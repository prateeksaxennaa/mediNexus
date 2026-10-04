import { useEffect } from 'react';

const EVENT_NAME = 'appointment-booked';

/**
 * Dispatch this after a booking succeeds (e.g. in PatientDiscover) to notify
 * any mounted PatientHome / PatientAppointments that they should re-fetch.
 */
export function dispatchAppointmentBooked(): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/**
 * Subscribe to the `appointment-booked` event.
 * The `onRefresh` callback is called whenever a new appointment is confirmed
 * anywhere in the app — without needing a page reload.
 */
export function useAppointmentRefresh(onRefresh: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENT_NAME, onRefresh);
    return () => window.removeEventListener(EVENT_NAME, onRefresh);
  }, [onRefresh]);
}
