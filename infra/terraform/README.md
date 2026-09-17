# CardAcquire AWS demo infrastructure

This Terraform configuration provisions the interview-prep environment only. It is intentionally minimal and should be created for a demo or screenshot, then destroyed to avoid ongoing AWS charges.

## Architecture mapping

| Terraform resource | CardAcquire responsibility |
| --- | --- |
| `aws_vpc`, public/private subnets, route table | Network isolation and placement boundaries |
| `aws_lb`, target group, ECS services, task definitions, IAM roles | ALB entry point plus API and worker compute on Fargate |
| `aws_db_instance` | Managed PostgreSQL persistence and audit trail |
| `aws_elasticache_replication_group` | Redis/BullMQ queue broker |
| `aws_s3_bucket` | Private identity-document storage |
| CloudWatch log groups | API and worker operational logs |

The example is intentionally missing a production NAT gateway, multi-AZ database failover, secret manager integration, and a full deployment pipeline. Those additions would increase cost and distract from the interview architecture exercise.

## WAF placement

In a real deployment, AWS WAF would sit at the public edge in front of the application load balancer, after DNS/CloudFront if that edge layer is used. It would absorb common bot, abuse, and request-shape attacks before traffic reaches ECS and before requests can trigger paid KYC work. This demo does not provision WAF live because the free-tier public deployment is separate and the AWS environment is disposable.

## Usage

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan \
	-var='api_image=YOUR_API_IMAGE' \
	-var='worker_image=YOUR_WORKER_IMAGE' \
	-var='database_password=SET_LOCALLY' \
	-var='jwt_access_secret=SET_LOCALLY' \
	-var='jwt_refresh_secret=SET_LOCALLY'
terraform apply ...
terraform destroy ...
```

Never commit a `.tfvars` file containing passwords, JWT secrets, or provider credentials. Terraform state can contain rendered environment values, so use an encrypted remote backend for any real shared environment.