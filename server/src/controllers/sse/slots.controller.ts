import type { Request, Response } from 'express';
import { subscribeClient, unsubscribeClient } from '../../sse/slotChannelManager.js';

/** Returns today's date as YYYY-MM-DD in local time */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/discover/doctors/:doctorId/slots/stream?date=YYYY-MM-DD
 *
 * Opens a persistent SSE connection. Whenever a slot row for this
 * doctor+date changes in Postgres (via Supabase Realtime), the server
 * pushes a `slot-update` event to all connected clients immediately —
 * no polling, no refresh needed.
 *
 * SSE frame format:
 *   event: slot-update
 *   data: { "event": "UPDATE"|"INSERT"|"DELETE", "slot": { id, slot_start, slot_end, status, doctor_id } }
 *
 * Connection lifecycle:
 *   1. Client opens EventSource — server sends a `connected` handshake event.
 *   2. Server registers the response in the channel manager.
 *   3. Client disconnects → `close` event fires → server unregisters the
 *      response; if it was the last client the Realtime channel is torn down.
 */
export async function streamDoctorSlots(req: Request, res: Response): Promise<void> {
  const { doctorId } = req.params as { doctorId: string };
  const dateParam = (req.query['date'] as string | undefined)?.trim();

  // Validate / default the date
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : todayISO();

  // ── SSE headers ──────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Allow cross-origin EventSource (Vite dev server runs on a different port)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders(); // Flush immediately so the browser recognises it as SSE

  // ── Register this response with the shared channel manager ───────────────
  subscribeClient(res, doctorId, date);

  // ── Initial handshake event ──────────────────────────────────────────────
  res.write(`event: connected\ndata: ${JSON.stringify({ doctorId, date })}\n\n`);

  // ── Heartbeat ── keeps the connection alive through proxies / LBs ────────
  // nginx and many cloud LBs close idle connections after ~30–60 s.
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n'); // SSE comment — EventSource ignores it
    } catch {
      clearInterval(heartbeat);
    }
  }, 20_000);

  // ── Clean up on client disconnect ────────────────────────────────────────
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribeClient(res, doctorId, date);
  });
}
