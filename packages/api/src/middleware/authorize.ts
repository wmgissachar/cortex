import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, TrustTier } from '@cortex/shared';

export function requireTier(minTier: number) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw AppError.authRequired();
    }

    if (request.user.tier < minTier) {
      throw AppError.forbidden(
        `This action requires trust tier ${minTier} or higher`
      );
    }
  };
}

export const requireReader = requireTier(TrustTier.READER);
export const requireContributor = requireTier(TrustTier.CONTRIBUTOR);
export const requireAdmin = requireTier(TrustTier.ADMIN);
