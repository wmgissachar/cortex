import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ErrorCode } from '@cortex/shared';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = (request as unknown as { requestId?: string }).requestId || 'unknown';

  // Handle AppError
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: error.toJSON(),
      meta: { request_id: requestId },
    });
    return;
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: {
          issues: error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      meta: { request_id: requestId },
    });
    return;
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    reply.status(400).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: error.message,
        details: { validation: error.validation },
      },
      meta: { request_id: requestId },
    });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error:', error);

  // Generic server error
  reply.status(500).send({
    error: {
      code: ErrorCode.SERVER_ERROR,
      message: 'Internal server error',
    },
    meta: { request_id: requestId },
  });
}
