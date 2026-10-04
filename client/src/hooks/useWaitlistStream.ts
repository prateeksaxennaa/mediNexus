import { useEffect, useRef, useCallback } from 'react';
import { patientService, type WaitlistEntry } from '@/services/patient.service';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

/**
 * Polls GET /api/patients/me/waitlist every 3 seconds.
 *
 * Diffs the result against the previous poll and fires `onUpdate` for each
 * row that was inserted, updated (status/offer fields changed), or deleted.
 *
 * Keeps the same external API as the old SSE-based hook so callers are
 * unchanged.
 *
 * @param enabled  - Pass false to pause polling (e.g. user is not logged in).
 * @param onUpdate - Callback invoked for each detected change.
 */
export function useWaitlistStream(
  enabled: boolean,
  onUpdate: (payload: WaitlistUpdatePayload) => void
): void {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  // Previous snapshot keyed by entry id for fast diffing.
  const prevEntriesRef = useRef<Map<string, WaitlistEntry>>(new Map());

  const poll = useCallback(async () => {
    try {
      const res = await patientService.listWaitlist();
      const fresh: WaitlistEntry[] = (res as any).data?.waitlist ?? [];
      const prev = prevEntriesRef.current;

      // ── Detect INSERTs and UPDATEs ────────────────────────────────────────
      for (const entry of fresh) {
        const old = prev.get(entry.id);

        if (!old) {
          // New row — INSERT
          callbackRef.current({
            event: 'INSERT',
            entry: {
              id: entry.id,
              slot_id: entry.slot_id,
              patient_id: entry.patient_id,
              status: entry.status,
              queued_at: entry.queued_at,
              notified_at: entry.notified_at ?? null,
              offer_expires_at: entry.offer_expires_at ?? null,
            },
          });
        } else if (
          old.status !== entry.status ||
          old.notified_at !== entry.notified_at ||
          old.offer_expires_at !== entry.offer_expires_at
        ) {
          // Status or offer fields changed — UPDATE
          callbackRef.current({
            event: 'UPDATE',
            entry: {
              id: entry.id,
              slot_id: entry.slot_id,
              patient_id: entry.patient_id,
              status: entry.status,
              queued_at: entry.queued_at,
              notified_at: entry.notified_at ?? null,
              offer_expires_at: entry.offer_expires_at ?? null,
            },
          });
        }
      }

      // ── Detect DELETEs (rows that disappeared from the live list) ─────────
      const freshIds = new Set(fresh.map((e) => e.id));
      for (const [id, old] of prev) {
        if (!freshIds.has(id)) {
          callbackRef.current({
            event: 'DELETE',
            entry: {
              id: old.id,
              slot_id: old.slot_id,
              patient_id: old.patient_id,
              status: old.status,
              queued_at: old.queued_at,
              notified_at: old.notified_at ?? null,
              offer_expires_at: old.offer_expires_at ?? null,
            },
          });
        }
      }

      // Update snapshot
      prevEntriesRef.current = new Map(fresh.map((e) => [e.id, e]));
    } catch {
      // Network errors are silent — next tick will retry automatically.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Run immediately, then on interval
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      // Reset snapshot so next enable starts fresh
      prevEntriesRef.current = new Map();
    };
  }, [enabled, poll]);
}
