# Cortex v2 — Product & Technical Specification Pack

**Version:** v2.0 (planning spec)
**Audience:** Product/ops analyst, engineering (backend, frontend, infra), security, agent-integration
**Goal:** This pack is **self‑sufficient**. It defines **what Cortex is**, **why it exists**, and **how to build it**.

Cortex v2 is designed as a **two-part system**:

1) **Cortex Core (server)** — the hosted/shared source of truth + human UI
2) **Cortex Sidecar (`cortexd`)** — a local daemon that provides **MCP tools**, a **local cache**, offline buffering, and frictionless agent participation

This design is intentionally **agent-first**, borrowing the most effective ergonomics from local sidecar tools (e.g., “one command start” + auto MCP config) and multi-agent “office” patterns (tasks, notifications, subscriptions, review queues).

---

## Document map

1. **01-vision.md**
   First principles, purpose, non-negotiables, success metrics, scope.

2. **02-system-overview.md**
   System architecture (Core + Sidecar), component responsibilities, data flows, deployment shapes.

3. **03-domain-model.md**
   Concepts, entities, relationships, lifecycle states, and invariants.

4. **04-agent-first-workflows.md**
   Agent interaction modes, stop hooks, auto-observations, drafts/review, human nudging.

5. **05-mcp-tools-and-cli.md**
   MCP tool suite (agent surface), CLI contract (`cortex start`, etc.), budgets, idempotency.

6. **06-core-api-spec.md**
   REST API contract for Cortex Core (server), auth, pagination, rate limits.

7. **07-ui-spec.md**
   Human UI/UX: feeds, threads, artifacts, work dashboard, review queue, admin.

8. **08-memory-engine.md**
   Memory lifecycle: capture → compress → promote → review → retire; summarization jobs; reliability.

9. **09-sidecar-spec.md**
   `cortexd` architecture: local cache, sync, offline queue, secret scanning/redaction, hooks, `.mcp.json` writing.

10. **10-integrations.md**
    Plugin model; Coldstart integration; code-linking; git and CI hooks; connectors.

11. **11-security-governance.md**
    Threat model, RBAC/capabilities, sensitivity model, audit logs, anti-poisoning.

12. **12-operations-rollout.md**
    Deployment, backups, migrations, monitoring, rollout phases, risk register.

13. **13-templates.md**  
    Templates for thread types, artifacts (ADR, runbook, report), checkpoint format, review checklists.

14. **14-design-decisions.md**  
    Centralized “why” decisions and tradeoffs.

---

## How to use this pack

- Analysts: start with **01**, then **03**, then workflows (**04**) to validate product shape.
- Engineers:
  - backend: **02**, **03**, **05**, **06**, **08**, **11**, **12**
  - frontend: **02**, **03**, **07**
  - sidecar + agent integration: **02**, **05**, **09**, **10**
  - infra/security: **02**, **11**, **12**

---

## Guiding product stance

- **Capture is cheap; canon is gated.**
  Cortex must accept lots of “exhaust,” but only curated, reviewed artifacts become “what we believe.”

- **Agents should contribute by default.**
  Most work should automatically produce observations and drafts, especially on stop hooks.

- **Humans steer by nudging, not rewriting.**
  Corrections are additive (annotations, superseding artifacts), preserving provenance.

---

## Key design outcomes

Cortex v2 should make these statements true:

1) A brand-new agent can become effective within minutes by calling `cortex.get_bootstrap_pack` and `cortex.get_context_pack`.
2) Interactive sessions don’t lose continuity because stop hooks create drafts and observation batches automatically.
3) The knowledge base stays usable after years because the system continuously compresses and promotes.
4) Sensitive information is controlled because the sidecar redacts and the core enforces classifications and permissions.
