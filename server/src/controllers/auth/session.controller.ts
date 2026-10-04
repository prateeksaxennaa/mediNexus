import type { Request, Response, NextFunction, CookieOptions } from 'express';
import { supabaseAdmin, supabaseAnon, createUserClient } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, UnauthorizedError, BadRequestError, NotFoundError } from '../../utils/errors.js';
import type { AppMetadata, UserRole } from '../../types/auth.types.js';
import type { LoginBody } from '../../validators/auth/login.validator.js';
import { env } from '../../config/env.js';
import { twilioClient } from '../whatsapp/whatsapp.controller.js';

interface OtpChallenge {
  code: string;
  hashedToken: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

const loginOtpStore = new Map<string, OtpChallenge>();

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

// ─── OTP Login ────────────────────────────────────────────────────────

/**
 * POST /api/auth/otp/send
 * Body: { identifier: string } (email or phone)
 */
export async function sendLoginOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawIdentifier = (req.body?.identifier ?? req.body?.email ?? req.body?.phone) as string | undefined;
    if (!rawIdentifier || typeof rawIdentifier !== 'string') {
      throw new BadRequestError('Email or phone number is required');
    }

    const cleanIdentifier = rawIdentifier.trim().toLowerCase();

    // 1. Resolve user email & phone from identifier
    let targetEmail: string | null = null;
    let targetPhone: string | null = null;

    if (cleanIdentifier.includes('@')) {
      targetEmail = cleanIdentifier;
      // Look up if they have a phone on file for WhatsApp OTP
      const { data: patient } = await supabaseAdmin.from('patients').select('phone_number').eq('email', targetEmail).maybeSingle();
      if (patient?.phone_number) targetPhone = patient.phone_number;
    } else {
      // It's a phone number (e.g. +91..., 9876...)
      targetPhone = cleanIdentifier.replace(/[^\d+]/g, '');
      if (!targetPhone.startsWith('+')) {
        targetPhone = `+91${targetPhone.replace(/^0+/, '')}`;
      }

      // Check patients
      const { data: patient } = await supabaseAdmin
        .from('patients')
        .select('email, phone_number')
        .or(`phone_number.eq.${targetPhone},phone_number.eq.${cleanIdentifier}`)
        .maybeSingle();

      if (patient?.email) {
        targetEmail = patient.email;
      } else {
        // Check auth.users
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        const match = userList?.users?.find(u => u.phone === targetPhone || u.phone === cleanIdentifier);
        if (match?.email) targetEmail = match.email;
      }
    }

    if (!targetEmail) {
      throw new NotFoundError('No user account found matching this email or phone number.');
    }

    // 2. Generate Supabase magiclink token
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[auth/sendLoginOtp] generateLink error:', linkError?.message);
      throw new AppError('Failed to generate verification session', 500);
    }

    // 3. Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    const challenge: OtpChallenge = {
      code: otpCode,
      hashedToken: linkData.properties.hashed_token,
      email: targetEmail,
      expiresAt,
      attempts: 0,
    };

    loginOtpStore.set(cleanIdentifier, challenge);
    loginOtpStore.set(targetEmail.toLowerCase(), challenge);

    console.log(`\n======================================================`);
    console.log(`[AUTH OTP] 🔑 Verification code for ${targetEmail}: ${otpCode}`);
    console.log(`======================================================\n`);

    // 4. Optionally dispatch via Twilio WhatsApp if a phone number exists
    if (targetPhone && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && !env.TWILIO_ACCOUNT_SID.includes('placeholder')) {
      try {
        const dest = targetPhone.startsWith('+') ? targetPhone : `+${targetPhone}`;
        await twilioClient.messages.create({
          from: env.TWILIO_WHATSAPP_FROM,
          to: `whatsapp:${dest}`,
          body: `Your mediNexus verification code is: ${otpCode}. Valid for 5 minutes. Do not share this code with anyone.`,
        });
        console.log(`[auth/sendLoginOtp] Sent WhatsApp OTP to ${dest}`);
      } catch (twErr: any) {
        console.warn('[auth/sendLoginOtp] Twilio WhatsApp notice:', twErr?.message);
      }
    }

    sendSuccess(
      res,
      {
        sent: true,
        identifier: cleanIdentifier,
        devOtp: env.NODE_ENV !== 'production' ? otpCode : undefined,
      },
      `Verification code sent to ${cleanIdentifier}`
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/verify
 * Body: { identifier: string, code: string }
 */
export async function verifyLoginOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawIdentifier = (req.body?.identifier ?? req.body?.email ?? req.body?.phone) as string | undefined;
    const rawCode = (req.body?.code ?? req.body?.otp) as string | undefined;

    if (!rawIdentifier || !rawCode) {
      throw new BadRequestError('Identifier and 6-digit OTP code are required');
    }

    const cleanIdentifier = rawIdentifier.trim().toLowerCase();
    const cleanCode = rawCode.trim();

    const challenge = loginOtpStore.get(cleanIdentifier);
    if (!challenge) {
      throw new BadRequestError('No OTP request found for this identifier or the code has expired. Please request a new code.');
    }

    if (Date.now() > challenge.expiresAt) {
      loginOtpStore.delete(cleanIdentifier);
      throw new BadRequestError('Verification code has expired. Please request a new code.');
    }

    challenge.attempts += 1;
    if (challenge.attempts > 5) {
      loginOtpStore.delete(cleanIdentifier);
      throw new AppError('Too many incorrect attempts. Please request a new code.', 429);
    }

    if (challenge.code !== cleanCode) {
      throw new UnauthorizedError('Invalid verification code. Please check and try again.');
    }

    // Verified! Now create the Supabase auth session using hashed_token
    const { data: sessionData, error: verifyError } = await supabaseAnon.auth.verifyOtp({
      token_hash: challenge.hashedToken,
      type: 'magiclink',
    });

    if (verifyError || !sessionData?.session || !sessionData?.user) {
      console.error('[auth/verifyLoginOtp] Supabase verifyOtp error:', verifyError?.message);
      throw new UnauthorizedError('Failed to establish authenticated session.');
    }

    // Clean up OTP store
    loginOtpStore.delete(cleanIdentifier);
    loginOtpStore.delete(challenge.email.toLowerCase());

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
      'OTP Login successful'
    );
  } catch (err) {
    next(err);
  }
}

