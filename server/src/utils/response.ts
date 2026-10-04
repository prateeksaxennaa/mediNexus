import type { Response } from 'express';

// ─── Standard API envelope ───────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

// ─── Success helper ──────────────────────────────────────────────────

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200
): Response {
  const body: ApiResponse<T> = { success: true, message, data };
  return res.status(statusCode).json(body);
}

// ─── Error helper ────────────────────────────────────────────────────

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: unknown
): Response {
  const body: ApiResponse = { success: false, message, ...(errors !== undefined && { errors }) };
  return res.status(statusCode).json(body);
}
