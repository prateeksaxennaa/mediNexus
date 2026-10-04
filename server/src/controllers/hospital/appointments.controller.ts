import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, BadRequestError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';
import type { AppointmentStatus } from '../../models/database.types.js';

type AppointmentFilter = 'upcoming' | 'past' | 'all';

interface HospitalAppointmentRow {
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
  doctors: { full_name: string; specialisation: string } | null;
  patients: { full_name: string; phone_number: string | null } | null;
}

/**
 * GET /api/hospitals/me/appointments?filter=upcoming|past|all&limit=20&offset=0
 */
export async function listHospitalAppointments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);

    const filter: AppointmentFilter =
      (req.query['filter'] as AppointmentFilter) ?? 'all';
    const limit = Math.min(parseInt((req.query['limit'] as string) ?? '20', 10), 100);
    const offset = parseInt((req.query['offset'] as string) ?? '0', 10);

    if (!['upcoming', 'past', 'all'].includes(filter)) {
      throw new BadRequestError('filter must be one of: upcoming, past, all');
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(
        `id, slot_id, patient_id, doctor_id, hospital_id, service_id,
         booking_type, status, notes, created_at,
         appointment_slots ( slot_start, slot_end ),
         doctors ( full_name, specialisation ),
         patients ( full_name, phone_number )`
      )
      .eq('hospital_id', hospital.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[listHospitalAppointments] query failed:', error.message);
      throw new AppError('Failed to fetch appointments', 500);
    }

    const now = new Date().toISOString();
    const appointments = (data as unknown as HospitalAppointmentRow[]) ?? [];

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

    sendSuccess(res, { appointments: filtered }, 'Appointments retrieved');
  } catch (err) {
    next(err);
  }
}
