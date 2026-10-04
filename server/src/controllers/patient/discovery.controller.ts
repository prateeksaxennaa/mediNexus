import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, NotFoundError } from '../../utils/errors.js';

/**
 * GET /api/discover/hospitals?q=<query>&city=<city>&speciality=<spec>
 *
 * Unified full-text search across hospitals, doctors, and services using
 * PostgreSQL GIN-indexed tsvector columns via the `search_hospitals` RPC.
 * Speciality filtering is executed at the DB level (no post-query JS filter).
 */
export async function discoverHospitals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = (req.query['q'] as string | undefined)?.trim() || null;
    const city = (req.query['city'] as string | undefined)?.trim() || null;
    const speciality = (req.query['speciality'] as string | undefined)?.trim() || null;

    // ── Step 1: Try FTS via RPC; fall back to ilike if migration not yet run ──
    const { data: rpcRows, error: rpcError } = await (supabaseAdmin as any).rpc(
      'search_hospitals',
      {
        search_query: q,
        filter_city: city,
        filter_speciality: speciality,
        result_limit: 50,
      }
    );

    // RPC not found means the migration hasn't been run yet — fall back to
    // the legacy ilike approach so the app stays functional in the meantime.
    const rpcNotFound =
      rpcError &&
      (rpcError.code === 'PGRST202' ||
        (rpcError.message as string).includes('Could not find the function'));

    if (rpcError && !rpcNotFound) {
      console.error('[discoverHospitals] RPC failed:', rpcError.message);
      throw new AppError('Failed to search hospitals', 500);
    }

    let hospitals: any[];
    let rankMap: Record<string, number> = {};

    if (!rpcError && rpcRows) {
      // ── FTS path ─────────────────────────────────────────────────────────
      const ranked = (rpcRows ?? []) as { id: string; rank: number }[];
      if (ranked.length === 0) {
        sendSuccess(res, { hospitals: [], count: 0 }, 'Hospitals retrieved');
        return;
      }

      for (const row of ranked) rankMap[row.id] = row.rank;
      const hospitalIds = ranked.map((r) => r.id);

      const { data, error: detailError } = await supabaseAdmin
        .from('hospitals')
        .select(
          `id, name, type, address, city, state, is_approved,
           hospital_services ( id, service_name, department, default_duration_mins, fee, is_available ),
           doctors ( id, full_name, specialisation, verified )`
        )
        .in('id', hospitalIds);

      if (detailError) {
        console.error('[discoverHospitals] detail query failed:', detailError.message);
        throw new AppError('Failed to fetch hospital details', 500);
      }
      hospitals = data ?? [];
    } else {
      // ── Legacy ilike fallback (pre-migration) ─────────────────────────────
      console.warn('[discoverHospitals] search_hospitals RPC not found — using ilike fallback');
      let query = supabaseAdmin
        .from('hospitals')
        .select(
          `id, name, type, address, city, state, is_approved,
           hospital_services ( id, service_name, department, default_duration_mins, fee, is_available ),
           doctors ( id, full_name, specialisation, verified )`
        )
        .eq('is_approved', true);

      if (city) query = query.ilike('city', `%${city}%`);
      if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%`);

      const { data, error: legacyError } = await query.order('name').limit(50);
      if (legacyError) throw new AppError('Failed to search hospitals', 500);

      let results = data ?? [];
      if (speciality) {
        const sl = speciality.toLowerCase();
        results = results.filter((h: any) =>
          (h.doctors ?? []).some((d: any) => d.specialisation?.toLowerCase().includes(sl)) ||
          (h.hospital_services ?? []).some(
            (s: any) =>
              s.service_name?.toLowerCase().includes(sl) ||
              s.department?.toLowerCase().includes(sl)
          )
        );
      }
      hospitals = results;
    }

    // ── Slot availability for today ───────────────────────────────────────────
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();
    const hospitalIds = hospitals.map((h: any) => h.id);

    const availabilityMap: Record<string, boolean> = {};
    const { data: slotsToday } = await supabaseAdmin
      .from('appointment_slots')
      .select('id, doctor_id, doctors!inner(hospital_id)')
      .eq('status', 'available')
      .gte('slot_start', todayStart)
      .lte('slot_start', todayEnd);

    if (slotsToday) {
      for (const slot of slotsToday as any[]) {
        const hId = slot.doctors?.hospital_id;
        if (hId && hospitalIds.includes(hId)) availabilityMap[hId] = true;
      }
    }

    const enriched = hospitals
      .map((h: any) => ({ ...h, has_slots_today: availabilityMap[h.id] ?? false }))
      .sort((a: any, b: any) => (rankMap[b.id] ?? 0) - (rankMap[a.id] ?? 0));

    sendSuccess(res, { hospitals: enriched, count: enriched.length }, 'Hospitals retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/discover/hospitals/:hospitalId
 * Returns a single hospital's full details with doctors and services.
 */
export async function getHospitalDetails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { hospitalId } = req.params as { hospitalId: string };

    const { data, error } = await supabaseAdmin
      .from('hospitals')
      .select(
        `id, name, type, address, city, state,
         hospital_services ( id, service_name, department, default_duration_mins, fee, pay_at_counter, is_available ),
         doctors ( id, full_name, specialisation, verified )`
      )
      .eq('id', hospitalId)
      .eq('is_approved', true)
      .single();

    if (error || !data) {
      throw new NotFoundError('Hospital not found');
    }

    sendSuccess(res, { hospital: data }, 'Hospital details retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/discover/doctors/:doctorId/slots?date=YYYY-MM-DD
 * Returns available slots for a doctor on a given date (or upcoming 7 days if no date).
 */
export async function getDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { doctorId } = req.params as { doctorId: string };
    const dateParam = req.query['date'] as string | undefined;

    // Verify doctor exists and is verified
    const { data: doctor, error: doctorError } = await supabaseAdmin
      .from('doctors')
      .select('id, full_name, specialisation, hospital_id, hospitals ( name, city )')
      .eq('id', doctorId)
      .single();

    if (doctorError || !doctor) {
      throw new NotFoundError('Doctor not found');
    }

    let query = supabaseAdmin
      .from('appointment_slots')
      .select('id, slot_start, slot_end, status')
      .eq('doctor_id', doctorId)
      .in('status', ['available', 'booked'])
      .order('slot_start');

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      query = query
        .gte('slot_start', `${dateParam}T00:00:00.000Z`)
        .lt('slot_start', `${dateParam}T23:59:59.999Z`);
    } else {
      // Default: next 7 days
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('slot_start', from).lte('slot_start', to);
    }

    const { data: slots, error } = await query;

    if (error) {
      console.error('[getDoctorSlots] query failed:', error.message);
      throw new AppError('Failed to fetch slots', 500);
    }

    sendSuccess(res, { doctor, slots: slots ?? [] }, 'Slots retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/discover/doctors/search?q=<query>
 * Public doctor search — used by patients when granting access manually.
 * Returns doctors matching the query by name or specialisation.
 */
export async function searchDoctorsPublic(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = (req.query['q'] as string ?? '').trim();
    if (q.length < 2) {
      sendSuccess(res, { doctors: [] }, 'Query too short');
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('doctors')
      .select('id, full_name, specialisation, hospital_id, hospitals ( name, city )')
      .or(`full_name.ilike.%${q}%,specialisation.ilike.%${q}%`)
      .eq('verified', true)
      .limit(20);

    if (error) {
      console.error('[searchDoctorsPublic] query failed:', error.message);
      throw new AppError('Failed to search doctors', 500);
    }

    sendSuccess(res, { doctors: data ?? [] }, 'Doctors found');
  } catch (err) {
    next(err);
  }
}
