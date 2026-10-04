import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import type { UserRole, AppMetadata } from '../types/auth.types.js';

// ─── JWT authentication ──────────────────────────────────────────────

/**
 * Validates the access token, trying sources in priority order:
 *   1. httpOnly cookie `mdn_access_token` (standard browser sessions)
 *   2. Authorization: Bearer header (doctor invite setup flow)
 *
 * Uses Supabase admin client (getUser introspects the JWT server-side).
 * Attaches the Supabase user to req.user on success.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try cookie first, then Authorization header as fallback
    const cookieToken = (req.cookies as Record<string, string | undefined>)['mdn_access_token'];
    const authHeader = req.headers['authorization'];

    let token: string | undefined;

    if (cookieToken) {
      token = cookieToken;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── RBAC guard ──────────────────────────────────────────────────────

/**
 * Factory that returns an Express middleware enforcing role-based access.
 * Call after authenticate() in a route chain.
 *
 * @example
 *   router.post('/invite', authenticate, requireRole('hospital_admin'), handler)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const appMeta = req.user?.app_metadata as AppMetadata | undefined;
    const role = appMeta?.role;

    if (!role || !roles.includes(role)) {
      next(
        new ForbiddenError(
          `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${role ?? 'none'}`
        )
      );
      return;
    }

    next();
  };
}
