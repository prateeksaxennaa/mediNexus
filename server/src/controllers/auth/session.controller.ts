import type { Request, Response, NextFunction, CookieOptions } from 'express';
import { supabaseAdmin, supabaseAnon, createUserClient } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, UnauthorizedError } from '../../utils/errors.js';
import type { AppMetadata, UserRole } from '../../types/auth.types.js';
import type { LoginBody } from '../../validators/auth/login.validator.js';
import { env } from '../../config/env.js';

// ─── Cookie helpers ───────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Base cookie options shared by both auth cookies. */
function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * Sets both auth cookies on the response.
 * `expires_at` is a Unix timestamp (seconds); maxAge is derived from it.
 */
export function setAuthCookies(
  res: Response,
  access_token: string,
  refresh_token: string,
  expires_at: number | null | undefined,
): void {
  const accessMaxAge =
    expires_at != null
      ? Math.max(0, expires_at * 1000 - Date.now())
      : 60 * 60 * 1000; // fallback: 1 hour

  res.cookie('mdn_access_token', access_token, {
    ...baseCookieOptions(),
    maxAge: accessMaxAge,
  });

  res.cookie('mdn_refresh_token', refresh_token, {
    ...baseCookieOptions(),
    maxAge: THIRTY_DAYS_MS,
  });
}

/** Clears both auth cookies. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('mdn_access_token', baseCookieOptions());
  res.clearCookie('mdn_refresh_token', baseCookieOptions());
}

// ─── Login ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 *
 * Unified login for patient, hospital_admin, and doctor.
 * Accepts email+password OR phone+password.
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, phone, password } = req.body as LoginBody;

    const signInPayload = email ? { email, password } : { phone: phone as string, password };

    const { data: sessionData, error: signInError } = await supabaseAnon.auth.signInWithPassword(
      signInPayload
    );

    if (signInError || !sessionData.session || !sessionData.user) {
      if (signInError) {
        console.error('[auth/login] Supabase auth error:', signInError.message, signInError.status);
      }
      throw new UnauthorizedError(signInError?.message || 'Invalid credentials');
    }

    const user = sessionData.user;
    const session = sessionData.session;
    const appMeta = user.app_metadata as AppMetadata | undefined;
    const role: UserRole | undefined = appMeta?.role;

    setAuthCookies(res, session.access_token, session.refresh_token, session.expires_at);

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          role: role ?? null,
        },
      },
      'Login successful'
    );
  } catch (err) {
    next(err);
  }
}

// ─── Refresh token ───────────────────────────────────────────────────

/**
 * POST /api/auth/refresh
 *
 * Reads the refresh_token from the httpOnly cookie and exchanges it for
 * a new access_token + refresh_token pair, then sets new cookies.
 */
export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refresh_token =
      (req.cookies as Record<string, string | undefined>)['mdn_refresh_token'];

    if (!refresh_token) {
      throw new UnauthorizedError('Missing refresh token');
    }

    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
      clearAuthCookies(res);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    setAuthCookies(
      res,
      data.session.access_token,
      data.session.refresh_token,
      data.session.expires_at
    );

    sendSuccess(res, null, 'Token refreshed successfully');
  } catch (err) {
    next(err);
  }
}

// ─── Logout ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 *
 * Invalidates the current session (reads access token from cookie).
 * Uses a user-scoped client so only the caller's session is revoked.
 */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.cookies as Record<string, string | undefined>)['mdn_access_token'];

    if (token) {
      const userClient = createUserClient(token);
      await userClient.auth.signOut();
    }

    clearAuthCookies(res);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

// ─── Get current user ────────────────────────────────────────────────

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user along with their role-specific profile.
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const appMeta = user.app_metadata as AppMetadata | undefined;
    const role = appMeta?.role;

    if (!role) {
      throw new AppError('User has no assigned role', 500);
    }

    let profile: Record<string, unknown> | null = null;

    if (role === 'patient') {
      const { data } = await supabaseAdmin
        .from('patients')
        .select('id, full_name, email, phone_number, dob, blood_group, language_preference')
        .eq('user_id', user.id)
        .single();
      profile = data ?? null;
    } else if (role === 'hospital_admin') {
      const { data } = await supabaseAdmin
        .from('hospitals')
        .select('id, name, type, city, state, is_approved')
        .eq('admin_id', user.id)
        .single();
      profile = data ?? null;
    } else if (role === 'doctor') {
      const { data } = await supabaseAdmin
        .from('doctors')
        .select('id, full_name, specialisation, hospital_id, verified')
        .eq('user_id', user.id)
        .single();
      profile = data ?? null;
    }

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          role,
        },
        profile,
      },
      'User fetched successfully'
    );
  } catch (err) {
    next(err);
  }
}
