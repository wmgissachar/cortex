# Cortex API Specification v2.0

## Part 10: Artifact Endpoints

---

## 10.1 Artifact Object Schema

Artifacts are durable, versioned knowledge units that form the "canon" of Cortex.

```json
{
  "id": {
    "type": "string",
    "example": "artifact_01H8ARTIFACT001"
  },
  "workspace_id": {
    "type": "string"
  },
  "subcortex_id": {
    "type": "string"
  },
  "type": {
    "type": "string",
    "enum": ["adr", "runbook", "report", "spec", "postmortem", "glossary", "other"],
    "description": "Artifact type"
  },
  "title": {
    "type": "string",
    "maxLength": 300
  },
  "body_md": {
    "type": "string",
    "maxLength": 100000,
    "description": "Content (Markdown)"
  },
  "body_html": {
    "type": "string",
    "description": "Rendered HTML (read-only)"
  },
  "summary_md": {
    "type": "string",
    "maxLength": 2000,
    "description": "Executive summary"
  },
  "status": {
    "type": "string",
    "enum": ["draft", "proposed", "accepted", "superseded", "deprecated"],
    "description": "Lifecycle status"
  },
  "sensitivity": {
    "type": "string",
    "enum": ["normal", "sensitive"]
  },
  "tags": {
    "type": "array",
    "items": { "type": "string", "maxLength": 50 },
    "maxItems": 20
  },
  "owner_id": {
    "type": "string",
    "description": "Steward responsible for maintenance"
  },
  "owner": {
    "type": "object",
    "description": "Embedded principal"
  },
  "created_by_id": {
    "type": "string"
  },
  "created_by": {
    "type": "object"
  },
  "created_at": {
    "type": "string",
    "format": "date-time"
  },
  "updated_at": {
    "type": "string",
    "format": "date-time"
  },
  "version": {
    "type": "integer",
    "description": "Current version number"
  },
  "evidence_links": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["thread", "comment", "observation", "artifact", "url"] },
        "ref": { "type": "string" },
        "title": { "type": "string" },
        "note": { "type": "string", "maxLength": 200 }
      }
    },
    "description": "Provenance links"
  },
  "supersedes_id": {
    "type": "string",
    "description": "Previous artifact this supersedes"
  },
  "superseded_by_id": {
    "type": "string",
    "description": "Newer artifact that supersedes this"
  },
  "review_by_date": {
    "type": "string",
    "format": "date",
    "description": "When this artifact should be reviewed"
  },
  "last_reviewed_at": {
    "type": "string",
    "format": "date-time"
  },
  "last_reviewed_by_id": {
    "type": "string"
  },
  "acceptance": {
    "type": "object",
    "properties": {
      "accepted_by_id": { "type": "string" },
      "accepted_by": { "type": "object" },
      "accepted_at": { "type": "string", "format": "date-time" },
      "notes": { "type": "string" }
    },
    "description": "Acceptance information"
  },
  "verification": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "enum": ["unverified", "verified", "incorrect"] },
      "verified_by_id": { "type": "string" },
      "verified_at": { "type": "string", "format": "date-time" },
      "evidence_link": { "type": "string" }
    }
  },
  "stats": {
    "type": "object",
    "properties": {
      "view_count": { "type": "integer" },
      "citation_count": { "type": "integer" },
      "vote_score": { "type": "integer" }
    }
  },
  "is_pinned": {
    "type": "boolean",
    "description": "Pinned in subcortex"
  },
  "my_vote": {
    "type": "integer",
    "enum": [-1, 0, 1]
  }
}
```

---

## 10.2 GET /artifacts

List artifacts with filters.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| workspace_id | string | - | Filter by workspace |
| subcortex_id | string | - | Filter by subcortex |
| type | string | - | Filter by type(s) |
| status | string | - | Filter by status(es) |
| owner_id | string | - | Filter by owner |
| created_by_id | string | - | Filter by creator |
| sensitivity | string | - | Filter by sensitivity |
| tag | string | - | Filter by tag(s) |
| review_due | boolean | - | Filter to overdue reviews |
| pinned | boolean | - | Filter to pinned only |
| q | string | - | Search title and body |
| sort | string | `-updated_at` | Sort field |
| cursor | string | - | Pagination cursor |
| limit | integer | 25 | Items per page (max 100) |

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "artifact_01H8METRICS",
      "workspace_id": "workspace_01H8WORKSPACE001",
      "subcortex_id": "subcortex_01H8BACKTESTING01",
      "subcortex": {
        "id": "subcortex_01H8BACKTESTING01",
        "slug": "backtesting",
        "name": "Backtesting"
      },
      "type": "adr",
      "title": "ADR: Standardize Sharpe ratio calculation",
      "summary_md": "Standardizes Sharpe ratio calculation using 252 trading days for annualization.",
      "status": "accepted",
      "sensitivity": "normal",
      "tags": ["sharpe-ratio", "metrics", "standardization"],
      "owner_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "owner": {
        "id": "principal_01H8MZXK9B2NVPQRS3T4",
        "handle": "will",
        "display_name": "Will"
      },
      "created_at": "2025-01-15T11:00:00.000Z",
      "updated_at": "2025-01-15T12:00:00.000Z",
      "version": 1,
      "review_by_date": "2025-07-15",
      "verification": {
        "status": "verified"
      },
      "stats": {
        "view_count": 45,
        "citation_count": 8,
        "vote_score": 12
      },
      "is_pinned": true,
      "my_vote": 1
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6ImFydGlmYWN0XzAxSDhNRVRSSUNTIn0=",
    "has_more": true,
    "limit": 25
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:30:00.000Z",
    "total_count": 45
  }
}
```

---

## 10.3 POST /artifacts

Create a new artifact (starts as draft or proposed).

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
  "workspace_id": {
    "type": "string",
    "required": true
  },
  "subcortex_id": {
    "type": "string",
    "required": true
  },
  "type": {
    "type": "string",
    "required": true,
    "enum": ["adr", "runbook", "report", "spec", "postmortem", "glossary", "other"]
  },
  "title": {
    "type": "string",
    "required": true,
    "minLength": 10,
    "maxLength": 300
  },
  "body_md": {
    "type": "string",
    "required": true,
    "minLength": 50,
    "maxLength": 100000
  },
  "summary_md": {
    "type": "string",
    "required": false,
    "maxLength": 2000
  },
  "status": {
    "type": "string",
    "required": false,
    "enum": ["draft", "proposed"],
    "default": "draft"
  },
  "sensitivity": {
    "type": "string",
    "required": false,
    "enum": ["normal", "sensitive"],
    "default": "normal"
  },
  "tags": {
    "type": "array",
    "required": false,
    "items": { "type": "string", "maxLength": 50 },
    "maxItems": 20
  },
  "owner_id": {
    "type": "string",
    "required": false,
    "description": "Defaults to creator"
  },
  "evidence_links": {
    "type": "array",
    "required": false,
    "items": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "required": true, "enum": ["thread", "comment", "observation", "artifact", "url"] },
        "ref": { "type": "string", "required": true },
        "note": { "type": "string", "maxLength": 200 }
      }
    },
    "maxItems": 50
  },
  "supersedes_id": {
    "type": "string",
    "required": false,
    "description": "Artifact this will supersede upon acceptance"
  },
  "review_by_date": {
    "type": "string",
    "format": "date",
    "required": false
  }
}
```

**Example Request:**
```json
{
  "workspace_id": "workspace_01H8WORKSPACE001",
  "subcortex_id": "subcortex_01H8BACKTESTING01",
  "type": "adr",
  "title": "ADR: Standardize Sharpe ratio calculation",
  "body_md": "# ADR: Standardize Sharpe ratio calculation\n\n## Status\nProposed\n\n## Context\nWe found a 2% discrepancy in Sharpe ratio calculations between our system and external benchmarks. Investigation revealed the annualization factor was using 365 days instead of 252 trading days.\n\n## Decision\nStandardize all Sharpe ratio calculations to use 252 trading days for annualization.\n\n## Consequences\n- Historical metrics will need recalculation\n- External comparisons will be accurate\n- Documentation must be updated\n\n## Evidence\n- thread:thread_01H8THREAD001",
  "summary_md": "Standardizes Sharpe ratio calculation using 252 trading days for annualization.",
  "status": "proposed",
  "tags": ["sharpe-ratio", "metrics", "standardization"],
  "evidence_links": [
    {
      "type": "thread",
      "ref": "thread_01H8THREAD001",
      "note": "Investigation and discussion"
    },
    {
      "type": "observation",
      "ref": "obs_01H8OBS001",
      "note": "Verification test results"
    }
  ],
  "review_by_date": "2025-07-15"
}
```

### Response

**Success (201 Created):**
```json
{
  "data": {
    "id": "artifact_01H8NEWARTIFACT",
    "workspace_id": "workspace_01H8WORKSPACE001",
    "subcortex_id": "subcortex_01H8BACKTESTING01",
    "type": "adr",
    "title": "ADR: Standardize Sharpe ratio calculation",
    "body_md": "# ADR: Standardize Sharpe ratio calculation\n...",
    "body_html": "<h1>ADR: Standardize Sharpe ratio calculation</h1>...",
    "summary_md": "Standardizes Sharpe ratio calculation using 252 trading days for annualization.",
    "status": "proposed",
    "sensitivity": "normal",
    "tags": ["sharpe-ratio", "metrics", "standardization"],
    "owner_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "created_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "created_at": "2025-01-15T12:30:00.000Z",
    "updated_at": "2025-01-15T12:30:00.000Z",
    "version": 1,
    "evidence_links": [...],
    "review_by_date": "2025-07-15",
    "verification": {
      "status": "unverified"
    },
    "stats": {
      "view_count": 0,
      "citation_count": 0,
      "vote_score": 0
    }
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| AUTHZ_TRUST_TIER_REQUIRED | T2+ required |
| REF_INVALID_REFERENCE | Subcortex or evidence not found |
| VALIDATION_ERROR | Missing or invalid fields |

---

## 10.4 GET /artifacts/{id}

Retrieve an artifact by ID.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Artifact ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| version | integer | Specific version (default: latest) |
| include | string | Comma-separated: `versions`, `citations` |

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "artifact_01H8METRICS",
    "workspace_id": "workspace_01H8WORKSPACE001",
    "subcortex_id": "subcortex_01H8BACKTESTING01",
    "subcortex": {
      "id": "subcortex_01H8BACKTESTING01",
      "slug": "backtesting",
      "name": "Backtesting"
    },
    "type": "adr",
    "title": "ADR: Standardize Sharpe ratio calculation",
    "body_md": "# ADR: Standardize Sharpe ratio calculation\n\n## Status\nAccepted\n\n## Context\n...",
    "body_html": "<h1>ADR: Standardize Sharpe ratio calculation</h1>...",
    "summary_md": "Standardizes Sharpe ratio calculation using 252 trading days for annualization.",
    "status": "accepted",
    "sensitivity": "normal",
    "tags": ["sharpe-ratio", "metrics", "standardization"],
    "owner_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "owner": {
      "id": "principal_01H8MZXK9B2NVPQRS3T4",
      "handle": "will",
      "display_name": "Will"
    },
    "created_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "created_by": {
      "id": "principal_01H8MZXK9B2NVPQRS3T4",
      "handle": "will",
      "display_name": "Will"
    },
    "created_at": "2025-01-15T11:00:00.000Z",
    "updated_at": "2025-01-15T12:00:00.000Z",
    "version": 1,
    "evidence_links": [
      {
        "type": "thread",
        "ref": "thread_01H8THREAD001",
        "title": "Investigating Sharpe ratio calculation discrepancy",
        "note": "Investigation and discussion"
      },
      {
        "type": "observation",
        "ref": "obs_01H8OBS001",
        "title": "Verification test results",
        "note": "Verification test results"
      }
    ],
    "review_by_date": "2025-07-15",
    "last_reviewed_at": "2025-01-15T12:00:00.000Z",
    "last_reviewed_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "acceptance": {
      "accepted_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "accepted_by": {
        "handle": "will",
        "display_name": "Will"
      },
      "accepted_at": "2025-01-15T12:00:00.000Z",
      "notes": "Verified with team, evidence is sufficient"
    },
    "verification": {
      "status": "verified",
      "verified_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "verified_at": "2025-01-15T13:00:00.000Z",
      "evidence_link": "obs_01H8VERIFICATION"
    },
    "stats": {
      "view_count": 45,
      "citation_count": 8,
      "vote_score": 12
    },
    "is_pinned": true,
    "my_vote": 1
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:00:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Artifact not found |
| AUTHZ_SENSITIVITY_CLEARANCE | Insufficient clearance |

---

## 10.5 PATCH /artifacts/{id}

Update an artifact (creates new version for significant changes).

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
| id | string | Artifact ID |

**Body Schema (all fields optional):**
```json
{
  "title": { "type": "string", "maxLength": 300 },
  "body_md": { "type": "string", "maxLength": 100000 },
  "summary_md": { "type": "string", "maxLength": 2000 },
  "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 20 },
  "owner_id": { "type": "string" },
  "sensitivity": { "type": "string", "enum": ["normal", "sensitive"] },
  "evidence_links": {
    "type": "array",
    "items": { "type": "object" },
    "description": "Replace evidence links"
  },
  "review_by_date": { "type": "string", "format": "date" },
  "create_new_version": {
    "type": "boolean",
    "default": false,
    "description": "Force new version creation"
  },
  "version_note": {
    "type": "string",
    "maxLength": 200,
    "description": "Note for new version"
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "artifact_01H8METRICS",
    "title": "ADR: Standardize Sharpe ratio calculation",
    "version": 2,
    "updated_at": "2025-01-15T14:30:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Artifact not found |
| AUTHZ_FORBIDDEN | Not owner or admin |
| BIZ_ARTIFACT_SUPERSEDED | Cannot edit superseded artifact |

---

## 10.6 GET /artifacts/{id}/versions

List all versions of an artifact.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Artifact ID |

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "version": 2,
      "created_at": "2025-01-15T14:30:00.000Z",
      "created_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "created_by": {
        "handle": "will",
        "display_name": "Will"
      },
      "note": "Added implementation details",
      "diff_summary": {
        "lines_added": 15,
        "lines_removed": 3
      }
    },
    {
      "version": 1,
      "created_at": "2025-01-15T11:00:00.000Z",
      "created_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "created_by": {
        "handle": "will",
        "display_name": "Will"
      },
      "note": "Initial version",
      "diff_summary": null
    }
  ],
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

---

## 10.7 GET /artifacts/{id}/evidence

List evidence links for an artifact.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Artifact ID |

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "type": "thread",
      "ref": "thread_01H8THREAD001",
      "entity": {
        "id": "thread_01H8THREAD001",
        "title": "Investigating Sharpe ratio calculation discrepancy",
        "status": "resolved"
      },
      "note": "Investigation and discussion",
      "added_at": "2025-01-15T11:00:00.000Z",
      "added_by_id": "principal_01H8MZXK9B2NVPQRS3T4"
    },
    {
      "type": "observation",
      "ref": "obs_01H8OBS001",
      "entity": {
        "id": "obs_01H8OBS001",
        "title": "Verification test results",
        "type": "test_result"
      },
      "note": "Verification test results",
      "added_at": "2025-01-15T11:00:00.000Z",
      "added_by_id": "principal_01H8MZXK9B2NVPQRS3T4"
    }
  ],
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

---

## 10.8 POST /artifacts/{id}/evidence

Add evidence links to an artifact.

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
| id | string | Artifact ID |

**Body Schema:**
```json
{
  "evidence_links": {
    "type": "array",
    "required": true,
    "items": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "required": true, "enum": ["thread", "comment", "observation", "artifact", "url"] },
        "ref": { "type": "string", "required": true },
        "note": { "type": "string", "maxLength": 200 }
      }
    },
    "minItems": 1,
    "maxItems": 20
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "added": 2,
    "evidence_links": [...]
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

---

## 10.9 POST /artifacts/{id}/accept

Accept a proposed artifact into canon (T3+ only).

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
| id | string | Artifact ID |

**Body Schema:**
```json
{
  "notes": {
    "type": "string",
    "required": false,
    "maxLength": 500,
    "description": "Acceptance notes"
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "artifact_01H8NEWARTIFACT",
    "status": "accepted",
    "acceptance": {
      "accepted_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "accepted_by": {
        "handle": "will",
        "display_name": "Will"
      },
      "accepted_at": "2025-01-15T14:30:00.000Z",
      "notes": "Evidence sufficient, team consensus reached"
    }
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Artifact not found |
| AUTHZ_TRUST_TIER_REQUIRED | T3+ required |
| BIZ_ARTIFACT_REQUIRES_EVIDENCE | Must have at least one evidence link |
| CONFLICT_STATE_TRANSITION | Artifact not in proposed state |

---

## 10.10 POST /artifacts/{id}/supersede

Supersede an artifact with a new one.

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
| id | string | Artifact ID (the one being superseded) |

**Body Schema:**
```json
{
  "successor_id": {
    "type": "string",
    "required": true,
    "description": "New artifact that supersedes this one"
  },
  "reason": {
    "type": "string",
    "required": false,
    "maxLength": 500,
    "description": "Reason for superseding"
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "superseded": {
      "id": "artifact_01H8OLDARTIFACT",
      "status": "superseded",
      "superseded_by_id": "artifact_01H8NEWARTIFACT"
    },
    "successor": {
      "id": "artifact_01H8NEWARTIFACT",
      "supersedes_id": "artifact_01H8OLDARTIFACT"
    }
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | Artifact not found |
| AUTHZ_TRUST_TIER_REQUIRED | T3+ required |
| REF_INVALID_REFERENCE | Successor artifact not found |
| BIZ_ARTIFACT_SUPERSEDED | Already superseded |

---

## 10.11 POST /artifacts/{id}/vote

Vote on an artifact.

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
  "value": {
    "type": "integer",
    "required": true,
    "enum": [-1, 0, 1]
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "artifact_id": "artifact_01H8METRICS",
    "value": 1,
    "new_score": 13
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T14:30:00.000Z"
  }
}
```

---

## 10.12 POST /artifacts/{id}/verify

Record verification status for an artifact.

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
  "status": {
    "type": "string",
    "required": true,
    "enum": ["verified", "incorrect"]
  },
  "evidence_link": {
    "type": "string",
    "required": true,
    "description": "Reference supporting the verification"
  },
  "notes": {
    "type": "string",
    "required": false,
    "maxLength": 500
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "artifact_01H8METRICS",
    "verification": {
      "status": "verified",
      "verified_by_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "verified_at": "2025-01-15T15:00:00.000Z",
      "evidence_link": "obs_01H8VERIFICATION"
    }
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T15:00:00.000Z"
  }
}
```
