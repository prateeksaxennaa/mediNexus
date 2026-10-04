import type { Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Payload broadcast to every SSE client subscribed to a doctor+date key.
 * Mirrors the columns returned by getDoctorSlots so the client can patch
 * its existing slots array without a full re-fetch.
 */
export interface SlotUpdatePayload {
  /** Which DB event fired */
  event: 'UPDATE' | 'INSERT' | 'DELETE';
  slot: {
    id: string;
    slot_start: string;
    slot_end: string;
    status: string;
    doctor_id: string;
  };
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface ChannelEntry {
  channel: RealtimeChannel;
  /** All currently open SSE Response objects for this key */
  clients: Set<Response>;
}

/**
 * Map of  "doctorId:YYYY-MM-DD"  →  { channel, clients }
 *
 * A single Supabase Realtime channel is opened the first time any client
 * subscribes to a given key, and closed when the last client disconnects.
 * This limits Realtime channels to at most (unique doctor × date pairs in
 * use at any moment), regardless of how many browser tabs are watching.
 */
const channels = new Map<string, ChannelEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKey(doctorId: string, date: string): string {
  return `${doctorId}:${date}`;
}

/**
 * Write a single SSE event frame to one client response.
 * No-ops silently if the socket has already closed.
 */
function sendEvent(res: Response, eventName: string, data: unknown): void {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Swallow — client disconnected between the check and the write
  }
}

/**
 * Broadcast a slot update to every SSE client watching the given key.
 */
function broadcast(key: string, payload: SlotUpdatePayload): void {
  const entry = channels.get(key);
  if (!entry) return;
  for (const client of entry.clients) {
    sendEvent(client, 'slot-update', payload);
  }
}

/**
 * Open a Supabase Realtime channel that watches INSERT/UPDATE/DELETE on
 * `appointment_slots` rows whose `doctor_id` matches and whose `slot_start`
 * falls within [dateStart, dateEnd).
 *
 * Supabase Realtime filter syntax supports equality filters on individual
 * columns.  For the date range we filter only on `doctor_id` at the channel
 * level (supported by Realtime row filters) and apply the date check in the
 * JS callback — this avoids Realtime's restriction to a single filter column.
 */
function openChannel(key: string, doctorId: string, date: string): RealtimeChannel {
  const dateStart = `${date}T00:00:00.000Z`;
  const dateEnd   = `${date}T23:59:59.999Z`;

  const channel = supabaseAdmin
    .channel(`slots:${key}`)
    .on(
      'postgres_changes',
      {
        event: '*',                        // INSERT | UPDATE | DELETE
        schema: 'public',
        table: 'appointment_slots',
        filter: `doctor_id=eq.${doctorId}`,
      },
      (payload) => {
        // Determine the record from new/old depending on event
        const record: any =
          payload.eventType === 'DELETE' ? payload.old : payload.new;

        if (!record?.slot_start) return;

        // Client-side date guard — only forward events for the watched date
        if (record.slot_start < dateStart || record.slot_start > dateEnd) return;

        const update: SlotUpdatePayload = {
          event: payload.eventType as 'UPDATE' | 'INSERT' | 'DELETE',
          slot: {
            id: record.id,
            slot_start: record.slot_start,
            slot_end: record.slot_end,
            status: record.status,
            doctor_id: record.doctor_id,
          },
        };

        broadcast(key, update);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[slotChannelManager] Realtime channel open: ${key}`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[slotChannelManager] Channel ${key} error: ${status}`);
      }
    });

  return channel;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a new SSE client (Express Response) for a given doctor+date.
 *
 * If a Realtime channel for that key does not yet exist, one is created.
 * Call `unsubscribeClient` when the client disconnects.
 */
export function subscribeClient(
  res: Response,
  doctorId: string,
  date: string
): void {
  const key = makeKey(doctorId, date);

  if (!channels.has(key)) {
    const channel = openChannel(key, doctorId, date);
    channels.set(key, { channel, clients: new Set() });
  }

  channels.get(key)!.clients.add(res);
  console.log(
    `[slotChannelManager] Client added to ${key} — total: ${channels.get(key)!.clients.size}`
  );
}

/**
 * Remove a client from the channel.
 * If it was the last client, the Realtime channel is torn down to avoid
 * leaking open WebSocket connections inside the Supabase client.
 */
export function unsubscribeClient(
  res: Response,
  doctorId: string,
  date: string
): void {
  const key = makeKey(doctorId, date);
  const entry = channels.get(key);
  if (!entry) return;

  entry.clients.delete(res);
  console.log(
    `[slotChannelManager] Client removed from ${key} — remaining: ${entry.clients.size}`
  );

  if (entry.clients.size === 0) {
    supabaseAdmin.removeChannel(entry.channel);
    channels.delete(key);
    console.log(`[slotChannelManager] Realtime channel closed: ${key}`);
  }
}
