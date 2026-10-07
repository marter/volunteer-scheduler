# Infra

Superseded — see [`deploy/`](../deploy/README.md) instead.

The original plan here was Terraform + EKS. For a project this size that
turned out to be a lot of operational overhead for no real benefit, so
deployment instead reuses a shared single Lightsail server (Docker Compose
+ Caddy) that was already built for a sibling project. No Kubernetes, no
Terraform, no ECR.

This directory is kept around in case EKS becomes worth it later (e.g. if
this app needs to scale well beyond one small server), but there's nothing
here to run today.
