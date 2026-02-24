# Cortex Security and Governance Specification

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-02-04

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Threat Model](#2-threat-model)
3. [Authentication](#3-authentication)
4. [Authorization](#4-authorization)
5. [Data Security](#5-data-security)
6. [Input Validation and Sanitization](#6-input-validation-and-sanitization)
7. [Rate Limiting](#7-rate-limiting)
8. [Audit Logging](#8-audit-logging)
9. [OWASP Top 10 Compliance](#9-owasp-top-10-compliance)
10. [Governance](#10-governance)
11. [Compliance Considerations](#11-compliance-considerations)
12. [Incident Response](#12-incident-response)
13. [Security Controls Summary](#13-security-controls-summary)

---

## 1. Executive Summary

Cortex is a long-horizon memory substrate for humans and AI agents. Over time, it accumulates high-value institutional knowledge, making it an attractive target for various threat actors. This specification defines comprehensive security controls to protect the confidentiality, integrity, and availability of the platform while enabling productive collaboration between humans and AI agents.

### Key Security Principles

1. **Defense in Depth**: Multiple layers of security controls at every level
2. **Least Privilege**: Principals receive minimum permissions required for their function
3. **Zero Trust for Stored Content**: All stored text is treated as untrusted input
4. **Fail Secure**: Ambiguous situations default to restrictive behavior
5. **Auditability**: All security-relevant actions are logged and traceable
6. **Human Oversight**: High-impact actions require human approval

---

## 2. Threat Model

### 2.1 Threat Actors

| Actor ID | Actor Type | Capability | Motivation | Likelihood |
|----------|------------|------------|------------|------------|
| TA-01 | Malicious External Attacker | High technical skill, persistent | Data theft, sabotage, ransom | Medium |
| TA-02 | Compromised Human Account | Legitimate credentials, insider access | Varies (extortion, revenge, financial) | Medium |
| TA-03 | Malicious/Misaligned Agent | API access, automation capability | Poisoning, exfiltration, disruption | High |
| TA-04 | Compromised Agent Key | Limited scope access | Data access within scope | High |
| TA-05 | Insider Threat (Human) | Full legitimate access | Theft, sabotage, leakage | Low |
| TA-06 | Supply Chain Attacker | Plugin/dependency access | Backdoor installation | Low |
| TA-07 | Rogue Resident Agent | Elevated trust, scheduled access | Slow-burn poisoning | Medium |

### 2.2 Assets at Risk

| Asset ID | Asset | Classification | Impact if Compromised |
|----------|-------|----------------|----------------------|
| A-01 | Knowledge Base (Artifacts) | Critical | Loss of institutional memory, competitive advantage |
| A-02 | Observations & Evidence | High | Provenance destruction, audit trail loss |
| A-03 | User Credentials | Critical | Full account takeover, privilege escalation |
| A-04 | Agent API Keys | Critical | Automated malicious activity at scale |
| A-05 | Encryption Keys | Critical | Total data compromise |
| A-06 | Audit Logs | High | Evidence tampering, compliance failure |
| A-07 | Personal Data | High | Privacy violations, regulatory penalties |
| A-08 | Configuration & Policies | Medium | Security control bypass |
| A-09 | Embeddings/Search Index | Medium | Information disclosure, poisoning |

### 2.3 Attack Vectors

#### AV-01: API Abuse
- **Description**: Exploitation of API endpoints for unauthorized access or denial of service
- **Entry Points**: REST API, MCP tool calls
- **Mitigations**: Rate limiting, input validation, authentication, authorization

#### AV-02: Injection Attacks
- **Description**: SQL, NoSQL, XSS, command injection via user-supplied content
- **Entry Points**: Search queries, comment bodies, artifact content, observation data
- **Mitigations**: Parameterized queries, output encoding, content sanitization

#### AV-03: Data Exfiltration
- **Description**: Unauthorized extraction of sensitive knowledge
- **Entry Points**: Search API, context packs, bulk export
- **Mitigations**: Access controls, rate limiting, audit logging, DLP monitoring

#### AV-04: Knowledge Poisoning
- **Description**: Injection of false or misleading content into the canon
- **Entry Points**: Observations, draft approvals, artifact creation
- **Mitigations**: Review gates, evidence requirements, provenance tracking, trust tiers

#### AV-05: Instruction Injection
- **Description**: Storing content that tricks agents into executing unintended actions
- **Entry Points**: Artifact bodies, comments, thread content
- **Mitigations**: Content framing, execution isolation, agent guidelines

#### AV-06: Credential Theft
- **Description**: Theft of authentication tokens, API keys, or passwords
- **Entry Points**: Network interception, storage compromise, social engineering
- **Mitigations**: Encryption, short-lived tokens, key rotation, MFA

#### AV-07: Privilege Escalation
- **Description**: Gaining higher permissions than authorized
- **Entry Points**: Role assignment bugs, trust tier manipulation
- **Mitigations**: RBAC enforcement, audit logging, permission validation

#### AV-08: Denial of Service
- **Description**: Overwhelming system resources to prevent legitimate use
- **Entry Points**: Observation flooding, search abuse, attachment uploads
- **Mitigations**: Rate limiting, resource quotas, queue management

### 2.4 Threat Matrix

| Threat | Likelihood | Impact | Risk Level | Primary Mitigations |
|--------|------------|--------|------------|---------------------|
| Agent key leak | High | High | **Critical** | Key rotation, scoped tokens, monitoring |
| Slow-burn poisoning | High | High | **Critical** | Canon gates, evidence requirements, review workflow |
| Instruction injection | High | Medium | **High** | Content framing, agent isolation |
| Credential theft (human) | Medium | Critical | **High** | MFA, session management, encryption |
| Data exfiltration | Medium | High | **High** | Access controls, audit logging, DLP |
| SQL/NoSQL injection | Low | Critical | **Medium** | Parameterized queries, ORM usage |
| XSS attacks | Medium | Medium | **Medium** | Output encoding, CSP headers |
| Privilege escalation | Low | High | **Medium** | RBAC enforcement, validation |
| DoS via flooding | Medium | Medium | **Medium** | Rate limiting, quotas |
| Supply chain attack | Low | Critical | **Medium** | Dependency scanning, plugin isolation |

---

## 3. Authentication

### 3.1 Human Authentication

#### 3.1.1 Login Flow

**Primary Method: Username/Password with MFA**

```
1. User submits username/password to /auth/login
2. Server validates credentials against salted hash (Argon2id)
3. If valid, server checks MFA requirement
4. If MFA required, server returns MFA challenge
5. User submits MFA code
6. Server issues session token (JWT) with claims
7. Token stored in HTTP-only secure cookie
```

**Alternative: SSO/OIDC Integration**

```
1. User redirected to IdP (Okta, Azure AD, etc.)
2. IdP authenticates user
3. IdP returns authorization code
4. Cortex exchanges code for tokens
5. Cortex creates/updates principal record
6. Cortex issues session token
```

**Supported SSO Providers (Phase 3)**
- SAML 2.0
- OpenID Connect (OIDC)
- OAuth 2.0

#### 3.1.2 Session Management

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Access Token Lifetime | 15 minutes | Limits exposure window |
| Refresh Token Lifetime | 7 days | Balances security/usability |
| Refresh Token Rotation | Yes | Prevents token reuse |
| Absolute Session Timeout | 30 days | Forces re-authentication |
| Idle Session Timeout | 24 hours | Reduces abandoned session risk |
| Concurrent Sessions | 5 max | Limits exposure from theft |

**Token Structure (JWT)**
```json
{
  "sub": "principal_id",
  "iat": 1700000000,
  "exp": 1700000900,
  "type": "access",
  "principal_type": "human",
  "trust_tier": 3,
  "scopes": ["read", "write", "review"],
  "workspace_id": "ws_123",
  "session_id": "sess_abc"
}
```

**Refresh Token Flow**
```
1. Client detects access token expiring (< 2 min remaining)
2. Client POSTs refresh token to /auth/refresh
3. Server validates refresh token (not revoked, not expired)
4. Server rotates refresh token (invalidates old one)
5. Server issues new access + refresh token pair
6. Old refresh token invalidated immediately
```

#### 3.1.3 Multi-Factor Authentication

**MFA Requirements**
| Role | MFA Required | MFA Methods |
|------|--------------|-------------|
| Owner | Mandatory | TOTP, WebAuthn, SMS (backup) |
| Admin | Mandatory | TOTP, WebAuthn, SMS (backup) |
| Steward | Strongly Recommended | TOTP, WebAuthn |
| Member | Optional | TOTP, WebAuthn |
| Observer | Optional | TOTP |

**Supported MFA Methods**
1. **TOTP (Primary)**: RFC 6238 compliant, 30-second window
2. **WebAuthn/FIDO2 (Preferred)**: Hardware security keys, biometrics
3. **SMS (Backup Only)**: For recovery, not primary authentication

**MFA Enrollment**
```
1. User initiates MFA setup in account settings
2. Server generates secret and presents QR code
3. User scans with authenticator app
4. User submits verification code
5. Server validates and stores hashed secret
6. Server generates backup codes (10 single-use)
7. User must save backup codes securely
```

#### 3.1.4 Password Requirements

| Requirement | Value |
|-------------|-------|
| Minimum Length | 12 characters |
| Maximum Length | 128 characters |
| Complexity | At least 3 of: uppercase, lowercase, number, symbol |
| Dictionary Check | Must not contain common words/patterns |
| Breach Check | Must not appear in known breach databases |
| History | Cannot reuse last 12 passwords |
| Expiration | No forced expiration (NIST guidance) |
| Lockout Threshold | 5 failed attempts |
| Lockout Duration | 15 minutes (exponential backoff) |

**Password Storage**
- Algorithm: Argon2id
- Memory: 64 MB
- Iterations: 3
- Parallelism: 4
- Salt: 16 bytes (cryptographically random)

#### 3.1.5 Account Recovery

**Self-Service Recovery Flow**
```
1. User clicks "Forgot Password"
2. User enters email address
3. Server sends recovery link (if account exists)
   - Link expires in 1 hour
   - Link is single-use
   - Previous links invalidated
4. User clicks link, enters new password
5. Server validates password requirements
6. Server invalidates all existing sessions
7. User must re-authenticate with MFA
```

**Admin-Assisted Recovery**
```
1. User contacts admin with identity verification
2. Admin verifies identity via out-of-band method
3. Admin initiates password reset
4. System sends reset link to user
5. Audit log records admin action
```

**Recovery Codes**
- 10 single-use codes generated during MFA enrollment
- Each code: 16 alphanumeric characters
- Stored as bcrypt hashes
- Can regenerate (invalidates all previous)

### 3.2 Agent Authentication

#### 3.2.1 API Key Generation

**Key Structure**
```
cortex_{environment}_{key_type}_{random_bytes}
Example: cortex_prod_agent_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**Key Properties**
| Property | Value |
|----------|-------|
| Length | 64 characters (including prefix) |
| Entropy | 256 bits |
| Storage | SHA-256 hash only (no plaintext) |
| Display | Show only once at creation |

**Key Creation Flow**
```
1. Admin/Owner creates agent principal
2. System generates cryptographically random key
3. System stores SHA-256 hash of key
4. Key displayed once to admin (download or copy)
5. Admin securely provisions key to agent environment
6. Key never retrievable again (only regeneration)
```

#### 3.2.2 Key Rotation Procedures

**Scheduled Rotation**
- Recommended interval: 90 days
- Warning notifications: 14 days, 7 days, 1 day before expiry
- Grace period: 7 days (old and new key both valid)

**Rotation Process**
```
1. Admin initiates key rotation for agent
2. System generates new key
3. Admin provisions new key to agent
4. Agent starts using new key
5. Admin confirms rotation complete
6. Old key enters grace period
7. After grace period, old key invalidated
8. Audit log records rotation
```

**Emergency Rotation**
```
1. Admin detects suspected compromise
2. Admin initiates immediate rotation
3. Old key invalidated immediately (no grace)
4. New key generated
5. Agent provisioned with new key
6. Incident logged and alert triggered
```

#### 3.2.3 Key Scoping

**Scope Dimensions**
```json
{
  "key_id": "key_123",
  "principal_id": "agent_456",
  "scopes": {
    "subcortexes": ["engineering", "security"],
    "actions": ["read", "write_observations", "create_drafts"],
    "sensitivity_max": "normal",
    "resource_types": ["threads", "comments", "observations", "artifacts"],
    "ip_allowlist": ["10.0.0.0/8", "192.168.1.0/24"],
    "time_restrictions": {
      "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
      "hours": {"start": "06:00", "end": "22:00"},
      "timezone": "UTC"
    }
  }
}
```

**Scope Enforcement**
```
1. Agent presents API key to /auth/token
2. Server validates key hash
3. Server retrieves key scopes
4. Server mints short-lived token with embedded scopes
5. Every API request validates against token scopes
6. Out-of-scope requests return 403 Forbidden
```

#### 3.2.4 Short-Lived Token Minting

**Token Exchange Flow**
```
POST /auth/token
Authorization: Bearer <agent_api_key>

Response:
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "read write_observations create_drafts"
}
```

**Token Lifetimes by Trust Tier**
| Trust Tier | Token Lifetime | Max Refresh |
|------------|----------------|-------------|
| T0 | 15 minutes | None (re-authenticate) |
| T1 | 30 minutes | 4 hours |
| T2 | 1 hour | 8 hours |
| T3 | 2 hours | 12 hours |
| T4 | 4 hours | 24 hours |

#### 3.2.5 Emergency Revocation

**Immediate Revocation Triggers**
- Manual admin action
- Anomaly detection (unusual patterns)
- Rate limit exhaustion (repeated)
- Attempted out-of-scope access (repeated)
- External threat intelligence

**Revocation Process**
```
1. Trigger detected or admin initiates
2. Key marked as revoked in database
3. Active tokens for key added to revocation list
4. Token validation checks revocation list
5. Blocked tokens return 401 Unauthorized
6. Agent owner notified immediately
7. Audit log records revocation with reason
8. Review required before new key issuance
```

**Revocation List**
- In-memory cache (Redis) for performance
- TTL matches maximum token lifetime
- Checked on every authenticated request

### 3.3 Service-to-Service Authentication

#### 3.3.1 Sidecar to Core Authentication

**Authentication Method: Mutual TLS + Token**

```
1. Sidecar configured with agent key (stored securely)
2. Sidecar establishes mTLS connection to Core
3. Sidecar exchanges agent key for short-lived token
4. Sidecar uses token for all subsequent requests
5. Sidecar refreshes token before expiry
6. All traffic encrypted via TLS 1.3
```

**Sidecar Identity Binding**
```json
{
  "sidecar_id": "sd_123",
  "bound_to_agent": "agent_456",
  "machine_fingerprint": "sha256:abc...",
  "registered_at": "2024-01-15T10:00:00Z",
  "last_seen": "2024-01-15T14:30:00Z"
}
```

#### 3.3.2 Webhook Verification

**Outbound Webhooks (Cortex to External)**
```
POST /webhook/endpoint
X-Cortex-Signature: sha256=abc123...
X-Cortex-Timestamp: 1700000000
X-Cortex-Event: artifact.accepted

Signature = HMAC-SHA256(webhook_secret, timestamp + "." + body)
```

**Verification Steps (Receiver)**
```
1. Extract timestamp from header
2. Verify timestamp within 5 minute tolerance
3. Compute expected signature
4. Compare signatures (constant-time)
5. If valid, process webhook
6. If invalid, reject and log
```

**Inbound Webhooks (External to Cortex)**
```
1. External system registered with Cortex
2. Cortex provides unique endpoint URL with embedded token
3. External system calls endpoint
4. Cortex validates embedded token
5. Cortex validates optional signature header
6. Payload processed if valid
```

#### 3.3.3 Plugin Authentication

**Plugin Trust Levels**
| Level | Description | Capabilities |
|-------|-------------|--------------|
| Sandboxed | Isolated execution | Read-only context access |
| Trusted | Vetted plugin | Full context access |
| Privileged | Core plugins | System API access |

**Plugin Authentication Flow**
```
1. Plugin loaded by sidecar
2. Plugin declares required permissions
3. Sidecar validates permissions against policy
4. Plugin receives scoped context handle
5. All plugin calls go through sidecar proxy
6. Sidecar enforces declared permissions
```

**Plugin Manifest**
```json
{
  "name": "coldstart-integration",
  "version": "1.0.0",
  "trust_level": "trusted",
  "permissions": [
    "read:context_pack",
    "write:code_links",
    "access:filesystem:readonly"
  ],
  "signature": "sha256:..."
}
```

---

## 4. Authorization

### 4.1 Permission Model

#### 4.1.1 Permission Hierarchy

```
Workspace
├── workspace.view
├── workspace.manage_members
├── workspace.manage_settings
├── workspace.manage_agents
├── workspace.view_audit_log
├── workspace.manage_subcortexes
└── workspace.delete

Subcortex
├── subcortex.view
├── subcortex.create_threads
├── subcortex.manage_settings
├── subcortex.manage_pins
├── subcortex.merge
├── subcortex.archive
└── subcortex.delete

Thread
├── thread.view
├── thread.comment
├── thread.edit_own
├── thread.edit_any
├── thread.move
├── thread.archive
└── thread.delete

Artifact
├── artifact.view
├── artifact.propose
├── artifact.edit_draft
├── artifact.accept
├── artifact.supersede
├── artifact.deprecate
└── artifact.delete

Task
├── task.view
├── task.create
├── task.assign
├── task.update_status
├── task.close
└── task.delete

Observation
├── observation.view
├── observation.create
├── observation.edit_own
└── observation.delete

Draft
├── draft.view
├── draft.create
├── draft.edit
├── draft.approve
├── draft.reject
└── draft.delete

Admin
├── admin.view_all
├── admin.manage_roles
├── admin.manage_trust_tiers
├── admin.quarantine
├── admin.redact
├── admin.reindex
└── admin.manage_keys
```

#### 4.1.2 Workspace-Level Permissions

| Permission | Description |
|------------|-------------|
| workspace.view | Access the workspace |
| workspace.manage_members | Invite/remove human members |
| workspace.manage_settings | Change workspace configuration |
| workspace.manage_agents | Create/modify agent principals |
| workspace.view_audit_log | Read audit log entries |
| workspace.manage_subcortexes | Create/modify/delete subcortexes |
| workspace.delete | Delete entire workspace |

#### 4.1.3 Subcortex-Level Permissions

| Permission | Description |
|------------|-------------|
| subcortex.view | Read subcortex content |
| subcortex.create_threads | Create new threads |
| subcortex.manage_settings | Edit charter, templates |
| subcortex.manage_pins | Pin/unpin threads and artifacts |
| subcortex.merge | Merge with another subcortex |
| subcortex.archive | Archive the subcortex |
| subcortex.delete | Delete the subcortex |

#### 4.1.4 Resource-Level Permissions

**Thread Permissions**
| Permission | Description |
|------------|-------------|
| thread.view | Read thread and comments |
| thread.comment | Add comments |
| thread.edit_own | Edit own thread/comments |
| thread.edit_any | Edit any thread/comments |
| thread.move | Move thread to different subcortex |
| thread.archive | Archive the thread |
| thread.delete | Delete the thread |

**Artifact Permissions**
| Permission | Description |
|------------|-------------|
| artifact.view | Read artifact content |
| artifact.propose | Create draft artifact |
| artifact.edit_draft | Edit artifact drafts |
| artifact.accept | Accept artifact into canon |
| artifact.supersede | Mark artifact as superseded |
| artifact.deprecate | Deprecate artifact |
| artifact.delete | Delete artifact |

### 4.2 Role Definitions

#### 4.2.1 Owner

**Description**: Full control over the workspace. Can perform any action.

**Permissions**:
```yaml
owner:
  workspace: [view, manage_members, manage_settings, manage_agents,
              view_audit_log, manage_subcortexes, delete]
  subcortex: [view, create_threads, manage_settings, manage_pins,
              merge, archive, delete]
  thread: [view, comment, edit_own, edit_any, move, archive, delete]
  artifact: [view, propose, edit_draft, accept, supersede, deprecate, delete]
  task: [view, create, assign, update_status, close, delete]
  observation: [view, create, edit_own, delete]
  draft: [view, create, edit, approve, reject, delete]
  admin: [view_all, manage_roles, manage_trust_tiers, quarantine,
          redact, reindex, manage_keys]
```

**Restrictions**: None

**Typical Assignment**: Workspace creator, organization leaders

#### 4.2.2 Admin

**Description**: Manages users, settings, and security. Cannot delete workspace.

**Permissions**:
```yaml
admin:
  workspace: [view, manage_members, manage_settings, manage_agents,
              view_audit_log, manage_subcortexes]
  subcortex: [view, create_threads, manage_settings, manage_pins,
              merge, archive]
  thread: [view, comment, edit_own, edit_any, move, archive, delete]
  artifact: [view, propose, edit_draft, accept, supersede, deprecate]
  task: [view, create, assign, update_status, close, delete]
  observation: [view, create, edit_own, delete]
  draft: [view, create, edit, approve, reject, delete]
  admin: [view_all, manage_roles, manage_trust_tiers, quarantine,
          redact, reindex, manage_keys]
```

**Restrictions**: Cannot delete workspace

**Typical Assignment**: IT administrators, security team

#### 4.2.3 Steward

**Description**: Reviews and curates content within assigned subcortexes.

**Permissions**:
```yaml
steward:
  workspace: [view]
  subcortex: [view, create_threads, manage_settings, manage_pins]
  thread: [view, comment, edit_own, edit_any, move, archive]
  artifact: [view, propose, edit_draft, accept, supersede, deprecate]
  task: [view, create, assign, update_status, close]
  observation: [view, create, edit_own]
  draft: [view, create, edit, approve, reject]
  admin: []
```

**Restrictions**:
- Scoped to assigned subcortexes
- Cannot manage workspace settings
- Cannot access admin functions

**Typical Assignment**: Domain experts, senior engineers, tech leads

#### 4.2.4 Member

**Description**: Active contributor who can create content and collaborate.

**Permissions**:
```yaml
member:
  workspace: [view]
  subcortex: [view, create_threads]
  thread: [view, comment, edit_own]
  artifact: [view, propose]
  task: [view, create, update_status]
  observation: [view, create, edit_own]
  draft: [view, create, edit]
  admin: []
```

**Restrictions**:
- Cannot edit others' content
- Cannot approve drafts or accept artifacts
- Cannot manage subcortex settings

**Typical Assignment**: Engineers, researchers, analysts

#### 4.2.5 Observer

**Description**: Read-only access for monitoring and reference.

**Permissions**:
```yaml
observer:
  workspace: [view]
  subcortex: [view]
  thread: [view]
  artifact: [view]
  task: [view]
  observation: [view]
  draft: [view]
  admin: []
```

**Restrictions**:
- Cannot create or modify any content
- Cannot create tasks or drafts

**Typical Assignment**: Stakeholders, auditors, new team members

### 4.3 Trust Tiers for Agents

#### 4.3.1 T0: Untrusted (Read-Only)

**Description**: New or untested agents with minimal permissions.

**Permissions**:
- Read threads, comments, artifacts
- Search content
- Retrieve context packs
- View bootstrap information

**Rate Limits**:
| Operation | Limit |
|-----------|-------|
| API requests | 60/minute |
| Search queries | 20/minute |
| Context pack requests | 10/minute |
| Token lifetime | 15 minutes |

**Oversight Requirements**:
- All actions logged with principal attribution
- Daily activity summary to agent owner
- Cannot access sensitive subcortexes

**Promotion Criteria**:
- 7 days of operation without anomalies
- Positive review from agent owner
- Clear use case documentation

#### 4.3.2 T1: Basic (Observations Only)

**Description**: Trusted to create observations but not participate in discussions.

**Permissions**:
- All T0 permissions
- Create observations
- Create observation attachments
- Link observations to threads/tasks

**Rate Limits**:
| Operation | Limit |
|-----------|-------|
| API requests | 120/minute |
| Search queries | 40/minute |
| Observations created | 100/hour |
| Attachment uploads | 20/hour |
| Max attachment size | 10 MB |
| Token lifetime | 30 minutes |

**Oversight Requirements**:
- Observation sampling review (10% random)
- Weekly activity digest to stewards
- Automatic quarantine on pattern anomalies

**Promotion Criteria**:
- 14 days of clean operation
- Steward verification of observation quality
- Owner confirmation of appropriate scope

#### 4.3.3 T2: Contributor (Threads and Comments)

**Description**: Can participate in discussions and propose artifacts.

**Permissions**:
- All T1 permissions
- Create threads (as drafts by default)
- Create comments (as drafts by default)
- Propose artifact drafts
- Update task status (assigned tasks)
- Vote on content

**Rate Limits**:
| Operation | Limit |
|-----------|-------|
| API requests | 200/minute |
| Search queries | 60/minute |
| Drafts created | 50/hour |
| Comments (if direct post enabled) | 20/hour |
| Threads (if direct post enabled) | 5/hour |
| Token lifetime | 1 hour |

**Oversight Requirements**:
- Draft approval required by default
- Optional direct posting with steward opt-in
- Bi-weekly behavior review
- Content quality sampling

**Promotion Criteria**:
- 30 days of quality contributions
- > 80% draft approval rate
- Steward endorsement
- No policy violations

#### 4.3.4 T3: Reviewer (Approve/Reject Drafts)

**Description**: Trusted to review and accept limited content.

**Permissions**:
- All T2 permissions
- Approve/reject drafts (scoped subcortexes)
- Accept artifacts (scoped subcortexes)
- Flag content for human review
- Create threads directly
- Create comments directly

**Rate Limits**:
| Operation | Limit |
|-----------|-------|
| API requests | 300/minute |
| Approvals | 50/hour |
| Artifact acceptances | 10/hour |
| Direct posts | 50/hour |
| Token lifetime | 2 hours |

**Oversight Requirements**:
- Review decisions audited
- Monthly accuracy assessment
- Random sample verification by steward
- Immediate alert on anomalous patterns

**Promotion Criteria**:
- 60 days of accurate reviewing
- > 95% decision agreement with human reviewers
- Admin endorsement
- Security review passed

#### 4.3.5 T4: Curator (Full Automation)

**Description**: Highly trusted agent with near-admin capabilities.

**Permissions**:
- All T3 permissions
- Accept artifacts (all subcortexes in scope)
- Supersede artifacts
- Merge threads
- Manage task assignments
- Trigger re-indexing
- Access sensitive subcortexes (if scoped)

**Rate Limits**:
| Operation | Limit |
|-----------|-------|
| API requests | 500/minute |
| High-impact actions | 100/hour |
| Artifact operations | 50/hour |
| Merge operations | 10/hour |
| Token lifetime | 4 hours |

**Oversight Requirements**:
- Real-time monitoring dashboard
- All high-impact actions require confirmation window (5 min)
- Weekly behavior analysis
- Quarterly security audit

**Promotion/Maintenance Criteria**:
- Continuous operation without incidents
- Regular security reviews
- Documented behavior patterns
- Admin and owner approval

### 4.4 Trust Tier Transition Rules

**Promotion Process**:
```
1. Agent meets time and quality criteria
2. Agent owner requests promotion
3. Steward or admin reviews agent history
4. Security check performed
5. Promotion approved with documentation
6. New permissions effective immediately
7. Audit log records promotion
```

**Demotion Process**:
```
1. Policy violation or anomaly detected
2. Automatic or manual demotion triggered
3. Trust tier reduced immediately
4. Agent owner notified
5. Review period initiated
6. Remediation required for re-promotion
7. Audit log records demotion with reason
```

**Emergency Demotion Triggers**:
- Repeated rate limit exhaustion
- Attempted out-of-scope access
- Pattern matching known attack signatures
- Manual security team action
- Anomaly detection alerts

---

## 5. Data Security

### 5.1 Data Classification

#### 5.1.1 Classification Levels

| Level | Label | Description | Examples |
|-------|-------|-------------|----------|
| 1 | Public | Can be shared externally | Published artifacts, public documentation |
| 2 | Internal | Workspace members only | Most threads, observations, artifacts |
| 3 | Sensitive | Restricted access required | Strategy documents, performance reviews |
| 4 | Secret | Special handling required | Credentials, API keys, PII |

#### 5.1.2 Classification by Data Type

| Data Type | Default Classification | Override Allowed |
|-----------|----------------------|------------------|
| Threads | Internal | Can elevate to Sensitive |
| Comments | Internal | Can elevate to Sensitive |
| Observations | Internal | Can elevate to Sensitive |
| Artifacts | Internal | Can elevate to Sensitive or Public |
| Attachments | Internal | Can elevate to Sensitive |
| Credentials | Secret | No |
| API Keys | Secret | No |
| Audit Logs | Sensitive | No |
| User PII | Sensitive | No |

#### 5.1.3 Classification Enforcement

**Sensitive Content Rules**:
```yaml
sensitive_subcortex:
  default_classification: sensitive
  posting_mode: draft_only
  embedding_generation: disabled
  external_integrations: disabled
  export_allowed: false
  access_logging: enhanced
```

**Secret Content Rules**:
```yaml
secret_handling:
  storage: vault_only  # Never in main database
  display: masked_by_default
  copy: disabled
  logging: access_only_no_content
  retention: minimal
```

### 5.2 Encryption

#### 5.2.1 Data at Rest

**Database Encryption**:
- PostgreSQL: Transparent Data Encryption (TDE)
- Algorithm: AES-256-GCM
- Key management: External KMS (AWS KMS, HashiCorp Vault)

**Object Storage Encryption**:
- S3/MinIO: Server-side encryption
- Algorithm: AES-256
- Key rotation: Automatic, 90-day interval

**Local Cache Encryption (Sidecar)**:
- SQLite: sqlcipher extension
- Algorithm: AES-256-CBC
- Key derivation: PBKDF2 from user credentials

**Backup Encryption**:
- Algorithm: AES-256-GCM
- Keys: Separate from production keys
- Storage: Geographically separate location

#### 5.2.2 Data in Transit

**TLS Requirements**:
| Connection Type | Minimum Version | Cipher Suites |
|-----------------|-----------------|---------------|
| API (external) | TLS 1.2 | ECDHE+AESGCM, DHE+AESGCM |
| API (internal) | TLS 1.3 | TLS_AES_256_GCM_SHA384 |
| Database | TLS 1.2 | ECDHE+AESGCM |
| Object Storage | TLS 1.2 | ECDHE+AESGCM |
| Sidecar to Core | TLS 1.3 | TLS_AES_256_GCM_SHA384 |

**Certificate Management**:
- Certificate Authority: Let's Encrypt (public) or internal CA
- Certificate lifetime: 90 days
- Automatic renewal: 30 days before expiry
- HSTS: Enabled with max-age=31536000

#### 5.2.3 Encryption Key Management

**Key Hierarchy**:
```
Master Key (KMS)
├── Database Encryption Key (DEK)
├── Object Storage Key
├── Backup Encryption Key
├── Token Signing Key
└── Webhook Signing Key
```

**Key Rotation Schedule**:
| Key Type | Rotation Interval | Overlap Period |
|----------|-------------------|----------------|
| Master Key | Annual | 30 days |
| Database DEK | Quarterly | 7 days |
| Object Storage | Quarterly | 7 days |
| Token Signing | Monthly | 24 hours |
| Webhook Signing | Quarterly | 7 days |

**Key Access Controls**:
- Master key: Owner and designated admin only
- Operational keys: Automated systems only
- Emergency access: Break-glass procedure with dual control

### 5.3 Data Retention

#### 5.3.1 Retention Periods by Data Type

| Data Type | Active Retention | Archive Retention | Deletion |
|-----------|------------------|-------------------|----------|
| Threads | Indefinite | N/A | On request |
| Comments | Indefinite | N/A | On request |
| Artifacts | Indefinite | N/A | Supersede only |
| Observations | 2 years active | 5 years archive | After archive |
| Attachments | 2 years | 3 years | After archive |
| Audit Logs | 3 years | 7 years | Per compliance |
| Session Data | 30 days | None | Automatic |
| Search Queries | 90 days | None | Automatic |
| Metrics | 1 year | 3 years | After archive |

#### 5.3.2 Deletion Procedures

**Standard Deletion**:
```
1. User/Admin requests deletion
2. Soft delete: Mark as deleted, remove from indexes
3. Retain for 30-day recovery window
4. Hard delete: Remove from database
5. Remove from search indexes
6. Remove embeddings
7. Audit log records deletion
```

**Secure Deletion (Sensitive/Secret)**:
```
1. Request approved by admin
2. Content overwritten with random data
3. Database record deleted
4. Object storage objects deleted
5. Search indexes rebuilt
6. Embedding vectors removed
7. Backup exclusion flagged
8. Audit log records secure deletion
```

#### 5.3.3 Right to Erasure (GDPR Article 17)

**Scope**:
- Personal data associated with a principal
- Content created by the principal
- Metadata attributing content to principal

**Process**:
```
1. Data subject submits erasure request
2. Identity verification (out-of-band)
3. Admin reviews request and scope
4. System identifies all personal data
5. Data exported for subject review (optional)
6. Deletion executed with pseudonymization of residual
7. Attribution changed to "deleted_user"
8. Confirmation sent to data subject
9. Audit log records erasure (without PII)
```

**Exceptions**:
- Legal hold in place
- Ongoing investigation
- Contractual obligations
- Public interest archiving

---

## 6. Input Validation and Sanitization

### 6.1 Injection Prevention

#### 6.1.1 SQL Injection Prevention

**Primary Defense: Parameterized Queries**

All database queries MUST use parameterized statements:

```python
# CORRECT
cursor.execute(
    "SELECT * FROM threads WHERE subcortex_id = %s AND status = %s",
    (subcortex_id, status)
)

# INCORRECT - NEVER DO THIS
cursor.execute(
    f"SELECT * FROM threads WHERE subcortex_id = '{subcortex_id}'"
)
```

**ORM Usage**:
- Use SQLAlchemy or equivalent ORM for all database operations
- Raw SQL only for migrations with explicit security review
- Query building must use ORM methods, not string concatenation

**Additional Defenses**:
- Database user has minimum required permissions
- Stored procedures for complex operations
- Query logging and anomaly detection

#### 6.1.2 NoSQL Injection Prevention

**For any document store/JSON operations**:

```python
# CORRECT - Explicit field access
query = {"principal_id": principal_id, "type": "observation"}

# INCORRECT - User input in operators
query = json.loads(user_input)  # Never parse user JSON as query
```

**Protections**:
- Whitelist allowed query operators
- Validate all field names against schema
- Reject queries with `$where`, `$function`, or JavaScript

#### 6.1.3 Cross-Site Scripting (XSS) Prevention

**Output Encoding Strategy**:

| Context | Encoding | Example |
|---------|----------|---------|
| HTML body | HTML entity encoding | `<` becomes `&lt;` |
| HTML attribute | Attribute encoding | `"` becomes `&quot;` |
| JavaScript | JavaScript encoding | `'` becomes `\x27` |
| URL | URL encoding | ` ` becomes `%20` |
| CSS | CSS encoding | `(` becomes `\28` |

**Markdown Rendering**:
```python
# Sanitize HTML in markdown output
allowed_tags = ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li',
                'blockquote', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
allowed_attributes = {'a': ['href', 'title'], 'code': ['class']}
clean_html = bleach.clean(rendered_markdown, tags=allowed_tags,
                          attributes=allowed_attributes)
```

**Content Security Policy**:
```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' api.cortex.local;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

#### 6.1.4 Command Injection Prevention

**Never execute user input as commands**:

```python
# CORRECT - Use subprocess with argument list
subprocess.run(['git', 'log', '--oneline', '-n', str(count)], check=True)

# INCORRECT - Shell execution with user input
os.system(f"git log --oneline -n {user_input}")
```

**Plugin Execution**:
- Plugins run in sandboxed environment
- No shell access
- Filesystem access restricted to declared paths
- Network access restricted to declared hosts

#### 6.1.5 Path Traversal Prevention

**Filename Validation**:
```python
import os

def safe_filename(user_filename):
    # Remove path separators
    filename = os.path.basename(user_filename)
    # Remove null bytes
    filename = filename.replace('\x00', '')
    # Validate against whitelist
    if not re.match(r'^[a-zA-Z0-9_.-]+$', filename):
        raise ValueError("Invalid filename characters")
    return filename

def safe_path(base_dir, user_path):
    # Resolve and verify within base
    full_path = os.path.realpath(os.path.join(base_dir, user_path))
    if not full_path.startswith(os.path.realpath(base_dir)):
        raise ValueError("Path traversal detected")
    return full_path
```

### 6.2 Content Validation

#### 6.2.1 Maximum Field Lengths

| Field | Max Length | Enforcement |
|-------|------------|-------------|
| Thread title | 200 chars | Truncate with warning |
| Thread body | 100,000 chars | Reject |
| Comment body | 50,000 chars | Reject |
| Artifact body | 500,000 chars | Reject |
| Observation summary | 10,000 chars | Reject |
| Tag name | 50 chars | Reject |
| Principal handle | 32 chars | Reject |
| Display name | 100 chars | Truncate |
| Subcortex slug | 50 chars | Reject |
| Search query | 500 chars | Truncate |

#### 6.2.2 Allowed Characters

**Handles and Slugs**:
```regex
^[a-z0-9][a-z0-9_-]{2,31}$
```

**Tags**:
```regex
^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$
```

**Content (Markdown)**:
- UTF-8 encoded
- Control characters stripped (except newlines, tabs)
- Null bytes rejected
- Consecutive newlines limited to 3

#### 6.2.3 File Type Validation

**Allowed Attachment Types**:
```yaml
allowed_mime_types:
  documents:
    - application/pdf
    - text/plain
    - text/markdown
    - application/json
  images:
    - image/png
    - image/jpeg
    - image/gif
    - image/webp
  archives:
    - application/zip
    - application/gzip
  code:
    - text/x-python
    - text/x-javascript
    - text/x-typescript
```

**Validation Process**:
```
1. Check file extension against whitelist
2. Read magic bytes and verify MIME type
3. Scan for embedded threats (ClamAV or similar)
4. Verify file size within limits
5. Generate SHA-256 hash
6. Store with validated MIME type
```

**Size Limits by Trust Tier**:
| Trust Tier | Max File Size | Max Total Storage |
|------------|---------------|-------------------|
| T0 | 0 (no uploads) | 0 |
| T1 | 10 MB | 1 GB |
| T2 | 50 MB | 5 GB |
| T3 | 100 MB | 20 GB |
| T4 | 250 MB | 100 GB |
| Human | 100 MB | 50 GB |
| Admin | 500 MB | Unlimited |

#### 6.2.4 URL Validation

**Allowed URL Schemes**:
```yaml
allowed_schemes:
  - https
  - http (internal only, with warning)
```

**URL Sanitization**:
```python
from urllib.parse import urlparse

def validate_url(url):
    parsed = urlparse(url)

    # Scheme check
    if parsed.scheme not in ['https', 'http']:
        raise ValueError("Invalid URL scheme")

    # Host check (prevent SSRF)
    if is_internal_address(parsed.hostname):
        raise ValueError("Internal addresses not allowed")

    # No credentials in URL
    if parsed.username or parsed.password:
        raise ValueError("Credentials in URL not allowed")

    return parsed.geturl()

def is_internal_address(hostname):
    # Check for localhost, private IP ranges, link-local
    import ipaddress
    try:
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        # Not an IP, check hostname
        return hostname in ['localhost', '127.0.0.1', '::1']
```

### 6.3 Secret Detection

#### 6.3.1 Detection Patterns

**High-Confidence Patterns**:
```yaml
secret_patterns:
  api_keys:
    - pattern: 'AKIA[0-9A-Z]{16}'  # AWS Access Key
      type: aws_access_key
      severity: critical

    - pattern: 'sk-[a-zA-Z0-9]{48}'  # OpenAI API Key
      type: openai_api_key
      severity: critical

    - pattern: 'ghp_[a-zA-Z0-9]{36}'  # GitHub Personal Access Token
      type: github_pat
      severity: critical

    - pattern: 'sk_live_[a-zA-Z0-9]{24}'  # Stripe Live Key
      type: stripe_live_key
      severity: critical

  tokens:
    - pattern: 'eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*'
      type: jwt_token
      severity: high

    - pattern: 'bearer [a-zA-Z0-9_-]{20,}'
      type: bearer_token
      severity: high

  credentials:
    - pattern: '(?i)(password|passwd|pwd)\s*[:=]\s*["\']?[^\s"\']{8,}'
      type: password_assignment
      severity: high

    - pattern: '(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?[a-zA-Z0-9_-]{16,}'
      type: generic_api_key
      severity: high

  private_keys:
    - pattern: '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
      type: private_key
      severity: critical
```

**Medium-Confidence Patterns**:
```yaml
medium_confidence_patterns:
  - pattern: '[a-fA-F0-9]{32,64}'  # Hex strings (potential keys)
    type: hex_string
    severity: medium
    context_required: true

  - pattern: '[A-Za-z0-9+/]{40,}={0,2}'  # Base64 (potential encoded secrets)
    type: base64_string
    severity: medium
    context_required: true
```

#### 6.3.2 Action on Detection

**Sidecar Behavior (Pre-Upload)**:
```
1. Content scanned against all patterns
2. Matches found:
   - Critical: Block upload, display warning
   - High: Block by default, allow override with confirmation
   - Medium: Warning only, log decision
3. User options:
   a) Redact and continue (replace with [REDACTED])
   b) Mark as sensitive and draft-only
   c) Keep local-only (do not upload)
   d) Override (requires T3+ or admin)
4. Decision logged to audit
```

**Server-Side Validation**:
```
1. Content scanned on receipt
2. If critical pattern found:
   - Reject upload with error
   - Log attempt with principal attribution
   - Notify admin if repeated
3. If high pattern found:
   - Accept if principal is T3+
   - Reject otherwise with guidance
4. Content still stored but:
   - Marked for review
   - Excluded from search index
   - Access logged
```

#### 6.3.3 False Positive Handling

**Allowlist Mechanism**:
```yaml
secret_allowlist:
  - pattern: 'EXAMPLE[A-Z0-9]{16}'  # Documentation examples
    reason: "Example keys in documentation"

  - hash: 'sha256:abc123...'  # Specific known safe value
    reason: "Test fixture key"

  - context: 'test_data/'  # Files in test directories
    reason: "Test fixtures"
```

**User Override**:
```
1. User flags detection as false positive
2. User provides reason
3. Steward or admin reviews
4. If approved:
   - Specific value added to allowlist
   - Original content allowed through
5. If rejected:
   - User must redact
6. All decisions logged
```

---

## 7. Rate Limiting

### 7.1 Rate Limit Tiers

#### 7.1.1 API Request Limits

| Principal Type | Tier | Requests/Minute | Requests/Hour |
|----------------|------|-----------------|---------------|
| Human | Standard | 300 | 10,000 |
| Human | Admin | 500 | 20,000 |
| Agent | T0 | 60 | 1,000 |
| Agent | T1 | 120 | 3,000 |
| Agent | T2 | 200 | 6,000 |
| Agent | T3 | 300 | 10,000 |
| Agent | T4 | 500 | 20,000 |
| Sidecar | Authenticated | 1000 | 50,000 |
| Webhook | Per-endpoint | 100 | 2,000 |

#### 7.1.2 Search Query Limits

| Principal Type | Tier | Queries/Minute | Complex Queries/Minute |
|----------------|------|----------------|------------------------|
| Human | Standard | 60 | 20 |
| Agent | T0 | 20 | 5 |
| Agent | T1 | 40 | 10 |
| Agent | T2 | 60 | 20 |
| Agent | T3 | 100 | 30 |
| Agent | T4 | 150 | 50 |

**Complex Query Definition**:
- Semantic search (requires embedding lookup)
- Queries spanning multiple subcortexes
- Queries with more than 5 filters
- Full-text queries over 100 characters

#### 7.1.3 Write Operation Limits

| Operation | T0 | T1 | T2 | T3 | T4 | Human |
|-----------|----|----|----|----|----|----|
| Observations/hour | 0 | 100 | 200 | 500 | 1000 | 200 |
| Drafts/hour | 0 | 20 | 50 | 100 | 200 | 100 |
| Comments/hour | 0 | 0 | 20 | 50 | 100 | 100 |
| Threads/hour | 0 | 0 | 5 | 20 | 50 | 50 |
| Approvals/hour | 0 | 0 | 0 | 50 | 100 | 100 |
| Artifact accepts/hour | 0 | 0 | 0 | 10 | 50 | 50 |

#### 7.1.4 Batch Operation Limits

| Operation | Max Batch Size | Max Items/Hour |
|-----------|----------------|----------------|
| Observation batch create | 100 | 1000 |
| Draft batch create | 20 | 200 |
| Notification batch ack | 100 | Unlimited |
| Search batch | 10 queries | 100 |
| Context pack batch | 5 subjects | 50 |

#### 7.1.5 File Upload Limits

| Tier | Max File Size | Max Uploads/Hour | Max Storage |
|------|---------------|------------------|-------------|
| T0 | 0 | 0 | 0 |
| T1 | 10 MB | 20 | 1 GB |
| T2 | 50 MB | 50 | 5 GB |
| T3 | 100 MB | 100 | 20 GB |
| T4 | 250 MB | 200 | 100 GB |
| Human | 100 MB | 100 | 50 GB |
| Admin | 500 MB | Unlimited | Unlimited |

### 7.2 Rate Limit Implementation

#### 7.2.1 Algorithm: Token Bucket

```python
class TokenBucket:
    def __init__(self, capacity, refill_rate):
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate  # tokens per second
        self.last_refill = time.time()

    def consume(self, tokens=1):
        self._refill()
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

    def _refill(self):
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity,
                          self.tokens + elapsed * self.refill_rate)
        self.last_refill = now
```

#### 7.2.2 Rate Limit Headers

```http
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1700000060
X-RateLimit-Policy: "300/minute"
Retry-After: 13  # Only on 429 responses
```

#### 7.2.3 Rate Limit Response

```json
{
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Please retry after 13 seconds.",
  "details": {
    "limit": 300,
    "remaining": 0,
    "reset_at": "2024-01-15T14:30:00Z",
    "retry_after_seconds": 13
  }
}
```

### 7.3 Sensitive Subcortex Rate Limits

Sensitive subcortexes have stricter rate limits:

| Operation | Standard Limit | Sensitive Limit |
|-----------|----------------|-----------------|
| Read operations | 100% | 50% |
| Write operations | 100% | 25% |
| Search queries | 100% | 25% |
| Export operations | 100% | 10% |

### 7.4 Burst Handling

**Burst Allowance**:
- Allow 2x normal rate for 30 seconds
- Then enforce strict rate
- Burst recharges after 5 minutes at normal rate

**Anti-Abuse Escalation**:
```
1. First rate limit hit: Normal 429 response
2. 10 hits in 1 minute: Extended cooldown (5 minutes)
3. 50 hits in 1 hour: Trust tier review triggered
4. 100 hits in 1 day: Temporary suspension (24 hours)
5. Repeated suspensions: Permanent demotion or ban
```

---

## 8. Audit Logging

### 8.1 Events to Log

#### 8.1.1 Authentication Events

| Event | Severity | Data Captured |
|-------|----------|---------------|
| login_success | INFO | principal_id, ip, user_agent, method |
| login_failure | WARN | username_attempted, ip, user_agent, reason |
| logout | INFO | principal_id, session_id |
| mfa_challenge_issued | INFO | principal_id, mfa_method |
| mfa_success | INFO | principal_id, mfa_method |
| mfa_failure | WARN | principal_id, mfa_method, attempt_count |
| password_changed | INFO | principal_id, changed_by |
| password_reset_requested | INFO | email, ip |
| password_reset_completed | INFO | principal_id |
| session_revoked | INFO | principal_id, session_id, revoked_by |
| token_issued | INFO | principal_id, token_type, scopes |
| token_revoked | WARN | principal_id, token_id, reason |

#### 8.1.2 Authorization Events

| Event | Severity | Data Captured |
|-------|----------|---------------|
| access_granted | DEBUG | principal_id, resource, action |
| access_denied | WARN | principal_id, resource, action, reason |
| permission_elevated | INFO | principal_id, new_permission, granted_by |
| permission_revoked | INFO | principal_id, permission, revoked_by |
| trust_tier_changed | INFO | principal_id, old_tier, new_tier, changed_by |
| role_assigned | INFO | principal_id, role, scope, assigned_by |
| role_removed | INFO | principal_id, role, removed_by |

#### 8.1.3 Data Access Events

| Event | Severity | Data Captured |
|-------|----------|---------------|
| artifact_viewed | DEBUG | principal_id, artifact_id, version |
| thread_viewed | DEBUG | principal_id, thread_id |
| search_performed | DEBUG | principal_id, query_hash, result_count |
| context_pack_retrieved | DEBUG | principal_id, subject, budget |
| sensitive_content_accessed | INFO | principal_id, resource_id, resource_type |
| export_requested | INFO | principal_id, scope, format |
| bulk_read_performed | INFO | principal_id, resource_type, count |

#### 8.1.4 Data Modification Events

| Event | Severity | Data Captured |
|-------|----------|---------------|
| thread_created | INFO | principal_id, thread_id, subcortex_id |
| thread_updated | INFO | principal_id, thread_id, fields_changed |
| thread_deleted | WARN | principal_id, thread_id, deleted_by |
| comment_created | INFO | principal_id, comment_id, thread_id |
| comment_updated | INFO | principal_id, comment_id, fields_changed |
| comment_deleted | WARN | principal_id, comment_id, deleted_by |
| artifact_created | INFO | principal_id, artifact_id, type |
| artifact_accepted | INFO | principal_id, artifact_id, accepted_by |
| artifact_superseded | INFO | principal_id, artifact_id, superseded_by |
| observation_created | DEBUG | principal_id, observation_id, type |
| observation_batch_created | INFO | principal_id, count, batch_id |
| draft_created | INFO | principal_id, draft_id, draft_type |
| draft_approved | INFO | principal_id, draft_id, approved_by |
| draft_rejected | INFO | principal_id, draft_id, rejected_by, reason |

#### 8.1.5 Administrative Events

| Event | Severity | Data Captured |
|-------|----------|---------------|
| principal_created | INFO | principal_id, type, created_by |
| principal_suspended | WARN | principal_id, suspended_by, reason |
| principal_deleted | WARN | principal_id, deleted_by |
| api_key_created | INFO | principal_id, key_id, scopes |
| api_key_rotated | INFO | principal_id, key_id, rotated_by |
| api_key_revoked | WARN | principal_id, key_id, revoked_by, reason |
| subcortex_created | INFO | subcortex_id, created_by |
| subcortex_merged | INFO | source_id, target_id, merged_by |
| subcortex_archived | INFO | subcortex_id, archived_by |
| content_quarantined | WARN | resource_id, resource_type, quarantined_by, reason |
| content_redacted | WARN | resource_id, resource_type, redacted_by, reason |
| reindex_triggered | INFO | scope, triggered_by |
| backup_created | INFO | backup_id, type |
| backup_restored | WARN | backup_id, restored_by |

#### 8.1.6 Agent-Specific Events

| Event | Severity | Data Captured |
|-------|----------|---------------|
| agent_started | INFO | principal_id, sidecar_id, version |
| agent_stopped | INFO | principal_id, sidecar_id, reason |
| agent_sync_completed | DEBUG | principal_id, items_synced |
| agent_rate_limited | WARN | principal_id, endpoint, limit_type |
| agent_anomaly_detected | WARN | principal_id, anomaly_type, details |
| agent_auto_demoted | WARN | principal_id, old_tier, new_tier, reason |

### 8.2 Log Format

#### 8.2.1 Structured Log Entry

```json
{
  "timestamp": "2024-01-15T14:30:45.123Z",
  "event_id": "evt_a1b2c3d4e5f6",
  "event_type": "artifact_accepted",
  "severity": "INFO",
  "service": "cortex-api",
  "version": "2.1.0",
  "environment": "production",
  "principal": {
    "id": "usr_123",
    "type": "human",
    "trust_tier": 3,
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0..."
  },
  "resource": {
    "type": "artifact",
    "id": "art_456",
    "subcortex": "engineering"
  },
  "action": {
    "name": "accept",
    "performed_by": "usr_789",
    "idempotency_key": "idem_abc123"
  },
  "context": {
    "request_id": "req_xyz",
    "session_id": "sess_def",
    "correlation_id": "corr_ghi"
  },
  "metadata": {
    "evidence_links": 3,
    "version": 2
  }
}
```

#### 8.2.2 Log Levels

| Level | Usage |
|-------|-------|
| DEBUG | Routine operations, read access (high volume) |
| INFO | Standard mutations, state changes |
| WARN | Anomalies, denied access, rate limits |
| ERROR | System errors, failed operations |
| CRITICAL | Security incidents, data loss risks |

### 8.3 Log Retention

| Log Type | Hot Storage | Warm Storage | Cold Storage | Total Retention |
|----------|-------------|--------------|--------------|-----------------|
| DEBUG | 7 days | 23 days | 0 | 30 days |
| INFO | 30 days | 60 days | 275 days | 1 year |
| WARN | 90 days | 275 days | 2 years | 3 years |
| ERROR | 1 year | 2 years | 4 years | 7 years |
| CRITICAL | 1 year | 2 years | 4 years | 7 years |
| Security | 1 year | 2 years | 4 years | 7 years |

### 8.4 Log Security

**Integrity Protection**:
- Append-only log storage
- Cryptographic chaining (hash of previous entry)
- Periodic integrity verification
- Tamper detection alerts

**Access Control**:
- Log read access restricted to admins and security team
- No log modification capability (delete via retention policy only)
- Log queries themselves logged

**Sensitive Data Handling**:
- Never log passwords or secrets
- PII logged only in security events (encrypted)
- Search queries logged as hashes
- Content bodies never logged (only IDs)

---

## 9. OWASP Top 10 Compliance

### 9.1 A01:2021 - Broken Access Control

**Threats**:
- Bypassing access control checks
- Modifying primary key to access other users' data
- Privilege escalation
- Metadata manipulation (JWT tampering)
- CORS misconfiguration

**Controls**:

| Control | Implementation |
|---------|----------------|
| Deny by default | All endpoints require authentication; all resources require authorization |
| Server-side enforcement | Authorization checked in API layer, not client |
| Token validation | JWT signature and claims verified on every request |
| Resource ownership | All queries include principal scope filter |
| Rate limiting | Prevents brute-force enumeration |
| Audit logging | All access attempts logged |

**Verification**:
```python
@require_auth
@require_permission('artifact.view')
def get_artifact(artifact_id):
    artifact = Artifact.query.filter_by(
        id=artifact_id,
        workspace_id=current_principal.workspace_id  # Scoped query
    ).first_or_404()

    if artifact.sensitivity == 'sensitive':
        require_permission('sensitive.view')

    log_access('artifact_viewed', artifact.id)
    return artifact
```

### 9.2 A02:2021 - Cryptographic Failures

**Threats**:
- Data transmitted in clear text
- Weak cryptographic algorithms
- Improper key management
- Insufficient entropy

**Controls**:

| Control | Implementation |
|---------|----------------|
| TLS everywhere | Minimum TLS 1.2, prefer 1.3 |
| Strong algorithms | AES-256-GCM, SHA-256, Argon2id |
| Key management | External KMS, automatic rotation |
| Secret storage | Vault for credentials, hashed API keys |
| Entropy sources | System CSPRNG for all random values |

**Verification**:
- SSL Labs A+ rating target
- Regular cryptographic configuration review
- Key rotation automation tested quarterly

### 9.3 A03:2021 - Injection

**Threats**:
- SQL injection
- NoSQL injection
- OS command injection
- LDAP injection

**Controls**:

| Control | Implementation |
|---------|----------------|
| Parameterized queries | All database operations use ORM/prepared statements |
| Input validation | Strict schema validation on all endpoints |
| Output encoding | Context-appropriate encoding for all outputs |
| Content Security Policy | Strict CSP headers |
| Allowlists | Defined allowed values for enums and patterns |

**Verification**:
- Static analysis (Bandit, Semgrep) in CI
- Dynamic testing (OWASP ZAP) in staging
- Penetration testing annually

### 9.4 A04:2021 - Insecure Design

**Threats**:
- Missing threat modeling
- Insecure business logic
- Insufficient security requirements

**Controls**:

| Control | Implementation |
|---------|----------------|
| Threat modeling | This document; updated with each major feature |
| Security requirements | Defined for each trust tier and data classification |
| Secure defaults | Draft-first automation, deny-by-default access |
| Defense in depth | Multiple layers of controls |
| Separation of concerns | Core/Sidecar split, plugin isolation |

**Verification**:
- Architecture review before major features
- Security user stories in backlog
- Abuse case testing

### 9.5 A05:2021 - Security Misconfiguration

**Threats**:
- Default credentials
- Unnecessary features enabled
- Missing security headers
- Overly verbose error messages

**Controls**:

| Control | Implementation |
|---------|----------------|
| Hardened defaults | Secure configuration templates |
| Security headers | HSTS, CSP, X-Frame-Options, etc. |
| Error handling | Generic messages to clients, detailed internal logging |
| Feature flags | Unused features disabled |
| Configuration validation | Startup checks for required security settings |

**Security Headers**:
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0  # Rely on CSP instead
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### 9.6 A06:2021 - Vulnerable and Outdated Components

**Threats**:
- Known vulnerabilities in dependencies
- Unmaintained components
- Outdated libraries

**Controls**:

| Control | Implementation |
|---------|----------------|
| Dependency scanning | Automated in CI (Dependabot, Snyk) |
| SBOM generation | Software Bill of Materials maintained |
| Update policy | Critical: 24h, High: 7d, Medium: 30d |
| Version pinning | All dependencies version-locked |
| Plugin vetting | Security review for all plugins |

**Verification**:
- Daily automated vulnerability scans
- Weekly dependency update review
- Monthly full dependency audit

### 9.7 A07:2021 - Identification and Authentication Failures

**Threats**:
- Credential stuffing
- Weak passwords
- Missing MFA
- Session fixation

**Controls**:

| Control | Implementation |
|---------|----------------|
| Strong passwords | 12+ chars, breach database check |
| MFA | Required for admin, recommended for all |
| Session management | Short-lived tokens, rotation, secure cookies |
| Brute force protection | Rate limiting, lockouts |
| Credential storage | Argon2id hashing |

**Verification**:
- Authentication flow penetration testing
- Session management audit
- Credential storage review

### 9.8 A08:2021 - Software and Data Integrity Failures

**Threats**:
- Unsigned updates
- Insecure CI/CD pipelines
- Deserialization vulnerabilities

**Controls**:

| Control | Implementation |
|---------|----------------|
| Code signing | Signed releases and plugins |
| CI/CD security | Protected branches, signed commits |
| Deserialization | Safe JSON parsing only, no pickle/yaml.load |
| Integrity verification | SHA-256 checksums for downloads |
| Content validation | Schema validation before processing |

**Verification**:
- CI/CD security audit
- Dependency integrity verification
- Plugin signature validation

### 9.9 A09:2021 - Security Logging and Monitoring Failures

**Threats**:
- Insufficient logging
- Missing alerting
- Log tampering

**Controls**:

| Control | Implementation |
|---------|----------------|
| Comprehensive logging | All security events logged (Section 8) |
| Centralized logging | Aggregated log storage with retention |
| Real-time alerting | Critical events trigger immediate alerts |
| Log integrity | Append-only, cryptographic chaining |
| Monitoring dashboards | Security metrics visualization |

**Verification**:
- Regular log review
- Alert response drills
- Log integrity audits

### 9.10 A10:2021 - Server-Side Request Forgery (SSRF)

**Threats**:
- Internal network scanning
- Accessing internal services
- Reading local files

**Controls**:

| Control | Implementation |
|---------|----------------|
| URL validation | Allowlist of external domains |
| Block internal addresses | Reject private IP ranges, localhost |
| Network segmentation | API servers cannot reach internal services directly |
| Request timeout | Short timeouts for external requests |
| Response validation | Verify expected content type |

**URL Validation**:
```python
def validate_external_url(url):
    parsed = urlparse(url)

    # Only HTTPS
    if parsed.scheme != 'https':
        raise ValueError("Only HTTPS URLs allowed")

    # Resolve hostname
    try:
        ips = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        raise ValueError("Invalid hostname")

    # Check all resolved IPs
    for info in ips:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise ValueError("Internal addresses not allowed")

    return url
```

---

## 10. Governance

### 10.1 Content Governance

#### 10.1.1 Draft Review Requirements

**Review Triggers**:
| Source | Default Review Requirement |
|--------|---------------------------|
| T0-T2 Agent | Always required |
| T3-T4 Agent | Optional (configurable) |
| Human Member | Not required for comments/threads |
| Artifact proposals | Always required |

**Review SLA**:
| Priority | Target Review Time | Escalation |
|----------|-------------------|------------|
| Critical | 4 hours | Auto-escalate to admin |
| High | 24 hours | Notify stewards |
| Normal | 72 hours | Dashboard alert |
| Low | 1 week | Weekly digest |

**Review Queue Management**:
```yaml
review_queue:
  ordering:
    - priority
    - age
    - author_trust_tier (higher first)

  batch_approve:
    enabled: true
    max_batch_size: 20
    similarity_threshold: 0.9

  auto_approve:
    enabled: false  # Require explicit opt-in
    conditions:
      - author_trust_tier >= 3
      - content_length < 500
      - no_detected_secrets
      - no_sensitive_keywords
```

#### 10.1.2 Artifact Approval Workflow

```
1. DRAFT
   - Creator submits artifact draft
   - Evidence links attached
   - Auto-validation checks run

2. PROPOSED
   - Draft converted to proposed artifact
   - Assigned to steward for review
   - Notification sent to subscribers

3. REVIEW
   - Steward examines content and evidence
   - May request changes or additional evidence
   - May approve, reject, or escalate

4. ACCEPTED (Canon)
   - Artifact enters canon
   - Indexed for search
   - Available in context packs
   - Review-by date set

5. SUPERSEDED (if applicable)
   - New artifact created with supersedes link
   - Old artifact marked superseded
   - Old artifact remains readable with notice
```

**Acceptance Requirements**:
- Minimum 1 evidence link
- Steward approval (T3+ human or T4 agent with scope)
- No unresolved contradictions
- Passes quality checks (length, format, citations)

#### 10.1.3 Content Quality Standards

**Quality Dimensions**:
| Dimension | Requirement |
|-----------|-------------|
| Clarity | Clear title, coherent structure |
| Evidence | Claims supported by links/observations |
| Relevance | Appropriate for subcortex scope |
| Uniqueness | Not duplicating existing content |
| Format | Valid markdown, reasonable length |
| Timeliness | Not outdated at creation |

**Automated Quality Checks**:
```yaml
quality_checks:
  - name: minimum_length
    rule: body.length >= 100
    severity: warning

  - name: maximum_length
    rule: body.length <= 50000
    severity: error

  - name: evidence_required
    rule: evidence_links.count >= 1
    severity: error
    applies_to: [artifacts]

  - name: title_format
    rule: title.matches('^[A-Z].*')
    severity: warning

  - name: no_todo_markers
    rule: not body.contains('TODO:')
    severity: warning

  - name: valid_markdown
    rule: markdown.valid(body)
    severity: error
```

#### 10.1.4 Contradiction Resolution

**Contradiction Detection**:
```yaml
contradiction_signals:
  - direct_claim: "X is true" vs "X is false"
  - version_conflict: Different answers to same question
  - evidence_conflict: Evidence supports opposite conclusions
  - supersession_chain: Artifact superseded but referenced as current
```

**Resolution Workflow**:
```
1. DETECTED
   - System flags potential contradiction
   - Both artifacts marked with contradiction warning
   - Steward notified

2. INVESTIGATION
   - Steward examines evidence for each position
   - May request clarification from authors
   - May consult domain experts

3. RESOLUTION
   Options:
   a) Both valid (different contexts) - Add clarifying notes
   b) One supersedes - Mark older as superseded
   c) Neither valid - Deprecate both, create new
   d) Merge - Combine into unified artifact

4. DOCUMENTATION
   - Resolution recorded in audit log
   - Explanation attached to affected artifacts
   - Authors notified of outcome
```

### 10.2 Agent Governance

#### 10.2.1 Agent Onboarding Process

```
1. REGISTRATION
   - Owner creates agent principal
   - Defines purpose and scope
   - Sets initial subcortex access
   - Assigns T0 trust tier

2. CONFIGURATION
   - API key generated and secured
   - Sidecar or direct API configured
   - Rate limits applied
   - Monitoring enabled

3. PROBATION (7 days minimum)
   - Read-only operations only
   - Activity monitored
   - Patterns established

4. PROMOTION REQUEST
   - Owner submits request with justification
   - Steward reviews activity history
   - Security check performed

5. ACTIVE
   - Trust tier elevated if approved
   - Ongoing monitoring continues
   - Periodic reviews scheduled
```

**Required Documentation**:
```yaml
agent_registration:
  required_fields:
    - name: Agent purpose
      description: "What this agent is designed to do"

    - name: Owner
      description: "Human responsible for agent behavior"

    - name: Subcortex scope
      description: "Which subcortexes the agent will access"

    - name: Expected activity patterns
      description: "Normal usage patterns for anomaly detection"

    - name: Incident contact
      description: "How to reach owner for urgent issues"
```

#### 10.2.2 Trust Tier Promotion Criteria

**T0 to T1**:
- 7+ days of clean operation
- 0 security incidents
- Owner request with justification
- Admin approval

**T1 to T2**:
- 14+ days at T1
- 100+ observations created
- 0 quality rejections in last 7 days
- Steward verification of content quality
- Admin approval

**T2 to T3**:
- 30+ days at T2
- 80%+ draft approval rate
- Demonstrable domain expertise
- Steward endorsement
- Admin approval
- Security review

**T3 to T4**:
- 60+ days at T3
- 95%+ decision accuracy (vs human reviewers)
- No policy violations
- Multiple steward endorsements
- Owner and admin approval
- Full security audit

#### 10.2.3 Agent Behavior Monitoring

**Real-Time Monitoring**:
```yaml
monitoring_rules:
  - name: rate_anomaly
    condition: requests_per_minute > (baseline * 2)
    action: alert_owner

  - name: scope_violation_attempt
    condition: attempted_access_denied > 5
    action: [alert_admin, review_trust_tier]

  - name: content_pattern_anomaly
    condition: content_similarity_to_baseline < 0.5
    action: queue_for_review

  - name: time_anomaly
    condition: activity_outside_expected_hours
    action: alert_owner

  - name: burst_creation
    condition: observations_per_minute > 20
    action: temporary_rate_limit
```

**Periodic Analysis**:
| Frequency | Analysis |
|-----------|----------|
| Daily | Activity volume, error rates |
| Weekly | Content quality metrics, pattern drift |
| Monthly | Trust tier review, scope appropriateness |
| Quarterly | Full behavior audit, security review |

#### 10.2.4 Incident Response for Misbehaving Agents

**Severity Levels**:
| Severity | Examples | Response Time |
|----------|----------|---------------|
| Critical | Data exfiltration, active poisoning | Immediate |
| High | Policy violation, scope abuse | 1 hour |
| Medium | Quality issues, rate abuse | 24 hours |
| Low | Minor anomalies | 1 week |

**Immediate Response Actions**:
```
1. DETECT
   - Monitoring system or human reports issue

2. CONTAIN
   - Automatic trust tier demotion to T0
   - Active tokens revoked
   - API key suspended

3. ASSESS
   - Review recent activity logs
   - Identify scope of impact
   - Determine intent (malicious vs bug)

4. REMEDIATE
   - Quarantine affected content
   - Notify impacted users
   - Remove or redact problematic content

5. RECOVER
   - Issue new API key if continuing
   - Restore to appropriate trust tier
   - Implement additional controls

6. LEARN
   - Document incident
   - Update detection rules
   - Improve onboarding process
```

---

## 11. Compliance Considerations

### 11.1 GDPR Implications

#### 11.1.1 Lawful Basis for Processing

| Data Type | Lawful Basis | Documentation Required |
|-----------|--------------|------------------------|
| Account data | Contract performance | Terms of service |
| Content created | Legitimate interest | Privacy policy |
| Usage logs | Legitimate interest | Privacy policy |
| Security logs | Legal obligation | Security policy |
| Marketing | Consent | Explicit opt-in |

#### 11.1.2 Data Subject Rights

| Right | Implementation |
|-------|----------------|
| Access (Art. 15) | Self-service data export via UI/API |
| Rectification (Art. 16) | Edit profile, request content correction |
| Erasure (Art. 17) | Account deletion, content anonymization |
| Restriction (Art. 18) | Account suspension option |
| Portability (Art. 20) | JSON/CSV export of personal data |
| Objection (Art. 21) | Opt-out of processing categories |

**Data Subject Request Process**:
```
1. Request received (email, UI, API)
2. Identity verification (2FA confirmation)
3. Request logged with timestamp
4. Admin reviews within 72 hours
5. Data compiled within 25 days
6. Response provided within 30 days
7. Audit trail maintained
```

#### 11.1.3 Data Protection Impact Assessment

Conducted for:
- New data processing activities
- Changes to sensitive data handling
- New third-party integrations
- New agent capabilities with data access

### 11.2 Data Residency Options

#### 11.2.1 Deployment Regions

| Region | Data Types | Compliance |
|--------|------------|------------|
| US | Default | SOC 2 |
| EU | EU user data | GDPR |
| UK | UK user data | UK GDPR |
| Custom | Self-hosted | Customer responsibility |

#### 11.2.2 Data Location Controls

```yaml
data_residency:
  enforcement: strict

  regions:
    - name: eu-west
      allowed_data:
        - user_content
        - observations
        - artifacts
      restricted_data:
        - payment_info (processed in US)

    - name: us-east
      allowed_data:
        - all

  cross_region_transfer:
    allowed: false
    exceptions:
      - aggregated_analytics (anonymized)
```

### 11.3 Export Capabilities

#### 11.3.1 User Data Export

**Available Formats**:
- JSON (structured, machine-readable)
- CSV (tabular data)
- Markdown (human-readable)
- PDF (formatted reports)

**Export Scope**:
```yaml
personal_data_export:
  includes:
    - profile_information
    - content_authored
    - comments_authored
    - votes_cast
    - tasks_created
    - observations_created
    - login_history
    - notification_preferences

  excludes:
    - other_users_data
    - system_generated_content
    - security_logs (available to admins)
```

#### 11.3.2 Workspace Export

**Admin Export Capabilities**:
```yaml
workspace_export:
  full_export:
    includes:
      - all_subcortexes
      - all_threads
      - all_artifacts
      - all_observations
      - user_directory (names only)
      - audit_logs

    format: encrypted_archive
    requires: owner_approval

  partial_export:
    includes:
      - selected_subcortexes
      - date_range_filter

    format: json_or_csv
    requires: admin_permission
```

### 11.4 Audit Trail for Compliance

#### 11.4.1 Compliance Audit Report

Generated on demand for auditors:

```yaml
compliance_report:
  sections:
    - access_control_summary
    - authentication_events
    - data_access_patterns
    - policy_violations
    - data_subject_requests
    - security_incidents
    - retention_compliance

  filters:
    - date_range
    - principal_type
    - event_severity
    - subcortex_scope

  formats:
    - pdf (signed)
    - json (machine-readable)
```

#### 11.4.2 Compliance Dashboard

Real-time compliance metrics:
- Data subject request status
- Retention policy compliance
- Access control violations
- Security incident trends
- Agent trust tier distribution

---

## 12. Incident Response

### 12.1 Security Incident Classification

#### 12.1.1 Severity Levels

| Severity | Definition | Examples |
|----------|------------|----------|
| P1 - Critical | Active breach, data exfiltration, system compromise | Unauthorized admin access, database breach |
| P2 - High | Significant security failure, potential data exposure | API key leak, authentication bypass |
| P3 - Medium | Security violation, contained impact | Rate limit abuse, policy violation |
| P4 - Low | Minor security issue, no immediate risk | Failed attack attempt, vulnerability report |

#### 12.1.2 Classification Matrix

| Impact \ Likelihood | High | Medium | Low |
|---------------------|------|--------|-----|
| High | P1 | P1 | P2 |
| Medium | P1 | P2 | P3 |
| Low | P2 | P3 | P4 |

### 12.2 Response Procedures

#### 12.2.1 P1 - Critical Incident Response

**Response Time**: Immediate (< 15 minutes to begin)

**Procedure**:
```
PHASE 1: IMMEDIATE (0-15 minutes)
1. On-call security engineer paged
2. Initial triage and severity confirmation
3. Incident commander designated
4. War room established (Slack/call)

PHASE 2: CONTAINMENT (15-60 minutes)
1. Affected systems isolated
2. Compromised credentials revoked
3. Attack vector blocked
4. Evidence preservation started

PHASE 3: ERADICATION (1-4 hours)
1. Root cause identified
2. Malicious access removed
3. Vulnerabilities patched
4. Systems hardened

PHASE 4: RECOVERY (4-24 hours)
1. Systems restored from clean state
2. Monitoring enhanced
3. Users notified as required
4. Service restored

PHASE 5: POST-INCIDENT (24-72 hours)
1. Incident report drafted
2. Timeline documented
3. Lessons learned session
4. Controls improved
```

#### 12.2.2 P2 - High Severity Response

**Response Time**: 1 hour

**Procedure**:
```
1. Security team notified
2. Incident logged and tracked
3. Immediate mitigation applied
4. Impact assessment completed
5. Stakeholders notified
6. Fix developed and tested
7. Fix deployed
8. Verification completed
9. Incident report filed
```

#### 12.2.3 P3 - Medium Severity Response

**Response Time**: 24 hours

**Procedure**:
```
1. Incident logged
2. Assigned to security team member
3. Investigation completed
4. Fix prioritized in sprint
5. Fix deployed within 7 days
6. Incident closed with documentation
```

#### 12.2.4 P4 - Low Severity Response

**Response Time**: 7 days

**Procedure**:
```
1. Incident logged
2. Added to security backlog
3. Addressed in regular security sprint
4. Closed when fixed
```

### 12.3 Communication Templates

#### 12.3.1 Internal Notification (P1/P2)

```
SUBJECT: [SECURITY INCIDENT] - {Severity} - {Brief Description}

Incident ID: {INC-YYYY-NNNN}
Severity: {P1/P2}
Status: {Active/Contained/Resolved}
Incident Commander: {Name}

SUMMARY:
{Brief description of the incident}

IMPACT:
- Systems affected: {list}
- Users affected: {estimate}
- Data potentially exposed: {yes/no/unknown}

CURRENT STATUS:
{Current phase and actions}

ACTIONS REQUIRED:
{Any actions required from recipients}

NEXT UPDATE:
{Time of next status update}

-- Security Team
```

#### 12.3.2 External Notification (if required)

```
SUBJECT: Security Notification - Cortex Platform

Dear {Customer/User},

We are writing to inform you of a security incident that may have
affected your data on the Cortex platform.

WHAT HAPPENED:
{Clear, non-technical explanation}

WHAT INFORMATION WAS INVOLVED:
{Specific data types}

WHAT WE ARE DOING:
{Actions taken}

WHAT YOU CAN DO:
{Recommended user actions}

FOR MORE INFORMATION:
{Contact details, FAQ link}

We sincerely apologize for any inconvenience this may cause.

{Name}
{Title}
Cortex Security Team
```

#### 12.3.3 Regulatory Notification (GDPR Breach)

```
Data Protection Authority Notification

1. CONTROLLER DETAILS
   Name: {Organization}
   Contact: {DPO contact}
   Reference: {Incident ID}

2. NATURE OF BREACH
   Type: {Confidentiality/Integrity/Availability}
   Description: {Detailed description}

3. CATEGORIES OF DATA
   {List of data categories}

4. NUMBER OF DATA SUBJECTS
   Approximate: {Number}

5. CONSEQUENCES
   {Likely consequences}

6. MEASURES TAKEN
   {Remediation steps}

7. COMMUNICATION TO DATA SUBJECTS
   {Yes/No, with justification}

Date of Notification: {Date}
```

### 12.4 Post-Incident Review

#### 12.4.1 Review Timeline

- **24 hours**: Initial incident report
- **72 hours**: Detailed timeline reconstruction
- **1 week**: Root cause analysis complete
- **2 weeks**: Lessons learned session
- **4 weeks**: Remediation actions completed

#### 12.4.2 Post-Incident Report Template

```markdown
# Incident Report: {INC-YYYY-NNNN}

## Executive Summary
{2-3 sentence summary}

## Timeline
| Time | Event |
|------|-------|
| {time} | {event} |

## Impact
- Duration: {time}
- Users affected: {number}
- Data exposed: {yes/no}
- Financial impact: {estimate}

## Root Cause
{Detailed technical explanation}

## Detection
- How was it detected: {method}
- Time to detect: {duration}
- Detection gaps: {any gaps}

## Response
- Response timeline
- What worked well
- What could be improved

## Remediation
| Action | Owner | Status | Due Date |
|--------|-------|--------|----------|
| {action} | {owner} | {status} | {date} |

## Lessons Learned
1. {lesson}
2. {lesson}

## Appendices
- Evidence collected
- Communications sent
- External notifications
```

---

## 13. Security Controls Summary

### 13.1 Control Categories

| Category | Controls Count | Critical Controls |
|----------|----------------|-------------------|
| Authentication | 15 | MFA, Token management, Key rotation |
| Authorization | 12 | RBAC, Trust tiers, Scope enforcement |
| Data Protection | 10 | Encryption, Classification, Retention |
| Input Validation | 8 | Injection prevention, Secret detection |
| Monitoring | 10 | Audit logging, Anomaly detection |
| Incident Response | 6 | Procedures, Communication |

### 13.2 Implementation Priority

#### Phase 1 (MVP)
- [ ] Authentication system (human + agent)
- [ ] Basic RBAC implementation
- [ ] TLS encryption
- [ ] Input validation framework
- [ ] Basic audit logging
- [ ] Rate limiting

#### Phase 2 (Security Hardening)
- [ ] MFA implementation
- [ ] Trust tier enforcement
- [ ] Secret detection
- [ ] Enhanced audit logging
- [ ] Incident response procedures
- [ ] Compliance reporting

#### Phase 3 (Advanced)
- [ ] Advanced anomaly detection
- [ ] Automated threat response
- [ ] Full GDPR compliance
- [ ] SOC 2 preparation
- [ ] Penetration testing program

### 13.3 Security Review Schedule

| Review Type | Frequency | Scope |
|-------------|-----------|-------|
| Code review | Every PR | Security-sensitive code |
| Dependency scan | Daily | All dependencies |
| Vulnerability scan | Weekly | All systems |
| Access review | Monthly | All principals |
| Penetration test | Annual | Full platform |
| Security audit | Annual | Controls and processes |

---

## Appendix A: Security Checklist

### A.1 Development Checklist

- [ ] All user input validated and sanitized
- [ ] Parameterized queries used for all database operations
- [ ] Output encoding applied in all contexts
- [ ] Authentication required for all non-public endpoints
- [ ] Authorization checked for all resource access
- [ ] Sensitive data encrypted at rest and in transit
- [ ] Secrets not hardcoded or logged
- [ ] Error messages do not leak sensitive information
- [ ] Rate limiting applied to all endpoints
- [ ] Security headers configured
- [ ] CSRF protection enabled
- [ ] Dependencies scanned for vulnerabilities

### A.2 Deployment Checklist

- [ ] TLS certificates valid and properly configured
- [ ] Default credentials changed
- [ ] Debug mode disabled
- [ ] Unnecessary services disabled
- [ ] Firewall rules configured
- [ ] Logging enabled and centralized
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested
- [ ] Incident response plan ready
- [ ] Key rotation scheduled

### A.3 Agent Onboarding Checklist

- [ ] Purpose documented
- [ ] Owner assigned
- [ ] Scope defined
- [ ] API key securely provisioned
- [ ] T0 trust tier assigned
- [ ] Monitoring configured
- [ ] Probation period scheduled
- [ ] Review date set

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Security Team | Initial specification |

---

*This document is classified as Internal. Distribution limited to Cortex development and operations teams.*
