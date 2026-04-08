#!/bin/bash

yum install -y docker git openssl

systemctl enable --now docker

curl -L "https://github.com/docker/compose/releases/download/v2.23.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

chmod +x /usr/local/bin/docker-compose

git clone https://github.com/urielsv/MenuQR.git

cd MenuQR

umask 077
cat > .env <<EOF
DB_URL=jdbc:postgresql://menuqr-db.c9auakcmctma.us-east-1.rds.amazonaws.com:5432/menudigital
DB_USER="postgres"
DB_PASS="postgres"
AWS_REGION="us-east-1"
S3_BUCKET="menu-qr-images-bucket"
DYNAMO_TABLE="menudigital-events"
QUARKUS_PROFILE="prod"
RECOMMENDATIONS_MODEL_S3_BUCKET="menu-qr-ml-models"
RECOMMENDATIONS_MODEL_S3_KEY="recommendations/v1/model.joblib"
EOF
chmod 600 .env

docker-compose -f docker-compose.prod.yml up -d --build
