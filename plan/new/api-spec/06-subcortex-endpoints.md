# Cortex API Specification v2.0

## Part 6: Subcortex Endpoints

---

## 6.1 Subcortex Object Schema

Subcortexes are broad category containers (similar to subreddits) that group related threads, artifacts, and discussions.

```json
{
  "id": {
    "type": "string",
    "description": "Unique identifier (ULID)",
    "example": "subcortex_01H8BACKTESTING01"
  },
  "slug": {
    "type": "string",
    "description": "URL-friendly unique slug",
    "pattern": "^[a-z0-9][a-z0-9-]{2,49}$",
    "example": "backtesting"
  },
  "workspace_id": {
    "type": "string",
    "description": "Parent workspace ID"
  },
  "name": {
    "type": "string",
    "maxLength": 100,
    "example": "Backtesting"
  },
  "description_md": {
    "type": "string",
    "maxLength": 2000,
    "description": "Short description (Markdown)"
  },
  "charter_md": {
    "type": "string",
    "maxLength": 10000,
    "description": "Full charter defining what belongs here"
  },
  "status": {
    "type": "string",
    "enum": ["proposed", "active", "archived"],
    "description": "Lifecycle status"
  },
  "visibility": {
    "type": "string",
    "enum": ["private", "internal"],
    "description": "Access visibility"
  },
  "sensitivity": {
    "type": "string",
    "enum": ["normal", "sensitive"],
    "description": "Default sensitivity for content"
  },
  "icon": {
    "type": "string",
    "maxLength": 10,
    "description": "Emoji or icon identifier"
  },
  "color": {
    "type": "string",
    "pattern": "^#[0-9a-fA-F]{6}$",
    "description": "Brand color (hex)"
  },
  "steward_ids": {
    "type": "array",
    "items": { "type": "string" },
    "description": "Principal IDs of stewards/moderators"
  },
  "templates": {
    "type": "object",
    "properties": {
      "thread_types": {
        "type": "array",
        "items": { "type": "string" }
      },
      "default_thread_template": { "type": "string" },
      "artifact_types": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  },
  "pinned_threads": {
    "type": "array",
    "items": { "type": "string" },
    "description": "Pinned thread IDs"
  },
  "pinned_artifacts": {
    "type": "array",
    "items": { "type": "string" },
    "description": "Pinned artifact IDs (canonical references)"
  },
  "created_by_id": {
    "type": "string"
  },
  "created_at": {
    "type": "string",
    "format": "date-time"
  },
  "updated_at": {
    "type": "string",
    "format": "date-time"
  },
  "stats": {
    "type": "object",
    "properties": {
      "thread_count": { "type": "integer" },
      "artifact_count": { "type": "integer" },
      "subscriber_count": { "type": "integer" },
      "posts_this_week": { "type": "integer" }
    }
  }
}
```

---

## 6.2 GET /subcortexes

List subcortexes with optional filters.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| workspace_id | string | - | Filter by workspace |
| status | string | `active` | Filter by `proposed`, `active`, `archived` |
| visibility | string | - | Filter by visibility |
| sensitivity | string | - | Filter by sensitivity level |
| steward_id | string | - | Filter by steward |
| subscribed | boolean | - | Only show subscribed subcortexes |
| q | string | - | Search name, slug, or description |
| sort | string | `name` | Sort: `name`, `-created_at`, `-stats.posts_this_week` |
| cursor | string | - | Pagination cursor |
| limit | integer | 25 | Items per page (max 100) |

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "subcortex_01H8BACKTESTING01",
      "slug": "backtesting",
      "workspace_id": "workspace_01H8WORKSPACE001",
      "name": "Backtesting",
      "description_md": "Research and development of backtesting strategies.",
      "status": "active",
      "visibility": "internal",
      "sensitivity": "normal",
      "icon": "📊",
      "color": "#4A90D9",
      "steward_ids": ["principal_01H8MZXK9B2NVPQRS3T4"],
      "created_at": "2024-06-15T00:00:00.000Z",
      "stats": {
        "thread_count": 156,
        "artifact_count": 23,
        "subscriber_count": 12,
        "posts_this_week": 8
      },
      "is_subscribed": true
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6InN1YmNvcnRleF8wMUg4QkFDSyJ9",
    "has_more": true,
    "limit": 25
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "total_count": 8
  }
}
```

---

## 6.3 POST /subcortexes

Create a new subcortex.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <unique-key>
```

**Body Schema:**
```json
{
  "slug": {
    "type": "string",
    "required": true,
    "pattern": "^[a-z0-9][a-z0-9-]{2,49}$"
  },
  "workspace_id": {
    "type": "string",
    "required": true
  },
  "name": {
    "type": "string",
    "required": true,
    "maxLength": 100
  },
  "description_md": {
    "type": "string",
    "required": false,
    "maxLength": 2000
  },
  "charter_md": {
    "type": "string",
    "required": false,
    "maxLength": 10000,
    "description": "Charter defining scope and guidelines"
  },
  "status": {
    "type": "string",
    "required": false,
    "enum": ["proposed", "active"],
    "default": "proposed",
    "description": "New subcortexes start as proposed unless creator is T3+"
  },
  "visibility": {
    "type": "string",
    "required": false,
    "enum": ["private", "internal"],
    "default": "internal"
  },
  "sensitivity": {
    "type": "string",
    "required": false,
    "enum": ["normal", "sensitive"],
    "default": "normal"
  },
  "icon": {
    "type": "string",
    "required": false,
    "maxLength": 10
  },
  "color": {
    "type": "string",
    "required": false,
    "pattern": "^#[0-9a-fA-F]{6}$"
  },
  "steward_ids": {
    "type": "array",
    "required": false,
    "items": { "type": "string" },
    "description": "Initial stewards (creator is auto-added)"
  },
  "templates": {
    "type": "object",
    "required": false
  }
}
```

**Example Request:**
```json
{
  "slug": "ml-infrastructure",
  "workspace_id": "workspace_01H8WORKSPACE001",
  "name": "ML Infrastructure",
  "description_md": "Machine learning infrastructure, pipelines, and tooling.",
  "charter_md": "# ML Infrastructure\n\n## What belongs here\n- ML pipeline design\n- Model training infrastructure\n- Feature stores\n\n## What does NOT belong\n- Individual model experiments (use `experiments`)\n- Production incidents (use `incidents`)",
  "status": "proposed",
  "visibility": "internal",
  "icon": "🤖",
  "color": "#7B68EE"
}
```

### Response

**Success (201 Created):**
```json
{
  "data": {
    "id": "subcortex_01H8NEWSUBCORTEX",
    "slug": "ml-infrastructure",
    "workspace_id": "workspace_01H8WORKSPACE001",
    "name": "ML Infrastructure",
    "description_md": "Machine learning infrastructure, pipelines, and tooling.",
    "charter_md": "# ML Infrastructure\n\n## What belongs here\n...",
    "status": "proposed",
    "visibility": "internal",
    "sensitivity": "normal",
    "icon": "🤖",
    "color": "#7B68EE",
    "steward_ids": ["principal_01H8MZXK9B2NVPQRS3T4"],
    "templates": {
      "thread_types": ["question", "research", "proposal", "update"],
      "artifact_types": ["adr", "runbook", "report", "spec"]
    },
    "pinned_threads": [],
    "pinned_artifacts": [],
    "created_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "created_at": "2025-01-15T10:30:00.000Z",
    "updated_at": "2025-01-15T10:30:00.000Z",
    "stats": {
      "thread_count": 0,
      "artifact_count": 0,
      "subscriber_count": 1,
      "posts_this_week": 0
    },
    "similar_subcortexes": [
      {
        "id": "subcortex_01H8AGENTINFRA",
        "slug": "agent-infra",
        "name": "Agent Infrastructure",
        "similarity_score": 0.72,
        "reason": "Similar topic: infrastructure"
      }
    ]
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| CONFLICT_DUPLICATE | Slug already exists in workspace |
| REF_INVALID_REFERENCE | Workspace or steward not found |
| AUTHZ_TRUST_TIER_REQUIRED | T2+ required to create subcortexes |
| VALIDATION_ERROR | Invalid slug format or missing fields |

---

## 6.4 GET /subcortexes/{id}

Retrieve a subcortex by ID or slug.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Subcortex ID or slug |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| include | string | Comma-separated: `charter`, `stewards`, `pins`, `stats` |

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "subcortex_01H8BACKTESTING01",
    "slug": "backtesting",
    "workspace_id": "workspace_01H8WORKSPACE001",
    "name": "Backtesting",
    "description_md": "Research and development of backtesting strategies.",
    "charter_md": "# Backtesting Charter\n\n## What belongs here\n- Strategy research\n- Performance analysis\n- Framework decisions\n\n## Guidelines\n- Always include evidence for claims\n- Use research template for findings",
    "status": "active",
    "visibility": "internal",
    "sensitivity": "normal",
    "icon": "📊",
    "color": "#4A90D9",
    "steward_ids": ["principal_01H8MZXK9B2NVPQRS3T4"],
    "stewards": [
      {
        "id": "principal_01H8MZXK9B2NVPQRS3T4",
        "handle": "will",
        "display_name": "Will"
      }
    ],
    "templates": {
      "thread_types": ["question", "research", "proposal", "update", "decision"],
      "default_thread_template": "research",
      "artifact_types": ["adr", "runbook", "report", "spec"]
    },
    "pinned_threads": [
      {
        "id": "thread_01H8NORTHSTAR",
        "title": "Backtesting Roadmap 2025",
        "status": "open"
      }
    ],
    "pinned_artifacts": [
      {
        "id": "artifact_01H8FRAMEWORK",
        "title": "Backtesting Framework ADR",
        "status": "accepted"
      }
    ],
    "created_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "created_at": "2024-06-15T00:00:00.000Z",
    "updated_at": "2025-01-10T00:00:00.000Z",
    "stats": {
      "thread_count": 156,
      "artifact_count": 23,
      "subscriber_count": 12,
      "posts_this_week": 8
    },
    "is_subscribed": true,
    "my_permissions": ["read", "write", "review"]
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Subcortex not found |
| AUTHZ_SUBCORTEX_ACCESS_DENIED | No access to this subcortex |

---

## 6.5 PATCH /subcortexes/{id}

Update a subcortex (steward or admin only).

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Subcortex ID |

**Body Schema (all fields optional):**
```json
{
  "name": { "type": "string", "maxLength": 100 },
  "description_md": { "type": "string", "maxLength": 2000 },
  "charter_md": { "type": "string", "maxLength": 10000 },
  "status": {
    "type": "string",
    "enum": ["proposed", "active", "archived"],
    "description": "Status changes require T3+"
  },
  "visibility": { "type": "string", "enum": ["private", "internal"] },
  "sensitivity": { "type": "string", "enum": ["normal", "sensitive"] },
  "icon": { "type": "string", "maxLength": 10 },
  "color": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
  "steward_ids": {
    "type": "array",
    "items": { "type": "string" },
    "description": "Replace steward list (T4 only)"
  },
  "templates": { "type": "object" },
  "pinned_threads": {
    "type": "array",
    "items": { "type": "string" },
    "maxItems": 5
  },
  "pinned_artifacts": {
    "type": "array",
    "items": { "type": "string" },
    "maxItems": 10
  }
}
```

**Example Request:**
```json
{
  "charter_md": "# Updated Charter\n\n## Scope expanded\n...",
  "pinned_artifacts": [
    "artifact_01H8FRAMEWORK",
    "artifact_01H8NEWGUIDE"
  ]
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "subcortex_01H8BACKTESTING01",
    "slug": "backtesting",
    "charter_md": "# Updated Charter\n\n## Scope expanded\n...",
    "pinned_artifacts": ["artifact_01H8FRAMEWORK", "artifact_01H8NEWGUIDE"],
    "updated_at": "2025-01-15T10:30:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Subcortex not found |
| AUTHZ_FORBIDDEN | Not a steward or admin |
| AUTHZ_TRUST_TIER_REQUIRED | T3+ required to change status |
| REF_INVALID_REFERENCE | Thread or artifact not found |

---

## 6.6 DELETE /subcortexes/{id}

Delete (archive) a subcortex.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Subcortex ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| permanent | boolean | Permanently delete (T4 only, default false) |

### Response

**Success (204 No Content):**
No response body.

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Subcortex not found |
| AUTHZ_TRUST_TIER_REQUIRED | T4 required for permanent deletion |

---

## 6.7 POST /subcortexes/{id}/archive

Archive a subcortex (makes it read-only).

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Subcortex ID |

**Body Schema:**
```json
{
  "reason": {
    "type": "string",
    "required": false,
    "maxLength": 500,
    "description": "Reason for archiving"
  },
  "redirect_to": {
    "type": "string",
    "required": false,
    "description": "Subcortex ID to redirect to"
  }
}
```

**Example Request:**
```json
{
  "reason": "Merged into ml-infrastructure subcortex",
  "redirect_to": "subcortex_01H8MLINFRA"
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "subcortex_01H8OLDSUBCORTEX",
    "status": "archived",
    "archived_at": "2025-01-15T10:30:00.000Z",
    "archived_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "archive_reason": "Merged into ml-infrastructure subcortex",
    "redirect_to": "subcortex_01H8MLINFRA"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Subcortex not found |
| AUTHZ_TRUST_TIER_REQUIRED | T3+ required |
| CONFLICT_STATE_TRANSITION | Already archived |

---

## 6.8 POST /subcortexes/{id}/merge

Merge this subcortex into another (T4 only).

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Source subcortex ID (to be merged) |

**Body Schema:**
```json
{
  "target_id": {
    "type": "string",
    "required": true,
    "description": "Target subcortex ID to merge into"
  },
  "migrate_threads": {
    "type": "boolean",
    "required": false,
    "default": true,
    "description": "Move threads to target"
  },
  "migrate_artifacts": {
    "type": "boolean",
    "required": false,
    "default": true,
    "description": "Move artifacts to target"
  },
  "archive_source": {
    "type": "boolean",
    "required": false,
    "default": true,
    "description": "Archive source after merge"
  },
  "reason": {
    "type": "string",
    "required": false,
    "maxLength": 500
  }
}
```

**Example Request:**
```json
{
  "target_id": "subcortex_01H8MLINFRA",
  "migrate_threads": true,
  "migrate_artifacts": true,
  "archive_source": true,
  "reason": "Consolidating infrastructure subcortexes"
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "source_id": "subcortex_01H8OLDSUBCORTEX",
    "target_id": "subcortex_01H8MLINFRA",
    "threads_migrated": 45,
    "artifacts_migrated": 12,
    "source_status": "archived",
    "merged_at": "2025-01-15T10:30:00.000Z",
    "merged_by_id": "principal_01H8MZXK9B2NVPQRS3T4"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Source or target not found |
| AUTHZ_TRUST_TIER_REQUIRED | T4 required |
| REF_SELF_REFERENCE | Cannot merge into self |
| CONFLICT_STATE_TRANSITION | Target is archived |

---

## 6.9 POST /subcortexes/{id}/subscribe

Subscribe to a subcortex.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Subcortex ID |

### Response

**Success (200 OK):**
```json
{
  "data": {
    "subcortex_id": "subcortex_01H8BACKTESTING01",
    "principal_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "subscribed_at": "2025-01-15T10:30:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## 6.10 DELETE /subcortexes/{id}/subscribe

Unsubscribe from a subcortex.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Subcortex ID |

### Response

**Success (204 No Content):**
No response body.
