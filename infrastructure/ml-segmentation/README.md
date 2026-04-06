# Segmentación de clientes (batch en EC2)

Este job agrega eventos de DynamoDB (`menudigital-events`), calcula clusters sencillos con scikit-learn y escribe el resultado en `menudigital-segments` para el panel admin.

**No usa AWS Lambda:** el cómputo debe ejecutarse en una **EC2 dedicada ETL/ML** (recomendado; arquitectura objetivo en [aws-deploy-guide.md](../aws-deploy-guide.md)), separada del **ASG de la API**, con **rol IAM propio** (`PutObject` en bucket de modelos, `Query`/`PutItem` en DynamoDB, etc.).

## Requisitos en la instancia

- Python 3.10+ (o un venv).
- Dependencias: `pip install -r requirements.txt`.
- Permisos IAM: `dynamodb:Query` sobre la tabla de eventos (e índices si aplica), `dynamodb:PutItem` sobre la tabla de segmentos y, para el entrenador, **`s3:PutObject`** en el bucket de modelos (ver [aws-deploy-guide.md](../aws-deploy-guide.md) §8.2).

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

## Entrenador: subir modelo a S3 (`train_upload_model.py`)

Script aparte que:

1. Lee **ITEM_VIEW** del día **anterior** en DynamoDB por tenant (`get_all_tenants()` / `TENANT_IDS`).
2. Construye un artefacto versionado (popularidad por ítem + estimador placeholder sklearn).
3. Lo serializa con **joblib** y hace **`PutObject`** al bucket/clave que usa el backend.

| Variable | Descripción |
|----------|-------------|
| `RECOMMENDATIONS_MODEL_S3_BUCKET` | Bucket solo modelos (mismo que en la API) |
| `RECOMMENDATIONS_MODEL_S3_KEY` | Clave del objeto (ej. `recommendations/v1/model.joblib`) |
| `TENANT_IDS` | Opcional: lista separada por comas de UUID de restaurantes; si no, usa el mismo default que `lambda_function.py` |

Ejecución manual (después de `pip install -r requirements.txt`):

```bash
export AWS_REGION=us-east-1
export EVENTS_TABLE=menudigital-events
export RECOMMENDATIONS_MODEL_S3_BUCKET=menudigital-models-TU-CUENTA
export RECOMMENDATIONS_MODEL_S3_KEY=recommendations/v1/model.joblib
python3 train_upload_model.py
```

**Cron** (tras segmentación o a otra hora; las instancias API recargan el objeto **solo al reiniciar** el contenedor/JVM hoy):

```cron
15 4 * * * cd /opt/menudigital/ml-segmentation && . .venv/bin/activate && AWS_REGION=us-east-1 EVENTS_TABLE=menudigital-events RECOMMENDATIONS_MODEL_S3_BUCKET=... RECOMMENDATIONS_MODEL_S3_KEY=... python3 train_upload_model.py >> /var/log/menudigital-model.log 2>&1
```

El backend Quarkus **descarga** esos bytes al arranque (`RecommendationModelLoader`); la inferencia HTTP sigue siendo **mock** hasta integrar lectura joblib/ONNX en Java.

## Nota sobre el nombre del archivo

El módulo conserva el nombre `lambda_function.py` por historial; la invocación es un script normal (`python3 lambda_function.py`), sin runtime de Lambda.
