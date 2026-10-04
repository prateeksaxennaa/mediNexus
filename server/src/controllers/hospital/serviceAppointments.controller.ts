import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, BadRequestError, NotFoundError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';
import type { AppointmentStatus } from '../../models/database.types.js';

type AppointmentFilter = 'upcoming' | 'past' | 'all';

const VALID_STATUSES: AppointmentStatus[] = [
  'booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show',
];

interface ServiceAppointmentRow {
  id: string;
  slot_id: string;
  patient_id: string;
  hospital_id: string;
  service_id: string;
  booking_type: string;
  status: AppointmentStatus;
  notes: string | null;
  booked_at: string | null;
  created_at: string;
  service_slots: { slot_date: string; slot_number: number } | null;
  hospital_services: { service_name: string; department: string; fee: number } | null;
  patients: { full_name: string; phone_number: string | null } | null;
}

/**
 * GET /api/hospitals/me/services/appointments
 *   ?filter=upcoming|past|all   (default: all)
 *   &serviceId=<uuid>           (optional)
 *   &status=<appointment_status>(optional)
 *   &date=YYYY-MM-DD            (optional — filter to a specific slot date)
 *   &limit=<n>                  (default 50, max 200)
 *   &offset=<n>                 (default 0)
 *
 * NOTE: `filter` (upcoming/past) and `date` are applied in-memory after fetching.
 * We intentionally over-fetch (up to max 200) before filtering so that pagination
 * is correct. For very high-volume hospitals a cursor-based approach is preferred,
 * but for typical usage 200 rows is sufficient.
 */
export async function listServiceAppointments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);

    // ── Parse & validate query params ────────────────────────────
    const filter: AppointmentFilter =
      (['upcoming', 'past', 'all'].includes(req.query['filter'] as string)
        ? req.query['filter']
        : 'all') as AppointmentFilter;

    const rawLimit  = parseInt((req.query['limit']  as string) ?? '50',  10);
    const rawOffset = parseInt((req.query['offset'] as string) ?? '0',  10);
    const limit  = isNaN(rawLimit)  ? 50  : Math.min(Math.max(rawLimit,  1), 200);
    const offset = isNaN(rawOffset) ? 0   : Math.max(rawOffset, 0);

    const serviceId    = req.query['serviceId'] as string | undefined;
    const statusFilter = req.query['status']    as string | undefined;
    const dateFilter   = req.query['date']      as string | undefined;

    if (statusFilter && !VALID_STATUSES.includes(statusFilter as AppointmentStatus)) {
      throw new BadRequestError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    if (dateFilter && !/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
      throw new BadRequestError('date must be in YYYY-MM-DD format');
    }

    // ── Build DB query ────────────────────────────────────────────
    // We fetch up to 200 rows and apply upcoming/past + date filters in JS.
    // This avoids Supabase join-level filter limitations and keeps pagination
    // semantics correct for typical hospital volumes.
    let query = (supabaseAdmin as any)
      .from('service_appointments')
      .select(
        `id, slot_id, patient_id, hospital_id, service_id,
         booking_type, status, notes, booked_at, created_at,
         service_slots ( slot_date, slot_number ),
         hospital_services ( service_name, department, fee ),
         patients ( full_name, phone_number )`
      )
      .eq('hospital_id', hospital.id)
      .order('booked_at', { ascending: false })
      .limit(200); // over-fetch; JS filtering + pagination applied below

    if (serviceId) query = query.eq('service_id', serviceId);
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, error } = await query;

    if (error) {
      console.error('[listServiceAppointments] query failed:', error.message);
      throw new AppError('Failed to fetch service appointments', 500);
    }

    let rows = (data as unknown as ServiceAppointmentRow[]) ?? [];

    // ── In-memory filtering ───────────────────────────────────────
    // date filter: match slot_date exactly
    if (dateFilter) {
      rows = rows.filter((r) => r.service_slots?.slot_date === dateFilter);
    }

    // upcoming/past filter
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
    if (filter === 'upcoming') {
      rows = rows.filter((r) => r.service_slots && r.service_slots.slot_date >= today);
    } else if (filter === 'past') {
      rows = rows.filter((r) => !r.service_slots || r.service_slots.slot_date < today);
    }

    // ── Paginate after filtering ──────────────────────────────────
    const total = rows.length;
    const appointments = rows.slice(offset, offset + limit);

    sendSuccess(res, { appointments, total }, 'Service appointments retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/hospitals/me/services/appointments/:appointmentId/status
 * Body: { status: AppointmentStatus }
 *
 * Allowed admin transitions:
 *   booked      → checked_in | cancelled | no_show
 *   checked_in  → in_progress | cancelled
 *   in_progress → completed | cancelled
 *   (completed, cancelled, no_show are terminal — no further transitions)
 *
 * When an appointment is cancelled the linked service_slot is freed back
 * to 'available'.
 */
export async function updateServiceAppointmentStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);

    const { appointmentId } = req.params as { appointmentId: string };
    const { status: newStatus } = req.body as { status: AppointmentStatus };

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      throw new BadRequestError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    // Fetch current appointment (scoped to this hospital)
    const { data: appt, error: fetchError } = await (supabaseAdmin as any)
      .from('service_appointments')
      .select('id, status, slot_id, hospital_id')
      .eq('id', appointmentId)
      .eq('hospital_id', hospital.id)
      .single();

    if (fetchError || !appt) {
      throw new NotFoundError('Service appointment not found');
    }

    const current: AppointmentStatus = appt.status;

    // ── Guard terminal states ─────────────────────────────────────
    const TERMINAL: AppointmentStatus[] = ['completed', 'cancelled', 'no_show'];
    if (TERMINAL.includes(current)) {
      throw new BadRequestError(
        `Appointment is already ${current} and cannot be updated`
      );
    }

    // ── Guard allowed transitions ─────────────────────────────────
    const ALLOWED: Record<AppointmentStatus, AppointmentStatus[]> = {
      booked:      ['checked_in', 'cancelled', 'no_show'],
      checked_in:  ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed:   [],
      cancelled:   [],
      no_show:     [],
    };

    if (!ALLOWED[current].includes(newStatus)) {
      throw new BadRequestError(
        `Cannot transition from '${current}' to '${newStatus}'. ` +
        `Allowed next states: ${ALLOWED[current].join(', ') || 'none'}`
      );
    }

    // ── Perform update ────────────────────────────────────────────
    const { data: updated, error: updateError } = await (supabaseAdmin as any)
      .from('service_appointments')
      .update({ status: newStatus })
      .eq('id', appointmentId)
      .select('id, status, slot_id, service_id, patient_id, booked_at')
      .single();

    if (updateError || !updated) {
      throw new AppError('Failed to update appointment status', 500);
    }

    // ── Free the slot if cancelled ────────────────────────────────
    if (newStatus === 'cancelled') {
      await (supabaseAdmin as any)
        .from('service_slots')
        .update({ status: 'available', locked_by: null, locked_until: null })
        .eq('id', appt.slot_id)
        .eq('status', 'booked'); // only reset if still booked (guard)
    }

    sendSuccess(res, { appointment: updated }, `Appointment status updated to '${newStatus}'`);
  } catch (err) {
    next(err);
  }
}
