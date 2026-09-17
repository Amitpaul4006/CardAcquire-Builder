variable "aws_region" {
  description = "AWS region for the interview-prep environment."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short name used in resource names and tags."
  type        = string
  default     = "cardacquire"
}

variable "vpc_cidr" {
  description = "CIDR range for the demo VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "api_image" {
  description = "Container image for the Node API."
  type        = string
}

variable "worker_image" {
  description = "Container image for the KYC worker."
  type        = string
}

variable "database_name" {
  description = "PostgreSQL database name."
  type        = string
  default     = "cardacquire"
}

variable "database_username" {
  description = "PostgreSQL application username."
  type        = string
  default     = "cardacquire"
}

variable "database_password" {
  description = "PostgreSQL password supplied at deploy time."
  type        = string
  sensitive   = true
}

variable "jwt_access_secret" {
  description = "JWT access-token secret supplied at deploy time."
  type        = string
  sensitive   = true
}

variable "jwt_refresh_secret" {
  description = "JWT refresh-token secret supplied at deploy time."
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Optional Anthropic key for the KYC worker."
  type        = string
  sensitive   = true
  default     = ""
}