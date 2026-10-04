import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';

/**
 * Global Express error handler. Must be registered LAST in app.ts
 * (after all routes) because Express identifies error handlers by
 * their 4-argument signature.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Known operational errors — safe to expose message to client
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors);
    return;
  }

  // Unexpected programming errors — log server-side, hide details from client
  if (env.NODE_ENV !== 'production') {
    console.error('[Unhandled Error]', err);
  }

  sendError(res, 'An unexpected internal error occurred', 500);
}
