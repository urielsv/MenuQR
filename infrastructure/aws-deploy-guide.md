# Guía de despliegue en AWS (MenuDigital / MenuQR)

Esta guía describe cómo desplegar el stack en AWS de forma coherente con el código actual (Quarkus, PostgreSQL, DynamoDB, S3, frontends estáticos, servicio de inferencia opcional). Complementa el esquema de tablas en [dynamo-tables.md](./dynamo-tables.md).

## 1. Arquitectura de referencia

```
Internet
   │
   ▼
Route 53 (opcional) ──► ALB (público, 80/443)
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        EC2 AZ-a                    EC2 AZ-b
        (Docker Compose)            (misma imagen / mismo user-data)
              │                         │
              └────────────┬────────────┘
                           ▼
              RDS PostgreSQL 15 (Multi-AZ, privado)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         DynamoDB      S3 (imágenes)   SPAs en S3 / CloudFront
         events +      (solo storage)  (solo estáticos)
         segments
         
  Segmentación batch: cron + Python en EC2 (sin Lambda).
```

**Qué corre en cada EC2 (recomendado para alinear con `docker-compose.prod.yml`):**

- Contenedor **backend** (Quarkus, puerto 8080 interno).
- Contenedor **nginx** (puerto 80 hacia el ALB; proxy a `/api/` y `/q/`).
- Contenedor **inference-engine** (FastAPI, solo red interna; el backend lo llama por HTTP).

Opcionalmente, en la **misma instancia** (o en otra EC2 solo para batch): **cron** que ejecuta el script de segmentación en Python contra DynamoDB ([ml-segmentation/README.md](./ml-segmentation/README.md)); todo el cómputo permanece en EC2.

Los frontends **admin** y **menu** pueden servirse desde **S3 + CloudFront** (o website hosting S3) con `VITE_API_URL` apuntando al dominio del ALB (HTTPS recomendado). S3 aquí es almacenamiento estático, no cómpute.

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

**A considerar:** si las instancias EC2 están **solo en subred privada** (recomendado), necesitán NAT o VPC endpoints (ECR, S3, etc.) para `docker pull`.

## 4. Security groups

| SG | Entrada |
|----|---------|
| `sg-alb` | `80`, `443` desde `0.0.0.0/0` (restringir admin por IP si aplica) |
| `sg-ec2` | `80` (o el puerto del target group) **solo** desde `sg-alb` |
| `sg-rds` | `5432` **solo** desde `sg-ec2` |

No exponer el puerto 8080 de Quarkus directamente a Internet; el ALB debe hablar con nginx (80) o con el puerto que defináis en el target group.

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

- `menudigital-events` (PK/SK + GSI `GSI-EventType`, `GSI-Item`).
- `menudigital-segments` (opcional hasta que ejecutéis el [job batch en EC2](./ml-segmentation/README.md)).

Modo de facturación: **PAY_PER_REQUEST** (on-demand) suele bastar al inicio.

**IAM en EC2:** la política debe permitir al menos `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:GetItem` sobre:

- `arn:aws:dynamodb:<region>:<account>:table/menudigital-events`
- `arn:aws:dynamodb:<region>:<account>:table/menudigital-events/index/*`
- `arn:aws:dynamodb:<region>:<account>:table/menudigital-segments` (si usáis segmentos en el panel)

En **producción**, no hace falta `DYNAMO_ENDPOINT` ni claves estáticas: el SDK usa **IAM instance profile** si `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` no están definidos para S3/Dynamo (el código ya usa `DefaultCredentialsProvider` cuando faltan claves).

**A considerar (evolución):** TTL en items de eventos, paginación en queries para tenants muy grandes, agregados asíncronos mediante **otro proceso en EC2** (cola en disco, cron más frecuente, o worker dedicado), sin usar Lambda.

## 7. S3

### Bucket de imágenes

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

## 8. IAM (perfil de instancia EC2)

Además de DynamoDB, la aplicación necesita S3 para subida de imágenes:

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
      "Action": ["dynamodb:PutItem", "dynamodb:Query", "dynamodb:GetItem"],
      "Resource": [
        "arn:aws:dynamodb:<region>:<account>:table/menudigital-events",
        "arn:aws:dynamodb:<region>:<account>:table/menudigital-events/index/*",
        "arn:aws:dynamodb:<region>:<account>:table/menudigital-segments"
      ]
    }
  ]
}
```

Ajustad ARNs y acciones si añadís más tablas o políticas de KMS.

## 9. Imagen del backend e instancias EC2

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

**User-data (esquema):**

1. Instalar Docker y plugin Compose v2.
2. Autenticar ECR (`aws ecr get-login-password` …) si usáis registry privado.
3. `docker compose pull && docker compose up -d`.

**A considerar:** **Auto Scaling Group** con Launch Template, misma AMI o mismo user-data, **mínimo 2** instancias en AZ distintas; salud del target group con **GET** `/q/health` (nginx debe enrutar `/q/` al backend, como en `nginx.conf` del repo).

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
| `S3_BUCKET` | Nombre del bucket de imágenes |
| `DYNAMO_TABLE` | Tabla de eventos (ej. `menudigital-events`) |
| `DYNAMO_SEGMENTS_TABLE` | Tabla de segmentos (si aplica; ver `application.properties`) |
| `INFERENCE_API_URL` | En Compose: `http://inference-engine:8000` |
| *(no definir)* `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Preferir IAM role en EC2 |
| *(no definir)* `DYNAMO_ENDPOINT`, `S3_ENDPOINT` | Vacío en AWS real (servicio gestionado) |
| `S3_PUBLIC_URL` | URL pública base para enlazar imágenes (CloudFront o `https://bucket.s3...`) |

**Secretos:** usar **AWS Systems Manager Parameter Store** o **Secrets Manager** y volcar a `.env` en el arranque (systemd unit + `ExecStartPre`), en lugar de dejar contraseñas en texto plano en disco sin cifrar.

**JWT:** rotación de claves implica redeploy coordinado; documentar el procedimiento.

## 12. Motor de inferencia (ML)

El backend llama al cliente REST configurado en `quarkus.rest-client.inference-api.url` (`INFERENCE_API_URL`).

En **docker-compose.prod.yml** del repo, el backend y `inference-engine` comparten red Docker; la URL debe ser **`http://inference-engine:8000`**, no `localhost`.

**Alternativas de arquitectura (siempre cómpute en EC2 u otra máquina virtual, no serverless):**

- **Mismo host (actual):** simple, adecuado para demo y carga baja.
- **Segunda instancia EC2** solo para inferencia o para jobs batch: mismo VPC, sin balancear tráfico público hacia ella; el backend apunta por IP/DNS interno.
- **Solo API sin ML:** no levantar `inference-engine` y dejar recomendaciones vacías (el API ya tolera fallos).

## 13. Segmentación batch en EC2 (opcional)

El código vive en [ml-segmentation/](./ml-segmentation/). Lee eventos de DynamoDB, calcula segmentos y escribe en `menudigital-segments`.

- Ejecutarlo con **cron** en la instancia EC2 (recomendado: misma cuenta IAM que ya tiene acceso a DynamoDB, sin claves en el script).
- Instrucciones detalladas: [ml-segmentation/README.md](./ml-segmentation/README.md).
- **No** usar EventBridge ni Lambda para este flujo en el diseño objetivo del proyecto.

## 14. Route 53 y DNS

- Registro **A/AAAA alias** al nombre DNS del ALB para el host de la API (ej. `api.tudominio.com`).
- Subdominios para admin/menú apuntando a CloudFront o a los endpoints S3 website, según elegís.

## 15. Verificación post-despliegue

1. `curl -sS https://<alb-o-dominio>/q/health` → JSON con estado UP.
2. Registro y login en admin (JWT).
3. Menú público: carga y envío de eventos (`POST /api/menu/{slug}/events`) sin errores en DynamoDB (CloudWatch / métricas).
4. Subida de imagen desde el panel y comprobación en S3 + URL pública.
5. Carrito con ítems: `POST /api/menu/{slug}/recommendations` responde (si el contenedor de inferencia está arriba).

## 16. Mejoras de arquitectura recomendadas (resumen)

| Tema | Recomendación |
|------|----------------|
| Alta disponibilidad EC2 | Auto Scaling Group, mínimo 2 instancias, health check ALB |
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
- [ml-segmentation/README.md](./ml-segmentation/README.md) — batch de segmentación en EC2 (cron + Python).
