import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import type { AppMetadata } from '../../types/auth.types.js';
import type { InviteDoctorBody } from '../../validators/auth/doctor.validator.js';

/**
 * POST /api/hospitals/:hospitalId/doctors/invite
 *
 * Only a hospital_admin that owns the specified hospital may call this.
 *
 * Flow:
 *  1. Verify the calling hospital_admin owns :hospitalId
 *  2. inviteUserByEmail — sends the invite email with a setup link
 *  3. updateUserById — set app_metadata.role = 'doctor' and app_metadata.hospital_id
 *  4. Insert skeleton doctor profile row (verified: false)
 *
 * Rollback: if steps 3–4 fail, the invited user is deleted.
 */
export async function inviteDoctor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { hospitalId } = req.params as { hospitalId: string };
    const { email, full_name, specialisation } = req.body as InviteDoctorBody;

    // ── 1. Ownership check ────────────────────────────────────────────
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const { data: hospital, error: hospitalError } = await supabaseAdmin
      .from('hospitals')
      .select('id, admin_id')
      .eq('id', hospitalId)
      .single();

    if (hospitalError || !hospital) {
      throw new NotFoundError('Hospital not found');
    }

    if (hospital.admin_id !== adminId) {
      throw new ForbiddenError('You do not have permission to manage this hospital');
    }

    // ── 2. Invite via email ───────────────────────────────────────────
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${env.FRONTEND_URL}/doctor/setup` }
    );

    if (inviteError) {
      if (
        inviteError.message.toLowerCase().includes('already registered') ||
        inviteError.message.toLowerCase().includes('already exists') ||
        inviteError.message.toLowerCase().includes('duplicate')
      ) {
        throw new ConflictError('A doctor with this email is already registered');
      }
      throw new AppError(inviteError.message, 400);
    }

    const invitedUser = inviteData.user;
    if (!invitedUser) throw new AppError('Failed to create invite', 500);

    // ── 3. Set role in app_metadata ───────────────────────────────────
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(invitedUser.id, {
      app_metadata: {
        role: 'doctor',
        hospital_id: hospitalId,
      } satisfies AppMetadata,
    });

    if (updateError) {
      console.error('[inviteDoctor] app_metadata update failed:', updateError.message);
      await supabaseAdmin.auth.admin.deleteUser(invitedUser.id);
      throw new AppError(`Failed to configure doctor account: ${updateError.message}`, 500);
    }

    // ── 4. Insert doctor profile ──────────────────────────────────────
    const { error: profileError } = await supabaseAdmin.from('doctors').insert({
      user_id: invitedUser.id,
      hospital_id: hospitalId,
      full_name,
      specialisation,
      verified: false,
    });

    if (profileError) {
      console.error('[inviteDoctor] doctor profile insert failed:', profileError.message, profileError.details, profileError.hint);
      await supabaseAdmin.auth.admin.deleteUser(invitedUser.id);
      throw new AppError(`Failed to create doctor profile: ${profileError.message}`, 500);
    }

    sendSuccess(
      res,
      {
        doctor: {
          email,
          full_name,
          specialisation,
          hospital_id: hospitalId,
          verified: false,
        },
      },
      `Invite sent to ${email}. The doctor will receive an email to set up their account.`,
      201
    );
  } catch (err) {
    next(err);
  }
}
