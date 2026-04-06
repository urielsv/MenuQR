# AWS — índice

- **Principiantes, paso a paso:** **[aws-deploy-novatos.md](./aws-deploy-novatos.md)** (consola + CLI, orden lógico, checklist).
- **Referencia técnica:** [aws-deploy-guide.md](./aws-deploy-guide.md) (arquitectura, IAM, variables, costes).

## Arquitectura resumida

**ALB** → **ASG** (EC2 con Docker: nginx + Quarkus) en **2 AZ** → **RDS Multi-AZ** + **DynamoDB** + **S3** (imágenes, SPAs y **bucket aparte para modelos ML**). **EC2 ETL/ML** dedicada (cron, entrenamiento → sube artefactos a S3). **VPC Gateway endpoints** para S3 y DynamoDB en subredes privadas (recomendado). Sin Lambda. Detalle en [aws-deploy-guide.md](./aws-deploy-guide.md) (sección 1).

## Variables mínimas en el servidor (`.env`)

Ver la tabla en la guía; incluyen `DB_*`, `AWS_REGION`, `S3_BUCKET`, `DYNAMO_TABLE`. Las recomendaciones del menú van en el mismo backend Quarkus (sin servicio aparte).

## Coste orientativo

~90 USD/mes en us-east-1 (orden de magnitud, sin NAT); detalle en [aws-deploy-guide.md §17](./aws-deploy-guide.md#17-coste-orientativo-us-east-1-orden-de-magnitud).

## Esquema DynamoDB

[./dynamo-tables.md](./dynamo-tables.md)
