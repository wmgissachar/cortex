/**
 * Live smoke test for the agentic runner against the OpenAI API.
 *
 * Tests that tool-calling works end-to-end with real API responses.
 * Run: npx tsx packages/ai/scripts/test-agentic.ts
 *
 * Requires OPENAI_KEY environment variable (reads from ../../.env if present).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load .env manually (dotenv not available in AI package)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../../.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch { /* .env not found, rely on env vars */ }

import { OpenAIProvider } from '../src/providers/openai.js';
import { createAgenticRunner } from '../src/execution/agentic-runner.js';
import { CircuitBreaker } from '../src/execution/circuit-breaker.js';
import { CascadeGuard } from '../src/execution/cascade.js';
import { TokenBudgetManager } from '../src/telemetry/usage.js';
import type { Tool } from '../src/tools/types.js';
import type { JobStore } from '../src/execution/runner.js';
import type { CascadeStore, UsageStore } from '../src/index.js';
import type { PersonaConfig } from '../src/personas/types.js';

// ── Tools ──────────────────────────────────────────────────────────

const getCurrentTime: Tool = {
  definition: {
    name: 'get_current_time',
    description: 'Returns the current date and time in ISO 8601 format.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  execute: async () => new Date().toISOString(),
};

const addNumbers: Tool = {
  definition: {
    name: 'add_numbers',
    description: 'Adds two numbers together and returns the result.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
  },
  execute: async (args) => {
    const a = Number(args.a);
    const b = Number(args.b);
    return String(a + b);
  },
};

// ── Setup ──────────────────────────────────────────────────────────

const apiKey = process.env.OPENAI_KEY;
if (!apiKey) {
  console.error('OPENAI_KEY not set. Set it in .env or as environment variable.');
  process.exit(1);
}

const provider = new OpenAIProvider(apiKey);

const persona: PersonaConfig = {
  name: 'scribe',
  display_name: 'Test Agent',
  description: 'Smoke test agent',
  system_prompt: 'You are a helpful assistant. Use the available tools to answer questions. Always call tools when they can help answer the question.',
  default_model: 'gpt-4o-mini',
  default_reasoning_effort: 'none',
  default_max_tokens: 2000,
  rate_limit_per_hour: 100,
  daily_token_limit: 1_000_000,
  features: ['test'],
};

const jobStore: JobStore = {
  createJob: async () => ({ id: `smoke-${Date.now()}` }),
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

const runner = createAgenticRunner({
  provider,
  circuitBreaker: new CircuitBreaker(),
  cascadeGuard: new CascadeGuard(cascadeStore),
  budgetManager: new TokenBudgetManager(usageStore, { test: 16000 }, { scribe: 1_000_000 }),
  jobStore,
  getPersona: () => persona,
  pricing: {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  },
  featureTokenLimits: { test: 2000 },
});

// ── Run test ───────────────────────────────────────────────────────

async function main() {
  console.log('=== Agentic Runner Smoke Test ===\n');
  console.log('Sending: "What time is it right now, and what is 42 + 58?"');
  console.log('Tools: get_current_time, add_numbers\n');

  const start = Date.now();

  const result = await runner.execute({
    workspaceId: 'smoke-test',
    persona: 'scribe',
    feature: 'test',
    targetId: 'smoke-test',
    context: 'What time is it right now, and what is 42 + 58?',
    tools: [getCurrentTime, addNumbers],
    agenticConfig: { max_iterations: 5, trace: true },
  });

  const elapsed = Date.now() - start;

  console.log('--- Response ---');
  console.log(result.content);
  console.log('\n--- Metrics ---');
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Input tokens: ${result.inputTokens}`);
  console.log(`Output tokens: ${result.outputTokens}`);
  console.log(`Cost: $${result.costUsd.toFixed(6)}`);
  console.log(`Model: ${result.model}`);
  console.log(`Elapsed: ${elapsed}ms`);

  if (result.trace && result.trace.length > 0) {
    console.log('\n--- Tool Call Trace ---');
    for (const entry of result.trace) {
      console.log(`  [iter ${entry.iteration}] ${entry.tool_name}(${JSON.stringify(entry.arguments)}) → ${entry.result_preview} (${entry.duration_ms}ms, error=${entry.is_error})`);
    }
  }

  // Basic assertions
  const hasTime = result.trace?.some((t) => t.tool_name === 'get_current_time');
  const hasAdd = result.trace?.some((t) => t.tool_name === 'add_numbers');
  const mentions100 = result.content.includes('100');

  console.log('\n--- Assertions ---');
  console.log(`Tool get_current_time called: ${hasTime ? 'PASS' : 'FAIL'}`);
  console.log(`Tool add_numbers called: ${hasAdd ? 'PASS' : 'FAIL'}`);
  console.log(`Response mentions 100: ${mentions100 ? 'PASS' : 'FAIL'}`);
  console.log(`Iterations > 1: ${result.iterations > 1 ? 'PASS' : 'FAIL'}`);

  const allPassed = hasTime && hasAdd && mentions100 && result.iterations > 1;
  console.log(`\n${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
