# Guía de despliegue en AWS (MenuDigital / MenuQR)

Si buscas una guía **paso a paso para novatos** (consola, orden de tareas, checklist), usa **[aws-deploy-novatos.md](./aws-deploy-novatos.md)**.

Esta guía describe cómo desplegar el stack en AWS de forma coherente con el código actual (Quarkus, PostgreSQL, DynamoDB, S3, frontends estáticos). Las sugerencias del carrito se calculan en el mismo Quarkus. Complementa el esquema de tablas en [dynamo-tables.md](./dynamo-tables.md).

## 1. Arquitectura de referencia (objetivo producción)

Diseño alineado con **multi-AZ**, **API en Auto Scaling Group**, **worker ETL/ML aparte** y **S3 separado para modelos** (el código ya soporta bucket de modelo vía `RECOMMENDATIONS_MODEL_S3_*`).

```
                    Route 53
                        │
    ┌───────────────────┼───────────────────┐
    │                   ▼                   │
    │   S3 (SPA menú)   │   S3 (SPA admin)  │   … fuera o dentro de VPC según CloudFront
    └───────────────────┴───────────────────┘

    Internet ──► IGW ──► ALB (subredes públicas, 80/443 + ACM)
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
     ASG: EC2 API (AZ-a)      ASG: EC2 API (AZ-b)
     Docker: nginx+Quarkus    (misma Launch Template / user-data)
            │                       │
            └───────────┬───────────┘
                        ▼
              RDS PostgreSQL 15 Multi-AZ (privado)

     EC2 ETL + ML (privado, típ. una AZ al inicio)
            │ cron: entrenamiento / subida de modelo
            ▼
     DynamoDB (eventos) ◄── Gateway VPC Endpoint
     S3 imágenes / assets          ◄── Gateway VPC Endpoint
     S3 modelos ML                 ◄── Gateway VPC Endpoint (mismo tipo; bucket distinto)

Las instancias **API** leen el artefacto de recomendaciones desde **S3 modelos** al arranque (`RecommendationModelLoader`).
```

**Capas:**

| Capa | Componentes |
|------|-------------|
| **Entrada** | Route 53, ALB (HTTPS con ACM), opcional WAF. |
| **API** | **Auto Scaling Group** (ej. min 1 / deseado 1 / max 2) con **misma** AMI/Launch Template; target group en puerto 80 → nginx → Quarkus. |
| **Datos transaccionales** | RDS Multi-AZ; security group solo desde SG de las EC2 de API. |
| **Analítica** | DynamoDB; las API escriben eventos; el worker ETL puede leer eventos para entrenar y subir modelos a S3. |
| **Objetos** | **Bucket S3** para imágenes del menú (`S3_BUCKET`); **otro bucket** (recomendado) para **artefactos ML** (`RECOMMENDATIONS_MODEL_S3_*`); buckets para builds de SPA. |
| **Batch / ML** | **EC2 dedicada** (no en el ASG) para cron de [entrenamiento](./ml-segmentation/README.md) y subida del artefacto al bucket de modelos. |

**Qué corre en cada instancia del ASG (ver `docker-compose.prod.yml`):**

- **nginx** (80 hacia el ALB) y **backend** Quarkus (8080 interno; recomendaciones + carga opcional de modelo desde S3).

Los frontends **admin** y **menu** se publican en **S3** (idealmente con **CloudFront**). `VITE_API_URL` apunta al dominio del ALB.

## 2. Prerrequisitos

- Cuenta AWS, región elegida (ej. `us-east-1`).
- AWS CLI v2 configurado (para crear recursos o automatizar).
- Dominio (opcional pero recomendable para HTTPS con ACM).
- Claves JWT de producción: generar `privateKey.pem` / `publicKey.pem` **solo para prod** y montarlas en el contenedor (no commitear secretos).

## 3. Red (VPC)

| Recurso | CIDR / notas |
|--------|----------------|
| VPC | `10.0.0.0/16` |
| Subred pública AZ-a | `10.0.1.0/24` (ALB) |
| Subred pública AZ-b | `10.0.2.0/24` |
| Subred privada AZ-a | `10.0.3.0/24` (EC2, RDS) |
| Subred privada AZ-b | `10.0.4.0/24` |
| Internet Gateway | Adjunto a la VPC; rutas desde subredes públicas |
| NAT Gateway (recomendado) | En subred pública; rutas `0.0.0.0/0` desde subredes **privadas** hacia NAT para que EC2 descargue imágenes Docker y parches sin IP pública |

**A considerar:** si las instancias EC2 están **solo en subred privada** (recomendado), necesitán **NAT Gateway** para `docker pull` desde internet y/o **VPC endpoints** para reducir tráfico y coste hacia servicios AWS.

### 3.1 VPC endpoints (Gateway) — S3 y DynamoDB

Para que las instancias en **subred privada** hablen con **S3** y **DynamoDB** sin enrutar ese tráfico por el NAT:

1. **VPC** → **Endpoints** → **Create endpoint**.
2. Tipo **Gateway** para **`com.amazonaws.<region>.s3`** y **`com.amazonaws.<region>.dynamodb`**.
3. Asocia las **tablas de rutas** de las subredes **privadas** donde están API, ETL y RDS clients (normalmente las mismas rutas que usan las EC2 privadas).

Efecto: `GetObject`/`PutObject` a S3 y llamadas a Dynamo desde el SDK **usan el endpoint** (sin cargo por hora en Gateway; solo datos). El NAT sigue siendo útil para **ECR**, **apt/yum**, **Git**, etc., a menos que añadas **interface endpoints** para ECR (opcional, de pago).

## 4. Security groups

| SG | Entrada |
|----|---------|
| `sg-alb` | `80`, `443` desde `0.0.0.0/0` (restringir admin por IP si aplica) |
| `sg-api` (antes sg-ec2) | `80` **solo** desde `sg-alb` — lo llevan todas las instancias del **ASG** de la API |
| `sg-rds` | `5432` **solo** desde `sg-api` |
| `sg-etl` (worker ETL/ML) | Sin entrada desde internet. Opcional: **SSH** solo desde bastión o usar **SSM** sin abrir 22. Salida por defecto (NAT) para pip/git si hace falta |

No exponer el puerto 8080 de Quarkus a Internet; solo el ALB → nginx:80.

**RDS:** si en el futuro el ETL lee PostgreSQL, añade regla en `sg-rds` desde `sg-etl` (puerto 5432).

## 5. RDS PostgreSQL

- Motor: **PostgreSQL 15**, misma familia que en local/Docker.
- **Multi-AZ** para failover automático (típico ~1–2 minutos).
- Subredes privadas, asociado a `sg-rds`.
- Crear base `menudigital` y usuario con permisos acotados.
- **Flyway** ejecuta migraciones al arrancar Quarkus (`migrate-at-start=true`): no hace falta script manual si el `DB_URL` apunta al RDS y la base está vacía o al día.

Cadena JDBC ejemplo:

```text
jdbc:postgresql://<rds-endpoint>:5432/menudigital
```

## 6. DynamoDB

Crear las tablas según [dynamo-tables.md](./dynamo-tables.md):

- `menudigital-events` (PK/SK + LSI `LSI-EventType`; sin GSI).

El **LSI** solo se define **al crear** la tabla. Si teníais `GSI-EventType` o `GSI-Item`, hay que **recrear** `menudigital-events` (o nueva tabla + migración) para alinear el esquema.

Modo de facturación: **PAY_PER_REQUEST** (on-demand) suele bastar al inicio.

**IAM en EC2:** la política debe permitir al menos `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:GetItem` sobre:

- `arn:aws:dynamodb:<region>:<account>:table/menudigital-events` (incluye queries al LSI; no hay GSI en esta tabla)

En **producción**, no hace falta `DYNAMO_ENDPOINT` ni claves estáticas: el SDK usa **IAM instance profile** si `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` no están definidos para S3/Dynamo (el código ya usa `DefaultCredentialsProvider` cuando faltan claves).

**A considerar (evolución):** TTL en items de eventos, paginación en queries para tenants muy grandes, agregados asíncronos mediante **otro proceso en EC2** (cola en disco, cron más frecuente, o worker dedicado), sin usar Lambda.

## 7. S3

### Bucket de imágenes y assets de aplicación

- Nombre único global, ej. `menudigital-images-<account-id>`.
- Política de lectura pública **solo en objetos** si el front muestra URLs directas; valorar **CloudFront + OAI** para no abrir el bucket al mundo.
- CORS: permitir `GET` (y `PUT` si subís desde el navegador) desde el origen de vuestros SPAs y/o API.

### Buckets de SPAs

- `menudigital-admin`, `menudigital-menu` (nombres de ejemplo).
- Subir artefactos de build:

```bash
cd frontend/admin && npm ci && npm run build
aws s3 sync dist s3://menudigital-admin --delete

cd ../menu && npm ci && npm run build
aws s3 sync dist s3://menudigital-menu --delete
```

Variables de build (ej. en CI):

- `VITE_API_URL=https://api.tudominio.com` (o `https://tudominio.com` si la API va en el mismo host bajo `/api`).

**Recomendación:** servir SPAs detrás de **CloudFront** con HTTPS (certificado ACM en `us-east-1` si usáis CloudFront).

### Bucket de modelos ML (recomendado en producción)

- Bucket **dedicado**, ej. `menudigital-models-<account-id>`, para artefactos entrenados (ONNX, etc.).
- El **worker ETL/ML** sube objetos (`PutObject`); las instancias **API** solo necesitan **`GetObject`** en la clave configurada (`RECOMMENDATIONS_MODEL_S3_KEY`).
- Así separás IAM (el batch puede escribir modelos; la API no debe poder sobrescribirlos salvo que lo queráis).

## 8. IAM — roles separados (API vs ETL/ML)

### 8.1 Rol para instancias del ASG (`menudigital-api-ec2`)

Incluye imágenes, DynamoDB y **lectura** del modelo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::menudigital-images-<account-id>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::menudigital-models-<account-id>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:Query", "dynamodb:GetItem"],
      "Resource": "arn:aws:dynamodb:<region>:<account>:table/menudigital-events"
    }
  ]
}
```

Añadí **`ecr:GetAuthorizationToken`** y **`ecr:BatchGetImage`** + permisos de capa si tiráis de ECR sin endpoint; o mantened NAT para `docker pull`.

### 8.2 Rol para EC2 ETL + ML (`menudigital-etl-ec2`)

Lectura de eventos en DynamoDB y **escritura** de modelos en S3:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::menudigital-models-<account-id>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Query", "dynamodb:Scan", "dynamodb:GetItem", "dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:<region>:<account>:table/menudigital-events"
    }
  ]
}
```

Si el ETL consulta **RDS**, añadí credenciales vía Secrets Manager y `secretsmanager:GetSecretValue` + conectividad `sg-etl` → `sg-rds`.

Ajustad ARNs y KMS si usáis cifrado en bucket.

## 9. Imagen del backend, ECR y Auto Scaling Group

En un entorno de build (CI o máquina local):

```bash
cd backend
mvn -DskipTests package
docker build -f src/main/docker/Dockerfile.jvm -t menudigital-backend:latest .
```

Subir la imagen a **Amazon ECR** y en cada EC2 hacer `docker pull` de ese tag, o construir en la instancia si aceptáis el tiempo de build.

**Contenido mínimo en el servidor** (junto al compose):

- `docker-compose.prod.yml` (o copia ajustada).
- `privateKey.pem`, `publicKey.pem` (permisos restrictivos).
- Archivo `.env` o parámetros inyectados (ver siguiente sección).

**User-data (esquema) — Launch Template del ASG:**

1. Instalar Docker y plugin Compose v2.
2. Autenticar ECR (`aws ecr get-login-password` …) si usáis registry privado.
3. `docker compose pull && docker compose up -d`.

**Auto Scaling Group (recomendado en lugar de “2 EC2 fijas”):**

- **Launch Template:** AMI (Amazon Linux 2023), tipo `t3.small`, `sg-api`, subredes **privadas** en **2 AZ**, disco EBS, **IAM instance profile** = rol API.
- **ASG:** min **1**, deseado **1**, max **2** (o según carga); políticas de escala opcionales (CPU, requests ALB).
- Adjuntar el ASG al **target group** del ALB; health check **GET** `/q/health`.

**EC2 ETL + ML (fuera del ASG):** misma VPC, subred privada, **rol ETL**, sin registro en el ALB. Desplegar ahí el repo o solo `infrastructure/ml-segmentation` + scripts de entrenamiento; **cron** diario/semanal.

## 10. Application Load Balancer

- Esquema **internet-facing**, en subredes públicas.
- Target group: protocolo **HTTP**, puerto **80**, destino las instancias EC2 (nginx).
- Health check: ruta **`/q/health`**, código 200, intervalos razonables.
- **HTTPS (443):** certificado en **ACM**, listener 443 → target group 80 (o terminación SSL en nginx si gestionáis cert allí).

**Cabeceras:** Quarkus y proxies suelen necesitar confianza en `X-Forwarded-*` si generáis URLs absolutas; para este proyecto la mayoría de rutas son relativas vía ALB.

## 11. Variables de entorno en producción

Definid al menos (nombres alineados con `application.properties` y `docker-compose.prod.yml`):

| Variable | Descripción |
|----------|-------------|
| `DB_URL` | JDBC a RDS |
| `DB_USER` / `DB_PASS` | Credenciales RDS |
| `AWS_REGION` | Región (ej. `us-east-1`) |
| `S3_BUCKET` | Bucket de **imágenes** del menú (distinto del de modelos en prod) |
| `RECOMMENDATIONS_MODEL_S3_BUCKET` | Bucket de **modelos** (puede ser `menudigital-models-…`) |
| `DYNAMO_TABLE` | Tabla de eventos (ej. `menudigital-events`) |
| *(no definir)* `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Preferir IAM role en EC2 |
| *(no definir)* `DYNAMO_ENDPOINT`, `S3_ENDPOINT` | Vacío en AWS real (servicio gestionado) |
| `S3_PUBLIC_URL` | URL pública base para enlazar imágenes (CloudFront o `https://bucket.s3...`) |
| `RECOMMENDATIONS_MODEL_S3_KEY` | Clave del objeto (ej. `recommendations/v1/model.onnx`) dentro del bucket de modelos |

**Secretos:** usar **AWS Systems Manager Parameter Store** o **Secrets Manager** y volcar a `.env` en el arranque (systemd unit + `ExecStartPre`), en lugar de dejar contraseñas en texto plano en disco sin cifrar.

**JWT:** rotación de claves implica redeploy coordinado; documentar el procedimiento.

## 12. Recomendaciones del menú

El endpoint `POST /api/menu/{slug}/recommendations` está implementado **dentro de Quarkus** (sugerencias aleatorias entre ítems disponibles fuera del carrito). Opcionalmente puede definirse un objeto en S3 (`RECOMMENDATIONS_MODEL_S3_BUCKET` + `RECOMMENDATIONS_MODEL_S3_KEY`) para **descargar el artefacto al arranque** (p. ej. ONNX); la inferencia real aún no está cableada, pero los bytes quedan listos en `RecommendationModelLoader`.

## 13. Entrenamiento del modelo en EC2 (opcional)

El script **`train_upload_model.py`** en [ml-segmentation/](./ml-segmentation/) lee eventos en DynamoDB y sube un artefacto de recomendaciones (joblib) al **bucket de modelos** S3; el rol ETL necesita `s3:PutObject` ahí.

- Ejecutarlo con **cron** en la instancia EC2 (recomendado: IAM role, sin claves en el script).
- Instrucciones: [ml-segmentation/README.md](./ml-segmentation/README.md).
- **No** usar EventBridge ni Lambda para este flujo en el diseño objetivo del proyecto.

## 14. Route 53 y DNS

- Registro **A/AAAA alias** al nombre DNS del ALB para el host de la API (ej. `api.tudominio.com`).
- Subdominios para admin/menú apuntando a CloudFront o a los endpoints S3 website, según elegís.

## 15. Verificación post-despliegue

1. `curl -sS https://<alb-o-dominio>/q/health` → JSON con estado UP.
2. Registro y login en admin (JWT).
3. Menú público: carga y envío de eventos (`POST /api/menu/{slug}/events`) sin errores en DynamoDB (CloudWatch / métricas).
4. Subida de imagen desde el panel y comprobación en S3 + URL pública.
5. Carrito con ítems: `POST /api/menu/{slug}/recommendations` devuelve sugerencias desde el mismo backend.

## 16. Mejoras de arquitectura recomendadas (resumen)

| Tema | Recomendación |
|------|----------------|
| Alta disponibilidad API | **ASG** min 1 / max 2 en 2 AZ, health check ALB a `/q/health` |
| VPC endpoints | Gateway **S3** + **DynamoDB** en rutas de subredes privadas (menos NAT) |
| Worker batch | **EC2 ETL/ML** aparte del ASG; rol IAM distinto (escribe modelos, lee Dynamo) |
| Secretos | Parameter Store / Secrets Manager, no contraseñas en git |
| HTTPS | ACM + ALB (y CloudFront para estáticos) |
| Imágenes | CloudFront delante de S3, políticas de bucket restrictivas |
| DynamoDB | TTL opcional; paginación en lecturas pesadas; unificar nombres de tabla vía env (hecho en `application.properties`) |
| Observabilidad | CloudWatch Logs para contenedores, alarmas ALB 5xx y latencia RDS |
| Backups | RDS backup automático + ventana de mantenimiento |
| WAF | Opcional delante del ALB si la API es pública |

## 17. Coste orientativo (us-east-1, orden de magnitud)

Los importes varían con tráfico y tamaños; son una referencia inicial:

| Servicio | Notas | ~USD/mes |
|----------|--------|----------|
| EC2 ×2 | `t3.small` | ~30 |
| RDS | `db.t3.micro` Multi-AZ | ~30 |
| ALB | Hora + LCU | ~20 |
| DynamoDB | On-demand, bajo volumen | ~5 |
| S3 + transferencia | Bajo uso | ~5 |
| NAT Gateway | Si usáis NAT en 2 AZ | +30–70 (revisar) |
| **Total orientativo** | Sin NAT / con NAT | **~90** / **~120+** |

## 18. Documentación relacionada

- [aws-setup.md](./aws-setup.md) — índice breve y enlace a esta guía.
- [dynamo-tables.md](./dynamo-tables.md) — esquema DynamoDB.
- [ml-segmentation/README.md](./ml-segmentation/README.md) — entrenamiento y subida del modelo (cron + Python).
