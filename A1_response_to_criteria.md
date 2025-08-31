Assignment 1 - REST API Project - Response to Criteria
================================================

Overview
------------------------------------------------

- **Name:** Jonathon Foo
- **Student number:** n11608382
- **Application name:** Image Processor API
- **Two line description:** A REST API that lets users upload images and run CPU-intensive processing (edge dection with iterative transforms). It stores files on disk and structured job metadata in SQLite; packaged in Docker, pushed to ECR, and run on EC2 


Core criteria
------------------------------------------------

### Containerise the app

- **ECR Repository name:** 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/cab432-assessment1-n11608382
- **Video timestamp:** 00:10
- **Relevant files:**
    - Dockerfile
    - package.json / package-lock.json
    - .env (runtime, not committed)

### Deploy the container

- **EC2 instance ID:** i-05a29c7461c8b09f7 (cab432-assessment1-instance-n11608382)
- **Video timestamp:** 00:40

### User login

- **One line description:** JWT-based login with two hard-coded users (admin/user); Bearer token required on protected endpoints.
- **Video timestamp:** 01:10
- **Relevant files:**
    - src/auth/routes.js (POST /v1/auth/login 11, requireAuth 21, requireRole 32)

### REST API

- **One line description:** RESTful endpoints for auth, file upload/listing, job creation/processing, job inspection, with pagination/filter/sort and ETag on list endpoints.
- **Video timestamp:** 01:30
- **Relevant files:**
    - src/server.js (Express app, /v1/healthz)
    - src/files/routes.js (POST /v1/files upload; GET /v1/files?limit&offset&sort&order&mime&minSize&maxSize)
    - src/jobs/routes.js (POST /v1/jobs, POST /v1/jobs/:id/process, GET /v1/jobs, GET /v1/jobs/:id, GET /v1/jobs/:id/logs)
    - src/lib/db.js (SQLite access)

### Data types

- **One line description:** Unstructured binaries (uploaded images, processed outputs, thumbnails) on disk + structured records (files, jobs, logs, thumbnails) in SQLite.
- **Video timestamp:** 2:00
- **Relevant files:**
    - data/ (mounted volume, persisted on EC2: files/outputs/app.sqlite)
    - src/lib/db.js schema creation & queries

#### First kind

- **One line description:** Uploaded images and processed outputs (JPEG/PNG); thumbnails for quick preview.
- **Type:** Unstructured data (files on disk)
- **Rationale:** Large binary files are best stored as files; later assessments can move to S3.
- **Video timestamp:** 2:20
- **Relevant files:**
    - Runtime paths under data/files/<userId>/... and data/outputs/<userId>/...
    - src/files/routes.js, src/jobs/pipeline.js

#### Second kind

- **One line description:** Job/file metadata, parameters (iterations, kernel), status, timing, and logs.
- **Type:** Structured data (SQLite, no ACID-critical banking-style constraints)
- **Rationale:**  Queryable lists (pagination/filter/sort), ownership checks, and reproducibility.
- **Video timestamp:** 2:40
- **Relevant files:**
  - src/lib/db.js
  - Tables: files, jobs, job_logs, thumbnails (in data/app.sqlite)

### CPU intensive task

 **One line description:** Iterative image processing (edge detection kernel with repeated transforms) implemented with Sharp/Node; iterations configurable to drive high CPU.
- **Video timestamp:** 3:00
- **Relevant files:**
    - src/jobs/pipeline.js (processing loop)
    - src/jobs/routes.js (invocation, status transitions)

### CPU load testing

 **One line description:** Burst creation/processing of multiple jobs in parallel, sustaining >80% CPU for ~5 minutes; demonstrated via EC2 CPUUtilization graph.
- **Video timestamp:** 3:40
- **Relevant files:**
    - Load commands shown in video (parallel curl POSTs to /v1/jobs and /v1/jobs/:id/process)
    - EC2 → Instance → Monitoring (CPUUtilization)

Additional criteria
------------------------------------------------

### Extensive REST API features

- **One line description:** Implemented versioned base path (/v1), pagination (limit/offset), filtering (status, from, to for jobs; mime, minSize, maxSize for files), sorting (sort/order), and conditional GET via ETag on list endpoints.
- **Video timestamp:** null
- **Relevant files:**
    - src/files/routes.js (pagination/filter/sort + ETag)
    - src/jobs/routes.js (pagination/filter/sort + ETag)

### External API(s)

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    - 

### Additional types of data

- **One line description:** Beyond required file + job metadata, added job_logs (structured timing/details JSON) and thumbnails (derived unstructured images).
- **Video timestamp:** 4:40
- **Relevant files:**
    - src/jobs/routes.js (writes to job_logs, thumbnails)
    - src/lib/db.js (table creation)

### Custom processing

- **One line description:** Custom iterative image pipeline combining Sharp kernel transforms with user-controlled iteration count to scale CPU cost; not a trivial proxy.
- **Video timestamp:** null
- **Relevant files:**
    - src/jobs/pipeline.js (loop, timing)
    - src/jobs/routes.js (params validation/clamping)

### Infrastructure as code

- **One line description:** Containerised with Docker; reproducible run via docker run and optional docker-compose.yml for local development volume/port/env mapping.
- **Video timestamp:** null
- **Relevant files:**
    - Dockerfile
    - docker-compose.yml (local)

### Web client

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    -   

### Upon request

- **One line description:** Not attempted
- **Video timestamp:**
- **Relevant files:**
    - 