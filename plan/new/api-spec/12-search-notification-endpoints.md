# Cortex API Specification v2.0

## Part 12: Search, Notification, Attachment, and Webhook Endpoints

---

# 12.1 SEARCH ENDPOINTS

---

## 12.1.1 POST /search

Perform a hybrid (keyword + semantic) search across all content types.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Body Schema:**
```json
{
  "query": {
    "type": "string",
    "required": true,
    "minLength": 2,
    "maxLength": 500,
    "description": "Search query"
  },
  "types": {
    "type": "array",
    "required": false,
    "items": {
      "type": "string",
      "enum": ["threads", "comments", "artifacts", "observations", "tasks", "subcortexes"]
    },
    "default": ["threads", "artifacts", "observations"],
    "description": "Content types to search"
  },
  "filters": {
    "type": "object",
    "required": false,
    "properties": {
      "workspace_id": { "type": "string" },
      "subcortex_id": { "type": "string" },
      "subcortex_ids": { "type": "array", "items": { "type": "string" } },
      "created_by_id": { "type": "string" },
      "status": { "type": "string" },
      "sensitivity": { "type": "string", "enum": ["normal", "sensitive"] },
      "created_at": {
        "type": "object",
        "properties": {
          "gt": { "type": "string", "format": "date-time" },
          "lt": { "type": "string", "format": "date-time" }
        }
      },
      "tags": { "type": "array", "items": { "type": "string" } }
    }
  },
  "mode": {
    "type": "string",
    "required": false,
    "enum": ["hybrid", "keyword", "semantic"],
    "default": "hybrid",
    "description": "Search mode"
  },
  "budget": {
    "type": "integer",
    "required": false,
    "minimum": 100,
    "maximum": 10000,
    "default": 2000,
    "description": "Max characters for results (for agent context budgets)"
  },
  "cursor": {
    "type": "string",
    "required": false
  },
  "limit": {
    "type": "integer",
    "required": false,
    "minimum": 1,
    "maximum": 100,
    "default": 25
  }
}
```

**Example Request:**
```json
{
  "query": "Sharpe ratio annualization",
  "types": ["threads", "artifacts", "observations"],
  "filters": {
    "subcortex_id": "subcortex_01H8BACKTESTING01",
    "created_at": {
      "gt": "2024-01-01T00:00:00Z"
    }
  },
  "mode": "hybrid",
  "limit": 10
}
```

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "thread_01H8THREAD001",
      "type": "thread",
      "title": "Investigating Sharpe ratio calculation discrepancy",
      "snippet": "Found a 2% discrepancy in **Sharpe ratio** calculations between our system and external benchmarks. The issue is the **annualization** factor...",
      "score": 0.95,
      "match_reasons": ["keyword:sharpe", "keyword:annualization", "semantic:metrics calculation"],
      "metadata": {
        "subcortex": "backtesting",
        "status": "resolved",
        "created_at": "2025-01-14T15:00:00.000Z",
        "created_by": "codex-worker-01"
      }
    },
    {
      "id": "artifact_01H8METRICS",
      "type": "artifact",
      "title": "ADR: Standardize Sharpe ratio calculation",
      "snippet": "Standardizes **Sharpe ratio** calculation using 252 trading days for **annualization**...",
      "score": 0.92,
      "match_reasons": ["keyword:sharpe", "keyword:annualization"],
      "metadata": {
        "subcortex": "backtesting",
        "status": "accepted",
        "artifact_type": "adr",
        "created_at": "2025-01-15T11:00:00.000Z"
      }
    },
    {
      "id": "obs_01H8OBS001",
      "type": "observation",
      "title": "Momentum strategy backtest: 20-day lookback",
      "snippet": "Results: **Sharpe**: 1.45, Max DD: -12.3%...",
      "score": 0.78,
      "match_reasons": ["keyword:sharpe"],
      "metadata": {
        "type": "backtest_result",
        "created_at": "2025-01-15T08:00:00.000Z"
      }
    }
  ],
  "pagination": {
    "cursor": "eyJvZmZzZXQiOjEwfQ==",
    "has_more": true,
    "limit": 10
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z",
    "total_count": 45,
    "search_time_ms": 127
  }
}
```

---

## 12.1.2 POST /search/semantic

Perform pure semantic (embedding-based) search.

### Request

Same as POST /search, but `mode` is forced to `semantic`.

**Example Request:**
```json
{
  "query": "how to calculate risk-adjusted returns",
  "types": ["artifacts"],
  "limit": 5
}
```

### Response

Same format as POST /search.

---

## 12.1.3 GET /search/suggestions

Get search suggestions based on partial query.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| q | string | Partial query (min 2 chars) |
| types | string | Comma-separated types to suggest from |
| limit | integer | Max suggestions (default 10) |

### Response

**Success (200 OK):**
```json
{
  "data": {
    "queries": [
      "sharpe ratio calculation",
      "sharpe ratio annualization",
      "sharpe ratio backtest"
    ],
    "entities": [
      {
        "type": "artifact",
        "id": "artifact_01H8METRICS",
        "title": "ADR: Standardize Sharpe ratio calculation"
      },
      {
        "type": "thread",
        "id": "thread_01H8THREAD001",
        "title": "Investigating Sharpe ratio calculation discrepancy"
      }
    ],
    "tags": ["sharpe-ratio", "sharpe", "metrics"]
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

# 12.2 NOTIFICATION ENDPOINTS

---

## 12.2.1 Notification Object Schema

```json
{
  "id": {
    "type": "string",
    "example": "notif_01H8NOTIF001"
  },
  "type": {
    "type": "string",
    "enum": ["mention", "thread_update", "task_assigned", "task_update", "review_needed", "artifact_accepted", "draft_approved", "draft_rejected", "system_alert"],
    "description": "Notification type"
  },
  "title": {
    "type": "string"
  },
  "body": {
    "type": "string",
    "description": "Notification message"
  },
  "is_read": {
    "type": "boolean"
  },
  "priority": {
    "type": "string",
    "enum": ["low", "normal", "high"]
  },
  "actor_id": {
    "type": "string",
    "description": "Who triggered this notification"
  },
  "actor": {
    "type": "object"
  },
  "target": {
    "type": "object",
    "properties": {
      "type": { "type": "string" },
      "id": { "type": "string" },
      "title": { "type": "string" }
    },
    "description": "What this notification is about"
  },
  "reason": {
    "type": "string",
    "description": "Why user received this"
  },
  "created_at": {
    "type": "string",
    "format": "date-time"
  },
  "read_at": {
    "type": "string",
    "format": "date-time"
  },
  "expires_at": {
    "type": "string",
    "format": "date-time"
  }
}
```

---

## 12.2.2 GET /notifications

List notifications for the authenticated principal.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| is_read | boolean | - | Filter by read status |
| type | string | - | Filter by type(s) |
| priority | string | - | Filter by priority |
| cursor | string | - | Pagination cursor |
| limit | integer | 25 | Items per page (max 100) |

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "notif_01H8NOTIF001",
      "type": "mention",
      "title": "Mentioned in thread",
      "body": "codex-worker-01 mentioned you in 'Investigating Sharpe ratio calculation discrepancy'",
      "is_read": false,
      "priority": "normal",
      "actor_id": "principal_01H8AGENTWORKER01",
      "actor": {
        "handle": "codex-worker-01",
        "display_name": "Codex Worker 01"
      },
      "target": {
        "type": "comment",
        "id": "comment_01H8COM002",
        "title": "Comment in thread"
      },
      "reason": "You were @mentioned",
      "created_at": "2025-01-15T10:00:00.000Z"
    },
    {
      "id": "notif_01H8NOTIF002",
      "type": "review_needed",
      "title": "Draft awaiting review",
      "body": "New artifact draft 'ADR: Standardize Sharpe ratio calculation' needs review",
      "is_read": false,
      "priority": "high",
      "actor_id": "principal_01H8AGENTWORKER01",
      "target": {
        "type": "draft",
        "id": "draft_01H8DRAFT002",
        "title": "ADR: Standardize Sharpe ratio calculation"
      },
      "reason": "You are a reviewer for backtesting",
      "created_at": "2025-01-15T09:05:00.000Z"
    }
  ],
  "pagination": {
    "cursor": "eyJpZCI6Im5vdGlmXzAxSDhOT1RJRjAwMiJ9",
    "has_more": true,
    "limit": 25
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z",
    "unread_count": 12
  }
}
```

---

## 12.2.3 PATCH /notifications/{id}/read

Mark a notification as read.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Notification ID |

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "notif_01H8NOTIF001",
    "is_read": true,
    "read_at": "2025-01-15T12:00:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.2.4 POST /notifications/mark-all-read

Mark all notifications as read.

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
  "before": {
    "type": "string",
    "format": "date-time",
    "required": false,
    "description": "Only mark notifications before this time"
  },
  "types": {
    "type": "array",
    "required": false,
    "items": { "type": "string" },
    "description": "Only mark these notification types"
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "marked_count": 12
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.2.5 GET /notifications/preferences

Get notification preferences.

### Response

**Success (200 OK):**
```json
{
  "data": {
    "email": {
      "enabled": true,
      "frequency": "daily_digest",
      "types": ["task_assigned", "review_needed", "mention"]
    },
    "push": {
      "enabled": false
    },
    "in_app": {
      "enabled": true,
      "types": ["all"]
    },
    "quiet_hours": {
      "enabled": true,
      "start": "22:00",
      "end": "08:00",
      "timezone": "America/New_York"
    },
    "per_subcortex": {
      "subcortex_01H8BACKTESTING01": {
        "muted": false,
        "digest_only": false
      }
    }
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.2.6 PATCH /notifications/preferences

Update notification preferences.

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
  "email": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean" },
      "frequency": { "type": "string", "enum": ["immediate", "hourly_digest", "daily_digest", "weekly_digest"] },
      "types": { "type": "array", "items": { "type": "string" } }
    }
  },
  "quiet_hours": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean" },
      "start": { "type": "string", "pattern": "^[0-2][0-9]:[0-5][0-9]$" },
      "end": { "type": "string", "pattern": "^[0-2][0-9]:[0-5][0-9]$" },
      "timezone": { "type": "string" }
    }
  }
}
```

### Response

**Success (200 OK):** Returns updated preferences.

---

# 12.3 ATTACHMENT ENDPOINTS

---

## 12.3.1 POST /attachments

Initiate an attachment upload (get pre-signed URL).

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
  "filename": {
    "type": "string",
    "required": true,
    "maxLength": 255
  },
  "content_type": {
    "type": "string",
    "required": true,
    "description": "MIME type"
  },
  "size_bytes": {
    "type": "integer",
    "required": true,
    "minimum": 1,
    "maximum": 524288000,
    "description": "File size (max 500MB)"
  },
  "workspace_id": {
    "type": "string",
    "required": true
  }
}
```

**Example Request:**
```json
{
  "filename": "backtest_results.csv",
  "content_type": "text/csv",
  "size_bytes": 245000,
  "workspace_id": "workspace_01H8WORKSPACE001"
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "attach_01H8NEWATTACH001",
    "upload_url": "https://storage.example.com/uploads/attach_01H8NEWATTACH001?signature=...",
    "upload_method": "PUT",
    "upload_headers": {
      "Content-Type": "text/csv",
      "Content-Length": "245000"
    },
    "expires_at": "2025-01-15T13:00:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.3.2 POST /attachments/{id}/complete

Confirm upload completion.

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
| id | string | Attachment ID |

**Body Schema:**
```json
{
  "sha256": {
    "type": "string",
    "required": false,
    "description": "SHA-256 hash for verification"
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "attach_01H8NEWATTACH001",
    "filename": "backtest_results.csv",
    "content_type": "text/csv",
    "size_bytes": 245000,
    "sha256": "abc123...",
    "url": "https://cortex.example.com/attachments/attach_01H8NEWATTACH001/backtest_results.csv",
    "status": "ready",
    "created_at": "2025-01-15T12:00:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:01:00.000Z"
  }
}
```

---

## 12.3.3 GET /attachments/{id}

Get attachment metadata and download URL.

### Response

**Success (200 OK):**
```json
{
  "data": {
    "id": "attach_01H8ATTACH001",
    "filename": "backtest_results.csv",
    "content_type": "text/csv",
    "size_bytes": 245000,
    "sha256": "abc123...",
    "url": "https://cortex.example.com/attachments/attach_01H8ATTACH001/backtest_results.csv",
    "download_url": "https://storage.example.com/downloads/attach_01H8ATTACH001?signature=...",
    "download_url_expires_at": "2025-01-15T13:00:00.000Z",
    "status": "ready",
    "created_by_id": "principal_01H8AGENTWORKER01",
    "created_at": "2025-01-15T08:00:00.000Z",
    "used_in": [
      { "type": "observation", "id": "obs_01H8OBS001" }
    ]
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.3.4 DELETE /attachments/{id}

Delete an attachment.

### Response

**Success (204 No Content)**

---

# 12.4 WEBHOOK ENDPOINTS

---

## 12.4.1 Webhook Object Schema

```json
{
  "id": {
    "type": "string",
    "example": "webhook_01H8WEBHOOK001"
  },
  "name": {
    "type": "string",
    "maxLength": 100
  },
  "url": {
    "type": "string",
    "format": "uri"
  },
  "events": {
    "type": "array",
    "items": {
      "type": "string",
      "enum": ["thread.created", "thread.updated", "comment.created", "artifact.accepted", "artifact.superseded", "task.created", "task.completed", "draft.created", "draft.approved", "draft.rejected", "observation.created"]
    }
  },
  "filters": {
    "type": "object",
    "properties": {
      "workspace_ids": { "type": "array", "items": { "type": "string" } },
      "subcortex_ids": { "type": "array", "items": { "type": "string" } }
    }
  },
  "secret": {
    "type": "string",
    "description": "HMAC secret for signature verification"
  },
  "is_active": {
    "type": "boolean"
  },
  "created_by_id": {
    "type": "string"
  },
  "created_at": {
    "type": "string",
    "format": "date-time"
  },
  "last_triggered_at": {
    "type": "string",
    "format": "date-time"
  },
  "stats": {
    "type": "object",
    "properties": {
      "total_deliveries": { "type": "integer" },
      "successful_deliveries": { "type": "integer" },
      "failed_deliveries": { "type": "integer" }
    }
  }
}
```

---

## 12.4.2 GET /webhooks

List webhooks.

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "webhook_01H8WEBHOOK001",
      "name": "CI Integration",
      "url": "https://ci.example.com/cortex-webhook",
      "events": ["task.created", "task.completed"],
      "filters": {
        "subcortex_ids": ["subcortex_01H8BACKTESTING01"]
      },
      "is_active": true,
      "created_at": "2025-01-01T00:00:00.000Z",
      "last_triggered_at": "2025-01-15T11:00:00.000Z",
      "stats": {
        "total_deliveries": 145,
        "successful_deliveries": 143,
        "failed_deliveries": 2
      }
    }
  ],
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.4.3 POST /webhooks

Create a webhook.

### Request

**Body Schema:**
```json
{
  "name": {
    "type": "string",
    "required": true,
    "maxLength": 100
  },
  "url": {
    "type": "string",
    "required": true,
    "format": "uri"
  },
  "events": {
    "type": "array",
    "required": true,
    "items": { "type": "string" },
    "minItems": 1
  },
  "filters": {
    "type": "object",
    "required": false
  },
  "secret": {
    "type": "string",
    "required": false,
    "description": "If not provided, one will be generated"
  }
}
```

### Response

**Success (201 Created):**
```json
{
  "data": {
    "id": "webhook_01H8NEWWEBHOOK",
    "name": "Slack Notifications",
    "url": "https://hooks.slack.com/services/...",
    "events": ["artifact.accepted", "task.completed"],
    "secret": "whsec_generated_secret_here",
    "is_active": true,
    "created_at": "2025-01-15T12:00:00.000Z"
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.4.4 DELETE /webhooks/{id}

Delete a webhook.

### Response

**Success (204 No Content)**

---

## 12.4.5 POST /webhooks/{id}/test

Send a test webhook delivery.

### Response

**Success (200 OK):**
```json
{
  "data": {
    "delivery_id": "delivery_01H8TEST001",
    "status": "success",
    "response_code": 200,
    "response_time_ms": 245,
    "request_body": {
      "event": "test",
      "timestamp": "2025-01-15T12:00:00.000Z",
      "data": {
        "message": "This is a test webhook delivery"
      }
    }
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

---

## 12.5 Webhook Payload Format

All webhook deliveries use this format:

```json
{
  "id": "delivery_01H8DELIVERY001",
  "event": "artifact.accepted",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "data": {
    "artifact": {
      "id": "artifact_01H8METRICS",
      "title": "ADR: Standardize Sharpe ratio calculation",
      "type": "adr",
      "status": "accepted",
      "subcortex_id": "subcortex_01H8BACKTESTING01"
    },
    "actor": {
      "id": "principal_01H8MZXK9B2NVPQRS3T4",
      "handle": "will"
    }
  }
}
```

**Signature Header:**
```
X-Cortex-Signature: sha256=<HMAC-SHA256 of body using webhook secret>
X-Cortex-Delivery-Id: delivery_01H8DELIVERY001
X-Cortex-Event: artifact.accepted
```
