import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import {
  AppError,
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Assert the doctor belongs to the calling admin's hospital. */
async function assertDoctorOwnership(
  hospitalId: string,
  doctorId: string
): Promise<{ id: string; full_name: string; hospital_id: string; specialisation: string }> {
  const { data: doctor, error } = await supabaseAdmin
    .from('doctors')
    .select('id, full_name, hospital_id, specialisation')
    .eq('id', doctorId)
    .eq('hospital_id', hospitalId)
    .single();

  if (error || !doctor) {
    throw new NotFoundError('Doctor not found in your hospital');
  }
  return doctor as { id: string; full_name: string; hospital_id: string; specialisation: string };
}

// ─── List doctor slots (admin view) ──────────────────────────────────────────

/**
 * GET /api/hospitals/me/doctors/:doctorId/slots
 *   ?date=YYYY-MM-DD     (default: today)
 *   &upcoming=true|false (default: true — only future slots when no date given)
 *
 * Returns all appointment_slots for the doctor on the requested date,
 * enriched with any linked appointment (patient info, status).
 */
export async function listAdminDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId } = req.params as { doctorId: string };
    await assertDoctorOwnership(hospital.id, doctorId);

    const dateParam = req.query['date'] as string | undefined;
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      throw new BadRequestError('date must be in YYYY-MM-DD format');
    }

    const date = dateParam ?? new Date().toISOString().split('T')[0]; // default: today

    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd   = `${date}T23:59:59.999Z`;

    // Fetch slots for the day
    const { data: slots, error: slotsError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, slot_start, slot_end, status, locked_by, locked_until, doctor_id')
      .eq('doctor_id', doctorId)
      .gte('slot_start', dayStart)
      .lte('slot_start', dayEnd)
      .order('slot_start', { ascending: true });

    if (slotsError) {
      console.error('[listAdminDoctorSlots] query failed:', slotsError.message);
      throw new AppError('Failed to fetch slots', 500);
    }

    const slotList = slots ?? [];

    if (slotList.length === 0) {
      sendSuccess(res, { slots: [], date }, 'No slots for this date');
      return;
    }

    // Enrich: fetch active appointments for these slots in one query
    const slotIds = slotList.map((s) => s.id);
    const { data: appointments, error: apptError } = await (supabaseAdmin as any)
      .from('appointments')
      .select(
        `id, slot_id, status, booking_type, notes, created_at,
         patients ( id, full_name, phone_number )`
      )
      .in('slot_id', slotIds)
      .not('status', 'eq', 'cancelled');

    if (apptError) {
      console.error('[listAdminDoctorSlots] appointments query failed:', apptError.message);
      // Non-fatal — return slots without appointment data
    }

    // Build a map of slotId → appointment for O(1) lookup
    const apptBySlot = new Map<string, any>();
    for (const a of appointments ?? []) {
      apptBySlot.set(a.slot_id, a);
    }

    // Merge appointment info into each slot
    const enriched = slotList.map((slot) => ({
      ...slot,
      appointment: apptBySlot.get(slot.id) ?? null,
    }));

    sendSuccess(res, { slots: enriched, date }, 'Slots retrieved');
  } catch (err) {
    next(err);
  }
}

// ─── Block a slot ─────────────────────────────────────────────────────────────

/**
 * PATCH /api/hospitals/me/doctors/:doctorId/slots/:slotId/block
 * Admin blocks an available slot (e.g. for maintenance, lunch, emergency leave).
 * Propagates to patients via the existing Supabase Realtime → SSE pipeline.
 */
export async function adminBlockDoctorSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId, slotId } = req.params as { doctorId: string; slotId: string };
    await assertDoctorOwnership(hospital.id, doctorId);

    // Fetch current slot state
    const { data: slot, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, status')
      .eq('id', slotId)
      .eq('doctor_id', doctorId)
      .single();

    if (fetchError || !slot) throw new NotFoundError('Slot not found');

    if (slot.status === 'booked') {
      throw new BadRequestError('Cannot block a booked slot — cancel the appointment first');
    }
    if (slot.status === 'blocked') {
      throw new BadRequestError('Slot is already blocked');
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'blocked' as any, locked_by: null, locked_until: null })
      .eq('id', slotId)
      .select('id, slot_start, slot_end, status, doctor_id')
      .single();

    if (updateError || !updated) {
      throw new AppError('Failed to block slot', 500);
    }

    // Supabase Realtime fires automatically → SSE → patient UI updates live

    sendSuccess(res, { slot: updated }, 'Slot blocked');
  } catch (err) {
    next(err);
  }
}

// ─── Unblock a slot ───────────────────────────────────────────────────────────

/**
 * PATCH /api/hospitals/me/doctors/:doctorId/slots/:slotId/unblock
 * Admin unblocks a previously blocked slot — makes it available for booking again.
 */
export async function adminUnblockDoctorSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId, slotId } = req.params as { doctorId: string; slotId: string };
    await assertDoctorOwnership(hospital.id, doctorId);

    const { data: slot, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, status')
      .eq('id', slotId)
      .eq('doctor_id', doctorId)
      .single();

    if (fetchError || !slot) throw new NotFoundError('Slot not found');

    if (slot.status !== 'blocked') {
      throw new BadRequestError(`Cannot unblock a slot with status: ${slot.status}`);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'available' })
      .eq('id', slotId)
      .select('id, slot_start, slot_end, status, doctor_id')
      .single();

    if (updateError || !updated) {
      throw new AppError('Failed to unblock slot', 500);
    }

    sendSuccess(res, { slot: updated }, 'Slot unblocked — now available for booking');
  } catch (err) {
    next(err);
  }
}

// ─── Delete a slot ────────────────────────────────────────────────────────────

/**
 * DELETE /api/hospitals/me/doctors/:doctorId/slots/:slotId
 * Permanently removes an available or blocked slot.
 * Cannot delete booked/locked slots (cancel the appointment first).
 */
export async function adminDeleteDoctorSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId, slotId } = req.params as { doctorId: string; slotId: string };
    await assertDoctorOwnership(hospital.id, doctorId);

    const { data: slot, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, status')
      .eq('id', slotId)
      .eq('doctor_id', doctorId)
      .single();

    if (fetchError || !slot) throw new NotFoundError('Slot not found');

    if (slot.status === 'booked') {
      throw new BadRequestError('Cannot delete a booked slot — cancel the appointment first');
    }
    if (slot.status === 'locked') {
      throw new BadRequestError('Cannot delete a locked slot — wait for the lock to expire or clear it first');
    }

    const { error: deleteError } = await supabaseAdmin
      .from('appointment_slots')
      .delete()
      .eq('id', slotId);

    if (deleteError) {
      console.error('[adminDeleteDoctorSlot] delete failed:', deleteError.message);
      throw new AppError('Failed to delete slot', 500);
    }

    sendSuccess(res, null, 'Slot deleted');
  } catch (err) {
    next(err);
  }
}

// ─── Walk-in booking ─────────────────────────────────────────────────────────

/**
 * POST /api/hospitals/me/doctors/:doctorId/walk-in
 *
 * Admin books a walk-in appointment for an existing patient on a chosen slot.
 * Bypasses the soft-lock step — the admin has authority to book directly.
 *
 * Body:
 *   {
 *     slot_id: string,       // the appointment_slot to book
 *     patient_id: string,    // patients.id (not user_id)
 *     notes?: string
 *   }
 *
 * The slot is atomically updated to 'booked' only if it is still 'available'
 * or 'blocked' (admin can override a blocked slot, useful for last-minute walk-ins).
 * A locked slot can also be overridden since the admin has authority.
 *
 * Propagation: the DB UPDATE fires Supabase Realtime → SSE → any patient
 * currently viewing the slot grid will see it flip to 'booked' in real time.
 */
export async function adminBookWalkIn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId } = req.params as { doctorId: string };
    const doctor = await assertDoctorOwnership(hospital.id, doctorId);

    const {
      slot_id,
      patient_id,
      notes,
    } = req.body as { slot_id: string; patient_id: string; notes?: string };

    if (!slot_id) throw new BadRequestError('slot_id is required');
    if (!patient_id) throw new BadRequestError('patient_id is required');

    // ── Verify slot belongs to this doctor ───────────────────────
    const { data: slot, error: slotError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, slot_start, slot_end, status')
      .eq('id', slot_id)
      .eq('doctor_id', doctorId)
      .single();

    if (slotError || !slot) throw new NotFoundError('Slot not found for this doctor');

    if (slot.status === 'booked') {
      throw new ConflictError('This slot is already booked');
    }

    // ── Verify patient exists ─────────────────────────────────────
    const { data: patient, error: patientError } = await (supabaseAdmin as any)
      .from('patients')
      .select('id, full_name, user_id')
      .eq('id', patient_id)
      .single();

    if (patientError || !patient) {
      throw new NotFoundError('Patient not found');
    }

    // ── Guard: check no active appointment already exists ─────────
    const { data: existingAppt } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('slot_id', slot_id)
      .not('status', 'eq', 'cancelled')
      .maybeSingle();

    if (existingAppt) {
      throw new ConflictError('This slot already has an active appointment');
    }

    // ── Resolve service_id (best-effort) ─────────────────────────
    let serviceId: string | null = null;
    if (doctor.specialisation) {
      const { data: svc } = await supabaseAdmin
        .from('hospital_services')
        .select('id')
        .eq('hospital_id', hospital.id)
        .eq('is_available', true)
        .ilike('department', `%${doctor.specialisation}%`)
        .limit(1)
        .maybeSingle();
      serviceId = svc?.id ?? null;
    }

    // ── Create appointment ────────────────────────────────────────
    const apptInsert: Record<string, unknown> = {
      slot_id,
      patient_id,
      doctor_id: doctorId,
      hospital_id: hospital.id,
      booking_type: 'walk_in',
      status: 'booked',
      notes: notes?.trim() || null,
    };
    if (serviceId) apptInsert['service_id'] = serviceId;

    const { data: appointment, error: apptError } = await supabaseAdmin
      .from('appointments')
      .insert(apptInsert as any)
      .select()
      .single();

    if (apptError || !appointment) {
      console.error('[adminBookWalkIn] appointment insert failed:', apptError?.message);
      throw new AppError('Failed to create walk-in appointment', 500);
    }

    // ── Mark slot as booked ───────────────────────────────────────
    // This UPDATE triggers Supabase Realtime → SSE → patient UIs update in real time.
    const { error: slotUpdateError } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'booked', locked_by: null, locked_until: null })
      .eq('id', slot_id);

    if (slotUpdateError) {
      console.error('[adminBookWalkIn] slot status update failed:', slotUpdateError.message);
      // Non-fatal: appointment exists, slot update will be caught by reconciliation
    }

    sendSuccess(
      res,
      {
        appointment,
        patient: { id: patient.id, full_name: patient.full_name },
        doctor: { id: doctor.id, full_name: doctor.full_name },
      },
      `Walk-in booked for ${patient.full_name}`,
      201
    );
  } catch (err) {
    next(err);
  }
}

// ─── Cancel a doctor appointment (admin) ─────────────────────────────────────

/**
 * PATCH /api/hospitals/me/doctors/:doctorId/appointments/:appointmentId/cancel
 *
 * Admin cancels a doctor appointment. Frees the slot back to 'available'
 * so another patient (or walk-in) can take it. Triggers SSE propagation.
 */
export async function adminCancelDoctorAppointment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId, appointmentId } = req.params as {
      doctorId: string;
      appointmentId: string;
    };
    await assertDoctorOwnership(hospital.id, doctorId);

    // Fetch appointment — must belong to this hospital + doctor
    const { data: appt, error: fetchError } = await supabaseAdmin
      .from('appointments')
      .select('id, status, slot_id, doctor_id, hospital_id')
      .eq('id', appointmentId)
      .eq('doctor_id', doctorId)
      .eq('hospital_id', hospital.id)
      .single();

    if (fetchError || !appt) throw new NotFoundError('Appointment not found');

    const TERMINAL = ['completed', 'cancelled'];
    if (TERMINAL.includes(appt.status)) {
      throw new BadRequestError(`Appointment is already ${appt.status}`);
    }

    // Cancel the appointment
    const { error: cancelError } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId);

    if (cancelError) throw new AppError('Failed to cancel appointment', 500);

    // Free the slot back to available — this fires Realtime → SSE
    await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'available', locked_by: null, locked_until: null })
      .eq('id', appt.slot_id)
      .eq('status', 'booked');

    sendSuccess(res, null, 'Appointment cancelled and slot freed');
  } catch (err) {
    next(err);
  }
}
