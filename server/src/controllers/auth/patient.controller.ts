import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, supabaseAnon } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, ConflictError } from '../../utils/errors.js';
import type { RegisterPatientBody } from '../../validators/auth/patient.validator.js';
import { setAuthCookies } from './session.controller.js';

/**
 * POST /api/auth/patient/register
 *
 * Flow:
 *  1. Create Supabase auth user (admin API so we can set app_metadata.role)
 *  2. Insert patient profile row
 *  3. Sign in immediately to return a live session to the client
 *
 * If step 2 or 3 fail the auth user is deleted (best-effort rollback)
 * so we never leave orphaned auth rows.
 */
export async function registerPatient(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      email,
      phone,
      password,
      full_name,
      dob,
      blood_group,
      language_preference,
    } = req.body as RegisterPatientBody;

    // ── 1. Create auth user ──────────────────────────────────────────
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone,
      password,
      email_confirm: true,   // skip email confirmation for MVP
      phone_confirm: true,   // skip OTP confirmation for MVP
      app_metadata: { role: 'patient' },
      user_metadata: { full_name },
    });

    if (createError) {
      if (
        createError.message.toLowerCase().includes('already registered') ||
        createError.message.toLowerCase().includes('already exists') ||
        createError.message.toLowerCase().includes('duplicate')
      ) {
        throw new ConflictError('An account with this email or phone already exists');
      }
      throw new AppError(createError.message, 400);
    }

    const user = createData.user;
    if (!user) throw new AppError('Failed to create user account', 500);

    // ── 2. Insert patient profile ────────────────────────────────────
    const { error: profileError } = await supabaseAdmin.from('patients').insert({
      user_id: user.id,
      full_name,
      email: email ?? null,
      phone_number: phone ?? null,
      dob: dob ?? null,
      blood_group: blood_group ?? null,
      language_preference: language_preference ?? 'en',
    });

    if (profileError) {
      console.error('[registerPatient] profile insert failed:', profileError.message, profileError.details, profileError.hint);
      // Rollback — delete the orphaned auth user
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw new AppError(`Failed to create patient profile: ${profileError.message}`, 500);
    }

    // ── 3. Sign in to return a live session ──────────────────────────
    const signInPayload = email
      ? { email, password }
      : { phone: phone as string, password };

    const { data: sessionData, error: signInError } = await supabaseAnon.auth.signInWithPassword(
      signInPayload
    );

    if (signInError || !sessionData.session) {
      // Account was created but sign-in failed — client can log in manually
      throw new AppError(
        'Account created but automatic sign-in failed. Please log in manually.',
        500
      );
    }

    setAuthCookies(
      res,
      sessionData.session.access_token,
      sessionData.session.refresh_token,
      sessionData.session.expires_at
    );

    sendSuccess(
      res,
      {
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: user.phone ?? null,
          role: 'patient',
          full_name,
        },
      },
      'Patient registered successfully',
      201
    );
  } catch (err) {
    next(err);
  }
}
