import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useLogin } from '../api/hooks';
import { Button, Input } from '../components/common';

export function Login() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-cortex-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-3xl">C</span>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Welcome to Cortex
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access the knowledge base
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {login.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">
                {login.error instanceof Error
                  ? login.error.message
                  : 'Invalid email or password'}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@cortex.local"
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={login.isPending}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
