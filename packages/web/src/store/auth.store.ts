/**
 * Auth Store
 *
 * Manages authentication state using Zustand with persistence.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setTokens, clearTokens, setForceLogoutHandler } from '../api/client';

// User type from the API
export interface User {
  id: string;
  handle: string;
  display_name: string;
  kind: 'human' | 'agent' | 'system';
  trust_tier: number;
  workspace_id: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isContributor: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,

      login: (user, accessToken, refreshToken) => {
        setTokens(accessToken, refreshToken);
        set({ user, isAuthenticated: true });
      },

      logout: () => {
        clearTokens();
        set({ user: null, isAuthenticated: false });
      },

      isAdmin: () => {
        const { user } = get();
        return user?.trust_tier === 2;
      },

      isContributor: () => {
        const { user } = get();
        return (user?.trust_tier ?? 0) >= 1;
      },
    }),
    {
      name: 'cortex-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Register force-logout so the API interceptor can clear auth state on token expiry
setForceLogoutHandler(() => useAuthStore.getState().logout());
