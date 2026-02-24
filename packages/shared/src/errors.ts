export const ErrorCode = {
  // Auth errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  FORBIDDEN: 'FORBIDDEN',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONTENT_BLOCKED: 'CONTENT_BLOCKED',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // Server errors
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  meta: {
    request_id: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  static authRequired(message = 'Authentication required'): AppError {
    return new AppError(ErrorCode.AUTH_REQUIRED, message, 401);
  }

  static authInvalid(message = 'Invalid or expired token'): AppError {
    return new AppError(ErrorCode.AUTH_INVALID, message, 401);
  }

  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404);
  }

  static conflict(message: string): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409);
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static contentBlocked(message = 'Content contains blocked patterns'): AppError {
    return new AppError(ErrorCode.CONTENT_BLOCKED, message, 400);
  }

  static rateLimited(message = 'Too many requests'): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, message, 429);
  }

  static serverError(message = 'Internal server error'): AppError {
    return new AppError(ErrorCode.SERVER_ERROR, message, 500);
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
