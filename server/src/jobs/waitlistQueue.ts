import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { pushWaitlistUpdate } from '../sse/waitlistChannelManager.js';

/**
 * Notify the FIRST 'waiting' patient in the queue for a given slot (FIFO order
 * by queued_at).  Only one patient is offered the slot at a time — if they
 * decline or their offer expires, the next in line is notified.
 *
 * Called from:
 *  - cancelPatientAppointment   (slot just freed by cancellation)
 *  - slotLockCleanup job        (slot freed because patient abandoned checkout)
 *  - declineWaitlistOffer       (patient explicitly declined)
 *  - leaveWaitlist              (patient left while holding an active offer)
 *  - waitlistQueue cron         (offer expired without acceptance)
 *
 * Returns the number of patients notified (0 or 1).
 */
export async function notifyNextWaiting(slotId: string): Promise<number> {
  // Guard: only notify if the slot is actually available right now.
  const { data: slot } = await supabaseAdmin
    .from('appointment_slots')
    .select('status')
    .eq('id', slotId)
    .single();

  if (slot?.status !== 'available') return 0;

  // Guard: don't double-notify if there is already an active 'notified' offer.
  const { data: existingNotified } = await supabaseAdmin
    .from('slot_waitlist')
    .select('id')
    .eq('slot_id', slotId)
    .eq('status', 'notified')
    .limit(1)
    .maybeSingle();

  if (existingNotified) return 0; // offer already live — skip

  // Pick the FIRST waiting patient by queue position (earliest queued_at).
  const { data: next } = await supabaseAdmin
    .from('slot_waitlist')
    .select('id, patient_id, queued_at')
    .eq('slot_id', slotId)
    .eq('status', 'waiting')
    .order('queued_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) return 0; // nobody waiting

  const offerExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  const now = new Date().toISOString();

  // Update only this specific entry.
  const { data: updated, error } = await supabaseAdmin
    .from('slot_waitlist')
    .update({
      status: 'notified',
      notified_at: now,
      offer_expires_at: offerExpiresAt,
    })
    .eq('id', next.id)
    .eq('status', 'waiting') // concurrency guard — skip if already changed
    .select('id, slot_id, patient_id, status, queued_at, notified_at, offer_expires_at')
    .maybeSingle();

  if (error) {
    console.error(`[waitlistQueue] Failed to notify waiting patient for slot ${slotId}:`, error.message);
    return 0;
  }

  if (!updated) return 0; // lost a race — another concurrent call already promoted someone

  console.log(`[waitlistQueue] Notified patient ${updated.patient_id} for slot ${slotId} (queued ${updated.queued_at})`);

  // Push the notification directly to the patient's open SSE connection(s).
  // This is instant — no polling, no Realtime WebSocket needed.
  pushWaitlistUpdate(updated.patient_id, {
    event: 'UPDATE',
    entry: {
      id: updated.id,
      slot_id: updated.slot_id,
      patient_id: updated.patient_id,
      status: updated.status,
      queued_at: updated.queued_at,
      notified_at: updated.notified_at ?? null,
      offer_expires_at: updated.offer_expires_at ?? null,
    },
  });

  // Also notify via WhatsApp if the patient has a registered phone number.
  try {
    const { sendWhatsAppText } = await import('../controllers/whatsapp/whatsapp.controller.js');
    const { msg } = await import('../controllers/whatsapp/strings.js');

    const { data: patient } = await supabaseAdmin
      .from('patients')
      .select('phone_number, language_preference')
      .eq('id', updated.patient_id)
      .single();

    if (patient?.phone_number) {
      const lang = patient.language_preference === 'hi' ? 'hi' : 'en';
      const text = msg(lang, "waitlist_freed_notify" as any);
      // Fire-and-forget
      sendWhatsAppText(patient.phone_number, text).catch(e => {
        console.error(`[waitlistQueue] WhatsApp notification failed for ${patient.phone_number}:`, e.message);
      });
    }
  } catch (err: any) {
    console.error(`[waitlistQueue] Could not trigger WhatsApp notification:`, err?.message);
  }

  return 1;
}

/**
 * Runs every 10 seconds.
 *
 * Two jobs in one pass:
 *
 * 1. Expire stale 'notified' offers whose offer window closed without anyone
 *    accepting.  Then promote the next patient in the queue.
 *
 * 2. Catch 'orphaned waiting' entries — slots that are available but whose
 *    first waiting patient was never notified (e.g. the server restarted between
 *    a slot being freed and notifyNextWaiting being called).
 */
export function startWaitlistQueueJob(): void {
  cron.schedule('*/10 * * * * *', async () => {
    const now = new Date().toISOString();

    // ── Step 1: expire stale notified offers ─────────────────────────────────
    const { data: expired, error } = await supabaseAdmin
      .from('slot_waitlist')
      .update({ status: 'expired' })
      .eq('status', 'notified')
      .lt('offer_expires_at', now)
      .select('id, slot_id, patient_id, status, queued_at, notified_at, offer_expires_at');

    if (error) {
      console.error('[waitlistQueue] Failed to expire stale offers:', error.message);
    }

    if (expired && expired.length > 0) {
      console.log(`[waitlistQueue] Expired ${expired.length} stale offer(s)`);

      // Push 'expired' event to each patient so their UI updates instantly.
      for (const row of expired) {
        pushWaitlistUpdate(row.patient_id, {
          event: 'UPDATE',
          entry: {
            id: row.id,
            slot_id: row.slot_id,
            patient_id: row.patient_id,
            status: row.status,
            queued_at: row.queued_at,
            notified_at: row.notified_at ?? null,
            offer_expires_at: row.offer_expires_at ?? null,
          },
        });
      }

      // Promote the next patient for each affected slot.
      const affectedSlots = [...new Set(expired.map((e) => e.slot_id as string))];
      for (const slotId of affectedSlots) {
        await notifyNextWaiting(slotId);
      }
    }

    // ── Step 2: catch orphaned waiting entries ────────────────────────────────
    // Find slots that are 'available' AND have at least one 'waiting' entry
    // but NO 'notified' entry.  These got stuck — notify the first in queue now.
    const { data: orphaned } = await supabaseAdmin
      .from('slot_waitlist')
      .select('slot_id')
      .eq('status', 'waiting');

    if (!orphaned || orphaned.length === 0) return;

    const candidateSlotIds = [...new Set(orphaned.map((e) => e.slot_id as string))];

    const { data: availableSlots } = await supabaseAdmin
      .from('appointment_slots')
      .select('id')
      .in('id', candidateSlotIds)
      .eq('status', 'available');

    if (!availableSlots || availableSlots.length === 0) return;

    for (const { id: slotId } of availableSlots) {
      // notifyNextWaiting already guards against double-notifying
      await notifyNextWaiting(slotId);
    }
  });

  console.log('[waitlistQueue] Waitlist queue job scheduled (every 10s)');
}
