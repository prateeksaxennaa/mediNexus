import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';

// Allowed updatable fields for a doctor by hospital admin
interface UpdateDoctorByAdminBody {
  full_name?: string;
  specialisation?: string;
  department?: string;
  qualifications?: string;
  registration_number?: string;
  experience_years?: number;
  consultation_fee?: number;
  bio?: string;
  available_from?: string;
  available_to?: string;
  slot_duration_mins?: number;
  verified?: boolean;
}

/**
 * GET /api/hospitals/me/doctors
 * Lists all doctors belonging to this hospital.
 */
export async function listHospitalDoctors(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);

    const { data, error } = await supabaseAdmin
      .from('doctors')
      .select('id, user_id, hospital_id, full_name, specialisation, department, qualifications, registration_number, experience_years, consultation_fee, bio, available_from, available_to, slot_duration_mins, verified, created_at')
      .eq('hospital_id', hospital.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listHospitalDoctors] query failed:', error.message);
      throw new AppError('Failed to fetch doctors', 500);
    }

    sendSuccess(res, { doctors: data ?? [] }, 'Doctors retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/hospitals/me/doctors/:doctorId
 * Allows hospital admin to update full_name, specialisation, or verified status.
 */
export async function updateHospitalDoctor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId } = req.params as { doctorId: string };

    const body = req.body as UpdateDoctorByAdminBody;

    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestError('At least one field must be provided');
    }

    // Ensure doctor belongs to this hospital
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('doctors')
      .select('id, hospital_id')
      .eq('id', doctorId)
      .eq('hospital_id', hospital.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Doctor not found in your hospital');
    }

    // Only allow these fields
    const allowedUpdate: UpdateDoctorByAdminBody = {};
    if (body.full_name !== undefined) allowedUpdate.full_name = body.full_name;
    if (body.specialisation !== undefined) allowedUpdate.specialisation = body.specialisation;
    if (body.department !== undefined) allowedUpdate.department = body.department;
    if (body.qualifications !== undefined) allowedUpdate.qualifications = body.qualifications;
    if (body.registration_number !== undefined) allowedUpdate.registration_number = body.registration_number;
    if (body.experience_years !== undefined) allowedUpdate.experience_years = body.experience_years;
    if (body.consultation_fee !== undefined) allowedUpdate.consultation_fee = body.consultation_fee;
    if (body.bio !== undefined) allowedUpdate.bio = body.bio;
    if (body.available_from !== undefined) allowedUpdate.available_from = body.available_from;
    if (body.available_to !== undefined) allowedUpdate.available_to = body.available_to;
    if (body.slot_duration_mins !== undefined) allowedUpdate.slot_duration_mins = body.slot_duration_mins;
    if (body.verified !== undefined) allowedUpdate.verified = body.verified;

    const { data, error } = await supabaseAdmin
      .from('doctors')
      .update(allowedUpdate)
      .eq('id', doctorId)
      .select()
      .single();

    if (error || !data) {
      console.error('[updateHospitalDoctor] update failed:', error?.message);
      throw new AppError('Failed to update doctor', 500);
    }

    sendSuccess(res, { doctor: data }, 'Doctor updated');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/hospitals/me/doctors/:doctorId
 * Removes a doctor record from the hospital.
 * Also deletes the associated Supabase auth user so the invite is fully revoked.
 */
export async function deleteHospitalDoctor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId } = req.params as { doctorId: string };

    // Verify the doctor belongs to this hospital and grab user_id for auth cleanup
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('doctors')
      .select('id, hospital_id, user_id')
      .eq('id', doctorId)
      .eq('hospital_id', hospital.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Doctor not found in your hospital');
    }

    // Delete the doctor row
    const { error: deleteError } = await supabaseAdmin
      .from('doctors')
      .delete()
      .eq('id', doctorId);

    if (deleteError) {
      console.error('[deleteHospitalDoctor] delete failed:', deleteError.message);
      throw new AppError('Failed to delete doctor', 500);
    }

    // Best-effort: delete the auth user so the email invite cannot be reused
    if (existing.user_id) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(existing.user_id);
      if (authErr) {
        console.warn('[deleteHospitalDoctor] auth user deletion failed:', authErr.message);
      }
    }

    sendSuccess(res, null, 'Doctor deleted');
  } catch (err) {
    next(err);
  }
}
