/**
 * API Client with JWT refresh
 *
 * Handles authentication and automatic token refresh.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const client = axios.create({
  baseURL: '/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Token storage keys
const TOKEN_KEY = 'cortex_access_token';
const REFRESH_KEY = 'cortex_refresh_token';

// Token helpers
export const getAccessToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_KEY);

export const setTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
};

export const clearTokens = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

// Logout callback — set by auth store to break circular dependency
let onForceLogout: (() => void) | null = null;
export const setForceLogoutHandler = (handler: () => void): void => {
  onForceLogout = handler;
};

// Request interceptor: Add Authorization header
client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Handle 401 with token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null): void => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401 errors
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Queue requests while refreshing
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(client(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token');
      }

      // Use a fresh axios instance to avoid interceptors
      const response = await axios.post('/v1/auth/refresh', {
        refresh_token: refreshToken,
      });

      const { access_token } = response.data.data;
      setTokens(access_token, refreshToken);
      processQueue(null, access_token);

      originalRequest.headers.Authorization = `Bearer ${access_token}`;
      return client(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);
      if (onForceLogout) {
        onForceLogout();
      } else {
        clearTokens();
      }
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default client;
