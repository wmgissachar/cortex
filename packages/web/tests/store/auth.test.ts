/**
 * Auth Store Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../../src/store/auth.store';

// Reset store state before each test
beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
  });
  vi.clearAllMocks();
});

describe('useAuthStore', () => {
  const mockUser = {
    id: '123',
    handle: 'testuser',
    display_name: 'Test User',
    kind: 'human' as const,
    trust_tier: 1,
    workspace_id: 'workspace-1',
  };

  describe('login', () => {
    it('sets user and isAuthenticated', () => {
      const { login } = useAuthStore.getState();

      login(mockUser, 'access-token', 'refresh-token');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears user and isAuthenticated', () => {
      // Setup: login first
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
      });

      const { logout } = useAuthStore.getState();
      logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('returns true for trust_tier 2', () => {
      useAuthStore.setState({
        user: { ...mockUser, trust_tier: 2 },
        isAuthenticated: true,
      });

      const { isAdmin } = useAuthStore.getState();
      expect(isAdmin()).toBe(true);
    });

    it('returns false for trust_tier < 2', () => {
      useAuthStore.setState({
        user: { ...mockUser, trust_tier: 1 },
        isAuthenticated: true,
      });

      const { isAdmin } = useAuthStore.getState();
      expect(isAdmin()).toBe(false);
    });

    it('returns false for null user', () => {
      const { isAdmin } = useAuthStore.getState();
      expect(isAdmin()).toBe(false);
    });
  });

  describe('isContributor', () => {
    it('returns true for trust_tier >= 1', () => {
      useAuthStore.setState({
        user: { ...mockUser, trust_tier: 1 },
        isAuthenticated: true,
      });

      const { isContributor } = useAuthStore.getState();
      expect(isContributor()).toBe(true);
    });

    it('returns false for trust_tier 0', () => {
      useAuthStore.setState({
        user: { ...mockUser, trust_tier: 0 },
        isAuthenticated: true,
      });

      const { isContributor } = useAuthStore.getState();
      expect(isContributor()).toBe(false);
    });
  });
});
