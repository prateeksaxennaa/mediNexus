import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError, ConflictError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';
import { notifyNextWaiting } from '../../jobs/waitlistQueue.js';
import { pushWaitlistUpdate } from '../../sse/waitlistChannelManager.js';

// ─── Types ───────────────────────────────────────────────────────────

interface LockSlotBody {
  slot_id: string;
}

interface ConfirmBookingBody {
  slot_id: string;
  doctor_id: string;
  hospital_id: string;
  service_id?: string;
  booking_type?: 'online' | 'walk_in' | 'referral';
}

interface JoinWaitlistBody {
  slot_id: string;
}

/**
 * POST /api/patients/me/slots/lock
 * Step 1 of booking: atomically soft-locks a slot for 3 minutes.
 * Returns 409 if the slot is already taken.
 */
export async function lockSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { slot_id } = req.body as LockSlotBody;

    if (!slot_id) throw new BadRequestError('slot_id is required');

    // Atomic UPDATE – only succeeds if status is still 'available'
    const lockedUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('appointment_slots')
      .update({
        status: 'locked' as any,
        locked_by: userId,
        locked_until: lockedUntil,
      })
      .eq('id', slot_id)
      .eq('status', 'available')
      .select('id, slot_start, slot_end, doctor_id, status, locked_until')
      .maybeSingle();

    if (error) {
      console.error('[lockSlot] update failed:', error.message);
      throw new AppError('Failed to acquire slot lock', 500);
    }

    if (!data) {
      // 0 rows updated — slot is taken or doesn't exist
      const { data: existing } = await supabaseAdmin
        .from('appointment_slots')
        .select('status')
        .eq('id', slot_id)
        .maybeSingle();

      if (!existing) throw new NotFoundError('Slot not found');
      throw new ConflictError(
        `Slot is no longer available (current status: ${existing.status})`
      );
    }

    sendSuccess(
      res,
      { slot: data, locked_until: lockedUntil },
      'Slot locked. You have 3 minutes to confirm your booking.'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients/me/appointments
 * Step 2 of booking: verifies the soft-lock is still valid, creates the appointment.
 */
export async function bookAppointment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const {
      slot_id,
      doctor_id,
      hospital_id,
      service_id,
      booking_type = 'online',
    } = req.body as ConfirmBookingBody;

    if (!slot_id || !doctor_id || !hospital_id) {
      throw new BadRequestError('slot_id, doctor_id, and hospital_id are required');
    }

    // Re-verify lock is still held by this patient
    const { data: slot, error: slotError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, status, locked_by, locked_until, doctor_id')
      .eq('id', slot_id)
      .single();

    if (slotError || !slot) {
      throw new NotFoundError('Slot not found');
    }

    if (slot.status !== 'locked' || slot.locked_by !== userId) {
      throw new ConflictError(
        'Slot lock not held by you. Please re-select and lock the slot first.'
      );
    }

    if (slot.locked_until && new Date(slot.locked_until) < new Date()) {
      throw new AppError('Slot lock has expired. Please select the slot again.', 410);
    }

    // Auto-resolve service_id if not provided by the client:
    // Look for a hospital_services row matching the doctor's specialisation.
    let resolvedServiceId: string | null = service_id ?? null;
    if (!resolvedServiceId) {
      const { data: doctor } = await supabaseAdmin
        .from('doctors')
        .select('specialisation')
        .eq('id', doctor_id)
        .single();

      if (doctor?.specialisation) {
        const { data: svc } = await supabaseAdmin
          .from('hospital_services')
          .select('id')
          .eq('hospital_id', hospital_id)
          .eq('is_available', true)
          .ilike('department', `%${doctor.specialisation}%`)
          .limit(1)
          .maybeSingle();

        resolvedServiceId = svc?.id ?? null;
      }
    }

    // Create the appointment record
    const { data: appointment, error: apptError } = await supabaseAdmin
      .from('appointments')
      .insert({
        slot_id,
        patient_id: patient.id,
        doctor_id,
        hospital_id,
        ...(resolvedServiceId ? { service_id: resolvedServiceId } : {}),
        booking_type,
        status: 'booked',
      })
      .select()
      .single();

    if (apptError || !appointment) {
      console.error('[bookAppointment] appointment insert failed:', apptError?.message);
      throw new AppError('Failed to create appointment', 500);
    }

    // Mark slot as booked
    const { error: updateError } = await supabaseAdmin
      .from('appointment_slots')
      .update({
        status: 'booked',
        locked_by: null,
        locked_until: null,
      })
      .eq('id', slot_id);

    if (updateError) {
      console.error('[bookAppointment] slot update failed:', updateError.message);
      // Non-fatal for the patient — appointment is created
    }

    sendSuccess(res, { appointment }, 'Appointment booked successfully', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me/slots/:slotId/release
 * Releases a soft-lock early (if the patient changes their mind).
 */
export async function releaseSlotLock(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const { slotId } = req.params as { slotId: string };

    const { data, error } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'available', locked_by: null, locked_until: null })
      .eq('id', slotId)
      .eq('status', 'locked')
      .eq('locked_by', userId)
      .select()
      .maybeSingle();

    if (error) {
      throw new AppError('Failed to release lock', 500);
    }

    if (!data) {
      throw new BadRequestError('No active lock found for this slot');
    }

    sendSuccess(res, null, 'Slot lock released');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients/me/waitlist
 * Adds the patient to the waitlist for a fully booked slot.
 */
export async function joinWaitlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { slot_id } = req.body as JoinWaitlistBody;

    if (!slot_id) throw new BadRequestError('slot_id is required');

    // Check slot is actually booked/locked
    const { data: slot } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, status')
      .eq('id', slot_id)
      .single();

    if (!slot) throw new NotFoundError('Slot not found');

    if (slot.status !== 'booked') {
      throw new BadRequestError(
        slot.status === 'available'
          ? 'This slot is available — book it directly instead of joining the waitlist'
          : 'This slot is not available for waitlisting'
      );
    }

    // Check the patient doesn't already own an active appointment for this slot
    const { data: ownAppt } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('slot_id', slot_id)
      .eq('patient_id', patient.id)
      .not('status', 'eq', 'cancelled')
      .maybeSingle();

    if (ownAppt) {
      throw new BadRequestError('You already have a booking for this slot');
    }

    // Check not already on waitlist
    const { data: existing } = await supabaseAdmin
      .from('slot_waitlist')
      .select('id, status')
      .eq('slot_id', slot_id)
      .eq('patient_id', patient.id)
      .in('status', ['waiting', 'notified'])
      .maybeSingle();

    if (existing) {
      throw new ConflictError('You are already on the waitlist for this slot');
    }

    const { data, error } = await supabaseAdmin
      .from('slot_waitlist')
      .insert({
        slot_id,
        patient_id: patient.id,
        queued_at: new Date().toISOString(),
        status: 'waiting',
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[joinWaitlist] insert failed:', error?.message);
      throw new AppError('Failed to join waitlist', 500);
    }

    // Push the new entry to the patient's SSE so WaitlistPanel can re-fetch
    // and show the card immediately (INSERT carries no join data — client re-fetches).
    pushWaitlistUpdate(patient.id, {
      event: 'INSERT',
      entry: {
        id: data.id,
        slot_id: data.slot_id,
        patient_id: data.patient_id,
        status: data.status,
        queued_at: data.queued_at,
        notified_at: data.notified_at ?? null,
        offer_expires_at: data.offer_expires_at ?? null,
      },
    });

    sendSuccess(res, { waitlist_entry: data }, "You've been added to the waitlist", 201);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/me/waitlist
 * Lists the patient's active waitlist entries.
 */
export async function listPatientWaitlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);

    const { data, error } = await supabaseAdmin
      .from('slot_waitlist')
      .select(
        `id, slot_id, patient_id, queued_at, notified_at, offer_expires_at, status,
         appointment_slots ( slot_start, slot_end,
           doctors ( full_name, specialisation,
             hospitals ( name, city )
           )
         )`
      )
      .eq('patient_id', patient.id)
      .in('status', ['waiting', 'notified'])
      .order('queued_at', { ascending: true });

    if (error) {
      console.error('[listPatientWaitlist] query failed:', error.message);
      throw new AppError('Failed to fetch waitlist', 500);
    }

    sendSuccess(res, { waitlist: data ?? [] }, 'Waitlist retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me/waitlist/:entryId/accept
 *
 * Atomically accepts a waitlist offer. The UPDATE is guarded by
 * status = 'notified' — only one concurrent request can win.
 * On success the slot is soft-locked for 3 minutes so the patient
 * can proceed through the normal lock → book confirmation flow.
 */
export async function acceptWaitlistOffer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { entryId } = req.params as { entryId: string };

    // Fetch the waitlist entry — must belong to this patient
    const { data: entry, error: fetchError } = await supabaseAdmin
      .from('slot_waitlist')
      .select('id, slot_id, patient_id, status, offer_expires_at, queued_at, notified_at')
      .eq('id', entryId)
      .eq('patient_id', patient.id)
      .single();

    if (fetchError || !entry) {
      throw new NotFoundError('Waitlist entry not found');
    }

    if (entry.status !== 'notified') {
      throw new ConflictError(
        entry.status === 'accepted'
          ? 'You have already accepted this offer'
          : 'This offer is no longer active'
      );
    }

    if (entry.offer_expires_at && new Date(entry.offer_expires_at) < new Date()) {
      throw new AppError('This offer has expired. You may rejoin the waitlist.', 410);
    }

    // ── Atomic accept: guard on status = 'notified' ──────────────────────────
    // If two requests race, only the first UPDATE matches — the second gets 0 rows.
    const { data: accepted, error: acceptError } = await supabaseAdmin
      .from('slot_waitlist')
      .update({ status: 'accepted' })
      .eq('id', entryId)
      .eq('status', 'notified')  // <-- concurrency guard
      .select('id, slot_id')
      .maybeSingle();

    if (acceptError) {
      throw new AppError('Failed to accept offer', 500);
    }

    if (!accepted) {
      // Another request won the race — entry is no longer 'notified'
      throw new ConflictError('This offer is no longer available. Please rejoin the waitlist.');
    }

    // Lock the slot for 3 minutes so the patient can confirm booking
    const lockedUntil = new Date(Date.now() + 3 * 60 * 1000).toISOString();

    const { data: slot, error: lockError } = await supabaseAdmin
      .from('appointment_slots')
      .update({
        status: 'locked',
        locked_by: userId,
        locked_until: lockedUntil,
      })
      .eq('id', entry.slot_id)
      .eq('status', 'available')  // only lock if still available
      .select('id, slot_start, slot_end, doctor_id, status, locked_until')
      .maybeSingle();

    if (lockError) {
      throw new AppError('Failed to lock slot after accepting offer', 500);
    }

    if (!slot) {
      // Slot was re-taken between the cancel and this accept (very rare edge case).
      // Revert the accept so the patient stays in queue.
      await supabaseAdmin
        .from('slot_waitlist')
        .update({ status: 'notified' })
        .eq('id', entryId);

      throw new ConflictError('The slot was taken by someone else. Your offer remains active.');
    }

    sendSuccess(
      res,
      { slot, locked_until: lockedUntil },
      'Offer accepted. You have 3 minutes to confirm your booking.'
    );

    // Push the accepted status to the patient's SSE so the card is cleared.
    pushWaitlistUpdate(patient.id, {
      event: 'UPDATE',
      entry: {
        id: accepted.id,
        slot_id: accepted.slot_id,
        patient_id: patient.id,
        status: 'accepted',
        queued_at: entry.queued_at,
        notified_at: entry.notified_at ?? null,
        offer_expires_at: entry.offer_expires_at ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me/waitlist/:entryId/decline
 *
 * Patient explicitly declines their offer. The entry is marked 'cancelled'
 * and the next person in the queue is promoted.
 */
export async function declineWaitlistOffer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { entryId } = req.params as { entryId: string };

    const { data: entry, error: fetchError } = await supabaseAdmin
      .from('slot_waitlist')
      .select('id, slot_id, patient_id, status')
      .eq('id', entryId)
      .eq('patient_id', patient.id)
      .single();

    if (fetchError || !entry) {
      throw new NotFoundError('Waitlist entry not found');
    }

    if (!['waiting', 'notified'].includes(entry.status)) {
      throw new BadRequestError(`Cannot decline an entry with status: ${entry.status}`);
    }

    const { data: cancelled, error: cancelError } = await supabaseAdmin
      .from('slot_waitlist')
      .update({ status: 'cancelled' })
      .eq('id', entryId)
      .select('id, slot_id, patient_id, status, queued_at, notified_at, offer_expires_at')
      .single();

    if (cancelError || !cancelled) {
      throw new AppError('Failed to remove from waitlist', 500);
    }

    // Push the cancelled status to the patient's SSE so their UI clears the card.
    pushWaitlistUpdate(cancelled.patient_id, {
      event: 'UPDATE',
      entry: {
        id: cancelled.id,
        slot_id: cancelled.slot_id,
        patient_id: cancelled.patient_id,
        status: cancelled.status,
        queued_at: cancelled.queued_at,
        notified_at: cancelled.notified_at ?? null,
        offer_expires_at: cancelled.offer_expires_at ?? null,
      },
    });

    // If this patient had an active offer, promote the next patient in the queue.
    if (entry.status === 'notified') {
      const { data: slot } = await supabaseAdmin
        .from('appointment_slots')
        .select('status')
        .eq('id', entry.slot_id)
        .single();

      if (slot?.status === 'available') {
        await notifyNextWaiting(entry.slot_id);
      }
    }

    sendSuccess(res, null, 'Removed from waitlist');
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/patients/me/waitlist/:entryId
 *
 * Leave the waitlist entirely (while still in 'waiting' status,
 * before an offer has been issued).
 */
export async function leaveWaitlist(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { entryId } = req.params as { entryId: string };

    const { data: entry, error: fetchError } = await supabaseAdmin
      .from('slot_waitlist')
      .select('id, status, patient_id, slot_id')
      .eq('id', entryId)
      .eq('patient_id', patient.id)
      .single();

    if (fetchError || !entry) {
      throw new NotFoundError('Waitlist entry not found');
    }

    if (!['waiting', 'notified'].includes(entry.status)) {
      throw new BadRequestError(`Cannot leave waitlist with status: ${entry.status}`);
    }

    const { data: cancelled, error: cancelError } = await supabaseAdmin
      .from('slot_waitlist')
      .update({ status: 'cancelled' })
      .eq('id', entryId)
      .select('id, slot_id, patient_id, status, queued_at, notified_at, offer_expires_at')
      .single();

    if (cancelError || !cancelled) {
      throw new AppError('Failed to leave waitlist', 500);
    }

    // Push the cancelled status to the patient's SSE so their UI clears the card.
    pushWaitlistUpdate(cancelled.patient_id, {
      event: 'UPDATE',
      entry: {
        id: cancelled.id,
        slot_id: cancelled.slot_id,
        patient_id: cancelled.patient_id,
        status: cancelled.status,
        queued_at: cancelled.queued_at,
        notified_at: cancelled.notified_at ?? null,
        offer_expires_at: cancelled.offer_expires_at ?? null,
      },
    });

    // If this patient was holding an active offer, promote the next in queue.
    if (entry.status === 'notified') {
      const { data: slot } = await supabaseAdmin
        .from('appointment_slots')
        .select('status')
        .eq('id', entry.slot_id)
        .single();

      if (slot?.status === 'available') {
        await notifyNextWaiting(entry.slot_id);
      }
    }

    sendSuccess(res, null, 'Left the waitlist');
  } catch (err) {
    next(err);
  }
}
