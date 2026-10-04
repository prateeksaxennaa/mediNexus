import type { Response } from 'express';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Payload pushed to the patient's browser whenever one of their waitlist rows
 * changes — sent directly from the server whenever a DB write occurs.
 *
 * No Supabase Realtime involved: the server pushes to SSE clients inline,
 * immediately after every relevant INSERT / UPDATE / DELETE.
 */
export interface WaitlistUpdatePayload {
  event: 'UPDATE' | 'INSERT' | 'DELETE';
  entry: {
    id: string;
    slot_id: string;
    patient_id: string;
    status: string;
    queued_at: string;
    notified_at: string | null;
    offer_expires_at: string | null;
  };
}

// ─── Internal state ───────────────────────────────────────────────────────────

/**
 * Map of patientId → Set of open SSE Response objects for that patient.
 * One entry per connected browser tab.
 */
const patientClients = new Map<string, Set<Response>>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendEvent(res: Response, eventName: string, data: unknown): void {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Swallow — client already disconnected
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register an SSE client for a given patient.
 */
export function subscribeWaitlistClient(res: Response, patientId: string): void {
  if (!patientClients.has(patientId)) {
    patientClients.set(patientId, new Set());
  }
  patientClients.get(patientId)!.add(res);
  console.log(
    `[waitlistChannelManager] Client added for patient ${patientId} — total: ${patientClients.get(patientId)!.size}`
  );
}

/**
 * Remove a client when it disconnects.
 */
export function unsubscribeWaitlistClient(res: Response, patientId: string): void {
  const clients = patientClients.get(patientId);
  if (!clients) return;

  clients.delete(res);
  console.log(
    `[waitlistChannelManager] Client removed for patient ${patientId} — remaining: ${clients.size}`
  );

  if (clients.size === 0) {
    patientClients.delete(patientId);
  }
}

/**
 * Push a waitlist update directly to all open SSE connections for a patient.
 *
 * Call this immediately after every relevant DB write — no Realtime needed.
 */
export function pushWaitlistUpdate(
  patientId: string,
  payload: WaitlistUpdatePayload
): void {
  const clients = patientClients.get(patientId);
  if (!clients || clients.size === 0) return;

  for (const client of clients) {
    sendEvent(client, 'waitlist-update', payload);
  }

  console.log(
    `[waitlistChannelManager] Pushed ${payload.event}/${payload.entry.status} to patient ${patientId} (${clients.size} client(s))`
  );
}
