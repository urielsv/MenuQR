# MenuDigital (TP Cloud Computing, VibeCode~~~~)

A multi-tenant digital menu SaaS platform for restaurants. Customers scan a QR code to view menus on their phones, while restaurant owners get rich, real-time analytics.

## Features

- **Multi-tenant architecture**: Each restaurant has isolated data and their own login
- **Digital menu**: Mobile-first QR code menu viewer with dietary filters
- **Rich analytics**: View counts, item popularity, hourly heatmaps, session depth
- **Real-time dashboard**: Live activity tracking with 30-second refresh
- **Menu management**: Full CRUD for sections and items with image upload

## Tech Stack

### Backend
- Quarkus 3 (Java 21)
- RESTEasy Reactive
- Hibernate ORM with Panache
- PostgreSQL 15
- DynamoDB (analytics events)
- S3 (image storage)
- SmallRye JWT

### Frontend
- React 18 + TypeScript
- Vite
- TailwindCSS + shadcn/ui
- React Query v5
- Recharts (analytics)

## Project Structure

```
menudigital/
├── backend/                    # Quarkus backend
│   ├── src/main/java/com/menudigital/
│   │   ├── domain/            # Pure Java domain models
│   │   ├── application/       # Use cases and DTOs
│   │   ├── infrastructure/    # DB, DynamoDB, S3 implementations
│   │   └── interfaces/rest/   # REST controllers
│   └── src/main/resources/
│       └── db/migration/      # Flyway migrations
├── frontend/
│   ├── admin/                 # Admin panel SPA
│   └── menu/                  # Public menu viewer SPA
├── infrastructure/            # AWS docs (ASG, VPC endpoints, S3 modelos, ETL EC2)
├── docker-compose.yml         # Local development
└── docker-compose.prod.yml    # Production deployment
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Java 21 (for local backend development)
- Node.js 20 (for local frontend development)

### 1. Environment Setup

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your settings (optional - defaults work for local development)
```

### 2. JWT Keys (Optional)

Development JWT keys are included in the repository. For production, generate new keys:

```bash
cd backend/src/main/resources
openssl genrsa -out privateKey.pem 2048
openssl rsa -pubout -in privateKey.pem -out publicKey.pem
```

### 3. Start with Docker Compose

```bash
docker-compose up
```

This starts:
- PostgreSQL on port 5432
- DynamoDB Local on port 8000
- Backend on port 8080
- Admin frontend on port 5174
- Menu frontend on port 5173

### 3. Access the Application

- **Admin Panel**: http://localhost:5174
- **Public Menu**: http://localhost:5173/menu/{slug}
- **API**: http://localhost:8080/api
- **Health Check**: http://localhost:8080/q/health

## API Endpoints

### Public (no auth)
- `GET /api/menu/{slug}` - Get public menu
- `POST /api/menu/{slug}/events` - Record analytics event
- `POST /api/menu/{slug}/recommendations` - Cart suggestions (same Quarkus backend; optional `menu_item_ids` in body)

### Auth
- `POST /api/auth/register` - Register restaurant
- `POST /api/auth/login` - Login

### Admin (JWT required)
- `GET /api/admin/menu` - Get full menu
- `POST/PUT/DELETE /api/admin/menu/sections/{id}` - Manage sections
- `POST/PUT/DELETE /api/admin/menu/items/{id}` - Manage items
- `PATCH /api/admin/menu/items/{id}/availability` - Toggle availability
- `POST /api/admin/upload` - Upload image
- `GET /api/admin/analytics` - Get analytics dashboard
- `GET /api/admin/analytics/realtime` - Get realtime stats

## Local Development

### Backend only
```bash
cd backend
./mvnw quarkus:dev
```

### Frontend only
```bash
cd frontend/admin
npm install && npm run dev

cd frontend/menu
npm install && npm run dev
```

## Infrastructure (Terraform)

The `infrastructure/terraform/` directory provisions the full AWS stack: VPC, RDS PostgreSQL, EC2, DynamoDB, S3 buckets (SPA + images + ML models), security groups and VPC endpoints.

### Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured (`aws configure`)
- An AWS account with permissions to create VPC, EC2, RDS, S3, DynamoDB, IAM and ELB resources (in Learner Lab the `LabRole` profile already covers this)

### 1. Configure variables

Edit `infrastructure/terraform/terraform.tfvars` and replace the `424242` suffix in every bucket name with something globally unique (e.g. your AWS account ID):

```hcl
spa_admin_bucket_name   = "menu-qr-spa-admin-<TU_SUFFIX>"
spa_users_bucket_name   = "menu-qr-spa-users-<TU_SUFFIX>"
ml_models_bucket_name   = "menu-qr-ml-models-<TU_SUFFIX>"
user_images_bucket_name = "menu-qr-user-images-<TU_SUFFIX>"
```

If you are using a Learner Lab account, `ec2_iam_instance_profile_name = "LabRole"` is already set. For a regular account create an instance profile manually and update that field.

### 2. Bootstrap (remote state) — run once

Creates the S3 bucket and DynamoDB table that Terraform will use to store state.

```bash
cd infrastructure/terraform
terraform -chdir=bootstrap init
terraform -chdir=bootstrap apply -var="account_id=<TU_ACCOUNT_ID>"
```

After it finishes, open `backend.tf`, uncomment the `terraform { backend "s3" { … } }` block and replace `<ACCOUNT_ID>` with your account ID.

### 3. Deploy the infrastructure

```bash
# Re-init to migrate state to the S3 backend
terraform init

terraform apply
```

`terraform apply` takes roughly 10–15 minutes (RDS multi-AZ is the slowest resource). When it finishes, copy the outputs — you will need them in the next steps:

```
rds_address                  = "menu-qr-vpc-postgres.xxxx.us-east-1.rds.amazonaws.com"
rds_master_user_secret_arn   = "arn:aws:secretsmanager:..."
ec2_app_private_ip           = "172.30.x.x"
spa_admin_website_url        = "http://menu-qr-spa-admin-<SUFFIX>.s3-website-us-east-1.amazonaws.com"
spa_users_website_url        = "http://menu-qr-spa-users-<SUFFIX>.s3-website-us-east-1.amazonaws.com"
```

### 4. Deploy the application

SSH or Session Manager into the EC2 (`ec2_app_private_ip`). The RDS master password is stored in Secrets Manager at the ARN shown in the outputs; retrieve it with:

```bash
aws secretsmanager get-secret-value \
  --secret-id <rds_master_user_secret_arn> \
  --query SecretString --output text
```

On the EC2, create a `.env` file and start the stack:

```bash
DB_URL=jdbc:postgresql://<rds_address>:5432/app
DB_USER=dbadmin
DB_PASS=<secret_from_above>
AWS_REGION=us-east-1
S3_BUCKET=menu-qr-user-images-<TU_SUFFIX>
DYNAMO_TABLE=menuqr-events
S3_PUBLIC_URL=https://menu-qr-user-images-<TU_SUFFIX>.s3.us-east-1.amazonaws.com

docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### 5. Publish the frontends

```bash
export VITE_API_URL=http://<ec2_public_ip_or_alb_dns>

cd frontend/admin && npm ci && npm run build
aws s3 sync dist/ s3://menu-qr-spa-admin-<TU_SUFFIX>/ --delete

cd ../menu && npm ci && npm run build
aws s3 sync dist/ s3://menu-qr-spa-users-<TU_SUFFIX>/ --delete
```

### Tear down

```bash
terraform destroy
# The bootstrap bucket has prevent_destroy = true; delete it manually from the console if needed.
```

---

## Testing the deployed app

Before running these steps, verify the backend is up:

```bash
curl http://<EC2_IP_OR_ALB>/q/health
# Expected: {"status":"UP"}
```

The following scenario walks through the full lifecycle of an order — from setting up the restaurant to a customer receiving real-time status notifications at their table.

---

### Step 1 — Register and set up the restaurant

Open the **admin panel** (`spa_admin_website_url`) in a browser.

1. Click **Register** and fill in the restaurant name, a URL slug (e.g. `mirestaurante`), email and password. Submit.
2. You are redirected to the admin dashboard. Log in if prompted.

---

### Step 2 — Build the menu

Go to **Menu** in the sidebar.

1. Click **Add section** and create at least one section (e.g. *Principales*).
2. Inside that section, click **Add item** and create two or three dishes with names, prices and descriptions. Save each one.
3. Optionally upload a photo for one of the items using the image upload button — verify the image appears in the card after saving.
4. Toggle one item to **unavailable** using the switch. It should appear greyed out.

---

### Step 3 — Create a table and start a session

Go to **Tables** in the sidebar.

1. Click **Add Table**, enter a table number (e.g. `5`) and an optional name (*Terraza*). Set capacity to 4 and confirm.
2. The new card appears. Click **Start Session** — the card should show a green badge with the session code and a countdown timer.
3. Click **View QR** to open the QR dialog. You will see the QR image and the table URL (format: `.../table/<token>`). Click **Copy URL**.

---

### Step 4 — Customer places an order

Open the copied table URL in a **second browser window or a phone** (this simulates the customer).

1. The page loads the menu branded with the restaurant name and table number.
2. Browse sections using the category tabs. The unavailable item from Step 2 should be hidden or disabled.
3. Tap a dish to open its detail modal, then tap **Add to order**. Add two or three items.
4. Open the cart by tapping the floating cart button. Review the items and tap **Submit order**.
5. A confirmation toast appears: *"Order submitted! Waiting for confirmation"*. The order is now in **SUBMITTED** state.

> Keep this customer window open — it will receive live notifications as the admin updates the order.

---

### Step 5 — Admin processes the order

Switch back to the **admin panel**. Go to **Orders** in the sidebar.

The orders board shows columns: **New → Confirmed → Preparing → Ready → Bill Requested**.

1. Find the order in the **New** column. It shows the table number, items and total. Click **Confirm**.
   - The card moves to **Confirmed**.
   - **In the customer window:** a toast notification appears — *"Your order has been confirmed!"*

2. Click **Start Preparing**.
   - The card moves to **Preparing**.
   - **Customer window:** *"Your order is being prepared"*.

3. Click **Mark Ready**.
   - The card moves to **Ready**.
   - **Customer window:** *"Your order is ready!"*

4. Click **Delivered**.
   - The card moves out of the active board.
   - **Customer window:** *"Your order has been delivered"*.

---

### Step 6 — Customer requests the bill

Back in the customer window, tap **Request bill** in the cart or order status screen. The admin orders board should show the order move to the **Bill Requested** column.

---

### Step 7 — End the session

Back in the admin panel, go to **Tables**. Click **End Session** on the table. The green session badge disappears. If the customer window is reloaded at this point, it should show the table as inactive.

---

### Step 8 — Check analytics

Go to **Analytics** in the sidebar. Verify that:

- The menu view event from when the customer loaded the table URL is counted.
- The items added to the order appear in the item popularity ranking.
- The hourly heatmap shows activity for the current hour.

---

## Production Deployment (manual / no Terraform)

See `infrastructure/aws-deploy-novatos.md` for a beginner step-by-step AWS deploy, or `infrastructure/aws-deploy-guide.md` for technical reference (index: `infrastructure/aws-setup.md`).

### Build backend
```bash
cd backend
./mvnw package
docker build -f src/main/docker/Dockerfile.jvm -t menudigital-backend .
```

### Build frontends
```bash
cd frontend/admin
npm run build

cd frontend/menu
npm run build
```

## Environment Variables

### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| DB_URL | PostgreSQL connection URL | jdbc:postgresql://localhost:5432/menudigital |
| DB_USER | Database username | menudigital |
| DB_PASS | Database password | menudigital |
| AWS_REGION | AWS region | us-east-1 |
| S3_BUCKET | S3 bucket for images | menudigital-images |
| DYNAMO_TABLE | DynamoDB table name | menudigital-events |

### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| VITE_API_URL | Backend API URL | http://localhost:8080 |

## License

MIT
