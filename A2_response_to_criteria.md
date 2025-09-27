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

- **Name:** YourName GoesHere
- **Student number:** n100200300
- **Partner name (if applicable):** YourPartner NameHere
- **Application name:** FooBarBaz
- **Two line description:** I/We implemented this very cool app that does Foo, Bar and Baz.
- **EC2 instance name or ID:**

------------------------------------------------

### Core - First data persistence service

- **AWS service name:**  [eg. S3]
- **What data is being stored?:** [eg video files]
- **Why is this service suited to this data?:** [eg. large files are best suited to blob storage due to size restrictions on other services]
- **Why is are the other services used not suitable for this data?:**
- **Bucket/instance/table name:**
- **Video timestamp:**
- **Relevant files:**
    -

### Core - Second data persistence service

- **AWS service name:**  [eg. DynamoDB]
- **What data is being stored?:** 
- **Why is this service suited to this data?:**
- **Why is are the other services used not suitable for this data?:**
- **Bucket/instance/table name:**
- **Video timestamp:**
- **Relevant files:**
    -

### Third data service

- **AWS service name:**  [eg. RDS]
- **What data is being stored?:** [eg video metadata]
- **Why is this service suited to this data?:** [eg. ]
- **Why is are the other services used not suitable for this data?:** [eg. Advanced video search requires complex querries which are not available on S3 and inefficient on DynamoDB]
- **Bucket/instance/table name:**
- **Video timestamp:**
- **Relevant files:**
    -

### S3 Pre-signed URLs

- **S3 Bucket names:**
- **Video timestamp:**
- **Relevant files:**
    -

### In-memory cache

- **ElastiCache instance name:**
- **What data is being cached?:** [eg. Thumbnails from YouTube videos obatined from external API]
- **Why is this data likely to be accessed frequently?:** [ eg. Thumbnails from popular YouTube videos are likely to be shown to multiple users ]
- **Video timestamp:**
- **Relevant files:**
    -

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** [eg. intermediate video files that have been transcoded but not stabilised]
- **Why is this data not considered persistent state?:** [eg. intermediate files can be recreated from source if they are lost]
- **How does your application ensure data consistency if the app suddenly stops?:** [eg. journal used to record data transactions before they are done.  A separate task scans the journal and corrects problems on startup and once every 5 minutes afterwards. ]
- **Relevant files:**
    -

### Graceful handling of persistent connections

- **Type of persistent connection and use:** [eg. server-side-events for progress reporting]
- **Method for handling lost connections:** [eg. client responds to lost connection by reconnecting and indicating loss of connection to user until connection is re-established ]
- **Relevant files:**
    -


### Core - Authentication with Cognito

- **User pool name:** A2_Group27
- **How are authentication tokens handled by the client?:** The login endpoints return tokens in JSON (`idToken`, `accessToken`). The client stores them in memory and sends `Authorization: Bearer <idToken>` to protected routes (no cookies).
- **Video timestamp:**
- **Relevant files:**
    - `src/auth/routes.js`  — `/v1/auth/register`, `/v1/auth/confirm`, `/v1/auth/login`, `/v1/auth/login/mfa-email`
    - `src/middleware/requireAuth.js` — verifies ID token and populates `req.user`
    - `src/server.js` — mounts auth routes and JSON handling

---

### Cognito multi-factor authentication

- **What factors are used for authentication:** Password + **Email OTP** (Cognito Email One-Time Passcode)
- **Video timestamp:**
- **Relevant files:**
    - `src/auth/routes.js` — challenge handling and `/v1/auth/login/mfa-email`
    - Pool settings (console) — MFA: **Required**, type: **Email OTP**

---

### Cognito federated identities

- **Identity providers used:**
- **Video timestamp:**
- **Relevant files:**

---

### Cognito groups

- **How are groups used to set permissions?:** Users in the **`Admin`** group can access admin-only endpoints; others receive **403**. Demo shows adding user `u1` to `Admin`, re-login to refresh group claim, then access succeeds.(Albeit very tight)
- **Video timestamp:**
- **Relevant files:**
    - `src/middleware/requireGroup.js` — checks `cognito:groups` claim
    - `src/admin/routes.js` — `/v1/admin/ping` (protected example)
    - `src/server.js` — `app.use("/v1/admin", requireAuth, requireGroup("Admin"), adminRoutes)`

---

### Core - DNS with Route53

- **Subdomain**: `a2group27.cab432.com` 
- **Video timestamp:**

---

### Parameter store

- **Parameter names:** 
  - `/a2/a2group27/API_BASE`  → `https://api.a2group27.cab432.com`
  - `/a2/a2group27/FRONTEND_URL`  → `https://a2group27.cab432.com`
- **Video timestamp:**
- **Relevant files:**
    - `src/config/ssm.js` — SSM client & `readParam(...)`
    - `src/external/routes.js` — tiny probe/usage (e.g., `param-demo`) and code that consumes `readParam`
    - *(Server start logs may also mention reading these params)*

---

### Secrets manager

- **Secrets names:** `a2/a2group27/external-api-key`
- **Video timestamp:**
- **Relevant files:**
    - `src/config/secret.js` — Secrets Manager client & `readSecret(...)`
    - `src/external/routes.js` — usage example (e.g., `/v1/external/ping` or `secret-demo` that sets `X-Secret-Source`)


---

### Infrastructure as code

- **Technology used:** **Terraform** (`hashicorp/aws` provider)
- **Services deployed:** 
  - Cognito **User Group**: `Admin` (managed resource)
  - Route53 **A records** for subdomains (optional toggle, if enabled)
  - **Data sources** referencing existing SSM Parameters and Secrets Manager Secret
  - **Outputs** exposing parameter names and secret ARN
- **Video timestamp:** N/A
- **Relevant files:**
  - `main.tf` — resources (e.g., `aws_cognito_user_group`), data sources (SSM/Secrets), outputs
  - `variables.tf` — typed inputs (e.g., `team`, `cognito_user_pool_id`, toggles)
  - `dev.tfvars` — your values (no secrets)
  - `.terraform.lock.hcl` — provider lock (optional to include)
  - *(Exclude from submission: `terraform.tfstate*`, `.terraform/`)*


    -

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