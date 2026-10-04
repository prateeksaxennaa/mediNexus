import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, supabaseAnon } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, ConflictError } from '../../utils/errors.js';
import type { RegisterHospitalAdminBody } from '../../validators/auth/hospital-admin.validator.js';
import { setAuthCookies } from './session.controller.js';

/**
 * POST /api/auth/hospital-admin/register
 *
 * Flow:
 *  1. Create Supabase auth user with app_metadata.role = 'hospital_admin'
 *  2. Insert hospital profile row (is_approved = true — auto-approved on signup)
 *  3. Sign in immediately and return a live session
 *
 * Rollback: if step 2 fails, the orphaned auth user is deleted.
 */
export async function registerHospitalAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      email,
      password,
      full_name,
      hospital_name,
      hospital_type,
      address,
      city,
      state,
      registration_number,
      contact_phone,
    } = req.body as RegisterHospitalAdminBody;

    // ── 1. Create auth user ──────────────────────────────────────────
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone: contact_phone,
      password,
      email_confirm: true,
      phone_confirm: true,
      app_metadata: { role: 'hospital_admin' },
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

    // ── 2. Insert hospital profile ────────────────────────────────────
    const { data: hospital, error: hospitalError } = await supabaseAdmin
      .from('hospitals')
      .insert({
        name: hospital_name,
        type: hospital_type,
        address,
        city,
        state,
        registration_number,
        admin_id: user.id,
        is_approved: true,
      })
      .select('id, name, type, city, state, is_approved')
      .single();

    if (hospitalError || !hospital) {
      console.error('[registerHospitalAdmin] hospital insert failed:', hospitalError?.message, hospitalError?.details, hospitalError?.hint);
      // Rollback — delete the orphaned auth user
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw new AppError(`Failed to create hospital profile: ${hospitalError?.message ?? 'unknown error'}`, 500);
    }

    // ── 3. Sign in to return a live session ──────────────────────────
    const { data: sessionData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !sessionData.session) {
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
          role: 'hospital_admin',
          full_name,
        },
        hospital: {
          id: hospital.id,
          name: hospital.name,
          type: hospital.type,
          city: hospital.city,
          state: hospital.state,
          is_approved: hospital.is_approved,
        },
      },
      'Hospital admin registered successfully. Your hospital is pending approval.',
      201
    );
  } catch (err) {
    next(err);
  }
}
