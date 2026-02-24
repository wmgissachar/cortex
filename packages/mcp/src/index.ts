#!/usr/bin/env node
/**
 * Cortex MCP Server
 *
 * Provides 8 tools for AI agents to interact with the Cortex knowledge base:
 * - cortex_get_context: Get workspace overview
 * - cortex_search: Full-text search
 * - cortex_get_thread: Get thread with comments
 * - cortex_get_artifact: Get artifact content
 * - cortex_observe: Add observation to thread
 * - cortex_draft_artifact: Create artifact draft
 * - cortex_update_task: Update task status
 * - cortex_checkpoint: Record work checkpoint
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { toolDefinitions, executeTool, isValidToolName, TOOL_NAMES } from './tools/index.js';

// Create server instance
const server = new Server(
  {
    name: 'cortex',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolDefinitions,
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Check if tool exists
  if (!isValidToolName(name)) {
    const availableTools = Object.values(TOOL_NAMES).join(', ');
    return {
      content: [
        {
          type: 'text',
          text: `Error: Unknown tool "${name}". Available tools: ${availableTools}`,
        },
      ],
      isError: true,
    };
  }

  const start = performance.now();
  let success = true;
  let errorMsg: string | undefined;

  try {
    // Execute tool with validated input
    const result = await executeTool(name, args);

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    success = false;
    errorMsg = error instanceof Error ? error.message : String(error);

    // Handle validation errors
    if (error instanceof ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return {
        content: [
          {
            type: 'text',
            text: `Validation Error: ${issues}`,
          },
        ],
        isError: true,
      };
    }

    // Handle execution errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  } finally {
    // Fire-and-forget: track tool call as activity event
    const durationMs = Math.round(performance.now() - start);
    const apiKey = process.env.CORTEX_API_KEY;
    const baseUrl = process.env.CORTEX_API_URL || 'http://localhost:3000/v1';
    if (apiKey) {
      fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Authorization': `ApiKey ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [{ event_type: 'mcp.tool_call', payload: { tool_name: name, duration_ms: durationMs, success, error: errorMsg } }] }),
      }).catch(() => {});
    }
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Cortex MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
