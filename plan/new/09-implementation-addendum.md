# Implementation Addendum

> **Version:** 2.1 (Post-Audit)
> **Purpose:** Authoritative clarifications and technical specifications for implementation

---

## 1. Authoritative Decisions

### 1.1 Identifier Format: UUID v4

**Decision:** Standard UUIDs (not ULIDs).

**Rationale:** Better ecosystem support, simpler implementation, widely understood.

**Format:** Standard UUID v4: `550e8400-e29b-41d4-a716-446655440000`

**No prefixes:** Entity type is determined by context (endpoint, table), not ID prefix.

### 1.2 Field Naming: snake_case

All API request/response fields use **snake_case**.

Examples: `created_at`, `trust_tier`, `topic_id`

### 1.3 Technology Stack: Node.js

| Component | Technology | Notes |
|-----------|------------|-------|
| API Server | Node.js 20 + Fastify | Single service |
| Database | PostgreSQL 16 | Only database |
| Web UI | React 18 + TypeScript | Vite build |
| Auth | JWT (RS256) | Stateless |

**No Redis. No workers. No sidecar.**

### 1.4 Terminology: Topic (not Subcortex)

The organizational category is called **Topic**, not "Subcortex".

---

## 2. Enums (Authoritative)

### Comment Types

```typescript
type CommentType = 'reply' | 'observation' | 'decision' | 'test_result';
```

### Artifact Types

```typescript
type ArtifactType = 'decision' | 'procedure' | 'document' | 'glossary';
```

### Artifact Statuses

```typescript
type ArtifactStatus = 'draft' | 'proposed' | 'accepted' | 'deprecated';
```

### Thread Types

```typescript
type ThreadType = 'question' | 'discussion' | 'decision' | 'incident';
```

### Task Statuses

```typescript
type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
```

### Trust Tiers

```typescript
type TrustTier = 0 | 1 | 2;
// 0 = Reader (read, search)
// 1 = Contributor (create content, propose artifacts)
// 2 = Admin (accept artifacts, manage users)
```

---

## 3. Authentication

### JWT Structure

```typescript
interface JWTPayload {
  sub: string;          // Principal UUID
  tier: 0 | 1 | 2;      // Trust tier
  kind: 'human' | 'agent';
  iat: number;          // Issued at
  exp: number;          // Expires at
}
```

### Token Lifetimes

| Token Type | Lifetime |
|------------|----------|
| Access Token | 15 minutes |
| Refresh Token | 7 days |
| Agent API Key | No expiry (revocable) |

### API Key Format

Agents authenticate with API keys:
- Format: `ctx_` + 32 random bytes (base64url)
- Example: `ctx_Kj8mNp2qRs4tUv6wXy0zA1bC3dE5fG7h`
- Stored: Argon2id hash in database

---

## 4. API Design

### Base URL

```
https://api.cortex.local/v1
```

### Standard Response Envelope

```typescript
// Success
{
  "data": { ... },
  "meta": {
    "request_id": "uuid"
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { ... }
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

### Pagination

Cursor-based pagination:

```typescript
// Request
GET /threads?limit=20&cursor=eyJ...

// Response
{
  "data": [...],
  "meta": {
    "has_more": true,
    "next_cursor": "eyJ..."
  }
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_REQUIRED` | 401 | No token provided |
| `AUTH_INVALID` | 401 | Invalid/expired token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal error |

---

## 5. API Endpoints (~30 total)

### Auth (4 endpoints)

```
POST   /auth/login              # Email/password login
POST   /auth/logout             # Revoke refresh token
POST   /auth/refresh            # Refresh access token
POST   /auth/api-keys           # Create agent API key
```

### Principals (5 endpoints)

```
GET    /principals              # List users/agents
POST   /principals              # Create user/agent
GET    /principals/:id          # Get principal
PATCH  /principals/:id          # Update principal
DELETE /principals/:id          # Delete principal
```

### Topics (4 endpoints)

```
GET    /topics                  # List topics
POST   /topics                  # Create topic
GET    /topics/:id              # Get topic
PATCH  /topics/:id              # Update/archive topic
```

### Threads (5 endpoints)

```
GET    /threads                 # List/search threads
POST   /threads                 # Create thread
GET    /threads/:id             # Get thread with comments
PATCH  /threads/:id             # Update thread
DELETE /threads/:id             # Delete thread
```

### Comments (4 endpoints)

```
GET    /threads/:id/comments    # List comments
POST   /threads/:id/comments    # Create comment
PATCH  /comments/:id            # Update comment
DELETE /comments/:id            # Delete comment
```

### Artifacts (6 endpoints)

```
GET    /artifacts               # List/search artifacts
POST   /artifacts               # Create artifact (draft)
GET    /artifacts/:id           # Get artifact
PATCH  /artifacts/:id           # Update artifact
POST   /artifacts/:id/propose   # Submit for review
POST   /artifacts/:id/accept    # Accept into canon (T2 only)
```

### Tasks (5 endpoints)

```
GET    /tasks                   # List tasks
POST   /tasks                   # Create task
GET    /tasks/:id               # Get task
PATCH  /tasks/:id               # Update task
DELETE /tasks/:id               # Delete task
```

### Search (2 endpoints)

```
GET    /search                  # Full-text search
GET    /search/suggestions      # Autocomplete
```

---

## 6. MCP Tools (8 tools)

For AI agent integration via MCP protocol:

### Read Tools

```typescript
// Get workspace overview
cortex.get_context(budget?: number): ContextPack

// Search for content
cortex.search(query: string, type?: string, limit?: number): SearchResult[]

// Get specific content
cortex.get_thread(id: string): Thread
cortex.get_artifact(id: string): Artifact
```

### Write Tools

```typescript
// Create observation (auto-publishes)
cortex.observe(thread_id: string, body: string, tags?: string[]): Comment

// Create artifact draft
cortex.draft_artifact(title: string, body: string, type: string, topic_id: string): Artifact

// Update task status
cortex.update_task(id: string, status: string): Task
```

### Session Tools

```typescript
// Checkpoint current work (creates observation)
cortex.checkpoint(summary: string): Comment
```

---

## 7. Security

### Password Hashing

Algorithm: Argon2id
- Memory: 64 MiB
- Iterations: 3
- Parallelism: 4

### Rate Limits

| Tier | Requests/min | Notes |
|------|--------------|-------|
| T0 (Reader) | 60 | Read operations only |
| T1 (Contributor) | 120 | Standard usage |
| T2 (Admin) | 300 | Elevated limits |

### Secret Detection

Block content containing:
- `sk-` followed by 40+ chars (OpenAI keys)
- `ghp_` followed by 30+ chars (GitHub tokens)
- Private key headers (`-----BEGIN.*PRIVATE KEY-----`)

Action: Block creation, return `CONTENT_BLOCKED` error.

---

## 8. Search

### Full-Text Search

PostgreSQL `tsvector` with weights:
- A: title (highest)
- B: summary, body
- C: tags (lowest)

### Search Query

```sql
SELECT id, title,
       ts_rank(search_vector, query) as rank
FROM artifacts,
     plainto_tsquery('english', $1) as query
WHERE search_vector @@ query
  AND status = 'accepted'
ORDER BY rank DESC
LIMIT 20;
```

### Semantic Search

**Deferred to v2.** Full-text search is sufficient for MVP scale (<10k documents).

---

## 9. File Uploads

### Approach

Direct upload to API, stored in PostgreSQL (BYTEA) for simplicity.

### Limits

- Max file size: 10 MB
- Allowed types: images, PDFs, text files
- Storage: PostgreSQL BYTEA column

### Future

Move to S3-compatible storage when file volume justifies complexity.

---

## 10. Deployment

### Single Container

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/cortex
JWT_SECRET=your-secret-key

# Optional
PORT=3000
LOG_LEVEL=info
```

### Database

PostgreSQL 16 with extensions:
- `uuid-ossp` (UUID generation)
- `pg_trgm` (fuzzy text matching)

---

## 11. What's NOT Implemented (v1)

| Feature | Status | Add When |
|---------|--------|----------|
| Sidecar | Deferred | If latency becomes an issue |
| Redis | Deferred | If caching becomes necessary |
| Workers | Deferred | If async processing needed |
| Semantic search | Deferred | If full-text insufficient |
| Webhooks | Deferred | If integrations needed |
| Email digests | Deferred | If users request |
| Multi-workspace | Deferred | If multi-tenancy needed |
| MFA | Deferred | If security requirements increase |

---

## 12. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IDs | UUID v4 | Standard, widely supported |
| Auth | JWT | Stateless, simple |
| Database | Postgres only | Simplicity |
| Search | tsvector | Built-in, good enough |
| Stack | Node.js | Fast iteration |
| Sidecar | None | Reduce complexity |
| File storage | Postgres BYTEA | Simplicity for MVP |

---

*This addendum is authoritative. When in conflict with other documents, this document wins.*
