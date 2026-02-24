/**
 * Auth Hooks
 */

import { useMutation } from '@tanstack/react-query';
import client from '../client';
import { useAuthStore, type User } from '../../store/auth.store';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  data: {
    access_token: string;
    refresh_token: string;
    user: User;
  };
}

export function useLogin() {
  const login = useAuthStore((state) => state.login);

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await client.post<LoginResponse>('/auth/login', credentials);
      return response.data.data;
    },
    onSuccess: (data) => {
      login(data.user, data.access_token, data.refresh_token);
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((state) => state.logout);

  return useMutation({
    mutationFn: async () => {
      await client.post('/auth/logout');
    },
    onSettled: () => {
      logout();
    },
  });
}
