import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  email: string;
  dob: string;
  blood_group: string | null;
  known_allergies: string | null;
  language_preference: string;
  no_show_count: number;
  created_at: string;
}

export interface PatientAppointment {
  id: string;
  slot_id: string;
  patient_id: string;
  doctor_id: string;
  hospital_id: string;
  service_id: string;
  booking_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  appointment_slots: { slot_start: string; slot_end: string } | null;
  doctors: { full_name: string; specialisation: string } | null;
  hospitals: { name: string; city: string } | null;
}

export interface PatientPassport {
  prescriptions: PatientPrescription[];
  reports: PatientReport[];
  grants: AccessGrant[];
  referrals: PatientReferral[];
}

export interface PatientPrescription {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  illness_description: string | null;
  issued_at: string;
  pdf_url: string | null;
  prescription_items?: PrescriptionItem[];
  doctors?: {
    full_name: string;
    specialisation: string;
    qualifications?: string | null;
    registration_number?: string | null;
    department?: string | null;
    hospitals?: { name: string; city: string } | null;
  } | null;
  appointments?: {
    hospital_id: string;
    appointment_slots: { slot_start: string } | null;
    hospitals: { name: string; city: string } | null;
  } | null;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string;
  dosage: string;
  frequency: string;
  duration: string;
  doctor_comment: string | null;
  medicines?: { medicine_name: string; composition: string | null; therapeutic_class?: string | null } | null;
}

export interface PatientReport {
  id: string;
  patient_id: string;
  hospital_id: string;
  report_category: string;
  report_type: string;
  report_name: string;
  report_url: string;
  uploaded_by: string;
  uploaded_at: string;
  hospitals?: { name: string } | null;
}

export interface AccessGrant {
  id: string;
  patient_id: string;
  granted_to_hospital_id: string | null;
  granted_to_doctor_id: string | null;
  record_types: string[];
  document_type: string | null;
  document_id: string | null;
  source: string;
  valid_until: string;
  created_at: string;
  is_active: boolean;
  doctor: {
    id: string;
    full_name: string;
    specialisation: string;
    hospitals?: { name: string; city: string } | null;
  } | null;
  document: {
    id: string;
    // Prescription fields
    illness_description?: string | null;
    issued_at?: string;
    doctors?: { full_name: string } | null;
    // Report fields
    report_name?: string;
    report_type?: string;
    uploaded_at?: string;
  } | null;
}

export interface PatientReferral {
  id: string;
  referring_doctor_id: string;
  referred_to_doctor_id: string;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  referring_doctor: {
    id: string;
    full_name: string;
    specialisation: string;
    hospitals?: { name: string; city: string } | null;
  } | null;
  referred_to_doctor: {
    id: string;
    full_name: string;
    specialisation: string;
    hospitals?: { name: string; city: string } | null;
  } | null;
}

export interface WaitlistEntry {
  id: string;
  slot_id: string;
  patient_id: string;
  queued_at: string;
  notified_at: string | null;
  offer_expires_at: string | null;
  status: string;
  appointment_slots?: {
    slot_start: string;
    slot_end: string;
    doctors?: { full_name: string; specialisation: string; hospitals?: { name: string; city: string } | null } | null;
  } | null;
}

export interface DocumentSelection {
  document_type: 'prescription' | 'report';
  document_id: string;
}

export interface PatientAccessLogItem {
  id: string;
  actor_user_id: string | null;
  actor_role: 'patient' | 'doctor' | 'hospital_admin' | 'system' | string;
  actor_label: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  purpose: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PatientAccessAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface PatientAccessAlertPreferences {
  enabled: boolean;
  first_time_provider_access: boolean;
  unusual_hour_access: boolean;
  bulk_record_access: boolean;
  updated_at: string | null;
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const patientService = {
  // Profile
  getProfile: () =>
    api.get<{ data: { patient: PatientProfile } }>('/api/patients/me'),

  // Appointments
  listAppointments: (filter: 'upcoming' | 'past' | 'all' = 'all') =>
    api.get<{ data: { appointments: PatientAppointment[] } }>(
      `/api/patients/me/appointments?filter=${filter}`
    ),

  cancelAppointment: (id: string) =>
    api.patch<{ data: { appointment: PatientAppointment } }>(
      `/api/patients/me/appointments/${id}/cancel`
    ),

  // Slot booking
  lockSlot: (slot_id: string) =>
    api.post<{ data: { slot: any; locked_until: string } }>(
      '/api/patients/me/slots/lock',
      { slot_id }
    ),

  bookAppointment: (payload: {
    slot_id: string;
    doctor_id: string;
    hospital_id: string;
    service_id?: string;
    booking_type?: string;
  }) =>
    api.post<{ data: { appointment: PatientAppointment } }>(
      '/api/patients/me/appointments',
      payload
    ),

  releaseSlotLock: (slotId: string) =>
    api.patch<{ data: null }>(`/api/patients/me/slots/${slotId}/release`),

  // Waitlist
  joinWaitlist: (slot_id: string) =>
    api.post<{ data: { waitlist_entry: WaitlistEntry } }>(
      '/api/patients/me/waitlist',
      { slot_id }
    ),

  listWaitlist: () =>
    api.get<{ data: { waitlist: WaitlistEntry[] } }>('/api/patients/me/waitlist'),

  acceptOffer: (entryId: string) =>
    api.patch<{ data: { slot: any; locked_until: string } }>(
      `/api/patients/me/waitlist/${entryId}/accept`
    ),

  declineOffer: (entryId: string) =>
    api.patch<{ data: null }>(
      `/api/patients/me/waitlist/${entryId}/decline`
    ),

  leaveWaitlist: (entryId: string) =>
    api.delete<{ data: null }>(`/api/patients/me/waitlist/${entryId}`),

  // Health passport
  getPassport: () =>
    api.get<{ data: PatientPassport }>('/api/patients/me/passport'),

  // Prescriptions (individual fetch for PDF view)
  getPrescription: (id: string) =>
    api.get<{ data: { prescription: PatientPrescription } }>(`/api/patients/me/prescriptions/${id}`),

  // Access grants — document-level, doctor-targeted
  listGrants: () =>
    api.get<{ data: { grants: AccessGrant[] } }>('/api/patients/me/grants'),

  createGrant: (payload: {
    granted_to_doctor_id: string;
    documents: DocumentSelection[];
    valid_days?: number;
    source?: 'manual' | 'booking' | 'referral';
    verification_token?: string;
  }) =>
    api.post<{ data: { grants: AccessGrant[] } }>('/api/patients/me/grants', payload),

  initiateBookingGrantOtp: (payload: {
    granted_to_doctor_id: string;
    documents: DocumentSelection[];
    valid_days?: number;
    source?: 'booking';
  }) =>
    api.post<{
      data: {
        challenge_id: string;
        expires_at: string;
        retry_after_seconds: number;
      };
    }>('/api/patients/me/grants/booking/otp/initiate', payload),

  verifyBookingGrantOtp: (payload: {
    granted_to_doctor_id: string;
    documents: DocumentSelection[];
    valid_days?: number;
    source?: 'booking';
    otp_code: string;
  }) =>
    api.post<{
      data: {
        verification_token: string;
        expires_at: string;
      };
    }>('/api/patients/me/grants/booking/otp/verify', payload),

  revokeGrant: (grantId: string) =>
    api.delete<{ data: null }>(`/api/patients/me/grants/${grantId}`),

  revokeAllGrantsForDoctor: (doctorId: string) =>
    api.delete<{ data: { revoked: number } }>(`/api/patients/me/grants/doctor/${doctorId}`),

  // Discovery
  discoverHospitals: (params: { q?: string; city?: string; speciality?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString();
    return api.get<{ data: { hospitals: any[]; count: number } }>(
      `/api/discover/hospitals${qs ? `?${qs}` : ''}`
    );
  },

  getHospitalDetails: (hospitalId: string) =>
    api.get<{ data: { hospital: any } }>(`/api/discover/hospitals/${hospitalId}`),

  getDoctorSlots: (doctorId: string, date?: string) =>
    api.get<{ data: { doctor: any; slots: any[] } }>(
      `/api/discover/doctors/${doctorId}/slots${date ? `?date=${date}` : ''}`
    ),

  searchDoctors: (q: string) =>
    api.get<{ data: { doctors: any[] } }>(
      `/api/discover/doctors/search?q=${encodeURIComponent(q)}`
    ),

  // Service Discovery & Booking
  discoverServices: (params: { hospitalId?: string; search?: string; department?: string; availableOn?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString();
    return api.get<{ data: { services: any[] } }>(
      `/api/services/discover${qs ? `?${qs}` : ''}`
    );
  },

  getServiceSlots: (serviceId: string, params?: { date?: string; startDate?: string; endDate?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params || {}).filter(([, v]) => v) as [string, string][]
    ).toString();
    return api.get<{ data: { service: any; slots: any } }>(
      `/api/services/${serviceId}/slots${qs ? `?${qs}` : ''}`
    );
  },

  lockServiceSlot: (slotId: string) =>
    api.post<{ data: { slot: any; lockedUntil: string } }>('/api/services/lock', { slotId }),

  bookServiceSlot: (payload: { slotId: string; notes?: string }) =>
    api.post<{ data: { appointment: any; service: any } }>('/api/services/book', payload),

  releaseServiceSlot: (slotId: string) =>
    api.patch<{ data: { success: boolean } }>(`/api/services/${slotId}/release`),

  listMyServiceAppointments: (status?: string) =>
    api.get<{ data: { appointments: any[] } }>(
      `/api/services/me/appointments${status ? `?status=${status}` : ''}`
    ),

  cancelServiceAppointment: (appointmentId: string) =>
    api.patch<{ data: { success: boolean } }>(`/api/services/me/appointments/${appointmentId}/cancel`),

  // AI Health Assistant
  aiChat: (payload: { message: string; history: AIChatMessage[] }) =>
    api.post<{ data: { reply: string } }>('/api/patients/me/ai-chat', payload),

  // Privacy center
  getDataAccessLog: (params: {
    limit?: number;
    offset?: number;
    action?: string;
    actor_role?: string;
  } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();

    return api.get<{
      data: {
        logs: PatientAccessLogItem[];
        pagination: { limit: number; offset: number; total: number };
      };
    }>(`/api/patients/me/privacy/access-log${qs ? `?${qs}` : ''}`);
  },

  getAccessAlerts: (params: { limit?: number; offset?: number; unread_only?: boolean } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();

    return api.get<{
      data: {
        alerts: PatientAccessAlert[];
        pagination: { limit: number; offset: number; total: number };
      };
    }>(`/api/patients/me/privacy/alerts${qs ? `?${qs}` : ''}`);
  },

  markAccessAlertRead: (alertId: string) =>
    api.patch<{ data: { alert: { id: string; is_read: boolean; read_at: string | null } } }>(
      `/api/patients/me/privacy/alerts/${alertId}/read`
    ),

  getAccessAlertPreferences: () =>
    api.get<{ data: { preferences: PatientAccessAlertPreferences } }>(
      '/api/patients/me/privacy/alert-preferences'
    ),

  updateAccessAlertPreferences: (payload: Partial<Omit<PatientAccessAlertPreferences, 'updated_at'>>) =>
    api.patch<{ data: { preferences: PatientAccessAlertPreferences } }>(
      '/api/patients/me/privacy/alert-preferences',
      payload
    ),

  // Report Audio Analysis
  speakReport: (reportId: string, lang: 'en' | 'hi' = 'en') =>
    api.post<{
      data: { audio_base64: string; audio_mime?: string; analysis_text: string };
    }>(
      `/api/patients/me/reports/${reportId}/speak`,
      { lang }
    ),

  // Longitudinal Health Trend Analysis
  getHealthTrends: () =>
    api.get<{
      data: {
        summary: string;
        trends: {
          parameter: string;
          direction: 'improving' | 'declining' | 'stable' | 'variable';
          concern: 'none' | 'watch' | 'urgent';
          note: string;
        }[];
        report_count: number;
        generated_at: string;
        cached?: boolean;
      };
    }>('/api/patients/me/health-trends'),
};

// ─── Keepalive release helpers ────────────────────────────────────────────────
// These use fetch with keepalive:true so the request survives page reload/close.
// Use these in beforeunload handlers and useEffect cleanups.

const _BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export function releaseSlotLockBeacon(slotId: string): void {
  try {
    fetch(`${_BASE}/api/patients/me/slots/${slotId}/release`, {
      method: 'PATCH',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  } catch {
    // keepalive not supported in this environment — ignore
  }
}

export function releaseServiceSlotBeacon(slotId: string): void {
  try {
    fetch(`${_BASE}/api/services/${slotId}/release`, {
      method: 'PATCH',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  } catch {
    // keepalive not supported in this environment — ignore
  }
}
