import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requireDoctor } from '../../utils/lookup.js';
import type { UpdateDoctorProfileBody } from '../../validators/doctor/profile.validator.js';

/**
 * GET /api/doctors/me
 */
export async function getDoctorProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);

    sendSuccess(res, { doctor }, 'Doctor profile retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/doctors/me
 */
export async function updateDoctorProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const body = req.body as UpdateDoctorProfileBody;

    const { data, error } = await supabaseAdmin
      .from('doctors')
      .update(body)
      .eq('id', doctor.id)
      .select()
      .single();

    if (error || !data) {
      console.error('[updateDoctorProfile] update failed:', error?.message);
      throw new AppError('Failed to update doctor profile', 500);
    }

    sendSuccess(res, { doctor: data }, 'Doctor profile updated');
  } catch (err) {
    next(err);
  }
}
