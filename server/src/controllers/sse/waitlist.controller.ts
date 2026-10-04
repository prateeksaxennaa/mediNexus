import type { Request, Response } from 'express';
import { subscribeWaitlistClient, unsubscribeWaitlistClient } from '../../sse/waitlistChannelManager.js';
import { requirePatient } from '../../utils/lookup.js';
import { AppError } from '../../utils/errors.js';

/**
 * GET /api/patients/me/waitlist/stream
 *
 * Opens a persistent SSE connection for the authenticated patient.
 * Whenever one of their `slot_waitlist` rows changes in Postgres (via
 * Supabase Realtime), the server immediately pushes a `waitlist-update`
 * event — no polling needed on the client.
 *
 * SSE frame format:
 *   event: waitlist-update
 *   data: { "event": "UPDATE"|"INSERT"|"DELETE", "entry": { id, slot_id, patient_id, status, queued_at, notified_at, offer_expires_at } }
 *
 * The client is responsible for re-fetching full entry details (with doctor/
 * hospital joins) when it receives an INSERT or needs to display extra info.
 * For status transitions (waiting → notified, notified → expired/cancelled)
 * the bare entry is enough to update the UI immediately.
 */
export async function streamPatientWaitlist(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  let patient: { id: string };
  try {
    patient = await requirePatient(userId);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
    return;
  }

  // ── SSE headers ──────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // ── Register with channel manager ────────────────────────────────────────
  subscribeWaitlistClient(res, patient.id);

  // ── Handshake event ──────────────────────────────────────────────────────
  res.write(`event: connected\ndata: ${JSON.stringify({ patientId: patient.id })}\n\n`);

  // ── Heartbeat — keeps connection alive through proxies ───────────────────
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20_000);

  // ── Clean up on disconnect ───────────────────────────────────────────────
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribeWaitlistClient(res, patient.id);
  });
}
