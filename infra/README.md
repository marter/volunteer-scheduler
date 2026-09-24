# Infra

Not yet implemented. Planned Terraform layout, once we get here:

- `modules/vpc` — networking (public/private subnets across 2+ AZs, NAT)
- `modules/eks` — EKS cluster + managed node group
- `modules/rds` — RDS Postgres (private subnet, backend security group only)
- `modules/ecr` — ECR repos for `backend` and `frontend` images
- `environments/staging`, `environments/prod` — root modules composing the
  above per environment, with their own state

Deploy flow (planned): GitHub Actions builds and pushes images to ECR on
merge to `main`, then applies a Helm chart / Kubernetes manifests to the EKS
cluster. Frontend can either be served as a static S3+CloudFront site or as
a containerized nginx service behind the same ALB as the backend — TBD.

This directory is intentionally empty until the backend and frontend are
working end-to-end locally.
