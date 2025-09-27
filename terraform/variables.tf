variable "aws_region" {
  type        = string
  default     = "ap-southeast-2"
  description = "AWS region"
}

variable "team" {
  type        = string
  description = "Team slug, e.g. a2group27"
}

variable "cognito_user_pool_id" {
  type        = string
  description = "ap-southeast-2_SlIhE0wy8"
}

variable "api_base" {
  type        = string
  description = "API base URL for clients"
}

variable "frontend_url" {
  type        = string
  description = "Frontend base URL"
}

variable "external_api_key" {
  type        = string
  sensitive   = true
  default     = "dev-placeholder"
}

variable "api_role_name" {
  type        = string
  description = "ami-0279a86684f669718"
}

variable "attach_api_policy" {
  type        = bool
  default     = false
  description = "Attach read policy to API role (set true only if role name is known and you have IAM perms)"
}

variable "provision_config" {
  type        = bool
  default     = false
  description = "Create SSM params & Secret (true) or read existing (false)"
}

# toggles
variable "enable_param_refs" {
  type        = bool
  default     = false
  description = "Read SSM params if they already exist (true) or just output names (false)"
}

variable "enable_secret_ref" {
  type        = bool
  default     = false
  description = "Read Secret if it already exists (true) or just output name (false)"
}