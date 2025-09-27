terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

############################
# Cognito: Admin group (managed by TF)
############################
resource "aws_cognito_user_group" "admin" {
  user_pool_id = var.cognito_user_pool_id
  name         = "Admin"
  description  = "Administrators"
  precedence   = 1

  lifecycle { prevent_destroy = true }
}

############################
# Names for SSM & Secret
############################
locals {
  api_base_param     = "/a2/${var.team}/API_BASE"
  frontend_url_param = "/a2/${var.team}/FRONTEND_URL"
  external_api_name  = "a2/${var.team}/external-api-key"
}

############################
# Optional READ of existing SSM Parameters
############################
data "aws_ssm_parameter" "api_base" {
  count = var.enable_param_refs ? 1 : 0
  name  = local.api_base_param
}

data "aws_ssm_parameter" "frontend_url" {
  count = var.enable_param_refs ? 1 : 0
  name  = local.frontend_url_param
}

############################
# Optional READ of existing Secret
############################
data "aws_secretsmanager_secret" "external_api_key" {
  count = var.enable_secret_ref ? 1 : 0
  name  = local.external_api_name
}

data "aws_secretsmanager_secret_version" "external_api_key_latest" {
  count     = var.enable_secret_ref ? 1 : 0
  secret_id = data.aws_secretsmanager_secret.external_api_key[0].id
}

############################
# Outputs (all single-line conditionals)
############################
output "cognito_group" {
  value = aws_cognito_user_group.admin.name
}

output "ssm_api_base_name" {
  value = var.enable_param_refs ? data.aws_ssm_parameter.api_base[0].name : local.api_base_param
}

output "ssm_frontend_url_name" {
  value = var.enable_param_refs ? data.aws_ssm_parameter.frontend_url[0].name : local.frontend_url_param
}

# When enabled, this will be the ARN; otherwise we return the intended secret name
output "secret_identifier" {
  value = var.enable_secret_ref ? data.aws_secretsmanager_secret.external_api_key[0].arn : local.external_api_name
}
