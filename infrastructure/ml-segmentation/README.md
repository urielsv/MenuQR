# Segmentación de clientes (batch en EC2)

Este job agrega eventos de DynamoDB (`menudigital-events`), calcula clusters sencillos con scikit-learn y escribe el resultado en `menudigital-segments` para el panel admin.

**No usa AWS Lambda:** el cómputo debe ejecutarse en una **EC2 dedicada ETL/ML** (recomendado; arquitectura objetivo en [aws-deploy-guide.md](../aws-deploy-guide.md)), separada del **ASG de la API**, con **rol IAM propio** (`PutObject` en bucket de modelos, `Query`/`PutItem` en DynamoDB, etc.).

## Requisitos en la instancia

- Python 3.10+ (o un venv).
- Dependencias: `pip install -r requirements.txt`.
- Permisos IAM: `dynamodb:Query` sobre la tabla de eventos (e índices si aplica) y `dynamodb:PutItem` sobre la tabla de segmentos (ver [aws-deploy-guide.md](../aws-deploy-guide.md)).

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `AWS_REGION` | Región (ej. `us-east-1`) |
| `EVENTS_TABLE` | Nombre de la tabla de eventos (mismo valor que `DYNAMO_TABLE` en el backend) |
| `SEGMENTS_TABLE` | Nombre de la tabla de segmentos (ej. `menudigital-segments`) |

## Ejecución manual

Desde el directorio `infrastructure/ml-segmentation`:

```bash
export AWS_REGION=us-east-1
export EVENTS_TABLE=menudigital-events
export SEGMENTS_TABLE=menudigital-segments
python3 lambda_function.py
```

## Cron diario (recomendado)

Ejemplo: todos los días a las 03:00 UTC, con venv en `/opt/menudigital/ml-segmentation`:

```cron
0 3 * * * cd /opt/menudigital/ml-segmentation && . .venv/bin/activate && AWS_REGION=us-east-1 EVENTS_TABLE=menudigital-events SEGMENTS_TABLE=menudigital-segments python3 lambda_function.py >> /var/log/menudigital-segments.log 2>&1
```

## Tenants a procesar

`get_all_tenants()` en `lambda_function.py` está como ejemplo fijo. En producción conviene leer los IDs activos desde **PostgreSQL** (`restaurants`) o desde un mecanismo interno; todo ello sigue ejecutándose en EC2.

## Nota sobre el nombre del archivo

El módulo conserva el nombre `lambda_function.py` por historial; la invocación es un script normal (`python3 lambda_function.py`), sin runtime de Lambda.
