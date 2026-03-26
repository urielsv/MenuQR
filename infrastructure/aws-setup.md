# AWS Setup

## Architecture
ALB → 2 EC2 (AZ-a + AZ-b) → RDS PostgreSQL Multi-AZ + DynamoDB + S3
No single point of failure: EC2 pair survives one AZ outage, RDS auto-failover ~60s, S3/DynamoDB HA by design.

## Steps

### 1. VPC
- Create VPC: 10.0.0.0/16
- Public subnets: 10.0.1.0/24 (AZ-a), 10.0.2.0/24 (AZ-b)
- Private subnets: 10.0.3.0/24 (AZ-a), 10.0.4.0/24 (AZ-b)
- Internet Gateway + route tables

### 2. Security Groups
- sg-alb: inbound 80, 443 from 0.0.0.0/0
- sg-ec2: inbound 80 from sg-alb only
- sg-rds: inbound 5432 from sg-ec2 only

### 3. EC2 (×2)
- AMI: Amazon Linux 2023, t3.small, one per AZ, private subnets, sg-ec2
- IAM instance profile with inline policy:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:PutObject", "s3:GetObject"],
        "Resource": "arn:aws:s3:::menudigital-images/*"
      },
      {
        "Effect": "Allow",
        "Action": ["dynamodb:PutItem", "dynamodb:Query", "dynamodb:GetItem"],
        "Resource": "arn:aws:dynamodb:*:*:table/menudigital-events*"
      }
    ]
  }
  ```
- User data: install Docker + docker-compose, clone repo, run docker-compose -f docker-compose.prod.yml up -d

### 4. ALB
- Scheme: internet-facing, public subnets
- Listener: HTTP:80 (add HTTPS:443 + ACM cert when domain is ready)
- Target group: HTTP:80, health check GET /q/health, threshold 2

### 5. RDS PostgreSQL
- Engine: PostgreSQL 15, db.t3.micro
- Multi-AZ: enabled (automatic standby + failover)
- Private subnets, sg-rds
- Note connection string for DB_URL env var

### 6. DynamoDB
- Create table with schema in dynamo-tables.md
- Billing: on-demand (PAY_PER_REQUEST)
- No extra HA config needed — multi-AZ by default

### 7. S3 — images
- Bucket: menudigital-images-{account-id}
- Block public access: OFF for GetObject
- Bucket policy: allow s3:GetObject from *
- CORS: allow GET from your ALB domain

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::menudigital-images-*/*"
        }
    ]
}
```

### 8. S3 — SPAs
- Two buckets: menudigital-admin and menudigital-menu
- Static website hosting enabled on both
- Upload: 
  ```bash
  aws s3 sync frontend/admin/dist s3://menudigital-admin
  aws s3 sync frontend/menu/dist  s3://menudigital-menu
  ```

### 9. Route 53
- A record (alias): your domain → ALB DNS name
- Optional: admin.yourdomain.com → menudigital-admin S3 website endpoint
            menu.yourdomain.com  → menudigital-menu  S3 website endpoint

## Environment Variables for EC2

Create a `.env` file on each EC2 instance:

```bash
DB_URL=jdbc:postgresql://your-rds-endpoint:5432/menudigital
DB_USER=menudigital
DB_PASS=your-secure-password
AWS_REGION=us-east-1
S3_BUCKET=menudigital-images-123456789
DYNAMO_TABLE=menudigital-events
```

## Cost Estimate (us-east-1)

| Service | Specification | Monthly Cost |
|---------|--------------|--------------|
| EC2 (×2) | t3.small | ~$30 |
| RDS | db.t3.micro Multi-AZ | ~$30 |
| DynamoDB | On-demand (low volume) | ~$5 |
| S3 | Storage + requests | ~$5 |
| ALB | Per hour + LCU | ~$20 |
| **Total** | | **~$90/month** |
