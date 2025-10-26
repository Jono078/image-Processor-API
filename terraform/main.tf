terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}


provider "aws" {
  region = var.aws_region
}


# Cognito: Admin group (managed by TF)

resource "aws_cognito_user_group" "admin" {
  user_pool_id = var.cognito_user_pool_id
  name         = "Admin"
  description  = "Administrators"
  precedence   = 1

  lifecycle { prevent_destroy = true }
}


# Names for SSM & Secret

locals {
  api_base_param     = "/a2/${var.team}/API_BASE"
  frontend_url_param = "/a2/${var.team}/FRONTEND_URL"
  external_api_name  = "a2/${var.team}/external-api-key"
}


# READ of existing SSM Parameters

data "aws_ssm_parameter" "api_base" {
  count = var.enable_param_refs ? 1 : 0
  name  = local.api_base_param
}

data "aws_ssm_parameter" "frontend_url" {
  count = var.enable_param_refs ? 1 : 0
  name  = local.frontend_url_param
}


#READ of existing Secret

data "aws_secretsmanager_secret" "external_api_key" {
  count = var.enable_secret_ref ? 1 : 0
  name  = local.external_api_name
}

data "aws_secretsmanager_secret_version" "external_api_key_latest" {
  count     = var.enable_secret_ref ? 1 : 0
  secret_id = data.aws_secretsmanager_secret.external_api_key[0].id
}

#########
# Outputs
#########
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


# STATIC + CDN

# Private S3 bucket for static assets (edge cached)
resource "aws_s3_bucket" "static" {
  bucket = "a3g27-static-${var.student_id}"
  tags = {
    qut-username = var.qut_username
    purpose      = "edge-caching"
    owner        = var.team
  }
}

resource "aws_s3_bucket_public_access_block" "static" {
  bucket                  = aws_s3_bucket.static.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront OAC (recommended)
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "oac-${var.student_id}"
  description                       = "OAC for ${aws_s3_bucket.static.bucket}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution (default cert/domain is fine)
resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  comment             = "Edge cache for static assets (${var.student_id})"
  default_root_object = var.default_root_object != "" ? var.default_root_object : null

  origin {
    domain_name              = aws_s3_bucket.static.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.static.bucket}"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.static.bucket}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed "CachingOptimized" policy
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }


  viewer_certificate {
    cloudfront_default_certificate = true
  }


  tags = {
    qut-username = var.qut_username
    purpose      = "edge-caching"
    owner        = var.team
  }
}

# Allow CloudFront to read from the private S3 origin
data "aws_iam_policy_document" "oac_read" {
  statement {
    sid     = "AllowCloudFrontServicePrincipalReadOnly"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    resources = ["${aws_s3_bucket.static.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "static" {
  bucket = aws_s3_bucket.static.id
  policy = data.aws_iam_policy_document.oac_read.json
}

# LAMBDA: S3 -> SQS JOB

# Reference existing SQS queue (Person A’s)
data "aws_sqs_queue" "jobs" {
  name = var.jobs_queue_name
}

# Reference the shared CAB432 Lambda role
data "aws_iam_role" "lambda_role" {
  name = var.lambda_role_name
}

# Zip local lambda/ folder
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "s3_to_sqs" {
  function_name = "a3g27-s3-to-sqs-${var.student_id}"
  role          = data.aws_iam_role.lambda_role.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  filename      = data.archive_file.lambda_zip.output_path
  timeout       = 10

  environment {
    variables = { QUEUE_URL = data.aws_sqs_queue.jobs.url }
  }

  tags = {
    qut-username = var.qut_username
    purpose      = "serverless-s3-to-sqs"
    owner        = var.team
  }
}

# Allow S3 to invoke the Lambda (only if we attach S3 trigger via TF)
resource "aws_lambda_permission" "allow_s3" {
  count         = var.attach_s3_trigger ? 1 : 0
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.s3_to_sqs.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::${var.uploads_bucket_name}"
}

# (Optional) Manage the S3->Lambda event here (off by default to avoid clashes)
resource "aws_s3_bucket_notification" "uploads" {
  count  = var.attach_s3_trigger ? 1 : 0
  bucket = var.uploads_bucket_name

  lambda_function {
    lambda_function_arn = aws_lambda_function.s3_to_sqs.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

# Useful outputs
output "cdn_domain_name" { value = aws_cloudfront_distribution.cdn.domain_name }
output "static_bucket_name" { value = aws_s3_bucket.static.bucket }
output "lambda_s3_to_sqs_name" { value = aws_lambda_function.s3_to_sqs.function_name }


