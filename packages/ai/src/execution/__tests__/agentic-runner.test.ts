/**
 * Unit tests for the agentic execution runner.
 *
 * Uses mock provider and tools to test the tool-call loop in isolation.
 * Run with: npx tsx --test packages/ai/src/execution/__tests__/agentic-runner.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAgenticRunner } from '../agentic-runner.js';
import type { AgenticRunner, AgenticRunnerDeps } from '../agentic-runner.js';
import type { LLMProvider, CompletionRequest, CompletionResponse } from '../../providers/types.js';
import type { Tool } from '../../tools/types.js';
import type { JobStore } from '../runner.js';
import type { PersonaConfig } from '../../personas/types.js';
import { CircuitBreaker } from '../circuit-breaker.js';
import { CascadeGuard } from '../cascade.js';
import { TokenBudgetManager } from '../../telemetry/usage.js';
import type { UsageStore, CascadeStore } from '../../index.js';

// ── Mock helpers ───────────────────────────────────────────────────

function textResponse(content: string, tokens = 100): CompletionResponse {
  return {
    content,
    input_tokens: tokens,
    output_tokens: tokens,
    model: 'mock-model',
    finish_reason: 'stop',
  };
}

function toolCallResponse(
  calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  tokens = 100,
): CompletionResponse {
  return {
    content: '',
    input_tokens: tokens,
    output_tokens: tokens,
    model: 'mock-model',
    tool_calls: calls,
    finish_reason: 'tool_calls',
  };
}

class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private responses: CompletionResponse[];
  private callIndex = 0;
  public calls: CompletionRequest[] = [];

  constructor(responses: CompletionResponse[]) {
    this.responses = responses;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(request);
    const response = this.responses[this.callIndex];
    if (!response) throw new Error(`MockProvider: no response for call #${this.callIndex}`);
    this.callIndex++;
    return response;
  }
}

function createMockTool(name: string, handler: (args: Record<string, unknown>) => Promise<string>): Tool {
  return {
    definition: {
      name,
      description: `Mock tool: ${name}`,
      parameters: { type: 'object', properties: {}, required: [] },
    },
    execute: handler,
  };
}

const MOCK_PERSONA: PersonaConfig = {
  name: 'scribe',
  display_name: 'Mock',
  description: 'Test persona',
  system_prompt: 'You are a test assistant.',
  default_model: 'mock-model',
  default_reasoning_effort: 'none',
  default_max_tokens: 4000,
  rate_limit_per_hour: 100,
  daily_token_limit: 1_000_000,
  features: ['test'],
};

function createMockDeps(provider: LLMProvider): AgenticRunnerDeps {
  const jobStore: JobStore = {
    createJob: async () => ({ id: 'job-001' }),
    updateJobStatus: async () => {},
  };

  const cascadeStore: CascadeStore = {
    getTriggerTags: async () => [],
    getParentJobDepth: async () => 0,
    countRecentJobs: async () => 0,
  };

  const usageStore: UsageStore = {
    getDailyTokenUsage: async () => 0,
    getMonthlySpend: async () => 0,
    getWorkspaceConfig: async () => ({ enabled: true, monthly_budget_usd: 100 }),
    recordUsage: async () => {},
  };

  return {
    provider,
    circuitBreaker: new CircuitBreaker(),
    cascadeGuard: new CascadeGuard(cascadeStore),
    budgetManager: new TokenBudgetManager(usageStore, { test: 100000 }, { scribe: 1_000_000 }),
    jobStore,
    getPersona: () => MOCK_PERSONA,
    pricing: { 'mock-model': { input: 0.001, output: 0.002 } },
    featureTokenLimits: { test: 100000 },
  };
}

function baseRequest(tools: Tool[]) {
  return {
    workspaceId: 'ws-001',
    persona: 'scribe' as const,
    feature: 'test',
    targetId: 'target-001',
    context: 'Test context',
    tools,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AgenticRunner', () => {
  it('1. single-shot: no tool calls → returns text with iterations=1', async () => {
    const provider = new MockProvider([textResponse('Hello, world!')]);
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute(baseRequest([]));

    assert.equal(result.content, 'Hello, world!');
    assert.equal(result.iterations, 1);
    assert.equal(result.model, 'mock-model');
    assert.equal(provider.calls.length, 1);
  });

  it('2. one tool call: tool_call → execute → text response', async () => {
    const provider = new MockProvider([
      toolCallResponse([{ id: 'call-1', name: 'echo', arguments: { msg: 'hi' } }]),
      textResponse('Echo result: hi'),
    ]);

    const echoTool = createMockTool('echo', async (args) => `Echoed: ${args.msg}`);
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute(baseRequest([echoTool]));

    assert.equal(result.content, 'Echo result: hi');
    assert.equal(result.iterations, 2);
    assert.equal(provider.calls.length, 2);

    // Verify the second call includes tool result messages
    const secondCall = provider.calls[1];
    const toolMsg = secondCall.messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg, 'Should have a tool result message');
    assert.equal((toolMsg as { content: string }).content, 'Echoed: hi');
  });

  it('3. multi-tool parallel: 3 tool calls at once → all execute', async () => {
    const provider = new MockProvider([
      toolCallResponse([
        { id: 'c1', name: 'tool_a', arguments: {} },
        { id: 'c2', name: 'tool_b', arguments: {} },
        { id: 'c3', name: 'tool_c', arguments: {} },
      ]),
      textResponse('All three tools called'),
    ]);

    const toolA = createMockTool('tool_a', async () => 'Result A');
    const toolB = createMockTool('tool_b', async () => 'Result B');
    const toolC = createMockTool('tool_c', async () => 'Result C');
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute(baseRequest([toolA, toolB, toolC]));

    assert.equal(result.content, 'All three tools called');
    assert.equal(result.iterations, 2);

    // Verify all 3 tool results in the second call
    const toolMsgs = provider.calls[1].messages.filter((m) => m.role === 'tool');
    assert.equal(toolMsgs.length, 3);
  });

  it('4. max iterations: always returns tool_calls → synthesis pass at limit', async () => {
    const infiniteToolCalls = Array.from({ length: 5 }, () =>
      toolCallResponse([{ id: `call-${Math.random()}`, name: 'echo', arguments: {} }]),
    );
    // After 3 tool-call iterations, the runner forces a synthesis call without tools
    const provider = new MockProvider([
      ...infiniteToolCalls.slice(0, 3),
      textResponse('Synthesized from gathered data'),
    ]);

    const echoTool = createMockTool('echo', async () => 'result');
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute({
      ...baseRequest([echoTool]),
      agenticConfig: { max_iterations: 3 },
    });

    assert.equal(result.iterations, 4); // 3 tool iterations + 1 synthesis
    assert.equal(result.content, 'Synthesized from gathered data');
    assert.equal(provider.calls.length, 4); // 3 tool + 1 synthesis

    // The synthesis call should have no tools
    const synthesisCall = provider.calls[3];
    assert.equal(synthesisCall.tools, undefined, 'Synthesis call should have no tools');
  });

  it('5. tool error: tool throws → error sent back to LLM', async () => {
    const provider = new MockProvider([
      toolCallResponse([{ id: 'c1', name: 'failing_tool', arguments: {} }]),
      textResponse('I see the tool failed'),
    ]);

    const failingTool = createMockTool('failing_tool', async () => {
      throw new Error('Database connection failed');
    });
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute(baseRequest([failingTool]));

    assert.equal(result.content, 'I see the tool failed');

    // Check the error was sent back as a tool result
    const toolMsg = provider.calls[1].messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg);
    assert.ok(
      (toolMsg as { content: string }).content.includes('Database connection failed'),
      'Error message should be passed back to the model',
    );
  });

  it('6. tool timeout: slow tool → timeout error', async () => {
    const provider = new MockProvider([
      toolCallResponse([{ id: 'c1', name: 'slow_tool', arguments: {} }]),
      textResponse('Tool timed out'),
    ]);

    const slowTool = createMockTool('slow_tool', async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return 'never returned';
    });
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute({
      ...baseRequest([slowTool]),
      agenticConfig: { tool_timeout_ms: 50 },
    });

    assert.equal(result.content, 'Tool timed out');

    const toolMsg = provider.calls[1].messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg);
    assert.ok(
      (toolMsg as { content: string }).content.includes('timed out'),
      'Timeout error should be sent back',
    );
  });

  it('7. unknown tool: LLM calls tool not in registry → error message', async () => {
    const provider = new MockProvider([
      toolCallResponse([{ id: 'c1', name: 'nonexistent', arguments: {} }]),
      textResponse('I see that tool does not exist'),
    ]);

    const runner = createAgenticRunner(createMockDeps(provider));
    const result = await runner.execute(baseRequest([]));

    assert.equal(result.content, 'I see that tool does not exist');

    const toolMsg = provider.calls[1].messages.find((m) => m.role === 'tool');
    assert.ok(toolMsg);
    assert.ok(
      (toolMsg as { content: string }).content.includes('Unknown tool'),
    );
  });

  it('8. token accumulation: 3 iterations → total = sum', async () => {
    const provider = new MockProvider([
      toolCallResponse([{ id: 'c1', name: 'echo', arguments: {} }], 200),
      toolCallResponse([{ id: 'c2', name: 'echo', arguments: {} }], 300),
      textResponse('done', 150),
    ]);

    const echoTool = createMockTool('echo', async () => 'ok');
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute(baseRequest([echoTool]));

    assert.equal(result.iterations, 3);
    // Each response has tokens for both input and output (same value in our mock)
    assert.equal(result.inputTokens, 200 + 300 + 150);
    assert.equal(result.outputTokens, 200 + 300 + 150);
  });

  it('9. trace mode: records tool call details', async () => {
    const provider = new MockProvider([
      toolCallResponse([
        { id: 'c1', name: 'tool_a', arguments: { q: 'test' } },
        { id: 'c2', name: 'tool_b', arguments: {} },
      ]),
      textResponse('done'),
    ]);

    const toolA = createMockTool('tool_a', async () => 'Result from A');
    const toolB = createMockTool('tool_b', async () => 'Result from B');
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute({
      ...baseRequest([toolA, toolB]),
      agenticConfig: { trace: true },
    });

    assert.ok(result.trace, 'Trace should be present');
    assert.equal(result.trace!.length, 2);

    const traceA = result.trace!.find((t) => t.tool_name === 'tool_a');
    assert.ok(traceA);
    assert.equal(traceA.iteration, 1);
    assert.deepEqual(traceA.arguments, { q: 'test' });
    assert.ok(traceA.result_preview.includes('Result from A'));
    assert.equal(traceA.is_error, false);
    assert.ok(traceA.duration_ms >= 0);

    const traceB = result.trace!.find((t) => t.tool_name === 'tool_b');
    assert.ok(traceB);
    assert.equal(traceB.is_error, false);
  });

  it('trace mode disabled: no trace in result', async () => {
    const provider = new MockProvider([
      toolCallResponse([{ id: 'c1', name: 'echo', arguments: {} }]),
      textResponse('done'),
    ]);

    const echoTool = createMockTool('echo', async () => 'ok');
    const runner = createAgenticRunner(createMockDeps(provider));

    const result = await runner.execute({
      ...baseRequest([echoTool]),
      agenticConfig: { trace: false },
    });

    assert.equal(result.trace, undefined);
  });
});
