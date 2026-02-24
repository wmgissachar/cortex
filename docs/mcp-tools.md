# Cortex MCP Tools

This guide explains how to integrate Cortex with Claude Code or other MCP-compatible AI assistants.

## Setup

### 1. Build the MCP Package

```bash
cd cortex
pnpm install
pnpm build:mcp
```

### 2. Create an API Key

First, get an access token by logging in:

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cortex.local","password":"admin123"}'
```

Then create an API key:

```bash
curl -X POST http://localhost:3000/v1/auth/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"claude-agent"}'
```

Save the returned `api_key` (format: `ctx_...`). It cannot be retrieved again.

### 3. Configure Claude Code

Add a `.mcp.json` file to your workspace root:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["<path-to-cortex>/packages/mcp/dist/index.js"],
      "env": {
        "CORTEX_API_URL": "http://localhost:3000/v1",
        "CORTEX_API_KEY": "ctx_your_api_key_here",
        "CORTEX_CHECKPOINT_THREAD_ID": "optional-thread-uuid"
      }
    }
  }
}
```

### 4. Restart Claude Code

Restart Claude Code to load the MCP server. The Cortex tools should now be available.

---

## Available Tools

### cortex_get_context

Get workspace overview for orientation.

**Use this to:** Understand what topics and content exist before diving into specific searches.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| budget | number | No | Max characters to return (default: 4000, max: 32000) |

**Example:**
```
cortex_get_context({ budget: 8000 })
```

**Returns:** Formatted overview including:
- List of topics with thread/artifact counts
- Recent accepted artifacts with summaries
- Open tasks (if any)

---

### cortex_search

Full-text search across the knowledge base.

**Use this to:** Find relevant threads, artifacts, or comments on a topic.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query (1-500 chars) |
| type | string | No | Filter: `all`, `threads`, `artifacts`, `comments` |
| limit | number | No | Max results (default: 20, max: 50) |

**Example:**
```
cortex_search({ query: "authentication", type: "artifacts", limit: 10 })
```

**Returns:** List of results with:
- Type, ID, title
- Snippet of matching content
- Topic information
- Relevance rank

---

### cortex_get_thread

Get a thread with all its comments.

**Use this to:** Read full discussions and understand context.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Thread UUID |

**Example:**
```
cortex_get_thread({ id: "550e8400-e29b-41d4-a716-446655440000" })
```

**Returns:** Full thread including:
- Title, type, status
- Body content
- All comments with authors
- Tags and metadata

---

### cortex_get_artifact

Get full artifact content.

**Use this to:** Read documentation, decisions, or procedures in detail.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Artifact UUID |

**Example:**
```
cortex_get_artifact({ id: "550e8400-e29b-41d4-a716-446655440000" })
```

**Returns:** Complete artifact with:
- Title, type, status, version
- Summary
- Full body content
- References
- Tags

---

### cortex_observe

Add an observation to a thread.

**Use this to:** Record insights, analysis results, or notes during work.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| thread_id | string | Yes | Thread UUID |
| body | string | Yes | Observation content (1-50000 chars, markdown supported) |
| tags | string[] | No | Tags for categorization (max 20) |

**Example:**
```
cortex_observe({
  thread_id: "550e8400-e29b-41d4-a716-446655440000",
  body: "## Analysis Results\n\nAfter reviewing the codebase...",
  tags: ["analysis", "important"]
})
```

**Returns:** Confirmation with comment ID.

---

### cortex_draft_artifact

Create a new artifact draft.

**Use this to:** Propose documentation based on discussions or analysis.

**Important:** Drafts require human review and acceptance. You cannot self-approve artifacts.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| title | string | Yes | Artifact title (1-500 chars) |
| body | string | Yes | Content (1-100000 chars, markdown) |
| type | string | Yes | `decision`, `procedure`, `document`, `glossary` |
| topic_id | string | Yes | Parent topic UUID |
| summary | string | No | Brief summary for search (max 1000 chars) |
| tags | string[] | No | Tags (max 20) |

**Example:**
```
cortex_draft_artifact({
  title: "API Authentication Guide",
  body: "# Authentication\n\nThis guide covers...",
  type: "procedure",
  topic_id: "550e8400-e29b-41d4-a716-446655440000",
  summary: "Step-by-step guide for API authentication",
  tags: ["api", "security"]
})
```

**Returns:** Created artifact with ID and status (draft).

---

### cortex_update_task

Update a task's status.

**Use this to:** Track progress on assigned work.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Task UUID |
| status | string | Yes | `open`, `in_progress`, `done`, `cancelled` |

**Example:**
```
cortex_update_task({
  id: "550e8400-e29b-41d4-a716-446655440000",
  status: "done"
})
```

**Returns:** Updated task details.

---

### cortex_checkpoint

Record a progress checkpoint.

**Use this to:** Document your work progress during long tasks.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| thread_id | string | No | Thread UUID (uses env var if not provided) |
| summary | string | Yes | Progress summary (1-10000 chars) |

If `thread_id` is not provided, the tool uses the `CORTEX_CHECKPOINT_THREAD_ID` environment variable.

**Example:**
```
cortex_checkpoint({
  summary: "## Progress Update\n\n- Completed initial analysis\n- Identified 3 areas for improvement\n- Next: implement changes"
})
```

**Returns:** Confirmation with comment ID.

---

## Workflow Example

Here's a typical workflow when using Cortex tools:

1. **Orient:** Start with `cortex_get_context()` to understand the workspace
2. **Search:** Use `cortex_search()` to find relevant existing content
3. **Read:** Get details with `cortex_get_thread()` or `cortex_get_artifact()`
4. **Document:** Add observations with `cortex_observe()` or create drafts with `cortex_draft_artifact()`
5. **Track:** Update task status with `cortex_update_task()`
6. **Checkpoint:** Record progress periodically with `cortex_checkpoint()`

## Error Handling

All tools return errors in this format:

```
Error: <error message>
```

Common errors:
- `CORTEX_API_KEY environment variable is required` - API key not configured
- `Invalid thread ID format` - UUID validation failed
- `HTTP 404` - Resource not found
- `HTTP 403` - Insufficient permissions

## Troubleshooting

### Tools not appearing in Claude Code

1. Verify `.mcp.json` is in your workspace root
2. Check the path to `packages/mcp/dist/index.js` is correct
3. Ensure MCP package is built (`pnpm build:mcp`)
4. Restart Claude Code

### Authentication errors

1. Verify `CORTEX_API_KEY` is set correctly
2. Check the API server is running (`pnpm dev:api`)
3. Ensure the API key is valid (hasn't been regenerated)

### Connection refused

1. Start the API server: `pnpm dev:api`
2. Verify `CORTEX_API_URL` matches your server address
3. Check for firewall/network issues
