#!/usr/bin/env node
// Wrapper that ensures env vars are set before loading the MCP server.
// CORTEX_API_URL and CORTEX_API_KEY should be provided via .mcp.json env config.
// Run setup.ps1 to generate .mcp.json with a fresh API key.
process.env.CORTEX_API_URL = process.env.CORTEX_API_URL || 'http://localhost:3000/v1';

if (!process.env.CORTEX_API_KEY) {
  console.error('CORTEX_API_KEY is not set. Run setup.ps1 or create an API key manually.');
  console.error('See README.md for instructions.');
  process.exit(1);
}

import('./dist/index.js');
