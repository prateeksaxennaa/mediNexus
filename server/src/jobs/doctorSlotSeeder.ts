import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How many days ahead (inclusive of today) to keep slots seeded. */
const WINDOW_DAYS = 31;

/** Max rows per upsert batch (Supabase REST default limit is 1000). */
const BATCH_SIZE = 500;

/**
 * Default working days (Mon–Sat) used when a doctor's schedule is stored.
 * Sunday (0) is always skipped.
 */
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Mon=1 … Sat=6

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Splits an array into chunks of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Core seeding logic ───────────────────────────────────────────────────────

/**
 * Seeds appointment slots for all verified doctors that have a schedule
 * configured (`available_from`, `available_to`, `slot_duration_mins`).
 *
 * Strategy:
 *  1. Fetch all verified doctors with scheduling fields set.
 *  2. For each doctor, build the full set of slots they should have over the
 *     next 31 days (Mon–Sat by default, skipping Sunday).
 *  3. Fetch which slot_start timestamps already exist in that window so we
 *     can skip them (no-op for already-created slots).
 *  4. Upsert only the missing rows in batches of 500.
 *
 * Error isolation: a failure on one doctor is logged but does not abort the
 * rest of the run.
 */
export async function seedDoctorSlots(): Promise<void> {
  // 1. Fetch verified doctors with a full schedule configured
  const { data: doctors, error: doctorsError } = await supabaseAdmin
    .from('doctors')
    .select('id, full_name, available_from, available_to, slot_duration_mins')
    .eq('verified', true)
    .not('available_from', 'is', null)
    .not('available_to', 'is', null)
    .not('slot_duration_mins', 'is', null);

  if (doctorsError) {
    console.error('[doctorSlotSeeder] Failed to fetch doctors:', doctorsError.message);
    return;
  }

  if (!doctors || doctors.length === 0) {
    console.log('[doctorSlotSeeder] No doctors with configured schedules — nothing to seed.');
    return;
  }

  // Build window boundaries (UTC)
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowStart.getUTCDate() + WINDOW_DAYS);

  const windowStartISO = windowStart.toISOString();
  const windowEndISO   = windowEnd.toISOString();

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const doctor of doctors) {
    try {
      const availableFrom: string | null = doctor.available_from;
      const availableTo: string | null   = doctor.available_to;
      const durationMins: number | null  = doctor.slot_duration_mins;

      // Skip doctors missing schedule data
      if (!availableFrom || !availableTo || !durationMins || durationMins < 5) {
        console.warn(
          `[doctorSlotSeeder] Doctor ${doctor.id} (${doctor.full_name}) missing schedule fields — skipping.`
        );
        continue;
      }

      const [startHour, startMin] = availableFrom.split(':').map(Number);
      const [endHour, endMin]     = availableTo.split(':').map(Number);

      // 2. Compute which slot_start timestamps should exist in the window
      const expectedSlots = new Map<string, { slot_end: string }>(); // key = ISO slot_start

      for (let dayOffset = 0; dayOffset < WINDOW_DAYS; dayOffset++) {
        const date = new Date(windowStart);
        date.setUTCDate(windowStart.getUTCDate() + dayOffset);

        const dayOfWeek = date.getUTCDay(); // 0=Sun … 6=Sat
        if (!DEFAULT_WORKING_DAYS.includes(dayOfWeek)) continue;

        const slotStart = new Date(date);
        slotStart.setUTCHours(startHour, startMin, 0, 0);

        const dayEnd = new Date(date);
        dayEnd.setUTCHours(endHour, endMin, 0, 0);

        let current = new Date(slotStart);
        while (current < dayEnd) {
          const next = new Date(current.getTime() + durationMins * 60_000);
          if (next > dayEnd) break;

          expectedSlots.set(current.toISOString(), { slot_end: next.toISOString() });
          current = next;
        }
      }

      if (expectedSlots.size === 0) {
        totalSkipped++;
        continue;
      }

      // 3. Fetch existing slot_start timestamps for this doctor in the window
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('appointment_slots')
        .select('slot_start')
        .eq('doctor_id', doctor.id)
        .gte('slot_start', windowStartISO)
        .lt('slot_start', windowEndISO);

      if (existingError) {
        console.error(
          `[doctorSlotSeeder] Failed to fetch existing slots for doctor ${doctor.id}:`,
          existingError.message
        );
        continue;
      }

      const existingSet = new Set<string>(
        (existing ?? []).map((r: { slot_start: string }) => r.slot_start)
      );

      // 4. Build only the missing rows
      const toInsert: {
        doctor_id: string;
        slot_start: string;
        slot_end: string;
        status: 'available';
      }[] = [];

      for (const [slotStartISO, { slot_end }] of expectedSlots) {
        if (!existingSet.has(slotStartISO)) {
          toInsert.push({
            doctor_id:  doctor.id,
            slot_start: slotStartISO,
            slot_end,
            status: 'available' as const,
          });
        }
      }

      if (toInsert.length === 0) {
        totalSkipped++;
        continue;
      }

      // 5. Upsert in batches — ignoreDuplicates guards against race conditions
      const batches = chunk(toInsert, BATCH_SIZE);
      let doctorInserted = 0;

      for (const batch of batches) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('appointment_slots')
          .upsert(batch, {
            onConflict: 'doctor_id,slot_start',
            ignoreDuplicates: true,
          })
          .select('id');

        if (insertError) {
          console.error(
            `[doctorSlotSeeder] Batch insert error for doctor ${doctor.id} (${doctor.full_name}):`,
            insertError.message
          );
        } else {
          doctorInserted += inserted?.length ?? 0;
        }
      }

      totalInserted += doctorInserted;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[doctorSlotSeeder] Unexpected error for doctor ${doctor.id}:`,
        msg
      );
    }
  }

  if (totalInserted > 0) {
    console.log(
      `[doctorSlotSeeder] Seeded ${totalInserted} new slot(s) for ${doctors.length} doctor(s) ` +
      `(window: ${windowStartISO.split('T')[0]} → ${windowEndISO.split('T')[0]}, ` +
      `${totalSkipped} already fully seeded)`
    );
  }
}

// ─── Cron scheduling ──────────────────────────────────────────────────────────

/**
 * Starts the doctor slot auto-seeding job:
 *  - Runs immediately on startup so slots are ready as soon as the server starts.
 *  - Runs every day at 00:10 UTC to seed the new day that rolls into the window.
 *  - Runs every hour as a catch-up for server restarts or missed midnight runs.
 */
export function startDoctorSlotSeeder(): void {
  // Immediate run on startup
  seedDoctorSlots().catch((err) => {
    console.error('[doctorSlotSeeder] Startup seed failed:', err);
  });

  // Daily at 00:10 UTC
  cron.schedule('10 0 * * *', () => {
    seedDoctorSlots().catch((err) => {
      console.error('[doctorSlotSeeder] Daily seed failed:', err);
    });
  });

  // Hourly catch-up
  cron.schedule('30 * * * *', () => {
    seedDoctorSlots().catch((err) => {
      console.error('[doctorSlotSeeder] Hourly seed failed:', err);
    });
  });

  console.log(
    '[doctorSlotSeeder] Doctor slot seeder started ' +
    '(immediate + daily 00:10 UTC + hourly catch-up)'
  );
}
