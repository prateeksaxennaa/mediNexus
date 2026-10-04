import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** How many days ahead (inclusive of today) to keep slots seeded. */
const WINDOW_DAYS = 31;

/** Max rows per upsert batch (Supabase REST has a default 1000-row limit). */
const BATCH_SIZE = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a YYYY-MM-DD string offset by `offsetDays` from today (UTC). */
function utcDateString(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

/**
 * Generates the list of YYYY-MM-DD dates in the rolling window,
 * skipping Sundays (UTC day 0).
 */
function buildWindowDates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() !== 0) {
      dates.push(d.toISOString().split('T')[0]);
    }
  }
  return dates;
}

/**
 * Splits an array into chunks of `size`.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Core seeding logic ───────────────────────────────────────────────────────

/**
 * Seeds service slots for all active services.
 *
 * Strategy:
 *  1. Fetch all is_available=true services with their daily_slot_limit.
 *  2. For each service, fetch which (slot_date, slot_number) pairs already exist
 *     within the window — so we never try to insert duplicates.
 *  3. Build only the missing rows and upsert them in batches.
 *
 * Error isolation: a failure on one service is logged but does not abort the
 * rest of the run.
 */
export async function seedServiceSlots(): Promise<void> {
  const windowDates = buildWindowDates();
  if (windowDates.length === 0) return;

  const windowStart = windowDates[0];
  const windowEnd   = windowDates[windowDates.length - 1];

  // 1. Fetch all active services
  const { data: services, error: servicesError } = await supabaseAdmin
    .from('hospital_services')
    .select('id, service_name, daily_slot_limit, hospital_id')
    .eq('is_available', true);

  if (servicesError) {
    console.error('[serviceSlotSeeder] Failed to fetch services:', servicesError.message);
    return;
  }

  if (!services || services.length === 0) {
    console.log('[serviceSlotSeeder] No active services found — nothing to seed.');
    return;
  }

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const service of services) {
    try {
      const slotsPerDay: number = service.daily_slot_limit ?? 10;

      // 2. Find which dates already have at least one slot for this service
      //    within the window, so we can skip fully-seeded dates.
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('service_slots')
        .select('slot_date, slot_number')
        .eq('service_id', service.id)
        .gte('slot_date', windowStart)
        .lte('slot_date', windowEnd);

      if (existingError) {
        console.error(
          `[serviceSlotSeeder] Failed to fetch existing slots for service ${service.id}:`,
          existingError.message
        );
        continue; // skip this service, try the next
      }

      // Build a Set of "date|slotNumber" keys for O(1) lookup
      const existingKeys = new Set<string>(
        (existing ?? []).map((r: { slot_date: string; slot_number: number }) =>
          `${r.slot_date}|${r.slot_number}`
        )
      );

      // 3. Build missing rows
      const toInsert: {
        service_id: string;
        slot_date: string;
        slot_number: number;
        status: 'available';
      }[] = [];

      for (const date of windowDates) {
        for (let slotNum = 1; slotNum <= slotsPerDay; slotNum++) {
          const key = `${date}|${slotNum}`;
          if (!existingKeys.has(key)) {
            toInsert.push({
              service_id:  service.id,
              slot_date:   date,
              slot_number: slotNum,
              status:      'available' as const,
            });
          }
        }
      }

      if (toInsert.length === 0) {
        totalSkipped++;
        continue;
      }

      // 4. Upsert in batches to stay within Supabase row limits.
      //    `ignoreDuplicates: true` is a final safety net against races.
      const batches = chunk(toInsert, BATCH_SIZE);
      let serviceInserted = 0;

      for (const batch of batches) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('service_slots')
          .upsert(batch, {
            onConflict: 'service_id,slot_date,slot_number',
            ignoreDuplicates: true,
          })
          .select('id');

        if (insertError) {
          console.error(
            `[serviceSlotSeeder] Batch insert error for service ${service.id} (${service.service_name}):`,
            insertError.message
          );
          // Don't break — other batches for this service may still succeed
        } else {
          serviceInserted += inserted?.length ?? 0;
        }
      }

      totalInserted += serviceInserted;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[serviceSlotSeeder] Unexpected error for service ${service.id}:`,
        msg
      );
    }
  }

  if (totalInserted > 0) {
    console.log(
      `[serviceSlotSeeder] Seeded ${totalInserted} new slot(s) across ${services.length} service(s) ` +
      `(window: ${windowStart} → ${windowEnd}, ${totalSkipped} already fully seeded)`
    );
  }
}

// ─── Cron scheduling ──────────────────────────────────────────────────────────

/**
 * Starts the auto-seeding job:
 *  - Runs immediately on startup (so slots are ready the moment the server starts).
 *  - Runs every day at 00:05 UTC to seed the new day that just rolled into the window.
 *  - Also runs every hour as a catch-up in case the midnight run failed or the
 *    server was down overnight.
 */
export function startServiceSlotSeeder(): void {
  // Immediate run on startup
  seedServiceSlots().catch((err) => {
    console.error('[serviceSlotSeeder] Startup seed failed:', err);
  });

  // Daily at 00:05 UTC — seeds the newly-added 31st day
  cron.schedule('5 0 * * *', () => {
    seedServiceSlots().catch((err) => {
      console.error('[serviceSlotSeeder] Daily seed failed:', err);
    });
  });

  // Hourly catch-up — handles server restarts, missed midnight runs
  cron.schedule('0 * * * *', () => {
    seedServiceSlots().catch((err) => {
      console.error('[serviceSlotSeeder] Hourly seed failed:', err);
    });
  });

  console.log(
    '[serviceSlotSeeder] Service slot seeder started ' +
    '(immediate + daily 00:05 UTC + hourly catch-up)'
  );
}
