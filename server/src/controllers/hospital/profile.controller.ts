import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';
import type { UpdateHospitalProfileBody } from '../../validators/hospital/profile.validator.js';

/**
 * GET /api/hospitals/me
 */
export async function getHospitalProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);

    sendSuccess(res, { hospital }, 'Hospital profile retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/hospitals/me
 * Only name, type, address, city, state are editable — not registration_number or admin_id.
 */
export async function updateHospitalProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const body = req.body as UpdateHospitalProfileBody;

    const { data, error } = await supabaseAdmin
      .from('hospitals')
      .update(body)
      .eq('id', hospital.id)
      .select()
      .single();

    if (error || !data) {
      console.error('[updateHospitalProfile] update failed:', error?.message);
      throw new AppError('Failed to update hospital profile', 500);
    }

    sendSuccess(res, { hospital: data }, 'Hospital profile updated');
  } catch (err) {
    next(err);
  }
}
