import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';
import type { UpdatePatientProfileBody } from '../../validators/patient/profile.validator.js';

/**
 * GET /api/patients/me
 * Returns the authenticated patient's profile row.
 */
export async function getPatientProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    sendSuccess(res, { patient }, 'Patient profile retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me
 * Updates the authenticated patient's profile row.
 */
export async function updatePatientProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const body = req.body as UpdatePatientProfileBody;

    const { data, error } = await supabaseAdmin
      .from('patients')
      .update(body)
      .eq('id', patient.id)
      .select()
      .single();

    if (error || !data) {
      console.error('[updatePatientProfile] update failed:', error?.message);
      throw new AppError('Failed to update patient profile', 500);
    }

    sendSuccess(res, { patient: data }, 'Patient profile updated');
  } catch (err) {
    next(err);
  }
}
