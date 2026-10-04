import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';

/**
 * GET /api/patients/me/reports
 * Returns all patient reports, newest first.
 */
export async function listPatientReports(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    const { data, error } = await supabaseAdmin
      .from('patient_reports')
      .select('*')
      .eq('patient_id', patient.id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('[listPatientReports] query failed:', error.message);
      throw new AppError('Failed to fetch reports', 500);
    }

    sendSuccess(res, { reports: data ?? [] }, 'Reports retrieved');
  } catch (err) {
    next(err);
  }
}
