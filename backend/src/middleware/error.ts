import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/api-error.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

/** Unknown keys mean a client tried to set a server-assigned field such as `role`. */
function isUnrecognizedKeys(error: ZodError): boolean {
  return error.issues.some((issue) => issue.code === 'unrecognized_keys');
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const unknownKeys = isUnrecognizedKeys(err);
    res.status(400).json({
      success: false,
      error: {
        code: unknownKeys ? 'FIELD_NOT_ALLOWED' : 'VALIDATION_FAILED',
        message: unknownKeys
          ? 'Request contains fields that are assigned by the server'
          : 'Validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');

  // Never leak an internal message or stack to the client in production.
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      ...(isProduction ? {} : { detail: err instanceof Error ? err.message : String(err) }),
    },
  });
}
