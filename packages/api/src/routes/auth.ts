import type { FastifyInstance } from 'fastify';
import { AppError, loginSchema, refreshTokenSchema, createApiKeySchema } from '@cortex/shared';
import { verifyPassword, hashPassword, generateApiKey, hashApiKey } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  getExpirationDate,
} from '../utils/jwt.js';
import db from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';

interface PrincipalRow {
  id: string;
  workspace_id: string;
  kind: string;
  handle: string;
  display_name: string;
  trust_tier: number;
  password_hash: string | null;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /login - Email/password login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    // Find user by email
    const { rows } = await db.query<PrincipalRow>(
      `SELECT id, workspace_id, kind, handle, display_name, trust_tier, password_hash
       FROM principals
       WHERE email = $1 AND kind = 'human'`,
      [body.email]
    );

    if (rows.length === 0) {
      throw AppError.authInvalid('Invalid email or password');
    }

    const user = rows[0];

    if (!user.password_hash) {
      throw AppError.authInvalid('Invalid email or password');
    }

    // Verify password
    const validPassword = await verifyPassword(user.password_hash, body.password);
    if (!validPassword) {
      throw AppError.authInvalid('Invalid email or password');
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      sub: user.id,
      workspace_id: user.workspace_id,
      kind: user.kind as 'human' | 'agent' | 'system',
      tier: user.trust_tier as 0 | 1 | 2,
    });

    const { token: refreshToken, jti } = generateRefreshToken(user.id);

    // Store refresh token
    await db.query(
      `INSERT INTO refresh_tokens (principal_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashRefreshToken(refreshToken), getExpirationDate('7d')]
    );

    // Update last active
    await db.query(
      `UPDATE principals SET last_active_at = NOW() WHERE id = $1`,
      [user.id]
    );

    return {
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 900, // 15 minutes in seconds
        user: {
          id: user.id,
          handle: user.handle,
          display_name: user.display_name,
          trust_tier: user.trust_tier,
        },
      },
      meta: { request_id: (request as unknown as { requestId: string }).requestId },
    };
  });

  // POST /logout - Revoke refresh token
  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);

    const tokenHash = hashRefreshToken(body.refresh_token);

    // Revoke the token
    await db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND principal_id = $2`,
      [tokenHash, request.user!.sub]
    );

    return {
      data: { success: true },
      meta: { request_id: (request as unknown as { requestId: string }).requestId },
    };
  });

  // POST /auth/refresh - Refresh access token
  app.post('/refresh', async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);

    // Verify the refresh token JWT
    let payload;
    try {
      payload = verifyRefreshToken(body.refresh_token);
    } catch {
      throw AppError.authInvalid('Invalid or expired refresh token');
    }

    const tokenHash = hashRefreshToken(body.refresh_token);

    // Check token in database
    const { rows: tokenRows } = await db.query<{ id: string; principal_id: string }>(
      `SELECT id, principal_id
       FROM refresh_tokens
       WHERE token_hash = $1
         AND expires_at > NOW()
         AND revoked_at IS NULL`,
      [tokenHash]
    );

    if (tokenRows.length === 0) {
      throw AppError.authInvalid('Invalid or expired refresh token');
    }

    // Get user info
    const { rows: userRows } = await db.query<PrincipalRow>(
      `SELECT id, workspace_id, kind, handle, display_name, trust_tier
       FROM principals
       WHERE id = $1`,
      [tokenRows[0].principal_id]
    );

    if (userRows.length === 0) {
      throw AppError.authInvalid('User not found');
    }

    const user = userRows[0];

    // Generate new access token
    const accessToken = generateAccessToken({
      sub: user.id,
      workspace_id: user.workspace_id,
      kind: user.kind as 'human' | 'agent' | 'system',
      tier: user.trust_tier as 0 | 1 | 2,
    });

    return {
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 900,
      },
      meta: { request_id: (request as unknown as { requestId: string }).requestId },
    };
  });

  // POST /api-keys - Create API key for agents
  app.post(
    '/api-keys',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const body = createApiKeySchema.parse(request.body);

      // Generate API key
      const apiKey = generateApiKey();
      const apiKeyHash = await hashApiKey(apiKey);

      // Create agent principal
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO principals (workspace_id, kind, handle, display_name, trust_tier, api_key_hash)
         VALUES ($1, 'agent', $2, $3, 1, $4)
         RETURNING id`,
        [
          request.user!.workspace_id,
          body.name.toLowerCase().replace(/\s+/g, '-'),
          body.name,
          apiKeyHash,
        ]
      );

      return {
        data: {
          id: rows[0].id,
          name: body.name,
          api_key: apiKey, // Only shown once!
          created_at: new Date().toISOString(),
        },
        meta: { request_id: (request as unknown as { requestId: string }).requestId },
      };
    }
  );
}
