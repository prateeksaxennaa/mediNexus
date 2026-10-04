import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import { requireDoctor } from '../../utils/lookup.js';
import type { CreateSlotsBody } from '../../validators/doctor/slot.validator.js';

// ─── Types ───────────────────────────────────────────────────────────

interface GenerateSlotsBody {
  working_days: number[];   // 0=Sun … 6=Sat
  start_time: string;       // HH:MM
  end_time: string;         // HH:MM
  slot_duration_mins: number;
  days_ahead?: number;      // default 30
}

/**
 * GET /api/doctors/me/slots?upcoming=true&date=YYYY-MM-DD
 * Default: upcoming=true (only future available slots).
 * Pass upcoming=false to get all slots.
 * Pass date=YYYY-MM-DD to scope results to a single UTC day.
 */
export async function listDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const upcoming = (req.query['upcoming'] as string) !== 'false';
    const dateParam = req.query['date'] as string | undefined;

    // ── Reconciliation: fix orphaned 'booked' slots ───────────────────────
    // A slot can get stuck as 'booked' if its appointment was cancelled or
    // completed without the slot being freed (e.g. pre-fix data, edge cases).
    // Find all 'booked' slots for this doctor that have NO active appointment
    // (active = booked | checked_in | in_progress) and reset them to 'available'.
    const { data: bookedSlots } = await supabaseAdmin
      .from('appointment_slots')
      .select('id')
      .eq('doctor_id', doctor.id)
      .eq('status', 'booked');

    if (bookedSlots && bookedSlots.length > 0) {
      const bookedSlotIds = bookedSlots.map((s) => s.id);

      // Find which of those slots have an active appointment
      const { data: activeAppointments } = await supabaseAdmin
        .from('appointments')
        .select('slot_id')
        .in('slot_id', bookedSlotIds)
        .in('status', ['booked', 'checked_in', 'in_progress']);

      const activeSlotIds = new Set(
        (activeAppointments ?? []).map((a) => a.slot_id as string)
      );

      // Slots that are marked 'booked' but have no active appointment are orphaned
      const orphanedSlotIds = bookedSlotIds.filter((id) => !activeSlotIds.has(id));

      if (orphanedSlotIds.length > 0) {
        console.log(
          `[listDoctorSlots] Reconciling ${orphanedSlotIds.length} orphaned booked slot(s) → available`
        );
        await supabaseAdmin
          .from('appointment_slots')
          .update({ status: 'available', locked_by: null, locked_until: null })
          .in('id', orphanedSlotIds);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    let query = supabaseAdmin
      .from('appointment_slots')
      .select('*')
      .eq('doctor_id', doctor.id)
      .order('slot_start');

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      query = query
        .gte('slot_start', `${dateParam}T00:00:00.000Z`)
        .lt('slot_start', `${dateParam}T23:59:59.999Z`);
    } else if (upcoming) {
      query = query.gt('slot_start', new Date().toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('[listDoctorSlots] query failed:', error.message);
      throw new AppError('Failed to fetch slots', 500);
    }

    sendSuccess(res, { slots: data ?? [] }, 'Slots retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/doctors/me/slots
 * Bulk-creates appointment slots for the authenticated doctor.
 */
export async function createDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { slots } = req.body as CreateSlotsBody;

    // Validate slot_start < slot_end for each slot
    for (const slot of slots) {
      if (new Date(slot.slot_start) >= new Date(slot.slot_end)) {
        throw new BadRequestError(
          `slot_start must be before slot_end (got start=${slot.slot_start}, end=${slot.slot_end})`
        );
      }
    }

    const rows = slots.map((s) => ({
      doctor_id: doctor.id,
      slot_start: s.slot_start,
      slot_end: s.slot_end,
      status: 'available' as const,
    }));

    const { data, error } = await supabaseAdmin
      .from('appointment_slots')
      .insert(rows)
      .select();

    if (error || !data) {
      console.error('[createDoctorSlots] insert failed:', error?.message);
      throw new AppError('Failed to create slots', 500);
    }

    sendSuccess(res, { slots: data }, `${data.length} slot(s) created`, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/doctors/me/slots/:slotId
 * Only allowed if the slot is still 'available' (not booked/locked).
 */
export async function deleteDoctorSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { slotId } = req.params as { slotId: string };

    // Verify ownership + current status
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, status')
      .eq('id', slotId)
      .eq('doctor_id', doctor.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Slot not found');
    }

    if (existing.status !== 'available') {
      throw new BadRequestError(
        `Cannot delete a slot with status: ${existing.status}. Only 'available' slots can be deleted.`
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('appointment_slots')
      .delete()
      .eq('id', slotId);

    if (deleteError) {
      console.error('[deleteDoctorSlot] delete failed:', deleteError.message);
      throw new AppError('Failed to delete slot', 500);
    }

    sendSuccess(res, null, 'Slot deleted');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/doctors/me/slots/generate
 * Generates appointment slots for the next N days (default 30) based on
 * the doctor's working schedule using a server-side loop.
 */
export async function generateDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const {
      working_days,
      start_time,
      end_time,
      slot_duration_mins,
      days_ahead = 30,
    } = req.body as GenerateSlotsBody;

    if (!working_days || !Array.isArray(working_days) || working_days.length === 0) {
      throw new BadRequestError('working_days must be a non-empty array (0=Sun, 6=Sat)');
    }
    if (!start_time || !end_time) {
      throw new BadRequestError('start_time and end_time are required (HH:MM format)');
    }
    if (!slot_duration_mins || slot_duration_mins < 5 || slot_duration_mins > 120) {
      throw new BadRequestError('slot_duration_mins must be between 5 and 120');
    }

    const slotsToInsert: {
      doctor_id: string;
      slot_start: string;
      slot_end: string;
      status: 'available';
    }[] = [];

    const now = new Date();

    for (let i = 0; i <= days_ahead; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      date.setHours(0, 0, 0, 0);

      const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat
      if (!working_days.includes(dayOfWeek)) continue;

      const [startHour, startMin] = start_time.split(':').map(Number);
      const [endHour, endMin] = end_time.split(':').map(Number);

      const slotStart = new Date(date);
      slotStart.setHours(startHour, startMin, 0, 0);

      const slotEnd = new Date(date);
      slotEnd.setHours(endHour, endMin, 0, 0);

      let current = new Date(slotStart);
      while (current < slotEnd) {
        const next = new Date(current.getTime() + slot_duration_mins * 60 * 1000);
        if (next > slotEnd) break;

        slotsToInsert.push({
          doctor_id: doctor.id,
          slot_start: current.toISOString(),
          slot_end: next.toISOString(),
          status: 'available',
        });

        current = next;
      }
    }

    if (slotsToInsert.length === 0) {
      sendSuccess(res, { generated: 0 }, 'No slots to generate for given schedule', 200);
      return;
    }

    // Insert in chunks of 100 to avoid request size limits
    const CHUNK = 100;
    let totalInserted = 0;
    for (let i = 0; i < slotsToInsert.length; i += CHUNK) {
      const chunk = slotsToInsert.slice(i, i + CHUNK);
      const { data, error } = await supabaseAdmin
        .from('appointment_slots')
        .upsert(chunk, { onConflict: 'doctor_id,slot_start', ignoreDuplicates: true })
        .select('id');

      if (error) {
        console.error('[generateDoctorSlots] upsert failed:', error.message);
        throw new AppError('Failed to generate slots', 500);
      }
      totalInserted += data?.length ?? 0;
    }

    sendSuccess(
      res,
      { generated: totalInserted, attempted: slotsToInsert.length },
      `${totalInserted} slot(s) generated`,
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/doctors/me/slots/:slotId/block
 * Marks a single slot as 'blocked'.
 */
export async function blockDoctorSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { slotId } = req.params as { slotId: string };

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, status')
      .eq('id', slotId)
      .eq('doctor_id', doctor.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Slot not found');
    }

    if (existing.status === 'booked') {
      throw new BadRequestError('Cannot block a slot that is already booked');
    }

    if (existing.status === 'blocked') {
      throw new BadRequestError('Slot is already blocked');
    }

    const { data, error } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'blocked' })
      .eq('id', slotId)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Failed to block slot', 500);
    }

    sendSuccess(res, { slot: data }, 'Slot blocked');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/doctors/me/slots/:slotId/unblock
 * Marks a single slot back to 'available'.
 */
export async function unblockDoctorSlot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { slotId } = req.params as { slotId: string };

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, status')
      .eq('id', slotId)
      .eq('doctor_id', doctor.id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Slot not found');
    }

    if (existing.status !== 'blocked') {
      throw new BadRequestError(`Cannot unblock a slot with status: ${existing.status}`);
    }

    const { data, error } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'available' })
      .eq('id', slotId)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Failed to unblock slot', 500);
    }

    sendSuccess(res, { slot: data }, 'Slot unblocked');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/doctors/me/leave
 * Blocks all available slots on a specified date.
 */
export async function markDoctorLeave(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const doctor = await requireDoctor(userId);
    const { leave_date } = req.body as { leave_date: string }; // YYYY-MM-DD

    if (!leave_date || !/^\d{4}-\d{2}-\d{2}$/.test(leave_date)) {
      throw new BadRequestError('leave_date must be in YYYY-MM-DD format');
    }

    // Fetch all available slots on that date for this doctor
    const { data: availableSlots, error: fetchError } = await supabaseAdmin
      .from('appointment_slots')
      .select('id')
      .eq('doctor_id', doctor.id)
      .gte('slot_start', `${leave_date}T00:00:00.000Z`)
      .lt('slot_start', `${leave_date}T23:59:59.999Z`)
      .eq('status', 'available');

    if (fetchError) {
      throw new AppError('Failed to fetch slots', 500);
    }

    if (!availableSlots || availableSlots.length === 0) {
      sendSuccess(res, { blocked: 0 }, 'No available slots to block on this date', 200);
      return;
    }

    const slotIds = availableSlots.map((s) => s.id);

    const { error: updateError } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'blocked' })
      .in('id', slotIds);

    if (updateError) {
      throw new AppError('Failed to mark leave day', 500);
    }

    sendSuccess(res, { blocked: slotIds.length }, `${slotIds.length} slot(s) blocked for leave day`);
  } catch (err) {
    next(err);
  }
}
