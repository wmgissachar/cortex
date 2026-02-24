/**
 * LLM Provider abstraction layer.
 * Decouples Cortex from any specific AI vendor.
 */

import type { ToolDefinition, ToolCall } from '../tools/types.js';

// ── Message types ──────────────────────────────────────────────────

export interface TextMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * An assistant message that contains tool calls instead of (or in addition to) text.
 * The agentic runner appends these to the conversation history so the LLM
 * sees its own prior tool invocations.
 */
export interface AssistantToolCallMessage {
  role: 'assistant';
  tool_calls: ToolCall[];
  content?: string;
}

/**
 * A tool-result message injected after tool execution.
 * Each maps back to a specific tool call via call_id.
 */
export interface ToolResultMessage {
  role: 'tool';
  call_id: string;
  content: string;
}

/**
 * Union of all message types that can appear in a conversation.
 * Existing callers that only use TextMessage remain compatible.
 */
export type CompletionMessage = TextMessage | AssistantToolCallMessage | ToolResultMessage;

// ── Request / Response ─────────────────────────────────────────────

export interface CompletionRequest {
  model: string;
  system: string;
  messages: CompletionMessage[];
  reasoning?: { effort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' };
  max_tokens?: number;
  temperature?: number;
  /** Tools to make available to the model. Omit for non-tool completions. */
  tools?: ToolDefinition[];
  /** Control tool use: 'auto' (default), 'none', or { name: string } to force a specific tool */
  tool_choice?: 'auto' | 'none' | { name: string };
}

export interface CompletionResponse {
  /** Text content from the model (empty string if response is tool-calls only) */
  content: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
  /** Tool calls requested by the model. Empty/undefined for non-tool responses. */
  tool_calls?: ToolCall[];
  /** Why the model stopped: 'stop' (text complete), 'tool_calls', or 'length' (token limit) */
  finish_reason?: 'stop' | 'tool_calls' | 'length';
}

export interface LLMProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
