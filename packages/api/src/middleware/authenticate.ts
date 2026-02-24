import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AppError } from '@cortex/shared';
import { verifyAccessToken, type JWTPayload } from '../utils/jwt.js';
import { verifyApiKey } from '../utils/password.js';
import db from '../db/index.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    throw AppError.authRequired();
  }

  // Check for Bearer token (JWT)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyAccessToken(token);
      request.user = payload;
      return;
    } catch (error) {
      throw AppError.authInvalid('Invalid or expired token');
    }
  }

  // Check for API key authentication (for agents)
  if (authHeader.startsWith('ApiKey ')) {
    const apiKey = authHeader.slice(7);

    // Find principal with matching API key
    const { rows } = await db.query<{
      id: string;
      workspace_id: string;
      kind: string;
      trust_tier: number;
      api_key_hash: string;
    }>(
      `SELECT id, workspace_id, kind, trust_tier, api_key_hash
       FROM principals
       WHERE api_key_hash IS NOT NULL`
    );

    for (const row of rows) {
      if (await verifyApiKey(row.api_key_hash, apiKey)) {
        request.user = {
          sub: row.id,
          workspace_id: row.workspace_id,
          kind: row.kind as JWTPayload['kind'],
          tier: row.trust_tier as JWTPayload['tier'],
        };

        // Update last_active_at
        await db.query(
          `UPDATE principals SET last_active_at = NOW() WHERE id = $1`,
          [row.id]
        );

        return;
      }
    }

    throw AppError.authInvalid('Invalid API key');
  }

  throw AppError.authRequired('Invalid authorization header format');
}

export function registerAuthPlugin(app: FastifyInstance): void {
  app.decorateRequest('user', null);
}
