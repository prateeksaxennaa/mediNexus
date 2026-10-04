import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError, BadRequestError } from '../../utils/errors.js';
import { requireHospital } from '../../utils/lookup.js';

interface GenerateSlotsBody {
  working_days: number[];      // 0=Sun … 6=Sat
  start_time: string;          // HH:MM
  end_time: string;            // HH:MM
  slot_duration_mins: number;
  days_ahead?: number;         // default 30
}

/**
 * POST /api/hospitals/me/doctors/:doctorId/slots/generate
 * Hospital admin generates slots on behalf of one of their doctors.
 */
export async function generateHospitalDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw new AppError('Authenticated user not found', 401);

    const hospital = await requireHospital(adminId);
    const { doctorId } = req.params as { doctorId: string };

    // Ensure doctor belongs to this hospital
    const { data: doctor, error: doctorError } = await supabaseAdmin
      .from('doctors')
      .select('id, hospital_id, full_name')
      .eq('id', doctorId)
      .eq('hospital_id', hospital.id)
      .single();

    if (doctorError || !doctor) {
      throw new NotFoundError('Doctor not found in your hospital');
    }

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

      const dayOfWeek = date.getDay();
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

    const CHUNK = 100;
    let totalInserted = 0;
    for (let i = 0; i < slotsToInsert.length; i += CHUNK) {
      const chunk = slotsToInsert.slice(i, i + CHUNK);
      const { data, error } = await supabaseAdmin
        .from('appointment_slots')
        .upsert(chunk, { onConflict: 'doctor_id,slot_start', ignoreDuplicates: true })
        .select('id');

      if (error) {
        console.error('[generateHospitalDoctorSlots] upsert failed:', error.message);
        throw new AppError('Failed to generate slots', 500);
      }
      totalInserted += data?.length ?? 0;
    }

    sendSuccess(
      res,
      { generated: totalInserted, attempted: slotsToInsert.length, doctor_id: doctor.id },
      `${totalInserted} slot(s) generated for ${doctor.full_name}`,
      201
    );
  } catch (err) {
    next(err);
  }
}
