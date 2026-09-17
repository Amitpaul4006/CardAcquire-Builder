output "vpc_id" {
  value = aws_vpc.main.id
}

output "database_endpoint" {
  value     = aws_db_instance.postgres.address
  sensitive = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive = true
}

output "document_bucket" {
  value = aws_s3_bucket.documents.id
}

output "api_url" {
  value = "http://${aws_lb.api.dns_name}"
}