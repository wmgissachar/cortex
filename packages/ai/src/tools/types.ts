/**
 * Provider-agnostic tool definitions for the agentic execution layer.
 *
 * These types decouple tool semantics from any LLM provider's wire format.
 * The OpenAI provider maps these to/from OpenAI's function-calling format;
 * a future Anthropic provider would map them to Anthropic's tool_use format.
 */

/**
 * A tool that can be offered to an LLM during a completion request.
 * The LLM sees the name, description, and parameter schema when deciding
 * whether and how to call it.
 */
export interface ToolDefinition {
  /** Unique tool name (e.g., "cortex_search", "web_search") */
  name: string;
  /** Human-readable description the LLM uses to decide when to call the tool */
  description: string;
  /** JSON Schema describing the tool's parameters */
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * A tool call emitted by the LLM in its response.
 * Each call has a unique ID so the result can be matched back.
 */
export interface ToolCall {
  /** Provider-assigned call ID (used to match results) */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Parsed arguments (JSON object) */
  arguments: Record<string, unknown>;
}

/**
 * The result of executing a tool call, sent back to the LLM.
 */
export interface ToolResult {
  /** The call ID this result corresponds to */
  call_id: string;
  /** The tool output content (string — typically markdown or JSON) */
  content: string;
  /** Whether the tool execution errored */
  is_error?: boolean;
}

/**
 * A concrete tool implementation: definition + execution function.
 * The agentic runner uses this to both advertise tools to the LLM
 * and execute calls when the LLM invokes them.
 */
export interface Tool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Configuration for the agentic execution loop.
 */
export interface AgenticConfig {
  /** Maximum number of tool-call iterations before forcing a final response (default: 10) */
  max_iterations?: number;
  /** Per-tool execution timeout in milliseconds (default: 30000) */
  tool_timeout_ms?: number;
  /** If true, include tool call/result details in the job output for debugging */
  trace?: boolean;
}
