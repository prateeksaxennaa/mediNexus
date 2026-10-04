import { useEffect, useRef } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlotUpdatePayload {
  event: 'UPDATE' | 'INSERT' | 'DELETE';
  slot: {
    id: string;
    slot_start: string;
    slot_end: string;
    status: string;
    doctor_id: string;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Opens a persistent SSE connection to
 *   GET /api/discover/doctors/:doctorId/slots/stream?date=YYYY-MM-DD
 *
 * Calls `onSlotUpdate` whenever a `slot-update` event arrives.
 * The connection is opened when both `doctorId` and `date` are non-empty,
 * and is automatically closed + reopened whenever either value changes.
 *
 * @param doctorId  - Watched doctor.  Pass empty string to pause the stream.
 * @param date      - Watched date in `YYYY-MM-DD` format.
 * @param onSlotUpdate - Callback invoked for each incoming slot change.
 */
export function useSlotStream(
  doctorId: string,
  date: string,
  onSlotUpdate: (payload: SlotUpdatePayload) => void
): void {
  // Keep a stable ref to the callback so the effect does not re-run when the
  // parent component re-renders with an inline arrow function.
  const callbackRef = useRef(onSlotUpdate);
  callbackRef.current = onSlotUpdate;

  useEffect(() => {
    if (!doctorId || !date) return;

    const url = `${BASE_URL}/api/discover/doctors/${encodeURIComponent(doctorId)}/slots/stream?date=${encodeURIComponent(date)}`;
    const es = new EventSource(url);

    es.addEventListener('slot-update', (e: MessageEvent) => {
      try {
        const payload: SlotUpdatePayload = JSON.parse(e.data);
        callbackRef.current(payload);
      } catch {
        console.warn('[useSlotStream] Failed to parse slot-update payload:', e.data);
      }
    });

    es.addEventListener('connected', (e: MessageEvent) => {
      try {
        const info = JSON.parse(e.data);
        console.log('[useSlotStream] Connected:', info);
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      // EventSource will automatically attempt to reconnect — log only.
      console.warn('[useSlotStream] SSE connection error — browser will retry automatically');
    };

    return () => {
      es.close();
    };
  }, [doctorId, date]);
}
