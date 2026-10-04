import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import { requireDoctor } from '../../utils/lookup.js';
import { logPatientDataAccess } from '../../utils/privacyAudit.js';
import type { AppointmentStatus } from '../../models/database.types.js';
import type { UpdateAppointmentStatusBody } from '../../validators/doctor/appointment-status.validator.js';
import { notifyNextWaiting } from '../../jobs/waitlistQueue.js';

type AppointmentFilter = 'upcoming' | 'past' | 'all';

interface DoctorAppointmentRow {
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
  appointment_slots: { slot_start: string; slot_end: string } | null;
  patients: {
    full_name: string;
    phone_number: string | null;
    email: string | null;
    dob: string | null;
    blood_group: string | null;
    known_allergies: string | null;
  } | null;
  hospitals: { name: string; city: string } | null;
}

/**
 * GET /api/doctors/me/appointments?filter=upcoming|past|all
 */
export async function listDoctorAppointments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const filter: AppointmentFilter =
      (req.query['filter'] as AppointmentFilter) ?? 'upcoming';

    if (!['upcoming', 'past', 'all'].includes(filter)) {
      throw new BadRequestError('filter must be one of: upcoming, past, all');
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(
        `id, slot_id, patient_id, doctor_id, hospital_id, service_id,
         booking_type, status, notes, created_at,
         appointment_slots ( slot_start, slot_end ),
         patients ( full_name, phone_number, email, dob, blood_group, known_allergies ),
         hospitals ( name, city )`
      )
      .eq('doctor_id', doctor.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listDoctorAppointments] query failed:', error.message);
      throw new AppError('Failed to fetch appointments', 500);
    }

    const now = new Date().toISOString();
    const appointments = (data as unknown as DoctorAppointmentRow[]) ?? [];

    const filtered =
      filter === 'upcoming'
        ? appointments.filter(
            (a) => a.appointment_slots && a.appointment_slots.slot_start > now
          )
        : filter === 'past'
        ? appointments.filter(
            (a) => !a.appointment_slots || a.appointment_slots.slot_start <= now
          )
        : appointments;

    const uniquePatientIds = [...new Set(filtered.map((appt) => appt.patient_id).filter(Boolean))];
    await Promise.all(
      uniquePatientIds.map((patientId) =>
        logPatientDataAccess({
          patientId,
          actorUserId: userId,
          actorRole: 'doctor',
          actorLabel: doctor.full_name,
          action: 'read',
          resourceType: 'appointments',
          purpose: 'doctor_schedule_review',
          metadata: {
            filter,
            record_count: filtered.filter((appt) => appt.patient_id === patientId).length,
          },
          ipAddress: req.ip,
        })
      )
    );

    sendSuccess(res, { appointments: filtered }, 'Appointments retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/doctors/me/appointments/:id
 */
export async function getDoctorAppointment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { id } = req.params as { id: string };

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(
        `id, slot_id, patient_id, doctor_id, hospital_id, service_id,
         booking_type, status, notes, created_at,
         appointment_slots ( slot_start, slot_end ),
         patients ( full_name, phone_number, email, dob, blood_group, known_allergies ),
         hospitals ( name, city )`
      )
      .eq('id', id)
      .eq('doctor_id', doctor.id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Appointment not found');
    }

    await logPatientDataAccess({
      patientId: data.patient_id,
      actorUserId: userId,
      actorRole: 'doctor',
      actorLabel: doctor.full_name,
      action: 'read',
      resourceType: 'appointment',
      resourceId: data.id,
      purpose: 'doctor_appointment_detail',
      metadata: {
        booking_type: data.booking_type,
      },
      ipAddress: req.ip,
    });

    sendSuccess(res, { appointment: data }, 'Appointment retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/doctors/me/appointments/:id/status
 * Updates appointment status and logs the change in appointment_status_log.
 */
export async function updateDoctorAppointmentStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { id } = req.params as { id: string };
    const { status, notes } = req.body as UpdateAppointmentStatusBody;

    // Fetch current appointment
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('appointments')
      .select('id, status, doctor_id, slot_id')
      .eq('id', id)
      .eq('doctor_id', doctor.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Appointment not found');
    }

    if (existing.status === status) {
      throw new BadRequestError(`Appointment is already in status: ${status}`);
    }

    // Update appointment status (and notes if provided)
    const updatePayload: { status: AppointmentStatus; notes?: string } = { status };
    if (notes !== undefined) updatePayload.notes = notes;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('appointments')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[updateDoctorAppointmentStatus] update failed:', updateError?.message);
      throw new AppError('Failed to update appointment status', 500);
    }

    // Log the status change
    const { error: logError } = await supabaseAdmin.from('appointment_status_log').insert({
      appointment_id: id,
      old_status: existing.status as AppointmentStatus,
      new_status: status,
      changed_by: userId,
      changed_at: new Date().toISOString(),
    });

    if (logError) {
      // Non-fatal: log but don't fail the request
      console.error('[updateDoctorAppointmentStatus] status log insert failed:', logError.message);
    }

    // Free the slot back to 'available' when the appointment ends (any terminal
    // or non-occupying status).  This keeps appointment_slots in sync with the
    // appointment row so the Schedule page never shows a slot as 'booked' when
    // the appointment has been cancelled, completed, or marked no_show.
    const slotFreedStatuses: AppointmentStatus[] = ['cancelled', 'completed', 'no_show'];
    if (slotFreedStatuses.includes(status) && existing.slot_id) {
      await supabaseAdmin
        .from('appointment_slots')
        .update({ status: 'available', locked_by: null, locked_until: null })
        .eq('id', existing.slot_id)
        .eq('status', 'booked');

      // If cancelled, also promote the next waiting patient (FIFO).
      if (status === 'cancelled') {
        await notifyNextWaiting(existing.slot_id);
      }
    }

    // If marking as no_show, increment patient's no_show_count
    if (status === 'no_show') {
      // Fetch patient_id from the updated appointment
      const { data: apptData } = await supabaseAdmin
        .from('appointments')
        .select('patient_id')
        .eq('id', id)
        .single();

      if (apptData?.patient_id) {
        const { data: patientData } = await supabaseAdmin
          .from('patients')
          .select('no_show_count')
          .eq('id', apptData.patient_id)
          .single();

        if (patientData) {
          await supabaseAdmin
            .from('patients')
            .update({ no_show_count: (patientData.no_show_count ?? 0) + 1 })
            .eq('id', apptData.patient_id);
        }
      }
    }

    sendSuccess(res, { appointment: updated }, 'Appointment status updated');
  } catch (err) {
    next(err);
  }
}
