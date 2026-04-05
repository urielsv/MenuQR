# AWS — índice

- **Principiantes, paso a paso:** **[aws-deploy-novatos.md](./aws-deploy-novatos.md)** (consola + CLI, orden lógico, checklist).
- **Referencia técnica:** [aws-deploy-guide.md](./aws-deploy-guide.md) (arquitectura, IAM, variables, costes).

## Arquitectura resumida

ALB → instancias EC2 (Docker: nginx + Quarkus) → **RDS PostgreSQL Multi-AZ** + **DynamoDB** (eventos y segmentos) + **S3** (imágenes y SPAs). El job que rellena segmentos corre en **EC2** (cron + Python), sin Lambda. Route 53 y HTTPS (ACM) recomendados en producción.

## Variables mínimas en el servidor (`.env`)

Ver la tabla en la guía; incluyen `DB_*`, `AWS_REGION`, `S3_BUCKET`, `DYNAMO_TABLE`, y opcionalmente `DYNAMO_SEGMENTS_TABLE`. Las recomendaciones del menú van en el mismo backend Quarkus (sin servicio aparte).

## Coste orientativo

~90 USD/mes en us-east-1 (orden de magnitud, sin NAT); detalle en [aws-deploy-guide.md §17](./aws-deploy-guide.md#17-coste-orientativo-us-east-1-orden-de-magnitud).

## Esquema DynamoDB

[./dynamo-tables.md](./dynamo-tables.md)
