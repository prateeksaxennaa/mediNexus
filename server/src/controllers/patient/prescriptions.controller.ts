import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';

// ─── Local join-result shapes ────────────────────────────────────────

interface PrescriptionItemWithMedicine {
  id: string;
  prescription_id: string;
  medicine_id: string;
  dosage: string;
  frequency: string;
  duration: string;
  doctor_comment: string | null;
  medicines: {
    medicine_name: string;
    composition: string | null;
    therapeutic_class: string | null;
  } | null;
}

interface PrescriptionWithItems {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  illness_description: string | null;
  issued_at: string;
  pdf_url: string | null;
  doctors: {
    full_name: string;
    specialisation: string;
    qualifications?: string | null;
    registration_number?: string | null;
    department?: string | null;
  } | null;
  appointments: {
    hospital_id: string;
    appointment_slots: { slot_start: string } | null;
    hospitals: { name: string; city: string } | null;
  } | null;
  prescription_items: PrescriptionItemWithMedicine[];
}

/**
 * GET /api/patients/me/prescriptions
 */
export async function listPatientPrescriptions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    const { data, error } = await supabaseAdmin
      .from('prescriptions')
      .select(
        `id, appointment_id, doctor_id, patient_id,
         illness_description, issued_at, pdf_url,
         doctors ( full_name, specialisation )`
      )
      .eq('patient_id', patient.id)
      .order('issued_at', { ascending: false });

    if (error) {
      console.error('[listPatientPrescriptions] query failed:', error.message);
      throw new AppError('Failed to fetch prescriptions', 500);
    }

    sendSuccess(res, { prescriptions: data ?? [] }, 'Prescriptions retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/me/prescriptions/:id
 * Returns prescription with nested prescription_items + medicines.
 */
export async function getPatientPrescription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { id } = req.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('prescriptions')
      .select(
        `id, appointment_id, doctor_id, patient_id,
         illness_description, issued_at, pdf_url,
         doctors ( full_name, specialisation, qualifications, registration_number, department ),
         appointments (
           hospital_id,
           appointment_slots ( slot_start ),
           hospitals ( name, city )
         ),
         prescription_items (
           id, prescription_id, medicine_id,
           dosage, frequency, duration, doctor_comment,
           medicines ( medicine_name, composition, therapeutic_class )
         )`
      )
      .eq('id', id)
      .eq('patient_id', patient.id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Prescription not found');
    }

    sendSuccess(
      res,
      { prescription: data as unknown as PrescriptionWithItems },
      'Prescription retrieved'
    );
  } catch (err) {
    next(err);
  }
}
