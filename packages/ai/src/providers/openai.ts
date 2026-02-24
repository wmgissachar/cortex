import OpenAI from 'openai';
import type {
  CompletionRequest,
  CompletionResponse,
  CompletionMessage,
  LLMProvider,
  AssistantToolCallMessage,
  ToolResultMessage,
} from './types.js';
import type { ToolCall } from '../tools/types.js';

/**
 * Fix malformed Unicode escape sequences in a JSON string.
 * Replaces \uXXXX where XXXX contains non-hex characters with the
 * Unicode replacement character \uFFFD, allowing JSON.parse to succeed.
 */
function sanitizeJsonUnicode(raw: string): string {
  // Fix malformed \uXXXX where XXXX isn't exactly 4 hex digits
  let result = raw.replace(/\\u(?![0-9a-fA-F]{4}(?:[^0-9a-fA-F]|$))/g, (match) => {
    console.warn(`Sanitized malformed Unicode escape in OpenAI response: ${match}`);
    return '\\\\u';
  });
  // Fix lone surrogates (\uD800-\uDFFF not followed by a valid low surrogate)
  result = result.replace(/\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F][0-9a-fA-F]{2})/g, (match) => {
    console.warn(`Sanitized lone surrogate in OpenAI response: ${match}`);
    return '\\uFFFD';
  });
  return result;
}

/**
 * Custom fetch wrapper that intercepts OpenAI API responses and sanitizes
 * malformed Unicode escape sequences before the SDK parses the JSON.
 * GPT-5.2 occasionally produces broken \u escapes in math-heavy contexts.
 */
function createSanitizingFetch(baseFetch: typeof globalThis.fetch) {
  return async (input: any, init?: any) => {
    const response = await baseFetch(input, init);

    // Only intercept JSON responses from the completions endpoint
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (!url.includes('/chat/completions')) return response;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) return response;

    const rawText = await response.text();

    // Try parsing as-is first (fast path)
    try {
      JSON.parse(rawText);
      // Valid JSON — return an equivalent response with the same body
      return new Response(rawText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      // JSON parse failed — sanitize and retry
      const sanitized = sanitizeJsonUnicode(rawText);
      console.warn(`Sanitized OpenAI response JSON (${rawText.length} chars) due to malformed Unicode escapes`);
      try {
        JSON.parse(sanitized);
        return new Response(sanitized, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch {
        // Nuclear fallback: escape ALL backslash-u sequences that aren't valid JSON unicode
        const nuclear = rawText.replace(/\\u/g, '\\\\u');
        console.warn(`Nuclear Unicode sanitization applied (${rawText.length} chars) — all \\u escapes neutralized`);
        return new Response(nuclear, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    }
  };
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      timeout: 300_000, // 5-minute timeout per API call
      fetch: createSanitizingFetch(globalThis.fetch) as unknown as OpenAI['_options']['fetch'],
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // GPT-5.x uses 'developer' role instead of 'system'
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'developer' as 'system', content: request.system },
      ...request.messages.map((m) => this.toOpenAIMessage(m)),
    ];

    const params: Record<string, unknown> = {
      model: request.model,
      messages,
      max_completion_tokens: request.max_tokens,
      temperature: request.temperature,
    };

    // GPT-5.2+: reasoning_effort is a top-level parameter
    // Default for GPT-5.2 is 'none' — must be explicitly set for reasoning
    if (request.reasoning && request.reasoning.effort !== 'none') {
      params.reasoning_effort = request.reasoning.effort;
    }

    // Map tool definitions to OpenAI format
    if (request.tools && request.tools.length > 0) {
      params.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      if (request.tool_choice) {
        if (typeof request.tool_choice === 'string') {
          params.tool_choice = request.tool_choice;
        } else {
          params.tool_choice = {
            type: 'function',
            function: { name: request.tool_choice.name },
          };
        }
      }
    }

    // Retry once on empty response (transient OpenAI issue)
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.chat.completions.create(
        params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
      );

      const choice = response.choices[0];
      const toolCalls = this.extractToolCalls(choice);
      const finishReason = this.mapFinishReason(choice?.finish_reason);

      // Tool-call response: model wants to call tools (may have no text content)
      if (toolCalls.length > 0) {
        return {
          content: choice?.message?.content ?? '',
          input_tokens: response.usage?.prompt_tokens ?? 0,
          output_tokens: response.usage?.completion_tokens ?? 0,
          model: response.model,
          tool_calls: toolCalls,
          finish_reason: 'tool_calls',
        };
      }

      // Text response
      if (choice?.message?.content) {
        return {
          content: choice.message.content,
          input_tokens: response.usage?.prompt_tokens ?? 0,
          output_tokens: response.usage?.completion_tokens ?? 0,
          model: response.model,
          finish_reason: finishReason,
        };
      }

      // finish_reason=length means the model exhausted max_completion_tokens
      // (reasoning used the entire budget). Don't retry — it will just happen again.
      if (choice?.finish_reason === 'length') {
        throw new Error(
          `Model exhausted token budget (all tokens used for reasoning, none left for output). ` +
          `Try increasing the token limit or reducing reasoning effort.`,
        );
      }

      // On first empty response (transient), retry once
      if (attempt === 0) {
        console.warn(
          `OpenAI returned empty response (finish_reason=${choice?.finish_reason}, ` +
          `refusal=${choice?.message?.refusal ?? 'none'}, ` +
          `choices=${response.choices.length}). Retrying...`,
        );
        continue;
      }

      // Second attempt also empty — throw with diagnostics
      throw new Error(
        `OpenAI returned empty response after retry ` +
        `(finish_reason=${choice?.finish_reason}, ` +
        `refusal=${choice?.message?.refusal ?? 'none'}, ` +
        `choices=${response.choices.length})`,
      );
    }

    // Unreachable, but TypeScript needs it
    throw new Error('OpenAI returned empty response');
  }

  /**
   * Convert our provider-agnostic message to OpenAI's format.
   */
  private toOpenAIMessage(msg: CompletionMessage): OpenAI.ChatCompletionMessageParam {
    // Tool result message
    if (msg.role === 'tool') {
      const toolMsg = msg as ToolResultMessage;
      return {
        role: 'tool',
        tool_call_id: toolMsg.call_id,
        content: toolMsg.content,
      };
    }

    // Assistant message with tool calls
    if (msg.role === 'assistant' && 'tool_calls' in msg) {
      const assistantMsg = msg as AssistantToolCallMessage;
      return {
        role: 'assistant',
        content: assistantMsg.content ?? null,
        tool_calls: assistantMsg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    // Plain text message (user or assistant)
    return {
      role: msg.role as 'user' | 'assistant',
      content: (msg as { content: string }).content,
    };
  }

  /**
   * Extract tool calls from an OpenAI choice, parsing JSON arguments.
   */
  private extractToolCalls(
    choice?: OpenAI.ChatCompletion.Choice,
  ): ToolCall[] {
    const rawCalls = choice?.message?.tool_calls;
    if (!rawCalls || rawCalls.length === 0) return [];

    return rawCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.safeParseArgs(tc.function.arguments),
    }));
  }

  /**
   * Parse tool call arguments, returning empty object on failure.
   */
  private safeParseArgs(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw);
    } catch {
      console.warn(`Failed to parse tool call arguments: ${raw}`);
      return {};
    }
  }

  /**
   * Map OpenAI finish_reason to our normalized enum.
   */
  private mapFinishReason(
    reason?: string | null,
  ): 'stop' | 'tool_calls' | 'length' {
    if (reason === 'tool_calls') return 'tool_calls';
    if (reason === 'length') return 'length';
    return 'stop';
  }
}
