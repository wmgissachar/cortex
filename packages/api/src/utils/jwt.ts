import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { TrustTier, PrincipalKind } from '@cortex/shared';

export interface JWTPayload {
  sub: string;           // Principal UUID
  tier: TrustTier;       // Trust tier
  kind: PrincipalKind;   // human | agent | system
  workspace_id: string;  // Workspace UUID
  iat?: number;          // Issued at
  exp?: number;          // Expires at
}

export interface RefreshTokenPayload {
  sub: string;           // Principal UUID
  jti: string;           // Token ID (for revocation)
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ACCESS_TOKEN_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES,
    algorithm: 'HS256',
  });
}

export function generateRefreshToken(principalId: string): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: principalId, jti } as RefreshTokenPayload,
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES, algorithm: 'HS256' }
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token);
    return decoded as JWTPayload | null;
  } catch {
    return null;
  }
}

// Hash refresh token for storage (simple SHA-256)
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getExpirationDate(expiresIn: string): Date {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiration format: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case 's':
      return new Date(now.getTime() + value * 1000);
    case 'm':
      return new Date(now.getTime() + value * 60 * 1000);
    case 'h':
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}
