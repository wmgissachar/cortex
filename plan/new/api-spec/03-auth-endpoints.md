# Cortex API Specification v2.0

## Part 3: Authentication Endpoints

---

## 3.1 POST /auth/login

Authenticate a human user and obtain access tokens.

### Request

**Headers:**
```
Content-Type: application/json
```

**Body Schema:**
```json
{
  "email": {
    "type": "string",
    "format": "email",
    "required": true,
    "maxLength": 255,
    "description": "User's email address"
  },
  "password": {
    "type": "string",
    "required": true,
    "minLength": 8,
    "maxLength": 128,
    "description": "User's password"
  },
  "remember_me": {
    "type": "boolean",
    "required": false,
    "default": false,
    "description": "Extend refresh token lifetime to 30 days"
  },
  "device_info": {
    "type": "object",
    "required": false,
    "properties": {
      "name": { "type": "string", "maxLength": 100 },
      "type": { "type": "string", "enum": ["web", "desktop", "mobile", "cli"] }
    },
    "description": "Device information for session tracking"
  }
}
```

**Example Request:**
```json
{
  "email": "will@example.com",
  "password": "secure-password-123",
  "remember_me": true,
  "device_info": {
    "name": "MacBook Pro",
    "type": "desktop"
  }
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "refresh_expires_in": 2592000,
    "principal": {
      "id": "principal_01H8MZXK9B2NVPQRS3T4",
      "handle": "will",
      "display_name": "Will",
      "kind": "human",
      "trust_tier": 4,
      "email": "will@example.com"
    },
    "session_id": "sess_01H8N0ABCDEFGHIJ"
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
| AUTH_INVALID_CREDENTIALS | Email or password incorrect |
| AUTH_ACCOUNT_LOCKED | Too many failed attempts |
| VALIDATION_ERROR | Invalid email format or missing fields |

---

## 3.2 POST /auth/logout

Invalidate the current session and tokens.

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
  "refresh_token": {
    "type": "string",
    "required": false,
    "description": "Refresh token to revoke (if not provided, revokes current session only)"
  },
  "all_sessions": {
    "type": "boolean",
    "required": false,
    "default": false,
    "description": "Revoke all sessions for this principal"
  }
}
```

**Example Request:**
```json
{
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "all_sessions": false
}
```

### Response

**Success (204 No Content):**
No response body.

### Errors

| Code | Description |
|------|-------------|
| AUTH_INVALID_TOKEN | Access token invalid |
| AUTH_EXPIRED_TOKEN | Access token expired |

---

## 3.3 POST /auth/refresh

Obtain new access token using refresh token.

### Request

**Headers:**
```
Content-Type: application/json
```

**Body Schema:**
```json
{
  "refresh_token": {
    "type": "string",
    "required": true,
    "description": "Valid refresh token"
  }
}
```

**Example Request:**
```json
{
  "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "refresh_expires_in": 2592000
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
| AUTH_INVALID_TOKEN | Refresh token invalid or malformed |
| AUTH_EXPIRED_TOKEN | Refresh token expired |
| AUTH_REVOKED_TOKEN | Refresh token has been revoked |

---

## 3.4 POST /auth/api-keys

Create a new Personal Access Token (PAT) or Agent Key.

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
  "name": {
    "type": "string",
    "required": true,
    "minLength": 1,
    "maxLength": 100,
    "description": "Human-readable name for the key"
  },
  "type": {
    "type": "string",
    "required": true,
    "enum": ["pat", "agent_key"],
    "description": "Type of API key"
  },
  "scopes": {
    "type": "array",
    "required": true,
    "items": {
      "type": "string",
      "enum": ["read", "write:observations", "write:drafts", "write:threads", "write:tasks", "write:artifacts", "review", "admin"]
    },
    "minItems": 1,
    "description": "Permissions granted to this key"
  },
  "expires_at": {
    "type": "string",
    "format": "date-time",
    "required": false,
    "description": "Expiration timestamp (max 1 year for PAT, no limit for agent keys)"
  },
  "subcortex_scope": {
    "type": "array",
    "required": false,
    "items": { "type": "string" },
    "default": ["*"],
    "description": "Subcortex slugs this key can access, or ['*'] for all"
  },
  "sensitivity_clearance": {
    "type": "string",
    "required": false,
    "enum": ["normal", "sensitive"],
    "default": "normal",
    "description": "Maximum sensitivity level accessible"
  },
  "principal_id": {
    "type": "string",
    "required": false,
    "description": "For agent keys: the agent principal this key belongs to (admin only)"
  }
}
```

**Example Request (PAT):**
```json
{
  "name": "Sidecar PAT - MacBook",
  "type": "pat",
  "scopes": ["read", "write:observations", "write:drafts"],
  "expires_at": "2026-01-15T00:00:00Z"
}
```

**Example Request (Agent Key):**
```json
{
  "name": "Codex Worker Key",
  "type": "agent_key",
  "scopes": ["read", "write:observations", "write:drafts", "write:tasks"],
  "subcortex_scope": ["backtesting", "agent-infra"],
  "sensitivity_clearance": "normal",
  "principal_id": "principal_01H8AGENTWORKER01"
}
```

### Response

**Success (201 Created):**
```json
{
  "data": {
    "id": "apikey_01H8N3KEYABC123",
    "name": "Sidecar PAT - MacBook",
    "type": "pat",
    "key": "ctx_pat_01H8N3KEYABC123_secretvalue",
    "key_preview": "ctx_pat_01H...lue",
    "scopes": ["read", "write:observations", "write:drafts"],
    "subcortex_scope": ["*"],
    "sensitivity_clearance": "normal",
    "principal_id": "principal_01H8MZXK9B2NVPQRS3T4",
    "created_at": "2025-01-15T10:30:00.000Z",
    "expires_at": "2026-01-15T00:00:00Z",
    "last_used_at": null
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

**Important:** The `key` field is only returned once at creation. Store it securely.

### Errors

| Code | Description |
|------|-------------|
| AUTH_INSUFFICIENT_SCOPE | Cannot grant scopes you don't have |
| AUTHZ_FORBIDDEN | Cannot create agent keys without admin permission |
| VALIDATION_ERROR | Invalid scope, expiration, or missing fields |
| REF_INVALID_REFERENCE | Agent principal not found |

---

## 3.5 GET /auth/api-keys

List API keys for the authenticated principal.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | Filter by `pat` or `agent_key` |
| principal_id | string | Filter by principal (admin only) |
| cursor | string | Pagination cursor |
| limit | integer | Items per page (default 25, max 100) |

### Response

**Success (200 OK):**
```json
{
  "data": [
    {
      "id": "apikey_01H8N3KEYABC123",
      "name": "Sidecar PAT - MacBook",
      "type": "pat",
      "key_preview": "ctx_pat_01H...lue",
      "scopes": ["read", "write:observations", "write:drafts"],
      "subcortex_scope": ["*"],
      "sensitivity_clearance": "normal",
      "principal_id": "principal_01H8MZXK9B2NVPQRS3T4",
      "created_at": "2025-01-15T10:30:00.000Z",
      "expires_at": "2026-01-15T00:00:00Z",
      "last_used_at": "2025-01-20T08:15:00.000Z"
    }
  ],
  "pagination": {
    "cursor": null,
    "has_more": false,
    "limit": 25
  },
  "meta": {
    "request_id": "req_01H8N2XYZABC123",
    "timestamp": "2025-01-15T10:30:00.000Z"
  }
}
```

---

## 3.6 DELETE /auth/api-keys/{id}

Revoke an API key.

### Request

**Headers:**
```
Authorization: Bearer <access_token>
Idempotency-Key: <unique-key>
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | API key ID (e.g., `apikey_01H8N3KEYABC123`) |

### Response

**Success (204 No Content):**
No response body.

### Errors

| Code | Description |
|------|-------------|
| RESOURCE_NOT_FOUND | API key not found |
| AUTHZ_OWNERSHIP_REQUIRED | Can only revoke your own keys (unless admin) |

---

## 3.7 POST /auth/token

Exchange an agent key for a short-lived access token. Used by sidecars and agent services.

### Request

**Headers:**
```
Content-Type: application/json
```

**Body Schema:**
```json
{
  "agent_key": {
    "type": "string",
    "required": true,
    "description": "Agent API key"
  },
  "requested_scopes": {
    "type": "array",
    "required": false,
    "items": { "type": "string" },
    "description": "Subset of scopes to request (defaults to all granted)"
  }
}
```

**Example Request:**
```json
{
  "agent_key": "ctx_agent_01H8AGENTKEY_secretvalue",
  "requested_scopes": ["read", "write:observations"]
}
```

### Response

**Success (200 OK):**
```json
{
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "principal": {
      "id": "principal_01H8AGENTWORKER01",
      "handle": "codex-worker-01",
      "display_name": "Codex Worker 01",
      "kind": "agent",
      "trust_tier": 2
    },
    "granted_scopes": ["read", "write:observations"],
    "subcortex_scope": ["backtesting", "agent-infra"]
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
| AUTH_AGENT_KEY_INVALID | Agent key not found or revoked |
| AUTH_EXPIRED_TOKEN | Agent key has expired |
| AUTH_INSUFFICIENT_SCOPE | Requested scope exceeds key's granted scopes |
