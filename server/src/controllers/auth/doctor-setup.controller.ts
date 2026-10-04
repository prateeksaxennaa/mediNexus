import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, supabaseAnon } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, ForbiddenError } from '../../utils/errors.js';
import type { AppMetadata } from '../../types/auth.types.js';
import type { DoctorSetupBody } from '../../validators/auth/doctor-setup.validator.js';
import { setAuthCookies } from './session.controller.js';

/**
 * POST /api/auth/doctor/setup
 *
 * Called by a doctor who clicked the invite email link.
 * The frontend extracts the access_token from the URL hash (#access_token=...)
 * and passes it as a Bearer token.
 *
 * Flow:
 *  1. authenticate middleware validates the invite token + sets req.user
 *  2. Confirm the user's role is 'doctor'
 *  3. Set the new password via admin updateUserById
 *  4. Update the doctor profile row with all submitted fields + mark verified: true
 *  5. Sign in with email+password to return a fresh permanent session
 */
export async function doctorSetup(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = req.user;
    if (!user) throw new AppError('Authenticated user not found', 401);

    // ── 1. Role guard ─────────────────────────────────────────────
    const appMeta = user.app_metadata as AppMetadata | undefined;
    if (appMeta?.role !== 'doctor') {
      throw new ForbiddenError('Only invited doctors can call this endpoint');
    }

    const {
      password,
      full_name,
      specialisation,
      department,
      qualifications,
      registration_number,
      experience_years,
      consultation_fee,
      bio,
      available_from,
      available_to,
      slot_duration_mins,
    } = req.body as DoctorSetupBody;

    // ── 2. Set password ───────────────────────────────────────────
    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    });

    if (passwordError) {
      throw new AppError(`Failed to set password: ${passwordError.message}`, 500);
    }

    // ── 3. Update doctor profile with all fields + verify ─────────
    const profileUpdate = {
      verified: true,
      full_name,
      specialisation,
      department,
      qualifications,
      registration_number,
      experience_years,
      consultation_fee,
      bio: bio ?? null,
      available_from,
      available_to,
      slot_duration_mins,
    };

    const { error: profileError } = await supabaseAdmin
      .from('doctors')
      .update(profileUpdate)
      .eq('user_id', user.id);

    if (profileError) {
      console.error('[doctorSetup] doctor profile update failed:', profileError.message);
      throw new AppError(`Failed to update doctor profile: ${profileError.message}`, 500);
    }

    // ── 4. Fetch email for sign-in ────────────────────────────────
    const { data: userData, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(
      user.id
    );

    if (fetchError || !userData.user?.email) {
      throw new AppError('Unable to retrieve doctor email for sign-in', 500);
    }

    // ── 5. Sign in to return a fresh session ──────────────────────
    const { data: sessionData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: userData.user.email,
      password,
    });

    if (signInError || !sessionData.session) {
      throw new AppError(
        `Sign-in after setup failed: ${signInError?.message ?? 'No session returned'}`,
        500
      );
    }

    const session = sessionData.session;

    setAuthCookies(res, session.access_token, session.refresh_token, session.expires_at);

    // Return with user info; session tokens are now in httpOnly cookies
    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: userData.user.email,
          role: 'doctor',
        },
      },
      'Doctor account setup complete',
      200
    );
  } catch (err) {
    next(err);
  }
}
