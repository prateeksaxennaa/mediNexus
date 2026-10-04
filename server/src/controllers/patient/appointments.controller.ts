import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';
import type { AppointmentStatus } from '../../models/database.types.js';
import { notifyNextWaiting } from '../../jobs/waitlistQueue.js';

// ─── Local join-result shapes ────────────────────────────────────────
// Supabase Relationships are empty so we cast manually.

interface AppointmentWithJoins {
  id: string;
  slot_id: string;
  patient_id: string;
  doctor_id: string;
  hospital_id: string;
  service_id: string;
  booking_type: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  appointment_slots: {
    slot_start: string;
    slot_end: string;
  } | null;
  doctors: {
    full_name: string;
    specialisation: string;
  } | null;
  hospitals: {
    name: string;
    city: string;
  } | null;
}

type AppointmentFilter = 'upcoming' | 'past' | 'all';

/**
 * GET /api/patients/me/appointments?filter=upcoming|past|all
 */
export async function listPatientAppointments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const filter: AppointmentFilter =
      (req.query['filter'] as AppointmentFilter) ?? 'all';

    if (!['upcoming', 'past', 'all'].includes(filter)) {
      throw new BadRequestError("filter must be one of: upcoming, past, all");
    }

    let query = supabaseAdmin
      .from('appointments')
      .select(
        `id, slot_id, patient_id, doctor_id, hospital_id, service_id,
         booking_type, status, notes, created_at,
         appointment_slots ( slot_start, slot_end ),
         doctors ( full_name, specialisation ),
         hospitals ( name, city )`
      )
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false });

    const now = new Date().toISOString();

    if (filter === 'upcoming') {
      // slot_start in the future — join is needed, filter post-query
    } else if (filter === 'past') {
      // filter post-query too
    }

    const { data, error } = await query;

    if (error) {
      console.error('[listPatientAppointments] query failed:', error.message);
      throw new AppError('Failed to fetch appointments', 500);
    }

    const appointments = (data as unknown as AppointmentWithJoins[]) ?? [];

    const filtered =
      filter === 'upcoming'
        ? appointments.filter(
            (a) =>
              a.appointment_slots &&
              a.appointment_slots.slot_start > now &&
              ['booked', 'checked_in', 'in_progress'].includes(a.status)
          )
        : filter === 'past'
        ? appointments.filter(
            (a) => !a.appointment_slots || a.appointment_slots.slot_start <= now
          )
        : appointments;

    sendSuccess(res, { appointments: filtered }, 'Appointments retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/me/appointments/:id
 */
export async function getPatientAppointment(
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
      .from('appointments')
      .select(
        `id, slot_id, patient_id, doctor_id, hospital_id, service_id,
         booking_type, status, notes, created_at,
         appointment_slots ( slot_start, slot_end ),
         doctors ( full_name, specialisation ),
         hospitals ( name, city )`
      )
      .eq('id', id)
      .eq('patient_id', patient.id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Appointment not found');
    }

    sendSuccess(res, { appointment: data }, 'Appointment retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me/appointments/:id/cancel
 */
export async function cancelPatientAppointment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { id } = req.params as { id: string };

    // Fetch current appointment to validate ownership + state
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('appointments')
      .select('id, status, patient_id, slot_id')
      .eq('id', id)
      .eq('patient_id', patient.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Appointment not found');
    }

    if (existing.status === 'cancelled') {
      throw new BadRequestError('Appointment is already cancelled');
    }

    if (['completed', 'no_show', 'in_progress'].includes(existing.status)) {
      throw new BadRequestError(`Cannot cancel an appointment with status: ${existing.status}`);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[cancelPatientAppointment] update failed:', updateError?.message);
      throw new AppError('Failed to cancel appointment', 500);
    }

    // Free the slot back to available
    if (existing.slot_id) {
      await supabaseAdmin
        .from('appointment_slots')
        .update({ status: 'available', locked_by: null, locked_until: null })
        .eq('id', existing.slot_id)
        .eq('status', 'booked');

      // Notify the next waiting patient in the queue (FIFO)
      await notifyNextWaiting(existing.slot_id);
    }

    sendSuccess(res, { appointment: updated }, 'Appointment cancelled');
  } catch (err) {
    next(err);
  }
}
