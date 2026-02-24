# 12 — Operations, Deployment, Rollout Plan

This document tells engineering and ops how to ship Cortex v2 safely.

---

## 12.1 Deployment options

### Option A: Self-hosted (recommended baseline)
Docker Compose services:
- `cortex-api`
- `cortex-web`
- `cortex-worker`
- `postgres`
- `minio`
- `redis` (optional)

Local machine:
- `cortexd` sidecar per workspace

### Option B: Managed infrastructure (later)
- managed Postgres
- managed object store
- worker pool scaling
- SSO integration

---

## 12.2 Backups and disaster recovery

### What to back up
- Postgres (full)
- object store buckets (attachments)
- configuration/keys (vault export)

### Frequency
- daily full DB backup
- hourly incremental (if possible)
- object store replication or nightly snapshot

### Restore drills
- practice quarterly
- validate that references between DB and object store remain consistent

---

## 12.3 Re-indexing playbooks

### When to re-index embeddings
- embedding model changes
- major redaction
- corruption detected

### When to re-build summaries/digests
- summarizer bug fixed
- thread migration/merge occurred

Provide admin endpoints:
- `/admin/reindex`
- `/admin/rebuild-summaries`

---

## 12.4 Observability

### Metrics
- API request latency p50/p95
- error rate by endpoint
- queue depth (background jobs)
- observation ingestion throughput
- draft queue size and approval latency
- sidecar sync lag and queue backlog

### Alerts
- abnormal write rate by one principal
- failed auth spikes
- object store permission anomalies
- worker failures/retry exhaustion
- draft queue growth without approvals (review backlog)

---

## 12.5 Testing strategy

### Unit tests
- schema validation
- RBAC enforcement
- idempotency behavior
- markdown sanitization
- draft approval correctness

### Integration tests
- sidecar sync flows
- MCP tool calls (golden tests)
- observation batch ingestion + attachments
- search (keyword + semantic)
- artifact acceptance workflow

### Load tests
- burst observation ingestion
- feed/search under load
- large attachment uploads

### Security tests
- privilege escalation
- XSS/markdown injection
- object store ACL correctness
- secret scanning effectiveness
- redaction reindex correctness

---

## 12.6 Rollout phases

### Phase 0 — Prototype (1–2 weeks)
Build:
- minimal Core: threads/comments + auth
- minimal UI: create/view threads
- minimal sidecar: `cortex start` + MCP search + get thread
- no embeddings; keyword search only

Goal:
- validate the workflow end-to-end with one project.

### Phase 1 — MVP (4–8 weeks)
Build:
- subcortexes + templates
- tasks + notifications
- observations + attachments
- drafts + review queue
- artifacts + versioning + acceptance
- semantic search (pgvector)
- stop hook draft creation in sidecar

Goal:
- agents and humans consistently reuse prior work.

### Phase 2 — Compounding engine (8–16 weeks)
Build:
- due-for-review workflows
- contradiction flagging
- better ranking using reliability signals
- subcortex similarity + merge suggestions
- plugin integrations (Coldstart, CI)

Goal:
- memory stays current and trustworthy as volume grows.

### Phase 3 — Hardening (ongoing)
- security audits
- performance tuning
- SSO (optional)
- multi-tenant (only if required)

---

## 12.7 Risk register and mitigations

### Risk: noise overwhelms signal
Mitigation:
- observations + drafts are default automation lanes
- rate limits
- digest compression
- review queue batching

### Risk: taxonomy explosion (too many subcortexes)
Mitigation:
- proposed subcortex state
- similarity suggestions
- merges with redirects

### Risk: memory poisoning
Mitigation:
- canon gate and evidence requirements
- audit logs
- staleness/review cadence
- quarantine workflows

### Risk: secret leakage
Mitigation:
- sidecar secret scanning/redaction
- sensitive classification
- encryption and access controls

### Risk: sidecar drift / stale cache
Mitigation:
- clear status command
- warnings when stale
- delta sync and background refresh

---

## 12.8 Operational runbooks (write early)

1) Backup and restore
2) Re-index embeddings and search
3) Rotate keys (human and agent)
4) Incident response (leak, poisoning, compromised key)
5) Moderation and quarantine
6) Sidecar troubleshooting (cache reset, queue flush)
7) Upgrade playbook (migrations + reindex)

---

## 12.9 Decision log template

Maintain `DECISIONS.md`:

- date
- decision
- rationale
- alternatives considered
- risks
- revisit date
