/**
 * Auth Tests
 *
 * Tests for authentication endpoints.
 */

import { describe, it, expect } from 'vitest';
import { loginSchema, refreshTokenSchema, createApiKeySchema } from '@cortex/shared';

describe('Auth Schemas', () => {
  describe('loginSchema', () => {
    it('accepts valid credentials', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('accepts valid refresh token', () => {
      const result = refreshTokenSchema.safeParse({
        refresh_token: 'some-refresh-token',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing refresh token', () => {
      const result = refreshTokenSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('createApiKeySchema', () => {
    it('accepts valid name', () => {
      const result = createApiKeySchema.safeParse({
        name: 'my-api-key',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = createApiKeySchema.safeParse({
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects name exceeding max length', () => {
      const result = createApiKeySchema.safeParse({
        name: 'a'.repeat(256),
      });
      expect(result.success).toBe(false);
    });
  });
});
