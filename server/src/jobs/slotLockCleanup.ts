import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { notifyNextWaiting } from './waitlistQueue.js';

/**
 * Releases expired slot locks every 10 seconds for BOTH appointment_slots and service_slots.
 *
 * Slots with status='locked' and locked_until < NOW() are reset to 'available'.
 * After freeing each appointment_slot, the waitlist queue is immediately notified.
 */
export function startSlotLockCleanupJob(): void {
  cron.schedule('*/10 * * * * *', async () => {
    const now = new Date().toISOString();

    // ── 1. Doctor appointment slots ──
    const { data: apptData, error: apptError } = await supabaseAdmin
      .from('appointment_slots')
      .update({ status: 'available', locked_by: null, locked_until: null })
      .eq('status', 'locked')
      .lt('locked_until', now)
      .select('id');

    if (apptError) {
      console.error('[slotLockCleanup] Failed to release expired appointment locks:', apptError.message);
    } else if (apptData && apptData.length > 0) {
      console.log(`[slotLockCleanup] Released ${apptData.length} expired appointment slot lock(s)`);
      for (const { id: slotId } of apptData) {
        await notifyNextWaiting(slotId);
      }
    }

    // ── 2. Service slots ──
    const { data: svcData, error: svcError } = await supabaseAdmin
      .from('service_slots')
      .update({ status: 'available', locked_by: null, locked_until: null })
      .eq('status', 'locked')
      .lt('locked_until', now)
      .select('id');

    if (svcError) {
      console.error('[slotLockCleanup] Failed to release expired service slot locks:', svcError.message);
    } else if (svcData && svcData.length > 0) {
      console.log(`[slotLockCleanup] Released ${svcData.length} expired service slot lock(s)`);
    }
  });

  console.log('[slotLockCleanup] Slot lock cleanup job scheduled (every 10s) — appointment + service slots');
}
