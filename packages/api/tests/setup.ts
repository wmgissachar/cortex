/**
 * Test Setup
 *
 * Configures test environment and provides helpers.
 */

import { beforeAll, afterAll, beforeEach } from 'vitest';

// Use test database if available
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

// Prevent tests from starting actual server
process.env.NODE_ENV = 'test';

beforeAll(async () => {
  // Setup code that runs once before all tests
});

afterAll(async () => {
  // Cleanup code that runs once after all tests
});

beforeEach(async () => {
  // Cleanup code that runs before each test
});
