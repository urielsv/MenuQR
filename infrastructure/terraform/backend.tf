# Descomentar DESPUÉS de correr bootstrap/ y reemplazar <ACCOUNT_ID>.
# Luego: terraform init  (migra el state local al bucket)

# terraform {
#   backend "s3" {
#     bucket         = "menu-qr-terraform-state-<ACCOUNT_ID>"
#     key            = "menu-qr/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "menu-qr-terraform-lock"
#   }
# }
