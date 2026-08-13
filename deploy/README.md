# Deploying to AWS

This app is two independent deployables. Test on Vercel + App Runner now;
the same pieces carry straight over to production later.

- **Frontend** (`frontend/`) — static Vite build. Deploy to Vercel for
  testing; move to S3 + CloudFront (or Amplify Hosting) for production. No
  code changes needed either way — just set `VITE_API_URL` to wherever the
  backend is running.
- **Backend** (`backend/`) — Express API in a Docker container
  (`backend/Dockerfile`). Runs identically locally, on App Runner, or on
  ECS/Fargate later — the container is the portable unit, not the platform.

## 1. S3 bucket for bill PDFs

Final bills are generated as PDFs and stored in a **private** S3 bucket —
patient billing data shouldn't sit behind a public URL. The app hands out
5-minute presigned download links on request instead (see
`backend/src/lib/s3.js` and `GET /api/bills/:id/pdf-url`).

```
aws s3api create-bucket --bucket hospital-billing-bills-<ACCOUNT_ID> --region <REGION> \
  --create-bucket-configuration LocationConstraint=<REGION>
aws s3api put-public-access-block --bucket hospital-billing-bills-<ACCOUNT_ID> \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 2. RDS for Postgres

Create a Postgres instance (RDS or Aurora Serverless v2) in a private
subnet — don't expose it publicly. Grab the connection string for
`DATABASE_URL`. Prisma doesn't care whether it's RDS, Neon, or Supabase, so
you can point at any Postgres you like during early testing and switch the
env var later without touching code.

## 3. Build & push the container image

```
cd backend
aws ecr create-repository --repository-name hospital-billing-backend --region <REGION>
aws ecr get-login-password --region <REGION> | docker login --username AWS \
  --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
docker build -t hospital-billing-backend .
docker tag hospital-billing-backend:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/hospital-billing-backend:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/hospital-billing-backend:latest
```

## 4. IAM roles

Two separate roles, both referenced in `apprunner-service.json`:

- **AccessRoleArn** — lets App Runner pull the image from ECR. Use AWS's
  managed `AppRunnerECRAccessRole` pattern (App Runner console offers to
  create this automatically the first time).
- **InstanceRoleArn** — attached to the *running* backend, gives it S3
  access without any static AWS keys. Create it and attach
  `s3-instance-role-policy.json` from this folder.

## 5. Secrets

Put `DATABASE_URL` and `JWT_SECRET` in AWS Secrets Manager rather than
plaintext env vars (`apprunner-service.json` already references them as
`RuntimeEnvironmentSecrets`):

```
aws secretsmanager create-secret --name hospital-billing/database-url --secret-string "postgresql://..."
aws secretsmanager create-secret --name hospital-billing/jwt-secret --secret-string "$(openssl rand -hex 32)"
```

## 6. VPC connector (only if RDS is private, which it should be)

App Runner needs a VPC connector to reach an RDS instance sitting in
private subnets:

```
aws apprunner create-vpc-connector --vpc-connector-name hospital-billing-vpc-connector \
  --subnets <SUBNET_IDS> --security-groups <SG_ID>
```

Then fill in the resulting ARN in `apprunner-service.json`'s
`NetworkConfiguration.EgressConfiguration.VpcConnectorArn`. Skip this
section entirely (delete the `NetworkConfiguration` block) if you're
testing against a publicly-reachable database like Neon/Supabase.

## 7. Create the App Runner service

Fill in every `<PLACEHOLDER>` in `apprunner-service.json`, then:

```
aws apprunner create-service --cli-input-json file://deploy/apprunner-service.json
```

App Runner will build nothing itself here — it just runs the image you
pushed in step 3, health-checks `/health`, and gives you an HTTPS URL.
Point the frontend's `VITE_API_URL` at that URL, and set the backend's
`CORS_ORIGIN` to the frontend's URL (Vercel during testing, your real
domain later).

## Migrating from Vercel-testing to AWS production

Nothing structural changes — you're not moving off a Vercel-specific
architecture because the backend was never Vercel-shaped to begin with.
"Going live on AWS" is: point the same container at production-sized RDS,
attach a real domain (Route 53 + ACM certificate) to the App Runner
service or put CloudFront in front of it, and swap the frontend's Vercel
deployment for its S3/CloudFront (or Amplify) equivalent.
