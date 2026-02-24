/**
 * Tool Registry
 *
 * Exports all Cortex MCP tools for registration with the server.
 */

import { z } from 'zod';
import { getContextTool, getContextSchema, type GetContextInput } from './get-context.js';
import { searchTool, searchSchema, type SearchInput } from './search.js';
import { getThreadTool, getThreadSchema, type GetThreadInput } from './get-thread.js';
import { getArtifactTool, getArtifactSchema, type GetArtifactInput } from './get-artifact.js';
import { observeTool, observeSchema, type ObserveInput } from './observe.js';
import { draftArtifactTool, draftArtifactSchema, type DraftArtifactInput } from './draft-artifact.js';
import { updateTaskTool, updateTaskSchema, type UpdateTaskInput } from './update-task.js';
import { checkpointTool, checkpointSchema, type CheckpointInput } from './checkpoint.js';
import { getTaskTool, getTaskSchema, type GetTaskInput } from './get-task.js';
import { updateArtifactTool, updateArtifactSchema, type UpdateArtifactInput } from './update-artifact.js';
import { createThreadTool, createThreadSchema, type CreateThreadInput } from './create-thread.js';
import { createTaskTool, createTaskSchema, type CreateTaskInput } from './create-task.js';
import { listThreadsTool, listThreadsSchema, type ListThreadsInput } from './list-threads.js';
import { listTasksTool, listTasksSchema, type ListTasksInput } from './list-tasks.js';
import { listArtifactsTool, listArtifactsSchema, type ListArtifactsInput } from './list-artifacts.js';
import { updateThreadTool, updateThreadSchema, type UpdateThreadInput } from './update-thread.js';
import { createKnowledgeLinkTool, createKnowledgeLinkSchema, type CreateKnowledgeLinkInput } from './create-knowledge-link.js';
import { briefingTool, briefingSchema, type BriefingInput } from './briefing.js';
import { askTool, askSchema, type AskInput } from './ask.js';
import { eventsSummaryTool, eventsSummarySchema, type EventsSummaryInput } from './events-summary.js';
import { createTopicTool, createTopicSchema, type CreateTopicInput } from './create-topic.js';
import { sessionCompleteTool, sessionCompleteSchema, type SessionCompleteInput } from './session-complete.js';

// Tool definition for MCP
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Get tool definitions for list_tools response
export const toolDefinitions: ToolDefinition[] = [
  {
    name: getContextTool.name,
    description: getContextTool.description,
    inputSchema: getContextTool.inputSchema,
  },
  {
    name: searchTool.name,
    description: searchTool.description,
    inputSchema: searchTool.inputSchema,
  },
  {
    name: getThreadTool.name,
    description: getThreadTool.description,
    inputSchema: getThreadTool.inputSchema,
  },
  {
    name: getArtifactTool.name,
    description: getArtifactTool.description,
    inputSchema: getArtifactTool.inputSchema,
  },
  {
    name: observeTool.name,
    description: observeTool.description,
    inputSchema: observeTool.inputSchema,
  },
  {
    name: draftArtifactTool.name,
    description: draftArtifactTool.description,
    inputSchema: draftArtifactTool.inputSchema,
  },
  {
    name: updateTaskTool.name,
    description: updateTaskTool.description,
    inputSchema: updateTaskTool.inputSchema,
  },
  {
    name: checkpointTool.name,
    description: checkpointTool.description,
    inputSchema: checkpointTool.inputSchema,
  },
  {
    name: createThreadTool.name,
    description: createThreadTool.description,
    inputSchema: createThreadTool.inputSchema,
  },
  {
    name: createTaskTool.name,
    description: createTaskTool.description,
    inputSchema: createTaskTool.inputSchema,
  },
  {
    name: getTaskTool.name,
    description: getTaskTool.description,
    inputSchema: getTaskTool.inputSchema,
  },
  {
    name: updateArtifactTool.name,
    description: updateArtifactTool.description,
    inputSchema: updateArtifactTool.inputSchema,
  },
  {
    name: listThreadsTool.name,
    description: listThreadsTool.description,
    inputSchema: listThreadsTool.inputSchema,
  },
  {
    name: listTasksTool.name,
    description: listTasksTool.description,
    inputSchema: listTasksTool.inputSchema,
  },
  {
    name: listArtifactsTool.name,
    description: listArtifactsTool.description,
    inputSchema: listArtifactsTool.inputSchema,
  },
  {
    name: updateThreadTool.name,
    description: updateThreadTool.description,
    inputSchema: updateThreadTool.inputSchema,
  },
  {
    name: createKnowledgeLinkTool.name,
    description: createKnowledgeLinkTool.description,
    inputSchema: createKnowledgeLinkTool.inputSchema,
  },
  {
    name: briefingTool.name,
    description: briefingTool.description,
    inputSchema: briefingTool.inputSchema,
  },
  {
    name: askTool.name,
    description: askTool.description,
    inputSchema: askTool.inputSchema,
  },
  {
    name: eventsSummaryTool.name,
    description: eventsSummaryTool.description,
    inputSchema: eventsSummaryTool.inputSchema,
  },
  {
    name: createTopicTool.name,
    description: createTopicTool.description,
    inputSchema: createTopicTool.inputSchema,
  },
  {
    name: sessionCompleteTool.name,
    description: sessionCompleteTool.description,
    inputSchema: sessionCompleteTool.inputSchema,
  },
];

// Export individual tools and schemas for direct access
export {
  getContextTool,
  getContextSchema,
  type GetContextInput,
  searchTool,
  searchSchema,
  type SearchInput,
  getThreadTool,
  getThreadSchema,
  type GetThreadInput,
  getArtifactTool,
  getArtifactSchema,
  type GetArtifactInput,
  observeTool,
  observeSchema,
  type ObserveInput,
  draftArtifactTool,
  draftArtifactSchema,
  type DraftArtifactInput,
  updateTaskTool,
  updateTaskSchema,
  type UpdateTaskInput,
  checkpointTool,
  checkpointSchema,
  type CheckpointInput,
  createThreadTool,
  createThreadSchema,
  type CreateThreadInput,
  createTaskTool,
  createTaskSchema,
  type CreateTaskInput,
  getTaskTool,
  getTaskSchema,
  type GetTaskInput,
  updateArtifactTool,
  updateArtifactSchema,
  type UpdateArtifactInput,
  listThreadsTool,
  listThreadsSchema,
  type ListThreadsInput,
  listTasksTool,
  listTasksSchema,
  type ListTasksInput,
  listArtifactsTool,
  listArtifactsSchema,
  type ListArtifactsInput,
  updateThreadTool,
  updateThreadSchema,
  type UpdateThreadInput,
  createKnowledgeLinkTool,
  createKnowledgeLinkSchema,
  type CreateKnowledgeLinkInput,
  briefingTool,
  briefingSchema,
  type BriefingInput,
  askTool,
  askSchema,
  type AskInput,
  eventsSummaryTool,
  eventsSummarySchema,
  type EventsSummaryInput,
  createTopicTool,
  createTopicSchema,
  type CreateTopicInput,
  sessionCompleteTool,
  sessionCompleteSchema,
  type SessionCompleteInput,
};

// Tool name constants
export const TOOL_NAMES = {
  GET_CONTEXT: 'cortex_get_context',
  SEARCH: 'cortex_search',
  GET_THREAD: 'cortex_get_thread',
  GET_ARTIFACT: 'cortex_get_artifact',
  OBSERVE: 'cortex_observe',
  DRAFT_ARTIFACT: 'cortex_draft_artifact',
  UPDATE_TASK: 'cortex_update_task',
  CHECKPOINT: 'cortex_checkpoint',
  CREATE_THREAD: 'cortex_create_thread',
  CREATE_TASK: 'cortex_create_task',
  GET_TASK: 'cortex_get_task',
  UPDATE_ARTIFACT: 'cortex_update_artifact',
  LIST_THREADS: 'cortex_list_threads',
  LIST_TASKS: 'cortex_list_tasks',
  LIST_ARTIFACTS: 'cortex_list_artifacts',
  UPDATE_THREAD: 'cortex_update_thread',
  CREATE_KNOWLEDGE_LINK: 'cortex_create_knowledge_link',
  BRIEFING: 'cortex_briefing',
  ASK: 'cortex_ask',
  EVENTS_SUMMARY: 'cortex_events_summary',
  CREATE_TOPIC: 'cortex_create_topic',
  SESSION_COMPLETE: 'cortex_session_complete',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

// Schema map for validation
export const toolSchemas: Record<ToolName, z.ZodType> = {
  [TOOL_NAMES.GET_CONTEXT]: getContextSchema,
  [TOOL_NAMES.SEARCH]: searchSchema,
  [TOOL_NAMES.GET_THREAD]: getThreadSchema,
  [TOOL_NAMES.GET_ARTIFACT]: getArtifactSchema,
  [TOOL_NAMES.OBSERVE]: observeSchema,
  [TOOL_NAMES.DRAFT_ARTIFACT]: draftArtifactSchema,
  [TOOL_NAMES.UPDATE_TASK]: updateTaskSchema,
  [TOOL_NAMES.CHECKPOINT]: checkpointSchema,
  [TOOL_NAMES.CREATE_THREAD]: createThreadSchema,
  [TOOL_NAMES.CREATE_TASK]: createTaskSchema,
  [TOOL_NAMES.GET_TASK]: getTaskSchema,
  [TOOL_NAMES.UPDATE_ARTIFACT]: updateArtifactSchema,
  [TOOL_NAMES.LIST_THREADS]: listThreadsSchema,
  [TOOL_NAMES.LIST_TASKS]: listTasksSchema,
  [TOOL_NAMES.LIST_ARTIFACTS]: listArtifactsSchema,
  [TOOL_NAMES.UPDATE_THREAD]: updateThreadSchema,
  [TOOL_NAMES.CREATE_KNOWLEDGE_LINK]: createKnowledgeLinkSchema,
  [TOOL_NAMES.BRIEFING]: briefingSchema,
  [TOOL_NAMES.ASK]: askSchema,
  [TOOL_NAMES.EVENTS_SUMMARY]: eventsSummarySchema,
  [TOOL_NAMES.CREATE_TOPIC]: createTopicSchema,
  [TOOL_NAMES.SESSION_COMPLETE]: sessionCompleteSchema,
};

// Execute a tool by name with validated input
export async function executeTool(name: string, args: unknown): Promise<string> {
  switch (name) {
    case TOOL_NAMES.GET_CONTEXT: {
      const input = getContextSchema.parse(args || {});
      return getContextTool.execute(input);
    }
    case TOOL_NAMES.SEARCH: {
      const input = searchSchema.parse(args);
      return searchTool.execute(input);
    }
    case TOOL_NAMES.GET_THREAD: {
      const input = getThreadSchema.parse(args);
      return getThreadTool.execute(input);
    }
    case TOOL_NAMES.GET_ARTIFACT: {
      const input = getArtifactSchema.parse(args);
      return getArtifactTool.execute(input);
    }
    case TOOL_NAMES.OBSERVE: {
      const input = observeSchema.parse(args);
      return observeTool.execute(input);
    }
    case TOOL_NAMES.DRAFT_ARTIFACT: {
      const input = draftArtifactSchema.parse(args);
      return draftArtifactTool.execute(input);
    }
    case TOOL_NAMES.UPDATE_TASK: {
      const input = updateTaskSchema.parse(args);
      return updateTaskTool.execute(input);
    }
    case TOOL_NAMES.CHECKPOINT: {
      const input = checkpointSchema.parse(args);
      return checkpointTool.execute(input);
    }
    case TOOL_NAMES.CREATE_THREAD: {
      const input = createThreadSchema.parse(args);
      return createThreadTool.execute(input);
    }
    case TOOL_NAMES.CREATE_TASK: {
      const input = createTaskSchema.parse(args);
      return createTaskTool.execute(input);
    }
    case TOOL_NAMES.GET_TASK: {
      const input = getTaskSchema.parse(args);
      return getTaskTool.execute(input);
    }
    case TOOL_NAMES.UPDATE_ARTIFACT: {
      const input = updateArtifactSchema.parse(args);
      return updateArtifactTool.execute(input);
    }
    case TOOL_NAMES.LIST_THREADS: {
      const input = listThreadsSchema.parse(args || {});
      return listThreadsTool.execute(input);
    }
    case TOOL_NAMES.LIST_TASKS: {
      const input = listTasksSchema.parse(args || {});
      return listTasksTool.execute(input);
    }
    case TOOL_NAMES.LIST_ARTIFACTS: {
      const input = listArtifactsSchema.parse(args || {});
      return listArtifactsTool.execute(input);
    }
    case TOOL_NAMES.UPDATE_THREAD: {
      const input = updateThreadSchema.parse(args);
      return updateThreadTool.execute(input);
    }
    case TOOL_NAMES.CREATE_KNOWLEDGE_LINK: {
      const input = createKnowledgeLinkSchema.parse(args);
      return createKnowledgeLinkTool.execute(input);
    }
    case TOOL_NAMES.BRIEFING: {
      const input = briefingSchema.parse(args);
      return briefingTool.execute(input);
    }
    case TOOL_NAMES.ASK: {
      const input = askSchema.parse(args);
      return askTool.execute(input);
    }
    case TOOL_NAMES.EVENTS_SUMMARY: {
      const input = eventsSummarySchema.parse(args || {});
      return eventsSummaryTool.execute(input);
    }
    case TOOL_NAMES.CREATE_TOPIC: {
      const input = createTopicSchema.parse(args);
      return createTopicTool.execute(input);
    }
    case TOOL_NAMES.SESSION_COMPLETE: {
      const input = sessionCompleteSchema.parse(args);
      return sessionCompleteTool.execute(input);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Check if a tool name is valid
export function isValidToolName(name: string): name is ToolName {
  return Object.values(TOOL_NAMES).includes(name as ToolName);
}
