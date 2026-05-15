# Correr UNA SOLA VEZ antes del terraform principal.
# Crea el bucket S3 para el state y la tabla DynamoDB para el lock.
#
#   cd infrastructure/terraform
#   terraform -chdir=bootstrap init
#   terraform -chdir=bootstrap apply -var="account_id=<TU_ACCOUNT_ID>"
#
# Después descomentar backend.tf y correr: terraform init

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.62, < 6"
    }
  }
}

provider "aws" {
  region                   = "us-east-1"
  profile                  = "default"
  shared_credentials_files = ["~/.aws/credentials"]
}

variable "account_id" {
  description = "AWS Account ID (usado para hacer el bucket name globalmente único)"
  type        = string
}

resource "aws_s3_bucket" "tf_state" {
  bucket = "menu-qr-terraform-state-${var.account_id}"

  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = "menu-qr-terraform-state" }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tf_lock" {
  name         = "menu-qr-terraform-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = { Name = "menu-qr-terraform-lock" }
}

output "state_bucket" {
  value = aws_s3_bucket.tf_state.bucket
}

output "lock_table" {
  value = aws_dynamodb_table.tf_lock.name
}
