Assignment 2 - Cloud Services Exercises - Response to Criteria
================================================

Instructions
------------------------------------------------
- Keep this file named A2_response_to_criteria.md, do not change the name
- Upload this file along with your code in the root directory of your project
- Upload this file in the current Markdown format (.md extension)
- Do not delete or rearrange sections.  If you did not attempt a criterion, leave it blank
- Text inside [ ] like [eg. S3 ] are examples and should be removed


Overview
------------------------------------------------

- **Name:** Jonathon Foo
- **Student number:** n11608382
- **Partner name (if applicable):** Jie Ren 
- **Application name:** Image Processor API
- **Two line description:** This application is an image processing API that lets users upload and manage images with S3 storing files, DynamoDB storing metadata, and ElastiCache providing fast in-memory caching. My contributions focused on implementing S3 pre-signed URLs, DynamoDB integration, statelessness, and caching, while Jie Ren implemented Cognito authentication, MFA, Route53 DNS, and configuration with Parameter Store and Secrets Manager.
- **EC2 instance name or ID:** i-05a29c7461c8b09f7

------------------------------------------------

### Core - First data persistence service

- **AWS service name:**  S3
- **What data is being stored?:** Original uploads, processed outputs, and thumbnails (binary objects).
- **Why is this service suited to this data?:** Durable, scalable object storage with low-cost, direct streaming I/O; ideal for binary blobs and integrates cleanly with pre-signed URLs.
- **Why is are the other services used not suitable for this data?:** DynamoDB is optimized for key-value/JSON items (400KB item limit) rather than large binaries; block/file storage would couple data to a single instance and reduce durability.
- **Bucket/instance/table name:** cab432-a2-n11608382-bucket (prefixes: uploads/, outputs/, thumbs/)
- **Video timestamp:** 00:27
- **Relevant files:**
    -src/lib/s3.js (S3 client & presigner)
    -src/files/routes.js (upload → S3)
    -src/jobs/routes.js (processed/thumbnail → S3)

### Core - Second data persistence service

- **AWS service name:** DynamoDB
- **What data is being stored?:** 
    -files table: file metadata (ownerId, id, s3Key, mime, size, createdAt)

    -jobs table: job records (ownerId, id, fileId, status, params, outputS3Key, thumbS3Key, createdAt, updatedAt)

    -jobLogs table: per-job structured logs (duration, iterations, kernel, etc.)
- **Why is this service suited to this data?:** Predictable access by partition key (ownerId) + item id, high availability, and flexible JSON attributes for job params/logs.
- **Why is are the other services used not suitable for this data?:** S3 doesn’t support conditional updates/queries over structured attributes; RDS would be overkill and add ops burden for simple key-value access patterns.
- **Bucket/instance/table name:**
    -cab432-a2-n11608382-files
    -cab432-a2-n11608382-jobs
    -cab432-a2-n11608382-jobLogs
- **Video timestamp:** 00:52
- **Relevant files:**
    -src/lib/ddb.js (DynamoDB DocumentClient helpers)
    -src/files/routes.js (create file item)
    -src/jobs/routes.js (create/update jobs, logs)

### Third data service

- **AWS service name:**  
- **What data is being stored?:** 
- **Why is this service suited to this data?:** 
- **Why is are the other services used not suitable for this data?:** 
- **Bucket/instance/table name:**
- **Video timestamp:**
- **Relevant files:**
    -

### S3 Pre-signed URLs

- **S3 Bucket names:** cab432-a2-n11608382-bucket (download via pre-signed URLs)
- **Video timestamp:** 01:57
- **Relevant files:**
    -src/lib/s3.js (presignGet)
    -src/files/routes.js (GET /v1/files/:id/url)
    -src/jobs/routes.js (GET /v1/jobs/:id/result → output & thumb pre-signed URLs)

### In-memory cache

- **ElastiCache instance name:** cab432-a2-mc-n11608382 (Memcached)
- **What data is being cached?:** 
    -Lists: /v1/files and /v1/jobs results per user (limit-scoped)
    -Single job: /v1/jobs/:id
- **Why is this data likely to be accessed frequently?:** Users typically poll job lists/details while processing; many reads per write benefit from a short-TTL cache layer.
- **Video timestamp:** 01:23, 2:11
- **Relevant files:**
    -src/lib/cache.js (memjs client + get/set/del)
    -src/files/routes.js (cache list)
    -src/jobs/routes.js (cache list & item; invalidate on job create/process)

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** Temporary working files only under /tmp during processing (downloaded input, generated output buffers before upload).
- **Why is this data not considered persistent state?:** It’s ephemeral and derived; once uploaded to S3 (and metadata written to DynamoDB), local files are deleted. They can be regenerated from S3 + DDB if the instance restarts
- **How does your application ensure data consistency if the app suddenly stops?:** 
    -Job status transitions are written to DynamoDB (queued → running → done/failed).
    -Outputs only become visible in DDB after successful S3 upload; failures set status failed.
    -No local DB or volumes; restart safe.
- **Relevant files:**
    -src/jobs/routes.js (status updates/try–catch/finally cleanup)
    -src/jobs/pipeline.js (pure in-memory processing; writes only to /tmp)

### Graceful handling of persistent connections

- **Type of persistent connection and use:** [eg. server-side-events for progress reporting]
- **Method for handling lost connections:** [eg. client responds to lost connection by reconnecting and indicating loss of connection to user until connection is re-established ]
- **Relevant files:**
    -


### Core - Authentication with Cognito

- **User pool name:** A2_Group27
- **How are authentication tokens handled by the client?:** The login endpoints return tokens in JSON(idtoken, accessToken). The client stores them in memory and sends Authorization: Bearer <idToken> to protected routes (no cookies) 
- **Video timestamp:** 02:50
- **Relevant files:**
    -src/auth/routes.js — /v1/auth/register, /v1/auth/confirm, /v1/auth/login, /v1/auth/login/mfa-email
    -src/middleware/requireAuth.js — verifies ID token and populates req.user
    -src/server.js — mounts auth routes and JSON handling

### Cognito multi-factor authentication

- **What factors are used for authentication:** Password + Email OTP (Cognito Email One-Time Passcode)
- **Video timestamp:** 03:10
- **Relevant files:**
    -src/auth/routes.js — challenge handling and /v1/auth/login/mfa-email
    -Pool settings (console) — MFA: Required, type: Email OTP

### Cognito federated identities

- **Identity providers used:**
- **Video timestamp:**
- **Relevant files:**
    -

### Cognito groups

- **How are groups used to set permissions?:** Users in the Admin group can access admin-only endpoints; others receive 403. Demo shows adding user u1 to Admin, re-login to refresh group claim, then access succeeds.(Albeit very tight)
- **Video timestamp:** 03:27
- **Relevant files:**
    -src/middleware/requireGroup.js — checks cognito:groups claim
    -src/admin/routes.js — /v1/admin/ping (protected example)
    -src/server.js — app.use("/v1/admin", requireAuth, requireGroup("Admin"), adminRoutes)

### Core - DNS with Route53

- **Subdomain**: a2group27.cab432.com
- **Video timestamp:** 4:04

### Parameter store

- **Parameter names:** 
    -/a2/a2group27/API_BASE → https://api.a2group27.cab432.com
    -/a2/a2group27/FRONTEND_URL → https://a2group27.cab432.com
- **Video timestamp:**4:27
- **Relevant files:**
    -src/config/ssm.js — SSM client & readParam(...)
    -src/external/routes.js — tiny probe/usage (e.g., param-demo) and code that consumes readParam
    -(Server start logs may also mention reading these params)


### Secrets manager

- **Secrets names:** a2/a2group27/external-api-key
- **Video timestamp:**4:54
- **Relevant files:**
    -src/config/secret.js — Secrets Manager client & readSecret(...)
    -src/external/routes.js — usage example (e.g., /v1/external/ping or secret-demo that sets X-Secret-Source)

### Infrastructure as code

- **Technology used:** Terraform (hashicorp/aws provider)
- **Services deployed:**
    -Cognito User Group: Admin (managed resource)
    -Route53 A records for subdomains (optional toggle, if enabled)
    -Data sources referencing existing SSM Parameters and Secrets Manager Secret
    -Outputs exposing parameter names and secret ARN
- **Video timestamp:** N/A
- **Relevant files:**
    -main.tf — resources (e.g., aws_cognito_user_group), data sources (SSM/Secrets), outputs

    -variables.tf — typed inputs (e.g., team, cognito_user_pool_id, toggles)

    -dev.tfvars — your values (no secrets)

    -.terraform.lock.hcl — provider lock (optional to include)

    -(Exclude from submission: terraform.tfstate*, .terraform/)

### Other (with prior approval only)

- **Description:**
- **Video timestamp:**
- **Relevant files:**
    -

### Other (with prior permission only)

- **Description:**
- **Video timestamp:**
- **Relevant files:**
    -