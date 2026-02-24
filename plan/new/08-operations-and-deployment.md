# 15 — Complete Operations and Deployment Specification

**Document Version:** 1.0
**Purpose:** Define the complete operational model for deploying and running Cortex in production.

---

## Table of Contents

1. [Deployment Architecture](#1-deployment-architecture)
2. [Infrastructure Requirements](#2-infrastructure-requirements)
3. [Container Architecture](#3-container-architecture)
4. [Configuration Management](#4-configuration-management)
5. [Monitoring and Observability](#5-monitoring-and-observability)
6. [Backup and Recovery](#6-backup-and-recovery)
7. [Disaster Recovery](#7-disaster-recovery)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Runbooks](#9-runbooks)
10. [SLA Definitions](#10-sla-definitions)
11. [Cost Estimation](#11-cost-estimation)
12. [Rollout Plan](#12-rollout-plan)

---

## 1. Deployment Architecture

### 1.1 Development Environment

#### Local Development Setup

**Prerequisites:**
- Docker Desktop 4.x+ with Docker Compose v2
- Node.js 20 LTS (for API/Web development)
- Rust 1.75+ (for sidecar development)
- PostgreSQL client tools (psql, pg_dump)
- Git 2.40+

**Required Development Tools:**
```
Tool                Version     Purpose
-----------------------------------------------
Docker Desktop      4.25+       Container runtime
Node.js             20.x LTS    API and Web services
pnpm                8.x+        Package management
Rust                1.75+       Sidecar (cortexd)
PostgreSQL Client   16.x        Database interaction
Redis CLI           7.x         Cache debugging
MinIO Client (mc)   Latest      Object storage CLI
```

**Environment Variables for Development:**
```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://cortex:cortex_dev@localhost:5432/cortex_dev
DATABASE_POOL_SIZE=10

# Redis
REDIS_URL=redis://localhost:6379/0

# Object Storage
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_ATTACHMENTS=cortex-attachments-dev
S3_BUCKET_BACKUPS=cortex-backups-dev

# API Configuration
API_PORT=3000
API_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:3001,http://localhost:5173

# Web UI
WEB_PORT=3001
API_BASE_URL=http://localhost:3000/api/v2

# Auth
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_EXPIRY=24h
AGENT_TOKEN_EXPIRY=1h

# Embeddings
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-dev-key-here

# Feature Flags
FEATURE_SEMANTIC_SEARCH=true
FEATURE_DRAFTS=true
FEATURE_OBSERVATIONS=true
```

**Sample Data Seeding:**
```bash
# Run database migrations
pnpm db:migrate

# Seed development data
pnpm db:seed

# Seed script creates:
# - 3 test users (admin, reviewer, member)
# - 5 subcortexes with charters
# - 50 sample threads with comments
# - 20 artifacts (various statuses)
# - 100 observations
# - Sample tasks and notifications
```

**Development docker-compose.dev.yml:**
```yaml
version: "3.9"

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: cortex-postgres-dev
    environment:
      POSTGRES_USER: cortex
      POSTGRES_PASSWORD: cortex_dev
      POSTGRES_DB: cortex_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cortex -d cortex_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: cortex-redis-dev
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    container_name: cortex-minio-dev
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_dev_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/cortex-attachments-dev;
      mc mb --ignore-existing local/cortex-backups-dev;
      exit 0;
      "

volumes:
  postgres_dev_data:
  redis_dev_data:
  minio_dev_data:
```

---

### 1.2 Staging Environment

#### Infrastructure Requirements

**Compute:**
- 2x API instances (2 vCPU, 4GB RAM each)
- 1x Worker instance (2 vCPU, 4GB RAM)
- 1x Web instance (1 vCPU, 2GB RAM)

**Database:**
- PostgreSQL 16 with pgvector extension
- 2 vCPU, 8GB RAM, 100GB SSD
- No read replicas (single instance acceptable)

**Cache:**
- Redis 7.x
- 1GB memory allocation
- No persistence required

**Object Storage:**
- S3-compatible storage
- Separate buckets for staging
- 50GB initial allocation

#### Configuration Differences from Production

```yaml
# staging-specific configuration
environment:
  NODE_ENV: staging
  LOG_LEVEL: debug  # More verbose than production

  # Reduced resource limits
  DATABASE_POOL_SIZE: 20
  WORKER_CONCURRENCY: 5

  # Faster job intervals for testing
  SUMMARY_JOB_INTERVAL: 300000  # 5 minutes vs 1 hour
  DIGEST_JOB_INTERVAL: 3600000  # 1 hour vs 24 hours

  # Feature flags - all enabled for testing
  FEATURE_SEMANTIC_SEARCH: true
  FEATURE_EXPERIMENTAL_FEATURES: true

  # Lower rate limits for load testing
  RATE_LIMIT_WINDOW_MS: 60000
  RATE_LIMIT_MAX_REQUESTS: 1000
```

#### Data Handling

**Sanitized Production Data:**
```sql
-- Data sanitization script for staging refresh
-- Run this AFTER copying production data

-- Anonymize user emails
UPDATE principals
SET email = CONCAT('user_', id, '@staging.cortex.local')
WHERE kind = 'human';

-- Rotate all API keys
UPDATE principals
SET api_key_hash = encode(sha256(random()::text::bytea), 'hex')
WHERE api_key_hash IS NOT NULL;

-- Clear sensitive observations
DELETE FROM observations
WHERE sensitivity = 'sensitive';

-- Truncate audit logs older than 7 days
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '7 days';

-- Reset all notifications
TRUNCATE notifications;

-- Clear session data
TRUNCATE sessions;
```

**Staging Data Refresh Schedule:**
- Weekly refresh from sanitized production snapshot
- Automated via scheduled job (Sunday 02:00 UTC)
- Verification tests run after each refresh

---

### 1.3 Production Environment

#### Infrastructure Requirements

**Minimum Production Setup (Small Team):**
- 2x API instances (2 vCPU, 4GB RAM)
- 2x Worker instances (2 vCPU, 4GB RAM)
- 1x Web instance (2 vCPU, 2GB RAM)

**Recommended Production Setup (Department):**
- 4x API instances (4 vCPU, 8GB RAM)
- 4x Worker instances (4 vCPU, 8GB RAM)
- 2x Web instances (2 vCPU, 4GB RAM)
- Load balancer with health checks

#### High Availability Setup

```
                    ┌─────────────────┐
                    │   CloudFlare    │
                    │   CDN / WAF     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Load Balancer  │
                    │  (HAProxy/ALB)  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  API Pod 1  │   │  API Pod 2  │   │  API Pod N  │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
 ┌──────▼──────┐     ┌───────▼───────┐    ┌──────▼──────┐
 │  PostgreSQL │     │    Redis      │    │   MinIO/S3  │
 │   Primary   │     │   Cluster     │    │   Cluster   │
 │      │      │     │               │    │             │
 │   Replica   │     │               │    │             │
 └─────────────┘     └───────────────┘    └─────────────┘
```

**Load Balancer Configuration:**
```yaml
# HAProxy configuration
frontend http_front
  bind *:80
  bind *:443 ssl crt /etc/ssl/cortex.pem
  redirect scheme https if !{ ssl_fc }

  # Route API requests
  acl is_api path_beg /api
  use_backend api_servers if is_api

  # Route WebSocket
  acl is_ws hdr(Upgrade) -i websocket
  use_backend api_servers if is_ws

  # Default to web
  default_backend web_servers

backend api_servers
  balance roundrobin
  option httpchk GET /health
  http-check expect status 200
  server api1 api-1:3000 check inter 5s fall 3 rise 2
  server api2 api-2:3000 check inter 5s fall 3 rise 2
  server api3 api-3:3000 check inter 5s fall 3 rise 2

backend web_servers
  balance roundrobin
  option httpchk GET /
  server web1 web-1:3001 check
  server web2 web-2:3001 check
```

#### Geographic Distribution

**Single-Region (Recommended for MVP):**
- Deploy all services in one region
- Use regional object storage
- Backup replication to secondary region

**Multi-Region (Enterprise):**
- Primary region: Full deployment
- Secondary region: Read replicas + warm standby
- Cross-region database replication (async)
- Global load balancer with geo-routing

#### CDN Configuration

```yaml
# CloudFlare configuration
cdn:
  zones:
    - name: cortex.example.com
      ssl: full_strict

  page_rules:
    # Cache static assets
    - match: "*.cortex.example.com/static/*"
      actions:
        cache_level: cache_everything
        edge_cache_ttl: 86400
        browser_cache_ttl: 31536000

    # Don't cache API
    - match: "*.cortex.example.com/api/*"
      actions:
        cache_level: bypass

    # Cache web app shell
    - match: "*.cortex.example.com/"
      actions:
        cache_level: cache_everything
        edge_cache_ttl: 3600

  firewall_rules:
    # Rate limiting
    - expression: "(http.request.uri.path contains \"/api/\")"
      action: rate_limit
      ratelimit:
        requests_per_period: 100
        period: 60

    # Block known bad actors
    - expression: "(cf.threat_score gt 50)"
      action: challenge

  security:
    waf_enabled: true
    ddos_protection: on
    bot_management: enabled
```

---

## 2. Infrastructure Requirements

### 2.1 Core Server (API)

**Resource Requirements:**

| Deployment Size | vCPU | Memory | Storage | Instances |
|-----------------|------|--------|---------|-----------|
| Small (1-10 users) | 2 | 4GB | 20GB | 2 |
| Medium (10-50 users) | 4 | 8GB | 50GB | 4 |
| Large (50-200 users) | 8 | 16GB | 100GB | 8+ |

**Scaling Triggers:**
```yaml
horizontal_scaling:
  metrics:
    - name: cpu_utilization
      threshold: 70%
      duration: 5m
      action: scale_up

    - name: memory_utilization
      threshold: 80%
      duration: 5m
      action: scale_up

    - name: request_latency_p95
      threshold: 500ms
      duration: 5m
      action: scale_up

    - name: request_queue_depth
      threshold: 100
      duration: 2m
      action: scale_up

  scale_down:
    cooldown: 10m
    cpu_threshold: 30%
    min_instances: 2
```

**Container Specifications:**
```yaml
api:
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "2000m"
      memory: "4Gi"

  probes:
    liveness:
      httpGet:
        path: /health/live
        port: 3000
      initialDelaySeconds: 10
      periodSeconds: 10
      failureThreshold: 3

    readiness:
      httpGet:
        path: /health/ready
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
      failureThreshold: 3

    startup:
      httpGet:
        path: /health/live
        port: 3000
      initialDelaySeconds: 0
      periodSeconds: 2
      failureThreshold: 30
```

---

### 2.2 Database (PostgreSQL)

**Version Requirements:**
- PostgreSQL 16.x (minimum 15.x)
- pgvector extension 0.5.0+
- pg_stat_statements extension

**Configuration Parameters:**
```ini
# postgresql.conf for production

# Memory
shared_buffers = 4GB                    # 25% of RAM
effective_cache_size = 12GB             # 75% of RAM
work_mem = 256MB                        # Per-operation memory
maintenance_work_mem = 1GB              # For vacuum, index creation

# Connections
max_connections = 200
superuser_reserved_connections = 3

# Write-Ahead Log
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
archive_mode = on
archive_command = 'aws s3 cp %p s3://cortex-wal-archive/%f'

# Query Planning
random_page_cost = 1.1                  # For SSD
effective_io_concurrency = 200          # For SSD
default_statistics_target = 100

# Logging
log_min_duration_statement = 500        # Log slow queries
log_checkpoints = on
log_lock_waits = on
log_temp_files = 0

# Autovacuum
autovacuum_vacuum_scale_factor = 0.02
autovacuum_analyze_scale_factor = 0.01
autovacuum_vacuum_cost_limit = 1000

# pgvector specific
# Ensure adequate memory for vector operations
```

**Connection Pooling (PgBouncer):**
```ini
# pgbouncer.ini
[databases]
cortex = host=postgres port=5432 dbname=cortex

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Pool configuration
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
reserve_pool_timeout = 3

# Timeouts
server_connect_timeout = 3
server_idle_timeout = 600
server_lifetime = 3600
client_idle_timeout = 0
query_timeout = 0

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60
```

**Replication Setup:**
```yaml
# Primary configuration
primary:
  wal_level: replica
  max_wal_senders: 10
  synchronous_commit: on
  synchronous_standby_names: 'replica1'

# Replica configuration
replica:
  hot_standby: on
  primary_conninfo: "host=primary port=5432 user=replication"
  restore_command: "aws s3 cp s3://cortex-wal-archive/%f %p"
  recovery_target_timeline: latest
```

---

### 2.3 Cache (Redis)

**Use Cases:**

| Use Case | Key Pattern | TTL | Data Structure |
|----------|-------------|-----|----------------|
| Sessions | `session:{token}` | 24h | Hash |
| Job Queue | `bull:{queue}:*` | - | List/Sorted Set |
| API Cache | `cache:api:{endpoint}:{hash}` | 5m | String |
| Rate Limits | `ratelimit:{principal}:{window}` | 1m | String |
| Real-time | `pubsub:{channel}` | - | Pub/Sub |

**Memory Requirements:**

| Deployment Size | Memory | Persistence |
|-----------------|--------|-------------|
| Small | 1GB | RDB hourly |
| Medium | 4GB | RDB + AOF |
| Large | 16GB+ | AOF always |

**Configuration:**
```conf
# redis.conf for production

# Memory
maxmemory 4gb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Security
requirepass ${REDIS_PASSWORD}
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command DEBUG ""

# Performance
tcp-keepalive 300
timeout 0
tcp-backlog 511

# Replication (for HA)
replica-read-only yes
repl-diskless-sync yes
```

---

### 2.4 Object Storage

**Provider Options:**

| Provider | Use Case | Pros | Cons |
|----------|----------|------|------|
| AWS S3 | Production cloud | Mature, reliable | Cost at scale |
| MinIO | Self-hosted | S3-compatible, free | Self-managed |
| GCS | GCP users | Good integration | Vendor lock-in |
| Azure Blob | Azure users | Good integration | Different API |

**Bucket Structure:**
```
cortex-{environment}/
├── attachments/
│   └── {year}/{month}/{day}/
│       └── {observation_id}/{filename}
├── exports/
│   └── {principal_id}/
│       └── {export_id}.zip
├── backups/
│   └── database/
│       └── {date}/
│           ├── full.sql.gz
│           └── wal/
└── temp/
    └── uploads/
        └── {upload_id}
```

**Lifecycle Policies:**
```json
{
  "Rules": [
    {
      "ID": "CleanupTempUploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "temp/uploads/"
      },
      "Expiration": {
        "Days": 1
      }
    },
    {
      "ID": "ArchiveOldAttachments",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "attachments/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    },
    {
      "ID": "DeleteOldExports",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "exports/"
      },
      "Expiration": {
        "Days": 30
      }
    },
    {
      "ID": "ManageBackupRetention",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "backups/"
      },
      "Expiration": {
        "Days": 90
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 30
      }
    }
  ]
}
```

---

### 2.5 Search Infrastructure

**pgvector Configuration:**
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embedding column
ALTER TABLE content_embeddings
ADD COLUMN embedding vector(1536);

-- Create HNSW index for fast similarity search
CREATE INDEX ON content_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create index on common query patterns
CREATE INDEX idx_embeddings_content_type
ON content_embeddings (content_type, content_id);

-- Vacuum and analyze after bulk operations
VACUUM ANALYZE content_embeddings;
```

**When to Consider Elasticsearch:**

| Criteria | pgvector Sufficient | Consider Elasticsearch |
|----------|---------------------|------------------------|
| Document count | < 1M | > 5M |
| Query complexity | Simple filters | Complex faceted search |
| Write volume | < 1000/min | > 5000/min |
| Search latency | < 100ms acceptable | < 20ms required |
| Full-text features | Basic | Advanced (synonyms, etc.) |

**Elasticsearch Setup (if needed):**
```yaml
# elasticsearch.yml
cluster.name: cortex-search
node.name: search-1

network.host: 0.0.0.0
http.port: 9200

discovery.type: single-node  # For small deployments

# Memory (50% of available RAM)
ES_JAVA_OPTS: "-Xms4g -Xmx4g"

# Index settings
index:
  number_of_shards: 3
  number_of_replicas: 1
  refresh_interval: 1s
```

---

## 3. Container Architecture

### 3.1 Docker Images

**Base Images:**
```dockerfile
# API and Web - Node.js
FROM node:20-alpine AS base

# Worker - Node.js with additional tools
FROM node:20-alpine AS worker-base
RUN apk add --no-cache python3 make g++

# Sidecar - Rust
FROM rust:1.75-alpine AS sidecar-base
RUN apk add --no-cache musl-dev openssl-dev
```

**Dockerfile Best Practices:**

```dockerfile
# Dockerfile.api
# Multi-stage build for optimal size

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

# Stage 3: Production
FROM node:20-alpine AS production

# Security: Non-root user
RUN addgroup --system --gid 1001 cortex && \
    adduser --system --uid 1001 cortex

WORKDIR /app

# Copy only production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Security hardening
RUN chown -R cortex:cortex /app
USER cortex

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

**Sidecar Dockerfile:**
```dockerfile
# Dockerfile.sidecar
FROM rust:1.75-alpine AS builder

RUN apk add --no-cache musl-dev openssl-dev pkgconfig

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release --target x86_64-unknown-linux-musl

# Final image
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

COPY --from=builder /build/target/x86_64-unknown-linux-musl/release/cortexd /usr/local/bin/

# Non-root user
RUN adduser -D -u 1001 cortex
USER cortex

ENTRYPOINT ["/usr/local/bin/cortexd"]
```

**Image Versioning:**
```yaml
# Tagging strategy
tags:
  # Semantic versioning
  - "v1.2.3"

  # Branch-based (for development)
  - "main-{short_sha}"
  - "feature-{branch}-{short_sha}"

  # Environment-based
  - "latest"      # Latest stable release
  - "staging"     # Current staging build
  - "edge"        # Latest main branch

# Example CI tagging
image_tags:
  production: "ghcr.io/org/cortex-api:v${VERSION}"
  staging: "ghcr.io/org/cortex-api:staging-${SHA}"
  development: "ghcr.io/org/cortex-api:dev-${BRANCH}-${SHA}"
```

---

### 3.2 Docker Compose (Development)

```yaml
# docker-compose.yml - Complete development stack
version: "3.9"

x-common-env: &common-env
  NODE_ENV: development
  LOG_LEVEL: debug
  DATABASE_URL: postgresql://cortex:cortex_dev@postgres:5432/cortex_dev
  REDIS_URL: redis://redis:6379/0
  S3_ENDPOINT: http://minio:9000
  S3_ACCESS_KEY: minioadmin
  S3_SECRET_KEY: minioadmin

services:
  # ===================
  # Infrastructure
  # ===================
  postgres:
    image: pgvector/pgvector:pg16
    container_name: cortex-postgres
    environment:
      POSTGRES_USER: cortex
      POSTGRES_PASSWORD: cortex_dev
      POSTGRES_DB: cortex_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./scripts/init-extensions.sql:/docker-entrypoint-initdb.d/02-extensions.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cortex -d cortex_dev"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - cortex-network

  redis:
    image: redis:7-alpine
    container_name: cortex-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - cortex-network

  minio:
    image: minio/minio:latest
    container_name: cortex-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cortex-network

  minio-init:
    image: minio/mc:latest
    container_name: cortex-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/cortex-attachments;
      mc mb --ignore-existing local/cortex-backups;
      mc mb --ignore-existing local/cortex-exports;
      mc anonymous set download local/cortex-attachments;
      exit 0;
      "
    networks:
      - cortex-network

  # ===================
  # Application Services
  # ===================
  api:
    build:
      context: ./packages/api
      dockerfile: Dockerfile
      target: development
    container_name: cortex-api
    environment:
      <<: *common-env
      API_PORT: 3000
      JWT_SECRET: dev-jwt-secret-32-chars-minimum!!
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    ports:
      - "3000:3000"
      - "9229:9229"  # Node.js debugger
    volumes:
      - ./packages/api/src:/app/src:ro
      - ./packages/shared:/app/packages/shared:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - cortex-network

  worker:
    build:
      context: ./packages/worker
      dockerfile: Dockerfile
      target: development
    container_name: cortex-worker
    environment:
      <<: *common-env
      WORKER_CONCURRENCY: 5
    volumes:
      - ./packages/worker/src:/app/src:ro
      - ./packages/shared:/app/packages/shared:ro
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      api:
        condition: service_healthy
    networks:
      - cortex-network

  web:
    build:
      context: ./packages/web
      dockerfile: Dockerfile
      target: development
    container_name: cortex-web
    environment:
      NODE_ENV: development
      VITE_API_URL: http://localhost:3000/api/v2
    ports:
      - "3001:3001"
    volumes:
      - ./packages/web/src:/app/src:ro
    depends_on:
      api:
        condition: service_healthy
    networks:
      - cortex-network

  # ===================
  # Development Tools
  # ===================
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: cortex-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@cortex.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    depends_on:
      - postgres
    networks:
      - cortex-network
    profiles:
      - tools

  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: cortex-redis-commander
    environment:
      REDIS_HOSTS: local:redis:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis
    networks:
      - cortex-network
    profiles:
      - tools

networks:
  cortex-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  minio_data:
  pgadmin_data:
```

---

### 3.3 Kubernetes (Production)

**Namespace and Resource Quotas:**
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cortex
  labels:
    name: cortex
    environment: production
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cortex-quota
  namespace: cortex
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
```

**API Deployment:**
```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-api
  namespace: cortex
  labels:
    app: cortex
    component: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: cortex
      component: api
  template:
    metadata:
      labels:
        app: cortex
        component: api
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: cortex-api
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001

      containers:
        - name: api
          image: ghcr.io/org/cortex-api:v1.0.0
          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 3000
              protocol: TCP

          envFrom:
            - configMapRef:
                name: cortex-config
            - secretRef:
                name: cortex-secrets

          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"

          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          volumeMounts:
            - name: tmp
              mountPath: /tmp

      volumes:
        - name: tmp
          emptyDir: {}

      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: cortex
                    component: api
                topologyKey: kubernetes.io/hostname

      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: cortex
              component: api
```

**Worker Deployment:**
```yaml
# worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cortex-worker
  namespace: cortex
  labels:
    app: cortex
    component: worker
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  selector:
    matchLabels:
      app: cortex
      component: worker
  template:
    metadata:
      labels:
        app: cortex
        component: worker
    spec:
      serviceAccountName: cortex-worker
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001

      containers:
        - name: worker
          image: ghcr.io/org/cortex-worker:v1.0.0

          envFrom:
            - configMapRef:
                name: cortex-config
            - secretRef:
                name: cortex-secrets

          env:
            - name: WORKER_CONCURRENCY
              value: "10"

          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"

          livenessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - "curl -f http://localhost:3001/health || exit 1"
            initialDelaySeconds: 30
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3

      terminationGracePeriodSeconds: 300  # Allow jobs to complete
```

**Services:**
```yaml
# services.yaml
apiVersion: v1
kind: Service
metadata:
  name: cortex-api
  namespace: cortex
  labels:
    app: cortex
    component: api
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: cortex
    component: api
---
apiVersion: v1
kind: Service
metadata:
  name: cortex-web
  namespace: cortex
  labels:
    app: cortex
    component: web
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3001
      protocol: TCP
      name: http
  selector:
    app: cortex
    component: web
```

**ConfigMaps and Secrets:**
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cortex-config
  namespace: cortex
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
  API_PORT: "3000"
  CORS_ORIGINS: "https://cortex.example.com"
  S3_BUCKET_ATTACHMENTS: "cortex-attachments"
  S3_BUCKET_BACKUPS: "cortex-backups"
  FEATURE_SEMANTIC_SEARCH: "true"
  FEATURE_DRAFTS: "true"
  RATE_LIMIT_WINDOW_MS: "60000"
  RATE_LIMIT_MAX_REQUESTS: "100"
---
# secrets.yaml (use sealed-secrets or external secrets in practice)
apiVersion: v1
kind: Secret
metadata:
  name: cortex-secrets
  namespace: cortex
type: Opaque
stringData:
  DATABASE_URL: "postgresql://cortex:PASSWORD@postgres:5432/cortex"
  REDIS_URL: "redis://:PASSWORD@redis:6379/0"
  JWT_SECRET: "your-32-char-minimum-jwt-secret!!"
  S3_ACCESS_KEY: "access-key"
  S3_SECRET_KEY: "secret-key"
  OPENAI_API_KEY: "sk-..."
```

**Horizontal Pod Autoscaler:**
```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cortex-api-hpa
  namespace: cortex
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cortex-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

**Ingress Configuration:**
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cortex-ingress
  namespace: cortex
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/websocket-services: "cortex-api"
spec:
  tls:
    - hosts:
        - cortex.example.com
        - api.cortex.example.com
      secretName: cortex-tls
  rules:
    - host: cortex.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: cortex-api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: cortex-web
                port:
                  number: 80
    - host: api.cortex.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: cortex-api
                port:
                  number: 80
```

---

## 4. Configuration Management

### 4.1 Environment Variables

**Complete Environment Variable Reference:**

```bash
# ============================================
# DATABASE
# ============================================
DATABASE_URL=postgresql://user:pass@host:5432/db  # Required
DATABASE_POOL_SIZE=20                              # Default: 20
DATABASE_POOL_MIN=5                                # Default: 5
DATABASE_SSL_MODE=require                          # Options: disable, require, verify-full
DATABASE_STATEMENT_TIMEOUT=30000                   # ms, Default: 30000

# ============================================
# REDIS
# ============================================
REDIS_URL=redis://:pass@host:6379/0               # Required
REDIS_TLS_ENABLED=false                           # Default: false
REDIS_KEY_PREFIX=cortex:                          # Default: cortex:

# ============================================
# OBJECT STORAGE (S3-compatible)
# ============================================
S3_ENDPOINT=https://s3.amazonaws.com              # Required for non-AWS
S3_REGION=us-east-1                               # Default: us-east-1
S3_ACCESS_KEY=                                    # Required
S3_SECRET_KEY=                                    # Required
S3_BUCKET_ATTACHMENTS=cortex-attachments          # Required
S3_BUCKET_BACKUPS=cortex-backups                  # Required
S3_BUCKET_EXPORTS=cortex-exports                  # Required
S3_PRESIGNED_URL_EXPIRY=3600                      # seconds, Default: 3600

# ============================================
# API CONFIGURATION
# ============================================
NODE_ENV=production                               # Required: development|staging|production
API_HOST=0.0.0.0                                  # Default: 0.0.0.0
API_PORT=3000                                     # Default: 3000
API_BASE_PATH=/api/v2                             # Default: /api/v2
CORS_ORIGINS=https://cortex.example.com           # Comma-separated list
CORS_CREDENTIALS=true                             # Default: true

# ============================================
# AUTHENTICATION
# ============================================
JWT_SECRET=                                       # Required, min 32 chars
JWT_EXPIRY=24h                                    # Default: 24h
JWT_REFRESH_EXPIRY=7d                             # Default: 7d
AGENT_TOKEN_EXPIRY=1h                             # Default: 1h
SESSION_SECRET=                                   # Required for web sessions
SESSION_MAX_AGE=86400000                          # ms, Default: 24h

# ============================================
# EMBEDDINGS & AI
# ============================================
OPENAI_API_KEY=                                   # Required for semantic search
OPENAI_ORG_ID=                                    # Optional
EMBEDDING_MODEL=text-embedding-3-small            # Default: text-embedding-3-small
EMBEDDING_DIMENSIONS=1536                         # Default: 1536
EMBEDDING_BATCH_SIZE=100                          # Default: 100

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_ENABLED=true                           # Default: true
RATE_LIMIT_WINDOW_MS=60000                        # Default: 60000 (1 min)
RATE_LIMIT_MAX_REQUESTS=100                       # Default: 100
RATE_LIMIT_TRUST_PROXY=true                       # Default: true

# ============================================
# BACKGROUND JOBS
# ============================================
WORKER_CONCURRENCY=10                             # Default: 10
JOB_RETRY_ATTEMPTS=3                              # Default: 3
JOB_RETRY_DELAY=5000                              # ms, Default: 5000

# Job schedules (cron format)
SUMMARY_JOB_SCHEDULE=0 * * * *                    # Default: hourly
DIGEST_JOB_SCHEDULE=0 0 * * *                     # Default: daily
REVIEW_REMINDER_SCHEDULE=0 9 * * 1-5              # Default: 9am weekdays
CLEANUP_JOB_SCHEDULE=0 2 * * *                    # Default: 2am daily

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=info                                    # Options: debug|info|warn|error
LOG_FORMAT=json                                   # Options: json|pretty
LOG_INCLUDE_TIMESTAMP=true                        # Default: true
LOG_INCLUDE_REQUEST_ID=true                       # Default: true

# ============================================
# MONITORING
# ============================================
METRICS_ENABLED=true                              # Default: true
METRICS_PORT=9090                                 # Default: 9090
METRICS_PATH=/metrics                             # Default: /metrics
TRACING_ENABLED=true                              # Default: false
TRACING_ENDPOINT=http://jaeger:4318               # OpenTelemetry endpoint
TRACING_SAMPLE_RATE=0.1                           # Default: 0.1 (10%)

# ============================================
# FEATURE FLAGS
# ============================================
FEATURE_SEMANTIC_SEARCH=true                      # Default: true
FEATURE_DRAFTS=true                               # Default: true
FEATURE_OBSERVATIONS=true                         # Default: true
FEATURE_NOTIFICATIONS=true                        # Default: true
FEATURE_REAL_TIME=true                            # Default: true
FEATURE_EXPERIMENTAL=false                        # Default: false

# ============================================
# SECURITY
# ============================================
ENCRYPTION_KEY=                                   # Required, 32-byte hex
SECRET_SCANNING_ENABLED=true                      # Default: true
MAX_UPLOAD_SIZE=104857600                         # bytes, Default: 100MB
ALLOWED_FILE_TYPES=image/*,application/pdf,text/* # Comma-separated

# ============================================
# SIDECAR CONFIGURATION
# ============================================
CORTEX_API_URL=https://api.cortex.example.com     # Required for sidecar
CORTEX_API_KEY=                                   # Required for sidecar
SIDECAR_CACHE_SIZE_MB=500                         # Default: 500
SIDECAR_SYNC_INTERVAL=30                          # seconds, Default: 30
SIDECAR_OFFLINE_QUEUE_SIZE=1000                   # Default: 1000
```

---

### 4.2 Secrets Management

**Secret Categories:**

| Category | Examples | Rotation Frequency |
|----------|----------|-------------------|
| Database | Passwords, connection strings | 90 days |
| API Keys | JWT secrets, encryption keys | 180 days |
| Third-Party | OpenAI API key | As needed |
| Agent Keys | Per-agent API keys | 30 days |
| TLS | Certificates | Before expiry |

**Storage Options:**

| Option | Use Case | Pros | Cons |
|--------|----------|------|------|
| Kubernetes Secrets | K8s deployments | Native, simple | Base64 only |
| HashiCorp Vault | Enterprise | Full-featured | Complex |
| AWS Secrets Manager | AWS deployments | Managed, rotation | Vendor lock-in |
| Sealed Secrets | GitOps | Git-friendly | K8s only |

**Vault Integration Example:**
```yaml
# vault-agent-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vault-agent-config
data:
  config.hcl: |
    exit_after_auth = true

    auto_auth {
      method "kubernetes" {
        mount_path = "auth/kubernetes"
        config = {
          role = "cortex-api"
        }
      }

      sink "file" {
        config = {
          path = "/vault/secrets/.vault-token"
        }
      }
    }

    template {
      source = "/vault/templates/secrets.ctmpl"
      destination = "/vault/secrets/env"
    }
---
# secrets.ctmpl
{{ with secret "secret/data/cortex/production" }}
DATABASE_URL={{ .Data.data.database_url }}
JWT_SECRET={{ .Data.data.jwt_secret }}
OPENAI_API_KEY={{ .Data.data.openai_api_key }}
{{ end }}
```

**Secret Rotation Procedures:**

```bash
# Database password rotation
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update database user
psql -c "ALTER USER cortex PASSWORD '${NEW_PASSWORD}';"

# 3. Update secret in Vault/K8s
kubectl create secret generic cortex-secrets \
  --from-literal=DATABASE_URL="postgresql://cortex:${NEW_PASSWORD}@postgres:5432/cortex" \
  --dry-run=client -o yaml | kubectl apply -f -

# 4. Trigger rolling restart
kubectl rollout restart deployment/cortex-api -n cortex
kubectl rollout restart deployment/cortex-worker -n cortex

# 5. Verify
kubectl rollout status deployment/cortex-api -n cortex
```

---

## 5. Monitoring and Observability

### 5.1 Metrics

**Application Metrics:**

```typescript
// Metrics to collect
const metrics = {
  // HTTP Metrics
  http_requests_total: Counter,           // Labels: method, path, status
  http_request_duration_seconds: Histogram, // Labels: method, path
  http_request_size_bytes: Histogram,
  http_response_size_bytes: Histogram,

  // Database Metrics
  db_query_duration_seconds: Histogram,   // Labels: operation, table
  db_connections_active: Gauge,
  db_connections_idle: Gauge,
  db_errors_total: Counter,               // Labels: operation, error_type

  // Redis Metrics
  redis_operations_total: Counter,        // Labels: operation, status
  redis_operation_duration_seconds: Histogram,

  // Business Metrics
  observations_created_total: Counter,    // Labels: type, subcortex
  drafts_created_total: Counter,
  drafts_approved_total: Counter,
  drafts_rejected_total: Counter,
  artifacts_created_total: Counter,       // Labels: type, status
  search_queries_total: Counter,          // Labels: type (keyword/semantic)
  search_duration_seconds: Histogram,

  // Queue Metrics
  job_queue_size: Gauge,                  // Labels: queue_name
  job_processing_duration_seconds: Histogram,
  job_failures_total: Counter,            // Labels: queue_name, error_type

  // Sidecar Metrics (aggregated)
  sidecar_connections_active: Gauge,
  sidecar_sync_duration_seconds: Histogram,
  sidecar_offline_queue_size: Gauge,
};
```

**Infrastructure Metrics:**

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| CPU utilization | Node exporter | > 80% for 5m |
| Memory utilization | Node exporter | > 85% for 5m |
| Disk utilization | Node exporter | > 80% |
| Network I/O | Node exporter | Anomaly detection |
| Container restarts | Kubernetes | > 3 in 10m |
| Pod pending | Kubernetes | > 0 for 5m |

**Alerting Thresholds:**

```yaml
# prometheus-rules.yaml
groups:
  - name: cortex-api
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High API latency"
          description: "P95 latency is {{ $value }}s"

      - alert: DatabaseConnectionsExhausted
        expr: db_connections_active / db_connections_max > 0.9
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connections near limit"

      - alert: QueueBacklogGrowing
        expr: |
          increase(job_queue_size[1h]) > 1000
          and job_queue_size > 500
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Job queue backlog growing"

      - alert: DraftReviewBacklog
        expr: |
          cortex_drafts_pending_review > 100
        for: 24h
        labels:
          severity: info
        annotations:
          summary: "Large draft review backlog"
```

---

### 5.2 Logging

**Log Format (Structured JSON):**

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "service": "cortex-api",
  "version": "1.2.3",
  "environment": "production",
  "request_id": "req_abc123",
  "trace_id": "trace_xyz789",
  "span_id": "span_def456",
  "user_id": "user_123",
  "principal_type": "human",
  "message": "Request completed",
  "context": {
    "method": "POST",
    "path": "/api/v2/observations",
    "status": 201,
    "duration_ms": 45,
    "bytes_in": 1024,
    "bytes_out": 256
  }
}
```

**Log Levels:**

| Level | Use Case | Production |
|-------|----------|------------|
| error | Unhandled errors, failures | Always logged |
| warn | Recoverable issues, deprecations | Always logged |
| info | Request completion, key events | Always logged |
| debug | Detailed debugging info | Disabled |
| trace | Very detailed tracing | Disabled |

**Log Aggregation (Loki):**

```yaml
# promtail-config.yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    pipeline_stages:
      - json:
          expressions:
            level: level
            service: service
            request_id: request_id
      - labels:
          level:
          service:
      - timestamp:
          source: timestamp
          format: RFC3339Nano
    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
```

**Log Retention:**

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Development | 7 days | Local |
| Staging | 14 days | Cloud |
| Production | 90 days | Cloud + archive |

---

### 5.3 Tracing

**OpenTelemetry Setup:**

```typescript
// tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'cortex-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.TRACING_ENDPOINT,
  }),
  instrumentations: [
    // Auto-instrumentation
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health', '/metrics'],
      },
      '@opentelemetry/instrumentation-pg': {
        enhancedDatabaseReporting: true,
      },
    }),
  ],
});

sdk.start();
```

**Trace Sampling:**

```yaml
# Sampling configuration
sampling:
  # Sample 10% of all traces
  default_rate: 0.1

  # Always sample errors
  error_rate: 1.0

  # Always sample slow requests (>500ms)
  slow_request_threshold_ms: 500
  slow_request_rate: 1.0

  # Per-endpoint sampling
  endpoints:
    "/api/v2/search": 0.5      # Sample 50% of searches
    "/api/v2/observations": 0.05  # Sample 5% of observations
    "/health": 0.0              # Never sample health checks
```

---

### 5.4 Dashboards

**Key Dashboards:**

1. **System Overview**
   - Request rate (total, by endpoint)
   - Error rate (by type, by endpoint)
   - Latency (P50, P95, P99)
   - Active users (human vs agent)

2. **Infrastructure Health**
   - CPU/Memory/Disk across all services
   - Database connections and query times
   - Redis memory and operations
   - Object storage operations

3. **Business Metrics**
   - Observations created (by type, trend)
   - Drafts pending review
   - Artifact promotion rate
   - Search usage and effectiveness

4. **Queue Monitoring**
   - Queue depth by job type
   - Processing rate
   - Failure rate
   - Oldest job age

**SLI/SLO Definitions:**

```yaml
slos:
  - name: API Availability
    sli: |
      sum(rate(http_requests_total{status!~"5.."}[5m]))
      / sum(rate(http_requests_total[5m]))
    target: 0.999  # 99.9%
    window: 30d

  - name: API Latency
    sli: |
      histogram_quantile(0.95,
        rate(http_request_duration_seconds_bucket[5m])
      ) < 0.5
    target: 0.99  # 99% of windows
    window: 30d

  - name: Search Latency
    sli: |
      histogram_quantile(0.95,
        rate(search_duration_seconds_bucket[5m])
      ) < 1.0
    target: 0.95
    window: 30d

  - name: Background Job Processing
    sli: |
      rate(job_completed_total[1h])
      / rate(job_created_total[1h])
    target: 0.999
    window: 7d
```

---

## 6. Backup and Recovery

### 6.1 Database Backups

**Backup Strategy:**

| Type | Frequency | Retention | Method |
|------|-----------|-----------|--------|
| Full | Daily | 30 days | pg_dump |
| Incremental | Hourly | 7 days | WAL archiving |
| Transaction logs | Continuous | 7 days | WAL streaming |

**Backup Script:**

```bash
#!/bin/bash
# backup-database.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/backups/postgres"
S3_BUCKET="s3://cortex-backups/database"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="cortex_${DATE}.sql.gz"

# Create backup
echo "Starting backup at $(date)"
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="${BACKUP_DIR}/${BACKUP_FILE}"

# Calculate checksum
sha256sum "${BACKUP_DIR}/${BACKUP_FILE}" > "${BACKUP_DIR}/${BACKUP_FILE}.sha256"

# Upload to S3
aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" "${S3_BUCKET}/${BACKUP_FILE}"
aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}.sha256" "${S3_BUCKET}/${BACKUP_FILE}.sha256"

# Clean old local backups
find "${BACKUP_DIR}" -name "cortex_*.sql.gz" -mtime +7 -delete

# Clean old S3 backups (lifecycle policy handles this, but belt and suspenders)
aws s3 ls "${S3_BUCKET}/" | while read -r line; do
  file_date=$(echo "$line" | awk '{print $1}')
  if [[ $(date -d "$file_date" +%s) -lt $(date -d "-${RETENTION_DAYS} days" +%s) ]]; then
    file_name=$(echo "$line" | awk '{print $4}')
    aws s3 rm "${S3_BUCKET}/${file_name}"
  fi
done

echo "Backup completed at $(date)"
```

**Backup Verification:**

```bash
#!/bin/bash
# verify-backup.sh

set -euo pipefail

BACKUP_FILE=$1
VERIFY_DB="cortex_verify_$(date +%s)"

# Download and verify checksum
aws s3 cp "s3://cortex-backups/database/${BACKUP_FILE}" /tmp/
aws s3 cp "s3://cortex-backups/database/${BACKUP_FILE}.sha256" /tmp/
cd /tmp && sha256sum -c "${BACKUP_FILE}.sha256"

# Create test database
createdb "${VERIFY_DB}"

# Restore
pg_restore \
  --dbname="${VERIFY_DB}" \
  --verbose \
  "/tmp/${BACKUP_FILE}"

# Run verification queries
psql -d "${VERIFY_DB}" -c "SELECT COUNT(*) FROM principals;"
psql -d "${VERIFY_DB}" -c "SELECT COUNT(*) FROM threads;"
psql -d "${VERIFY_DB}" -c "SELECT COUNT(*) FROM artifacts;"

# Cleanup
dropdb "${VERIFY_DB}"
rm -f "/tmp/${BACKUP_FILE}" "/tmp/${BACKUP_FILE}.sha256"

echo "Backup verification successful"
```

**Point-in-Time Recovery:**

```bash
#!/bin/bash
# pit-recovery.sh

TARGET_TIME=$1  # Format: "2024-01-15 10:30:00"

# Stop services
kubectl scale deployment cortex-api --replicas=0 -n cortex
kubectl scale deployment cortex-worker --replicas=0 -n cortex

# Find the appropriate base backup
BASE_BACKUP=$(aws s3 ls s3://cortex-backups/database/ | \
  awk -v target="$TARGET_TIME" '$1" "$2 < target {print $4}' | \
  tail -1)

# Restore base backup
pg_restore --dbname=cortex_recovery "${BASE_BACKUP}"

# Configure recovery
cat > /var/lib/postgresql/data/recovery.signal <<EOF
EOF

cat >> /var/lib/postgresql/data/postgresql.conf <<EOF
restore_command = 'aws s3 cp s3://cortex-wal-archive/%f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# Restart PostgreSQL
systemctl restart postgresql

# Wait for recovery
while [ -f /var/lib/postgresql/data/recovery.signal ]; do
  sleep 5
done

# Verify and swap
# ... verification steps ...

# Restart services
kubectl scale deployment cortex-api --replicas=3 -n cortex
kubectl scale deployment cortex-worker --replicas=2 -n cortex
```

---

### 6.2 File Storage Backups

**Backup Strategy:**

```yaml
file_storage_backup:
  # Cross-region replication (preferred)
  replication:
    enabled: true
    source_region: us-east-1
    destination_region: us-west-2

  # Nightly snapshot (additional protection)
  snapshots:
    enabled: true
    schedule: "0 3 * * *"  # 3 AM daily
    retention_days: 30

  # Versioning
  versioning:
    enabled: true
    noncurrent_expiration_days: 30
```

**S3 Replication Configuration:**

```json
{
  "Role": "arn:aws:iam::ACCOUNT:role/s3-replication-role",
  "Rules": [
    {
      "ID": "ReplicateAttachments",
      "Status": "Enabled",
      "Priority": 1,
      "Filter": {
        "Prefix": "attachments/"
      },
      "Destination": {
        "Bucket": "arn:aws:s3:::cortex-attachments-replica",
        "ReplicationTime": {
          "Status": "Enabled",
          "Time": {
            "Minutes": 15
          }
        },
        "Metrics": {
          "Status": "Enabled",
          "EventThreshold": {
            "Minutes": 15
          }
        }
      },
      "DeleteMarkerReplication": {
        "Status": "Enabled"
      }
    }
  ]
}
```

---

### 6.3 Recovery Procedures

**RTO/RPO Targets:**

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single service failure | 5 minutes | 0 |
| Database failure (with replica) | 15 minutes | < 1 minute |
| Database failure (from backup) | 2 hours | 1 hour |
| Full region failure | 4 hours | 1 hour |
| Catastrophic (all regions) | 24 hours | 24 hours |

---

## 7. Disaster Recovery

### 7.1 Failure Scenarios

| Scenario | Detection | Automatic Recovery | Manual Steps |
|----------|-----------|-------------------|--------------|
| API pod crash | Health check | Yes (K8s restart) | None |
| Database primary down | Connection errors | Replica promotion | Verify, update DNS |
| Redis failure | Connection errors | Restart pod | Clear if needed |
| Object storage unavailable | S3 errors | Retry with backoff | Failover to replica |
| Full AZ failure | Multiple alerts | Traffic shift | Verify, scale up |
| Region failure | External monitoring | DNS failover | Full DR procedure |

### 7.2 Failover Procedures

**Database Failover:**

```bash
#!/bin/bash
# database-failover.sh

set -euo pipefail

echo "=== Database Failover Procedure ==="

# 1. Verify primary is truly down
echo "Step 1: Verifying primary status..."
if pg_isready -h "${PRIMARY_HOST}" -p 5432 -U cortex; then
  echo "ERROR: Primary appears to be up. Aborting failover."
  exit 1
fi

# 2. Stop writes to prevent split-brain
echo "Step 2: Stopping application writes..."
kubectl scale deployment cortex-api --replicas=0 -n cortex

# 3. Promote replica
echo "Step 3: Promoting replica to primary..."
psql -h "${REPLICA_HOST}" -U postgres -c "SELECT pg_promote();"

# 4. Wait for promotion
sleep 10

# 5. Verify new primary
echo "Step 4: Verifying new primary..."
psql -h "${REPLICA_HOST}" -U cortex -c "SELECT 1;"

# 6. Update connection strings
echo "Step 5: Updating connection strings..."
kubectl create secret generic cortex-secrets \
  --from-literal=DATABASE_URL="postgresql://cortex:${DB_PASSWORD}@${REPLICA_HOST}:5432/cortex" \
  --dry-run=client -o yaml | kubectl apply -f -

# 7. Restart services
echo "Step 6: Restarting services..."
kubectl scale deployment cortex-api --replicas=3 -n cortex
kubectl rollout status deployment cortex-api -n cortex

# 8. Verify application health
echo "Step 7: Verifying application health..."
sleep 30
curl -f "https://api.cortex.example.com/health"

echo "=== Failover complete ==="
```

### 7.3 Communication Plan

**Incident Severity Levels:**

| Level | Description | Response Time | Notification |
|-------|-------------|---------------|--------------|
| P1 | Complete outage | 15 minutes | All hands, executives |
| P2 | Partial outage | 30 minutes | On-call team, manager |
| P3 | Degraded performance | 2 hours | On-call team |
| P4 | Minor issue | 24 hours | Ticket |

**Communication Templates:**

```markdown
# Incident Start
Subject: [P{LEVEL}] Cortex - {Brief Description}

We are investigating an issue affecting Cortex.

**Impact:** {Description of user impact}
**Status:** Investigating
**Started:** {Time}

Updates will be provided every {15/30/60} minutes.

# Incident Update
Subject: [UPDATE] [P{LEVEL}] Cortex - {Brief Description}

**Status:** {Investigating/Identified/Monitoring/Resolved}
**Impact:** {Current impact}
**Root Cause:** {If known}
**Mitigation:** {Steps being taken}
**ETA:** {If known}

Next update in {X} minutes.

# Incident Resolved
Subject: [RESOLVED] Cortex - {Brief Description}

The incident has been resolved.

**Duration:** {Start} - {End} ({Total time})
**Impact:** {Summary}
**Root Cause:** {Description}
**Resolution:** {What fixed it}
**Follow-up:** {Planned improvements}

Full postmortem will be published within 48 hours.
```

### 7.4 Testing Schedule

| Test Type | Frequency | Scope |
|-----------|-----------|-------|
| Backup restoration | Monthly | Random backup |
| Failover drill | Quarterly | Database failover |
| Full DR test | Annually | Complete region failover |
| Chaos engineering | Weekly | Random failure injection |

---

## 8. CI/CD Pipeline

### 8.1 Build Pipeline

**GitHub Actions Workflow:**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ==================
  # Lint and Type Check
  # ==================
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

  # ==================
  # Unit Tests
  # ==================
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm test:unit --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  # ==================
  # Integration Tests
  # ==================
  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: cortex_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run migrations
        run: pnpm db:migrate
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/cortex_test

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/cortex_test
          REDIS_URL: redis://localhost:6379/0

  # ==================
  # Build Docker Images
  # ==================
  build:
    needs: [lint, test-unit, test-integration]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    strategy:
      matrix:
        service: [api, worker, web]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=sha,prefix=

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./packages/${{ matrix.service }}
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ==================
  # Security Scan
  # ==================
  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

---

### 8.2 Deployment Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        type: choice
        options:
          - staging
          - production
      version:
        description: 'Version to deploy (e.g., v1.2.3)'
        required: true

jobs:
  # ==================
  # Deploy to Staging
  # ==================
  deploy-staging:
    if: github.event_name == 'push' || github.event.inputs.environment == 'staging'
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.cortex.example.com

    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}

      - name: Deploy to staging
        run: |
          VERSION=${{ github.event.inputs.version || github.ref_name }}

          # Update image tags
          kubectl set image deployment/cortex-api \
            api=ghcr.io/org/cortex-api:${VERSION} \
            -n cortex-staging

          kubectl set image deployment/cortex-worker \
            worker=ghcr.io/org/cortex-worker:${VERSION} \
            -n cortex-staging

          kubectl set image deployment/cortex-web \
            web=ghcr.io/org/cortex-web:${VERSION} \
            -n cortex-staging

          # Wait for rollout
          kubectl rollout status deployment/cortex-api -n cortex-staging
          kubectl rollout status deployment/cortex-worker -n cortex-staging
          kubectl rollout status deployment/cortex-web -n cortex-staging

      - name: Run smoke tests
        run: |
          ./scripts/smoke-tests.sh https://staging.cortex.example.com

      - name: Notify
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Deployed ${{ github.ref_name }} to staging"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

  # ==================
  # Deploy to Production
  # ==================
  deploy-production:
    if: github.event.inputs.environment == 'production'
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://cortex.example.com

    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_PRODUCTION }}

      - name: Pre-deployment checks
        run: |
          # Verify staging is healthy
          curl -f https://staging.cortex.example.com/health

          # Check for pending migrations
          ./scripts/check-migrations.sh

      - name: Create deployment record
        run: |
          # Record deployment in database for audit
          curl -X POST https://api.cortex.example.com/admin/deployments \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
            -d '{"version": "${{ github.event.inputs.version }}", "deployer": "${{ github.actor }}"}'

      - name: Deploy with canary
        run: |
          VERSION=${{ github.event.inputs.version }}

          # Deploy canary (10% traffic)
          kubectl apply -f k8s/canary/api-canary.yaml
          kubectl set image deployment/cortex-api-canary \
            api=ghcr.io/org/cortex-api:${VERSION} \
            -n cortex

          # Wait and monitor
          sleep 300

          # Check error rates
          ERROR_RATE=$(curl -s "http://prometheus:9090/api/v1/query?query=..." | jq '.data.result[0].value[1]')
          if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
            echo "Canary error rate too high, rolling back"
            kubectl delete -f k8s/canary/api-canary.yaml
            exit 1
          fi

          # Full rollout
          kubectl set image deployment/cortex-api \
            api=ghcr.io/org/cortex-api:${VERSION} \
            -n cortex
          kubectl set image deployment/cortex-worker \
            worker=ghcr.io/org/cortex-worker:${VERSION} \
            -n cortex
          kubectl set image deployment/cortex-web \
            web=ghcr.io/org/cortex-web:${VERSION} \
            -n cortex

          # Cleanup canary
          kubectl delete -f k8s/canary/api-canary.yaml

          # Wait for rollout
          kubectl rollout status deployment/cortex-api -n cortex
          kubectl rollout status deployment/cortex-worker -n cortex
          kubectl rollout status deployment/cortex-web -n cortex

      - name: Post-deployment verification
        run: |
          ./scripts/smoke-tests.sh https://cortex.example.com
          ./scripts/verify-deployment.sh

      - name: Notify
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": ":rocket: Deployed ${{ github.event.inputs.version }} to production"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

**Rollback Procedure:**

```bash
#!/bin/bash
# rollback.sh

set -euo pipefail

PREVIOUS_VERSION=$1

echo "Rolling back to ${PREVIOUS_VERSION}..."

# Rollback deployments
kubectl rollout undo deployment/cortex-api -n cortex
kubectl rollout undo deployment/cortex-worker -n cortex
kubectl rollout undo deployment/cortex-web -n cortex

# Or specify exact version
# kubectl set image deployment/cortex-api api=ghcr.io/org/cortex-api:${PREVIOUS_VERSION} -n cortex

# Wait for rollback
kubectl rollout status deployment/cortex-api -n cortex
kubectl rollout status deployment/cortex-worker -n cortex
kubectl rollout status deployment/cortex-web -n cortex

# Verify
curl -f https://cortex.example.com/health

echo "Rollback complete"
```

---

## 9. Runbooks

### Runbook 1: Initial Deployment

```markdown
# Initial Deployment Runbook

## Prerequisites
- [ ] Kubernetes cluster provisioned
- [ ] PostgreSQL instance created with pgvector extension
- [ ] Redis instance created
- [ ] S3 buckets created
- [ ] DNS configured
- [ ] TLS certificates provisioned
- [ ] Secrets configured in Vault/K8s

## Procedure

### Step 1: Create Namespace and RBAC
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
```

### Step 2: Deploy Secrets and ConfigMaps
```bash
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
```

### Step 3: Run Database Migrations
```bash
kubectl apply -f k8s/jobs/migrate.yaml
kubectl wait --for=condition=complete job/cortex-migrate -n cortex --timeout=300s
```

### Step 4: Deploy Services
```bash
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/services.yaml
```

### Step 5: Configure Ingress
```bash
kubectl apply -f k8s/ingress.yaml
```

### Step 6: Verify Deployment
```bash
kubectl get pods -n cortex
kubectl logs -l app=cortex,component=api -n cortex
curl -f https://cortex.example.com/health
```

### Step 7: Create Initial Admin User
```bash
kubectl exec -it deployment/cortex-api -n cortex -- \
  node scripts/create-admin.js --email admin@example.com
```

### Step 8: Seed Initial Data (Optional)
```bash
kubectl apply -f k8s/jobs/seed.yaml
```

## Verification Checklist
- [ ] All pods running
- [ ] Health endpoints responding
- [ ] Can log in via web UI
- [ ] Can create subcortex
- [ ] Background jobs processing
- [ ] Metrics endpoint accessible
```

---

### Runbook 2: Database Migration

```markdown
# Database Migration Runbook

## Pre-Migration Checklist
- [ ] Backup completed and verified
- [ ] Migration tested on staging
- [ ] Rollback plan prepared
- [ ] Maintenance window scheduled
- [ ] Team notified

## Procedure

### Step 1: Create Fresh Backup
```bash
./scripts/backup-database.sh
./scripts/verify-backup.sh cortex_$(date +%Y-%m-%d).sql.gz
```

### Step 2: Put System in Maintenance Mode (if needed)
```bash
kubectl scale deployment cortex-api --replicas=0 -n cortex
kubectl scale deployment cortex-worker --replicas=0 -n cortex
```

### Step 3: Run Migration
```bash
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: cortex-migrate-$(date +%s)
  namespace: cortex
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: ghcr.io/org/cortex-api:${VERSION}
        command: ["pnpm", "db:migrate"]
        envFrom:
        - secretRef:
            name: cortex-secrets
      restartPolicy: Never
  backoffLimit: 0
EOF

kubectl wait --for=condition=complete job/cortex-migrate-* -n cortex --timeout=600s
```

### Step 4: Verify Migration
```bash
kubectl logs job/cortex-migrate-* -n cortex
psql $DATABASE_URL -c "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

### Step 5: Restart Services
```bash
kubectl scale deployment cortex-api --replicas=3 -n cortex
kubectl scale deployment cortex-worker --replicas=2 -n cortex
kubectl rollout status deployment cortex-api -n cortex
```

### Step 6: Verify Application
```bash
curl -f https://cortex.example.com/health
./scripts/smoke-tests.sh
```

## Rollback Procedure
If migration fails:
```bash
# Restore from backup
./scripts/restore-database.sh cortex_YYYY-MM-DD.sql.gz

# Restart services with previous version
kubectl set image deployment/cortex-api api=ghcr.io/org/cortex-api:${PREVIOUS_VERSION} -n cortex
```
```

---

### Runbook 3: Scaling Up/Down

```markdown
# Scaling Runbook

## Horizontal Scaling

### Scale API Pods
```bash
# Manual scaling
kubectl scale deployment cortex-api --replicas=5 -n cortex

# Update HPA limits
kubectl patch hpa cortex-api-hpa -n cortex \
  --patch '{"spec":{"maxReplicas":10}}'
```

### Scale Worker Pods
```bash
kubectl scale deployment cortex-worker --replicas=4 -n cortex
```

## Vertical Scaling

### Update Resource Limits
```bash
kubectl patch deployment cortex-api -n cortex --patch '
spec:
  template:
    spec:
      containers:
      - name: api
        resources:
          requests:
            cpu: "1000m"
            memory: "2Gi"
          limits:
            cpu: "4000m"
            memory: "8Gi"
'
```

## Database Scaling

### Increase Connection Pool
```bash
kubectl patch configmap cortex-config -n cortex \
  --patch '{"data":{"DATABASE_POOL_SIZE":"50"}}'
kubectl rollout restart deployment cortex-api -n cortex
```

### Add Read Replica
1. Create replica in cloud console
2. Update connection string for read operations
3. Deploy application changes

## Verification
```bash
kubectl get pods -n cortex
kubectl top pods -n cortex
kubectl describe hpa cortex-api-hpa -n cortex
```
```

---

### Runbook 4: Backup Restoration

```markdown
# Backup Restoration Runbook

## Full Database Restore

### Step 1: Identify Backup to Restore
```bash
aws s3 ls s3://cortex-backups/database/ | tail -10
```

### Step 2: Stop Services
```bash
kubectl scale deployment cortex-api --replicas=0 -n cortex
kubectl scale deployment cortex-worker --replicas=0 -n cortex
```

### Step 3: Download Backup
```bash
BACKUP_FILE="cortex_2024-01-15.sql.gz"
aws s3 cp "s3://cortex-backups/database/${BACKUP_FILE}" /tmp/
```

### Step 4: Restore Database
```bash
# Drop and recreate database
psql -h $DB_HOST -U postgres -c "DROP DATABASE cortex;"
psql -h $DB_HOST -U postgres -c "CREATE DATABASE cortex OWNER cortex;"

# Restore
gunzip -c /tmp/${BACKUP_FILE} | pg_restore -h $DB_HOST -U cortex -d cortex
```

### Step 5: Verify Restore
```bash
psql -h $DB_HOST -U cortex -d cortex -c "SELECT COUNT(*) FROM principals;"
psql -h $DB_HOST -U cortex -d cortex -c "SELECT COUNT(*) FROM threads;"
```

### Step 6: Rebuild Indexes (if needed)
```bash
psql -h $DB_HOST -U cortex -d cortex -c "REINDEX DATABASE cortex;"
```

### Step 7: Restart Services
```bash
kubectl scale deployment cortex-api --replicas=3 -n cortex
kubectl scale deployment cortex-worker --replicas=2 -n cortex
```

### Step 8: Trigger Re-indexing
```bash
curl -X POST https://api.cortex.example.com/admin/reindex \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```
```

---

### Runbook 5: Incident Response

```markdown
# Incident Response Runbook

## Initial Response (First 5 Minutes)

### Step 1: Acknowledge and Assess
- [ ] Join incident channel
- [ ] Assess severity (P1-P4)
- [ ] Notify appropriate team members

### Step 2: Quick Diagnostics
```bash
# Check pod status
kubectl get pods -n cortex

# Check recent events
kubectl get events -n cortex --sort-by='.lastTimestamp' | tail -20

# Check logs for errors
kubectl logs -l app=cortex --tail=100 -n cortex | grep -i error

# Check metrics
curl -s http://prometheus:9090/api/v1/query?query=http_requests_total | jq
```

### Step 3: Determine Impact
- What percentage of users are affected?
- What functionality is impaired?
- Is data at risk?

## Mitigation

### Common Issues and Fixes

#### High Error Rate
```bash
# Check for specific error patterns
kubectl logs deployment/cortex-api -n cortex | grep -i "error\|exception" | tail -50

# If OOM, restart pods
kubectl rollout restart deployment/cortex-api -n cortex

# If database connection issues
kubectl rollout restart deployment/cortex-api -n cortex
```

#### High Latency
```bash
# Check database
psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Check for long-running queries
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query
         FROM pg_stat_activity
         WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '30 seconds';"

# Kill long queries if needed
psql -c "SELECT pg_terminate_backend(PID);"
```

#### Worker Backlog
```bash
# Check queue depth
redis-cli -h redis LLEN bull:default:wait

# Scale workers
kubectl scale deployment cortex-worker --replicas=5 -n cortex
```

## Post-Incident

### Immediate (within 1 hour)
- [ ] Update status page
- [ ] Notify stakeholders of resolution
- [ ] Document timeline

### Follow-up (within 48 hours)
- [ ] Write postmortem
- [ ] Identify action items
- [ ] Schedule review meeting
```

---

### Runbook 6: Secret Rotation

```markdown
# Secret Rotation Runbook

## JWT Secret Rotation

### Step 1: Generate New Secret
```bash
NEW_JWT_SECRET=$(openssl rand -base64 32)
```

### Step 2: Update Secret
```bash
kubectl create secret generic cortex-secrets \
  --from-literal=JWT_SECRET="${NEW_JWT_SECRET}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3: Rolling Restart (maintains existing sessions)
```bash
kubectl rollout restart deployment/cortex-api -n cortex
kubectl rollout status deployment/cortex-api -n cortex
```

### Step 4: Verify
```bash
curl -f https://cortex.example.com/health
# Test authentication
```

## Database Password Rotation

### Step 1: Generate New Password
```bash
NEW_DB_PASSWORD=$(openssl rand -base64 24)
```

### Step 2: Update Database User
```bash
psql -h $DB_HOST -U postgres -c "ALTER USER cortex PASSWORD '${NEW_DB_PASSWORD}';"
```

### Step 3: Update Application Secret
```bash
kubectl create secret generic cortex-secrets \
  --from-literal=DATABASE_URL="postgresql://cortex:${NEW_DB_PASSWORD}@${DB_HOST}:5432/cortex" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 4: Rolling Restart
```bash
kubectl rollout restart deployment/cortex-api -n cortex
kubectl rollout restart deployment/cortex-worker -n cortex
```

## Agent API Key Rotation

### Step 1: Generate New Key for Agent
```bash
curl -X POST https://api.cortex.example.com/principals/{agent_id}/rotate-key \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Step 2: Distribute New Key to Agent Operator
- Securely share new API key
- Update agent configuration

### Step 3: Verify Agent Connectivity
```bash
# Monitor for auth failures from agent
kubectl logs -l app=cortex,component=api -n cortex | grep "auth_failure"
```
```

---

### Runbook 7: SSL Certificate Renewal

```markdown
# SSL Certificate Renewal Runbook

## Automated (cert-manager)

### Check Certificate Status
```bash
kubectl get certificates -n cortex
kubectl describe certificate cortex-tls -n cortex
```

### Force Renewal (if needed)
```bash
kubectl delete secret cortex-tls -n cortex
# cert-manager will automatically request new certificate
```

### Verify New Certificate
```bash
kubectl get secret cortex-tls -n cortex -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout | grep -A2 "Validity"
```

## Manual Renewal

### Step 1: Obtain New Certificate
```bash
# Using certbot
certbot certonly --dns-cloudflare -d cortex.example.com -d api.cortex.example.com
```

### Step 2: Update Secret
```bash
kubectl create secret tls cortex-tls \
  --cert=/etc/letsencrypt/live/cortex.example.com/fullchain.pem \
  --key=/etc/letsencrypt/live/cortex.example.com/privkey.pem \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3: Reload Ingress Controller
```bash
kubectl rollout restart deployment/nginx-ingress-controller -n ingress-nginx
```

### Step 4: Verify
```bash
curl -vI https://cortex.example.com 2>&1 | grep "expire date"
```
```

---

### Runbook 8: Performance Troubleshooting

```markdown
# Performance Troubleshooting Runbook

## Symptoms and Diagnostics

### High API Latency

```bash
# Check P95 latency by endpoint
curl -s 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))' | jq

# Check slow queries
psql -c "SELECT query, calls, mean_time, total_time
         FROM pg_stat_statements
         ORDER BY mean_time DESC LIMIT 10;"

# Check for missing indexes
psql -c "SELECT relname, seq_scan, idx_scan
         FROM pg_stat_user_tables
         WHERE seq_scan > idx_scan
         ORDER BY seq_scan DESC;"
```

### High Memory Usage

```bash
# Check container memory
kubectl top pods -n cortex

# Check for memory leaks (Node.js)
kubectl exec deployment/cortex-api -n cortex -- node --expose-gc -e "gc(); console.log(process.memoryUsage())"

# Check heap dump if needed
kubectl exec deployment/cortex-api -n cortex -- kill -USR2 1
```

### Database Performance

```bash
# Connection status
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Lock contention
psql -c "SELECT blocked_locks.pid AS blocked_pid,
         blocking_locks.pid AS blocking_pid,
         blocked_activity.usename AS blocked_user
         FROM pg_catalog.pg_locks blocked_locks
         JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
         WHERE NOT blocked_locks.granted;"

# Table bloat
psql -c "SELECT schemaname, relname, n_dead_tup, last_vacuum, last_autovacuum
         FROM pg_stat_user_tables
         ORDER BY n_dead_tup DESC LIMIT 10;"
```

### Redis Performance

```bash
# Memory usage
redis-cli INFO memory | grep used_memory_human

# Slow log
redis-cli SLOWLOG GET 10

# Key statistics
redis-cli INFO keyspace
```

## Common Fixes

### Clear Query Cache
```bash
# Redis cache
redis-cli FLUSHDB

# PostgreSQL statistics
psql -c "SELECT pg_stat_reset();"
```

### Force Vacuum
```bash
psql -c "VACUUM ANALYZE;"
```

### Restart with Clean Slate
```bash
kubectl rollout restart deployment/cortex-api -n cortex
kubectl rollout restart deployment/cortex-worker -n cortex
```
```

---

### Runbook 9: Sidecar Deployment/Update

```markdown
# Sidecar Deployment/Update Runbook

## Initial Sidecar Installation

### Step 1: Download Sidecar
```bash
# macOS
curl -L https://releases.cortex.example.com/cortexd/latest/darwin-arm64/cortexd -o /usr/local/bin/cortexd
chmod +x /usr/local/bin/cortexd

# Linux
curl -L https://releases.cortex.example.com/cortexd/latest/linux-amd64/cortexd -o /usr/local/bin/cortexd
chmod +x /usr/local/bin/cortexd

# Windows
Invoke-WebRequest -Uri https://releases.cortex.example.com/cortexd/latest/windows-amd64/cortexd.exe -OutFile cortexd.exe
```

### Step 2: Configure Sidecar
```bash
# Create global config
mkdir -p ~/.cortex
cat > ~/.cortex/config.json <<EOF
{
  "api_url": "https://api.cortex.example.com",
  "api_key": "YOUR_API_KEY"
}
EOF
chmod 600 ~/.cortex/config.json
```

### Step 3: Start Sidecar
```bash
cortex start
```

### Step 4: Verify
```bash
cortex status
```

## Sidecar Update

### Step 1: Check Current Version
```bash
cortexd --version
```

### Step 2: Download New Version
```bash
# Use installer script
curl -sSL https://releases.cortex.example.com/install.sh | bash -s -- --version v1.2.0
```

### Step 3: Restart Sidecar
```bash
cortex stop
cortex start
```

### Step 4: Verify Update
```bash
cortexd --version
cortex status
```

## Troubleshooting

### Sidecar Not Starting
```bash
# Check logs
cat ~/.cortex/logs/cortexd.log

# Check if port is in use
lsof -i :8765

# Reset state
rm -rf ~/.cortex/cache.db
cortex start
```

### Sync Issues
```bash
# Force sync
cortex sync --force

# Clear cache
cortex cache clear

# Check connectivity
curl -v https://api.cortex.example.com/health
```
```

---

### Runbook 10: User Data Export

```markdown
# User Data Export Runbook

## Full User Data Export (GDPR/CCPA)

### Step 1: Validate Request
- Verify user identity
- Log export request in audit log

### Step 2: Generate Export
```bash
curl -X POST https://api.cortex.example.com/admin/exports \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "principal_id": "user_123",
    "include": ["threads", "comments", "observations", "drafts", "artifacts", "audit_log"],
    "format": "json"
  }'
```

### Step 3: Monitor Export Job
```bash
curl https://api.cortex.example.com/admin/exports/{export_id} \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Step 4: Retrieve Export
```bash
# Export is stored in S3
aws s3 cp s3://cortex-exports/user_123/export_2024-01-15.zip ./

# Or via API
curl -O https://api.cortex.example.com/admin/exports/{export_id}/download \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Step 5: Deliver to User
- Securely transfer export file to user
- Log delivery in audit log

## Export Contents

```
export_2024-01-15/
├── manifest.json           # Export metadata
├── principal.json          # User profile
├── threads.json            # Threads created by user
├── comments.json           # Comments made by user
├── observations.json       # Observations created by user
├── drafts.json             # Drafts created by user
├── artifacts.json          # Artifacts authored by user
├── votes.json              # Votes cast by user
├── audit_log.json          # User's audit trail
└── attachments/            # User's uploaded files
    └── {attachment_id}/
        └── {filename}
```

## Data Deletion (Right to Erasure)

### Step 1: Export Data First
Follow export steps above

### Step 2: Anonymize User Data
```bash
curl -X POST https://api.cortex.example.com/admin/principals/{id}/anonymize \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"reason": "GDPR erasure request", "ticket": "TICKET-123"}'
```

### Step 3: Verify Anonymization
```bash
# User data should be anonymized
psql -c "SELECT handle, email FROM principals WHERE id = 'user_123';"
# Should show: anonymous_user_abc123, null
```

### Step 4: Trigger Re-indexing
```bash
curl -X POST https://api.cortex.example.com/admin/reindex \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"scope": "embeddings"}'
```
```

---

## 10. SLA Definitions

### 10.1 Service Level Objectives

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Availability** | 99.9% | Monthly uptime |
| **API Latency (P50)** | < 100ms | Rolling 5-minute |
| **API Latency (P95)** | < 500ms | Rolling 5-minute |
| **API Latency (P99)** | < 1000ms | Rolling 5-minute |
| **Error Rate** | < 0.1% | Rolling 5-minute |
| **Search Latency (P95)** | < 1000ms | Rolling 5-minute |
| **Background Job Processing** | 99.9% | Jobs completed within SLA |

### 10.2 Availability Calculation

```
Availability = (Total Minutes - Downtime Minutes) / Total Minutes * 100

Monthly Minutes = 43,200 (30 days)

99.9% = 43.2 minutes downtime allowed per month
99.95% = 21.6 minutes downtime allowed per month
99.99% = 4.32 minutes downtime allowed per month
```

### 10.3 Maintenance Windows

| Type | Frequency | Duration | Notice |
|------|-----------|----------|--------|
| Scheduled maintenance | Monthly | 2 hours | 7 days |
| Emergency maintenance | As needed | Varies | ASAP |
| Database maintenance | Weekly | 15 minutes | 3 days |

**Maintenance Window Schedule:**
- Primary window: Sunday 02:00-04:00 UTC
- Secondary window: Wednesday 02:00-03:00 UTC

### 10.4 Incident Response SLAs

| Severity | Response Time | Resolution Target |
|----------|--------------|-------------------|
| P1 (Critical) | 15 minutes | 4 hours |
| P2 (Major) | 30 minutes | 8 hours |
| P3 (Minor) | 4 hours | 72 hours |
| P4 (Low) | 24 hours | Best effort |

---

## 11. Cost Estimation

### 11.1 Small Deployment (Single Team, 1-10 users)

**Self-Hosted (Monthly):**

| Component | Specification | Cost |
|-----------|--------------|------|
| Compute (2x API + 1x Worker) | 3x t3.medium | $90 |
| Database (RDS PostgreSQL) | db.t3.medium | $60 |
| Cache (ElastiCache Redis) | cache.t3.micro | $15 |
| Object Storage (S3) | 50GB | $5 |
| Data Transfer | 100GB | $10 |
| **Total** | | **~$180/month** |

**Managed Services Alternative:**

| Service | Cost |
|---------|------|
| Railway/Render | $100-200/month |
| Kubernetes (EKS/GKE small) | $150-250/month |

### 11.2 Medium Deployment (Department, 10-50 users)

**Cloud (Monthly):**

| Component | Specification | Cost |
|-----------|--------------|------|
| Compute (4x API + 4x Worker) | 8x t3.large | $600 |
| Database (RDS PostgreSQL) | db.r6g.large (Multi-AZ) | $400 |
| Cache (ElastiCache Redis) | cache.r6g.large | $200 |
| Object Storage (S3) | 500GB + replication | $50 |
| Load Balancer (ALB) | | $30 |
| Data Transfer | 500GB | $50 |
| Monitoring (CloudWatch) | | $50 |
| Secrets Manager | | $10 |
| **Total** | | **~$1,400/month** |

### 11.3 Large Deployment (Enterprise, 50-200 users)

**Cloud (Monthly):**

| Component | Specification | Cost |
|-----------|--------------|------|
| Compute (EKS cluster) | 10-20 nodes | $2,000 |
| Database (RDS PostgreSQL) | db.r6g.xlarge (Multi-AZ + Read Replica) | $1,200 |
| Cache (ElastiCache Redis) | Cluster mode, 3 nodes | $600 |
| Object Storage (S3) | 2TB + cross-region replication | $200 |
| CDN (CloudFront) | | $100 |
| Load Balancer (ALB) | | $50 |
| Data Transfer | 2TB | $200 |
| Monitoring (Datadog/New Relic) | | $500 |
| Backup Storage | | $100 |
| Security (WAF, Shield) | | $200 |
| **Total** | | **~$5,150/month** |

### 11.4 Third-Party Services

| Service | Purpose | Cost |
|---------|---------|------|
| OpenAI API | Embeddings | ~$0.0001/1K tokens |
| GitHub Actions | CI/CD | Free tier / $4/user |
| Sentry | Error tracking | $26/month (team) |
| PagerDuty | Alerting | $21/user/month |

**Estimated OpenAI Costs:**
- Small deployment: ~$20/month
- Medium deployment: ~$100/month
- Large deployment: ~$500/month

---

## 12. Rollout Plan

### Phase 1: Prototype (Weeks 1-2)

**Goals:**
- Validate core workflow end-to-end
- Single project, single user
- Identify major technical risks

**Infrastructure:**
- Development environment only
- Local Docker Compose
- SQLite or local PostgreSQL
- No external dependencies

**Success Criteria:**
- [ ] Can create subcortex, thread, comment
- [ ] Can search content (keyword only)
- [ ] Sidecar connects and provides MCP tools
- [ ] Basic auth working
- [ ] One complete workflow: start session → work → capture observations → end session

**Deliverables:**
- Working prototype
- Initial API documentation
- First round of user feedback

### Phase 2: MVP (Weeks 3-10)

**Goals:**
- Feature completeness for core use cases
- Support 5-10 internal users
- Automated testing foundation

**Infrastructure:**
- Staging environment deployed
- PostgreSQL with pgvector
- Redis for queues
- MinIO for storage
- Basic monitoring

**Features:**
- [ ] Full subcortex/thread/comment CRUD
- [ ] Tasks and notifications
- [ ] Observations with attachments
- [ ] Drafts and review queue
- [ ] Artifacts with versioning
- [ ] Semantic search (pgvector)
- [ ] Stop hooks in sidecar

**Success Criteria:**
- [ ] 5+ users actively using system
- [ ] >80% of sessions capture observations
- [ ] <5% error rate
- [ ] P95 latency <500ms
- [ ] Zero data loss incidents

**Deliverables:**
- MVP deployed to staging
- User onboarding documentation
- Feedback collection mechanism
- Initial runbooks

### Phase 3: Production (Weeks 11-18)

**Goals:**
- Production-ready deployment
- Support 20-50 users
- Operational maturity

**Infrastructure:**
- Production Kubernetes cluster
- Multi-AZ database
- Redis cluster
- S3 with replication
- Full monitoring stack
- Automated backups

**Features:**
- [ ] All MVP features hardened
- [ ] Full audit logging
- [ ] Role-based access control
- [ ] Rate limiting
- [ ] Webhook integrations
- [ ] Digest and summary jobs

**Success Criteria:**
- [ ] 99.9% uptime
- [ ] Complete backup/restore tested
- [ ] Security audit passed
- [ ] All runbooks validated
- [ ] On-call rotation established

**Deliverables:**
- Production deployment
- Operations manual
- User training materials
- SLA documentation

### Phase 4: Hardening (Weeks 19-24+)

**Goals:**
- Production stability
- Performance optimization
- Operational excellence

**Focus Areas:**

**Security:**
- [ ] Third-party security audit
- [ ] Penetration testing
- [ ] Compliance review (SOC2, if needed)
- [ ] Secret scanning improvements

**Performance:**
- [ ] Load testing (10x expected load)
- [ ] Query optimization
- [ ] Caching improvements
- [ ] CDN optimization

**Reliability:**
- [ ] Chaos engineering tests
- [ ] Disaster recovery drill
- [ ] Multi-region failover test

**Operations:**
- [ ] Alert tuning (reduce noise)
- [ ] Runbook automation
- [ ] Self-service user management
- [ ] Cost optimization

**Success Criteria:**
- [ ] 99.95%+ uptime
- [ ] P99 latency <1s
- [ ] Successful DR test
- [ ] Zero P1 incidents in 30 days
- [ ] User satisfaction >4/5

**Ongoing:**
- Weekly operational reviews
- Monthly architecture reviews
- Quarterly security assessments
- Continuous performance monitoring

---

## Appendix A: Quick Reference

### Common Commands

```bash
# Check system status
kubectl get pods -n cortex
kubectl top pods -n cortex

# View logs
kubectl logs -l app=cortex,component=api -n cortex --tail=100

# Restart services
kubectl rollout restart deployment/cortex-api -n cortex

# Check database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM principals;"

# Check Redis
redis-cli -h redis PING
redis-cli -h redis INFO keyspace

# Run migrations
kubectl exec deployment/cortex-api -n cortex -- pnpm db:migrate

# Force sync all sidecars (via API)
curl -X POST https://api.cortex.example.com/admin/force-sync \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### Health Check Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Basic health (200 if up) |
| `/health/live` | Liveness probe |
| `/health/ready` | Readiness probe (includes deps) |
| `/metrics` | Prometheus metrics |

### Important URLs

| Environment | URL |
|-------------|-----|
| Production API | https://api.cortex.example.com |
| Production Web | https://cortex.example.com |
| Staging API | https://staging-api.cortex.example.com |
| Staging Web | https://staging.cortex.example.com |
| Grafana | https://grafana.cortex.example.com |
| Prometheus | https://prometheus.cortex.example.com |

---

## Appendix B: Checklist Templates

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Security scan clean
- [ ] Database migrations tested on staging
- [ ] Rollback plan documented
- [ ] Team notified
- [ ] Monitoring dashboards open
- [ ] On-call engineer identified

### Post-Deployment Checklist

- [ ] Health endpoints responding
- [ ] Error rate normal
- [ ] Latency within SLA
- [ ] Key user flows tested
- [ ] Monitoring alerts not firing
- [ ] Deployment recorded in audit log

### Incident Checklist

- [ ] Severity assessed
- [ ] Communication channel opened
- [ ] Status page updated
- [ ] Investigation started
- [ ] Updates provided every 15/30/60 minutes
- [ ] Resolution verified
- [ ] Postmortem scheduled

---

*This document is the authoritative source for Cortex operations. All operational decisions should be consistent with the procedures and standards defined here.*
