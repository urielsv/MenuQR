# Desplegar MenuQR en AWS — guía paso a paso (principiantes)

Esta guía asume que **conoces lo básico de terminal** (carpetas, pegar comandos) pero **no** que ya sepas AWS. Al final tendrás la API en internet, base de datos, analítica en DynamoDB, imágenes en S3 y los frontends publicados.

Para detalles técnicos extra, ver también [aws-deploy-guide.md](./aws-deploy-guide.md) y [dynamo-tables.md](./dynamo-tables.md).

---

## Antes de empezar: conceptos en 30 segundos

| Término | Qué es |
|--------|--------|
| **Región** | Un “datacenter” de AWS (ej. `us-east-1` Virginia). Elige **una** y crea todo ahí. |
| **VPC** | Tu red privada virtual: subredes, firewalls (security groups), quién habla con quién. |
| **EC2** | Una máquina virtual (servidor) donde correrá Docker con tu backend. |
| **RDS** | Base PostgreSQL gestionada (no instalas tú el motor). |
| **ALB** | Balanceador que recibe el tráfico de internet y lo reparte a tus EC2. |
| **S3** | Almacenamiento: imágenes del menú, SPAs y (recomendado) **otro bucket** solo para modelos ML. |
| **ASG** | Auto Scaling Group: varias EC2 de API con la misma plantilla; el ALB reparte entre ellas. |
| **DynamoDB** | Base NoSQL para **eventos de analítica** (vistas del menú, etc.). |
| **IAM** | Permisos: qué puede hacer cada recurso (ej. la EC2 leyendo S3). |

---

## Paso 0 — Cuenta, región y herramientas

1. Crea una cuenta en [aws.amazon.com](https://aws.amazon.com) y activa facturación.
2. En la consola AWS, arriba a la derecha, elige una **región** (recomendado: **N. Virginia `us-east-1`** para seguir esta guía tal cual).
3. Activa una **alarma de facturación** (Billing → Budgets) para no llevar sorpresas.
4. En tu PC instala:
   - **Docker** (para construir imágenes).
   - **AWS CLI v2** ([instrucciones oficiales](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)).
5. Configura la CLI (sustituye tus claves de usuario IAM con acceso programático):

   ```bash
   aws configure
   ```

   Te pedirá `Access Key`, `Secret`, región (`us-east-1`) y formato de salida (`json`).

**Importante:** el usuario IAM que uses debe tener permisos para crear VPC, EC2, RDS, S3, DynamoDB, IAM (rol de instancia), ELB, etc. Para aprender, a veces se usa `AdministratorAccess`; en producción se acota.

---

## Paso 1 — Red (VPC) para “producción razonable”

Objetivo: subredes **públicas** (para el ALB) y **privadas** (para EC2 y RDS), con salida a internet para que EC2 pueda hacer `docker pull` (NAT Gateway).

**Opción fácil (asistente de la consola):**

1. Consola AWS → busca **VPC** → **Create VPC**.
2. Elige **VPC and more**.
3. Marca: **2 Availability Zones**, **2 public subnets**, **2 private subnets**, **1 NAT Gateway** (o 1 por AZ si quieres más resiliencia, sube coste).
4. Nombre algo como `menudigital-vpc` y crea.
5. Anota los IDs de las **subredes privadas** y **públicas** (los usarás en RDS, ALB y EC2).

Si no quieres pagar NAT al principio, puedes poner la primera EC2 en subred **pública** solo para **pruebas** (menos seguro); esta guía asume **EC2 en privada + NAT** como en [aws-deploy-guide.md](./aws-deploy-guide.md).

### Paso 1b — Endpoints de VPC (opcional pero recomendado)

Para que S3 y DynamoDB no salgan por el **NAT** (ahorro y alineado con arquitectura objetivo):

1. **VPC** → **Endpoints** → crear **Gateway** para `com.amazonaws.us-east-1.s3` y `com.amazonaws.us-east-1.dynamodb` (cambia la región si no es `us-east-1`).
2. Asocia las **route tables** de tus subredes **privadas**.

Detalle: [aws-deploy-guide.md §3.1](./aws-deploy-guide.md#31-vpc-endpoints-gateway--s3-y-dynamodb).

---

## Paso 2 — Security groups (firewalls)

Crea **tres** security groups en la misma VPC (nombre sugerido entre paréntesis):

### 2.1 `sg-alb` (ALB)

- **Inbound:** tipo **HTTP**, puerto **80**, origen **0.0.0.0/0**.  
- Opcional: **HTTPS 443** cuando tengas certificado.
- **Outbound:** por defecto (todo).

### 2.2 `sg-api` (instancias del ASG / API con Docker)

- **Inbound:** puerto **80**, origen el **security group del ALB** (`sg-alb`), no “cualquiera”.
- **Outbound:** por defecto.

### 2.3 `sg-rds` (PostgreSQL)

- **Inbound:** tipo **PostgreSQL**, puerto **5432**, origen **`sg-api`** (solo las instancias de la API).
- **Outbound:** por defecto.

### 2.4 `sg-etl` (opcional — worker ETL / ML)

- **Inbound:** ninguna desde `0.0.0.0/0`. Para operar: **Session Manager** (IAM) o bastión.
- **Outbound:** por defecto (NAT para `pip`, etc.).

---

## Paso 3 — RDS PostgreSQL

1. Consola → **RDS** → **Create database**.
2. Motor: **PostgreSQL**, versión **15** (alineada con el proyecto).
3. Plantilla: **Production** o **Dev/Test** (más barato).
4. Identificador y credenciales: usuario y contraseña **fuertes**; guárdalos en un gestor de secretos.
5. **Instance configuration:** tamaño pequeño al inicio (ej. `db.t3.micro`).
6. **Storage:** por defecto está bien.
7. **Connectivity:** VPC creada, subredes **privadas**, **no** público.
8. **VPC security group:** elige **sg-rds**.
9. **Database name:** `menudigital` (o el que luego pongas en `DB_URL`).
10. Crea la base y espera a que el estado sea **Available**.
11. En la ficha del RDS copia el **endpoint** (algo como `menudigital.xxxx.us-east-1.rds.amazonaws.com`).

Tu JDBC será:

```text
jdbc:postgresql://TU_ENDPOINT:5432/menudigital
```

---

## Paso 4 — DynamoDB (analítica)

Las tablas deben coincidir con [dynamo-tables.md](./dynamo-tables.md). La forma más rápida es la **CLI** (en tu PC, con `aws configure` hecho).

### 4.1 Tabla `menudigital-events`

Ejecuta **un solo bloque** (puedes cambiar el nombre de tabla si quieres, pero luego usa el mismo en variables de entorno):

```bash
export AWS_REGION=us-east-1
export TABLE_EVENTS=menudigital-events

aws dynamodb create-table \
  --table-name "$TABLE_EVENTS" \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=tenantId,AttributeType=S \
    AttributeName=eventTypeTimestamp,AttributeType=S \
    AttributeName=itemId,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"GSI-EventType","KeySchema":[{"AttributeName":"tenantId","KeyType":"HASH"},{"AttributeName":"eventTypeTimestamp","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},{"IndexName":"GSI-Item","KeySchema":[{"AttributeName":"itemId","KeyType":"HASH"},{"AttributeName":"timestamp","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region "$AWS_REGION"
```

Si la tabla ya existe, el comando fallará; en ese caso puedes ignorar el error.

### 4.2 Tabla `menudigital-segments`

```bash
aws dynamodb create-table \
  --table-name menudigital-segments \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --region "$AWS_REGION"
```

---

## Paso 5 — S3 (imágenes y, opcional, frontends)

### 5.1 Bucket de imágenes

1. **S3** → **Create bucket**.
2. Nombre **único en el mundo** (ej. `menudigital-images-TU-ACCOUNT-ID`).
3. Región la misma que el resto.
4. **Block Public Access:** para que las imágenes del menú se vean en el navegador, muchas demos desactivan el bloqueo público y ponen una política de lectura; en producción es mejor **CloudFront**. Para empezar, sigue la política de ejemplo en [aws-deploy-guide.md §7](./aws-deploy-guide.md#7-s3) y configura **CORS** si subes desde el admin.

Anota el **nombre del bucket** → lo usarás en `S3_BUCKET`.

### 5.2 (Opcional) Buckets para el build del admin y del menú

Crea dos buckets (o uno con prefijos) para subir `dist/` de cada frontend después del build.

### 5.3 Bucket de modelos ML (recomendado)

1. Crea otro bucket, ej. `menudigital-models-TU-ACCOUNT-ID` (sin mezclar con imágenes).
2. El **worker ETL** subirá aquí el artefacto; la **API** solo necesita `GetObject` en la clave que pongas en `RECOMMENDATIONS_MODEL_S3_KEY`.

---

## Paso 6 — Roles IAM (API y, opcional, ETL)

No uses claves de acceso largas en el `.env` en producción: **Instance profile** por tipo de máquina.

### 6.1 Rol para el ASG / API (`menudigital-api-ec2`)

Permite imágenes + DynamoDB + **lectura** del bucket de modelos. Copia el JSON de la guía técnica ([rol API — §8.1](./aws-deploy-guide.md)).

### 6.2 Rol para EC2 ETL/ML (`menudigital-etl-ec2`) — opcional

Para [ml-segmentation](./ml-segmentation/README.md) y scripts que **suban** el modelo a S3. JSON en la guía técnica ([§8.2](./aws-deploy-guide.md)).

Asocia **6.1** al **Launch Template** del ASG (o a la primera EC2 si aún no usás ASG).

---

## Paso 7 — Imagen Docker del backend

En tu máquina, en la carpeta del repo:

```bash
cd backend
mvn -DskipTests package
docker build -f src/main/docker/Dockerfile.jvm -t menudigital-backend:latest .
```

Subir a **ECR** (registro de contenedores de Amazon):

1. Consola **ECR** → **Create repository** → nombre `menudigital-backend` → privado.
2. Sigue los comandos **“View push commands”** que te muestra AWS (login, tag, push).  
   Al final tendrás una URI tipo:  
   `123456789012.dkr.ecr.us-east-1.amazonaws.com/menudigital-backend:latest`

---

## Paso 8 — Claves JWT de producción

En el servidor (o en tu PC antes de copiar), genera par de claves **solo para producción**:

```bash
openssl genrsa -out privateKey.pem 2048
openssl rsa -pubout -in privateKey.pem -out publicKey.pem
```

Cópialas a la carpeta donde estaré el `docker-compose.prod.yml` en la EC2 (mismos paths que en el compose: montados en el contenedor). **No las subas a Git.**

---

## Paso 9 — Lanzar la API: una EC2 o Auto Scaling Group

**Objetivo de arquitectura:** **ASG** con la misma plantilla en **2 AZ** (ver [aws-deploy-guide.md](./aws-deploy-guide.md) sección *Imagen del backend, ECR y Auto Scaling Group*).

### Opción A — Primera vez (una sola instancia)

1. **EC2** → **Launch instance**.
2. AMI **Amazon Linux 2023**, tipo **t3.small**, **sg-api**, subred **privada**, **IAM** = rol **API** (paso 6.1).
3. User-data: instalar Docker + Compose + `docker compose up` (como antes).

### Opción B — Producción (recomendado)

1. Crea **Launch Template** con lo mismo que la opción A.
2. **Auto Scaling Groups** → crear grupo: min **1**, max **2**, subredes privadas en **dos AZ**, vinculado al **target group** del ALB (paso 11).

**Conectar:** Session Manager o bastión si no hay IP pública.

En la instancia: Docker + Compose ([guía Docker AL2023](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-getting-started-choose-installation.html#serverless-getting-started-install-docker)).

---

## Paso 10 — Archivo `.env` y `docker-compose.prod.yml` en el servidor

En la EC2, en la carpeta donde tengas `docker-compose.prod.yml` y las claves JWT:

1. Copia `docker-compose.prod.yml` del repo (y ajusta si las rutas de contexto build apuntan a ECR en lugar de `build:` local; lo habitual es **solo** `image: ...ecr.../menudigital-backend:latest` sin `build` en producción).
2. Crea `.env` (permisos restrictivos):

```bash
DB_URL=jdbc:postgresql://TU_ENDPOINT_RDS:5432/menudigital
DB_USER=EL_USUARIO_RDS
DB_PASS=LA_CONTRASEÑA_RDS
AWS_REGION=us-east-1
S3_BUCKET=menudigital-images-TU-CUENTA
DYNAMO_TABLE=menudigital-events
DYNAMO_SEGMENTS_TABLE=menudigital-segments
# Opcional: bucket solo modelos (recomendado ≠ imágenes)
# RECOMMENDATIONS_MODEL_S3_BUCKET=menudigital-models-TU-CUENTA
# RECOMMENDATIONS_MODEL_S3_KEY=recommendations/v1/model.onnx
S3_PUBLIC_URL=https://TU-BUCKET.s3.us-east-1.amazonaws.com
```

**No** definas `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY` si usas el rol IAM (recomendado).  
**No** definas `DYNAMO_ENDPOINT` ni `S3_ENDPOINT` en AWS real (deben quedar vacíos para usar el servicio gestionado).

3. Autentica ECR y levanta:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

4. Comprueba logs: `docker compose logs -f backend`.

---

## Paso 11 — Application Load Balancer

1. **EC2** → **Load Balancers** → **Create** → **Application Load Balancer**.
2. Esquema **internet-facing**, VPC y **subredes públicas** (dos AZ).
3. Security group: **sg-alb**.
4. **Target group:** tipo **Instance**, protocolo **HTTP**, puerto **80**, health check path **`/q/health`** (nginx reenvía `/q/` al backend).
5. Si usas **una EC2**, regístrala a mano en el target group. Si usas **ASG**, en el grupo elige **Attach to an existing load balancer** y este target group (o asocia el TG al ASG tras crearlo).
6. Crea el ALB y espera a que los targets pasen a **healthy**.

Prueba en el navegador: `http://DNS-DEL-ALB/q/health`.

---

## Paso 12 — Frontends (admin y menú)

En tu PC:

```bash
# Sustituye por la URL pública de tu API (ALB o dominio + HTTPS)
export VITE_API_URL=http://DNS-DEL-ALB

cd frontend/admin && npm ci && npm run build
cd ../menu && npm ci && npm run build
```

Sube cada `dist/` a su bucket S3 (y si usas website hosting o CloudFront, configura el origen).  
**CORS:** el bucket de imágenes y la API deben permitir el **origen** desde el que sirves el admin/menú (dominio CloudFront o S3 website).

---

## Paso 13 — Dominio y HTTPS (opcional pero recomendado)

1. **ACM** (Certificate Manager) en **us-east-1**: solicita certificado para `api.tudominio.com` y/o frontends (validación DNS).
2. En el **ALB**, añade listener **443** con ese certificado y reenvía al target group.
3. **Route 53:** registro ALIAS al ALB.

---

## Paso 14 — EC2 ETL / ML y segmentación (opcional)

Arquitectura objetivo: **instancia dedicada** (no el ASG de la API), `sg-etl`, rol **ETL** (paso 6.2), **cron** + Python como en [ml-segmentation/README.md](./ml-segmentation/README.md). Desde ahí podés subir modelos al bucket de **§5.3** y escribir segmentos en DynamoDB.

---

## Paso 15 — Checklist final

- [ ] `/q/health` responde OK detrás del ALB.
- [ ] Registro/login en admin funciona.
- [ ] Menú público carga y los eventos aparecen en DynamoDB (métricas o “Explore items”).
- [ ] Subida de imagen crea objeto en S3 y la URL se ve en el menú.
- [ ] Recomendaciones: con ítems en el carrito, el panel del menú muestra sugerencias (mismo backend).
- [ ] (Opcional) VPC endpoints S3 + DynamoDB en rutas privadas; worker ETL con cron.

---

## Si algo falla (ideas rápidas)

| Síntoma | Qué mirar |
|---------|-----------|
| Target **unhealthy** | **`sg-api`** permite 80 **desde** `sg-alb`; nginx y backend levantados; health en `/q/health`. |
| Backend no conecta a RDS | `sg-rds` permite 5432 desde **`sg-api`**; `DB_URL` y credenciales correctas; RDS en subred alcanzable desde la EC2. |
| Errores S3/Dynamo | Rol IAM adjunto a la instancia; nombres de bucket/tabla; región consistente. |
| CORS en el navegador | Orígenes permitidos en API (Quarkus ya tiene CORS amplio en dev; revisar prod) y en S3 si aplica. |

---

## Coste y siguiente lectura

Orden de magnitud de costes: [aws-deploy-guide.md §17](./aws-deploy-guide.md#17-coste-orientativo-us-east-1-orden-de-magnitud). El **NAT Gateway** suele ser una partida importante; no te sorprenda si el total supera los 90 USD/mes.

Índice general: [aws-setup.md](./aws-setup.md).
