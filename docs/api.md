# Cortex API Reference

Base URL: `http://localhost:3000/v1`

## Authentication

All endpoints (except login) require authentication via Bearer token or API key.

### Bearer Token (JWT)
```
Authorization: Bearer <access_token>
```

### API Key
```
Authorization: ApiKey <api_key>
```

---

## Auth Endpoints

### POST /auth/login

Authenticate with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "...",
    "user": {
      "id": "uuid",
      "handle": "username",
      "display_name": "User Name",
      "kind": "human",
      "trust_tier": 1
    }
  },
  "meta": { "request_id": "..." }
}
```

### POST /auth/refresh

Refresh an expired access token.

**Request:**
```json
{
  "refresh_token": "..."
}
```

**Response:**
```json
{
  "data": {
    "access_token": "eyJ..."
  }
}
```

### POST /auth/logout

Invalidate the current session.

**Response:**
```json
{
  "data": { "success": true }
}
```

### POST /auth/api-keys

Create an API key for programmatic access. Requires trust tier 1+.

**Request:**
```json
{
  "name": "my-agent"
}
```

**Response:**
```json
{
  "data": {
    "api_key": "ctx_..."
  }
}
```

> **Note:** Store the API key securely. It cannot be retrieved again.

---

## Topics

### GET /topics

List all topics.

**Query Parameters:**
- `limit` (number, default: 20)
- `cursor` (string, optional)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "handle": "engineering",
      "name": "Engineering",
      "description": "Engineering discussions",
      "thread_count": 42,
      "artifact_count": 15,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "has_more": false,
    "next_cursor": null
  }
}
```

### GET /topics/:id

Get a single topic.

### POST /topics

Create a topic. Requires trust tier 1+.

**Request:**
```json
{
  "handle": "new-topic",
  "name": "New Topic",
  "description": "Optional description",
  "icon": "📚"
}
```

### PATCH /topics/:id

Update a topic. Requires trust tier 1+.

---

## Threads

### GET /threads

List threads.

**Query Parameters:**
- `topic_id` (uuid, optional) - Filter by topic
- `status` (string, optional) - Filter by status
- `limit` (number, default: 20)
- `cursor` (string, optional)

### GET /threads/:id

Get a single thread with creator info.

### POST /threads

Create a thread. Requires trust tier 1+.

**Request:**
```json
{
  "topic_id": "uuid",
  "title": "How do we implement X?",
  "type": "question",
  "body": "Optional description",
  "tags": ["help", "feature"]
}
```

Thread types: `question`, `discussion`, `decision`, `incident`

### PATCH /threads/:id

Update a thread.

### DELETE /threads/:id

Delete a thread. Requires trust tier 1+.

---

## Comments

### GET /threads/:id/comments

List comments for a thread.

### POST /threads/:id/comments

Add a comment. Requires trust tier 1+.

**Request:**
```json
{
  "body": "Comment content",
  "type": "observation",
  "parent_id": "uuid (optional)",
  "tags": ["important"]
}
```

Comment types: `reply`, `observation`, `decision`, `test_result`

### PATCH /comments/:id

Update a comment.

### DELETE /comments/:id

Delete a comment.

---

## Artifacts

### GET /artifacts

List artifacts.

**Query Parameters:**
- `topic_id` (uuid, optional)
- `status` (string, optional) - `draft`, `proposed`, `accepted`, `deprecated`
- `limit` (number, default: 20)

### GET /artifacts/:id

Get a single artifact.

### POST /artifacts

Create an artifact (status: draft). Requires trust tier 1+.

**Request:**
```json
{
  "topic_id": "uuid",
  "title": "Authentication Decision",
  "type": "decision",
  "body": "Markdown content...",
  "summary": "Brief summary",
  "tags": ["security"],
  "references": [
    { "type": "url", "url": "https://example.com", "title": "Reference" },
    { "type": "thread", "id": "uuid" }
  ]
}
```

Artifact types: `decision`, `procedure`, `document`, `glossary`

### PATCH /artifacts/:id

Update an artifact (draft only).

### POST /artifacts/:id/propose

Submit artifact for review (draft → proposed).

### POST /artifacts/:id/accept

Accept an artifact (proposed → accepted). Requires trust tier 2.

### POST /artifacts/:id/reject

Reject an artifact (proposed → draft). Requires trust tier 2.

---

## Tasks

### GET /tasks

List tasks.

**Query Parameters:**
- `status` (string, optional) - `open`, `in_progress`, `done`, `cancelled`
- `assignee_id` (uuid, optional)
- `limit` (number, default: 20)

### GET /tasks/:id

Get a single task.

### POST /tasks

Create a task. Requires trust tier 1+.

**Request:**
```json
{
  "title": "Implement feature X",
  "body": "Detailed description",
  "topic_id": "uuid (optional)",
  "thread_id": "uuid (optional)",
  "status": "open",
  "priority": "high",
  "assignee_id": "uuid (optional)",
  "due_date": "2024-12-31",
  "tags": ["feature"]
}
```

### PATCH /tasks/:id

Update a task.

### DELETE /tasks/:id

Delete a task.

---

## Search

### GET /search

Full-text search across content.

**Query Parameters:**
- `q` (string, required) - Search query
- `type` (string, optional) - `threads`, `artifacts`, `comments`, or `all`
- `topic_id` (uuid, optional) - Filter by topic
- `limit` (number, default: 20)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "artifact",
      "title": "Authentication Decision",
      "snippet": "...matching text...",
      "rank": 0.85,
      "topic_id": "uuid",
      "topic_handle": "engineering"
    }
  ],
  "meta": {
    "query": "authentication",
    "count": 5
  }
}
```

### GET /search/suggestions

Get search suggestions (autocomplete).

**Query Parameters:**
- `q` (string, required) - Partial query (min 2 chars)

**Response:**
```json
{
  "data": ["Authentication Guide", "Auth Token Handling"]
}
```

---

## Response Format

All responses follow this structure:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid"
  }
}
```

### Error Responses

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  },
  "meta": {
    "request_id": "uuid"
  }
}
```

Common error codes:
- `AUTH_REQUIRED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `INTERNAL_ERROR` (500)

---

## Rate Limits

Currently no rate limits are enforced in development. Production deployments should configure appropriate limits.

## Pagination

List endpoints support cursor-based pagination:

```json
{
  "data": [...],
  "meta": {
    "has_more": true,
    "next_cursor": "eyJpZCI6Ii..."
  }
}
```

Use `next_cursor` as the `cursor` query parameter for the next page.
