FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY inference_api.py .
# If you had a model.pkl, also COPY model.pkl .

EXPOSE 8000

CMD ["uvicorn", "inference_api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
