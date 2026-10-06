import { api, API_BASE_URL } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HospitalProfile {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  registration_number: string;
  admin_id: string;
  is_approved: boolean;
  created_at: string;
}

export interface HospitalDoctor {
  id: string;
  user_id: string;
  hospital_id: string;
  full_name: string;
  specialisation: string;
  department: string | null;
  qualifications: string | null;
  registration_number: string | null;
  experience_years: number | null;
  consultation_fee: number | null;
  bio: string | null;
  available_from: string | null;
  available_to: string | null;
  slot_duration_mins: number | null;
  prescription_template: string | null;
  verified: boolean;
  created_at: string;
}

export interface HospitalService {
  id: string;
  hospital_id: string;
  service_type: string;
  service_name: string;
  department: string;
  default_duration_mins: number;
  fee: number;
  pay_at_counter: boolean;
  is_available: boolean;
  daily_slot_limit?: number;
}

export interface ServiceSlot {
  id: string;
  service_id: string;
  slot_date: string;
  slot_number: number;
  status: 'available' | 'locked' | 'booked' | 'cancelled';
  locked_by: string | null;
  locked_until: string | null;
}

export interface ServiceSlotWithService extends ServiceSlot {
  hospital_services: {
    id: string;
    service_name: string;
    department: string;
    fee: number;
    hospital_id: string;
  };
}

export interface HospitalAppointment {
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
  appointment_slots?: { slot_start: string; slot_end: string } | null;
  doctors?: { full_name: string; specialisation: string } | null;
  patients?: { id?: string; full_name: string; phone_number: string | null } | null;
}

export type AdminDoctorSlotStatus = 'available' | 'booked' | 'locked' | 'cancelled' | 'blocked';

export interface AdminDoctorSlot {
  id: string;
  slot_start: string;
  slot_end: string;
  status: AdminDoctorSlotStatus;
  locked_by: string | null;
  locked_until: string | null;
  doctor_id: string;
  appointment: {
    id: string;
    status: string;
    booking_type: string;
    notes: string | null;
    patients: { id: string; full_name: string; phone_number: string | null } | null;
  } | null;
}

export type ServiceAppointmentStatus =
  | 'booked'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface ServiceAppointment {
  id: string;
  slot_id: string;
  patient_id: string;
  hospital_id: string;
  service_id: string;
  booking_type: string;
  status: ServiceAppointmentStatus;
  notes: string | null;
  booked_at: string | null;
  created_at: string;
  service_slots: { slot_date: string; slot_number: number } | null;
  hospital_services: { service_name: string; department: string; fee: number } | null;
  patients: { id?: string; full_name: string; phone_number: string | null } | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const hospitalService = {
  // Profile
  getProfile: () =>
    api.get<{ data: { hospital: HospitalProfile } }>('/api/hospitals/me'),

  updateProfile: (payload: Partial<Pick<HospitalProfile, 'name' | 'type' | 'address' | 'city' | 'state'>>) =>
    api.patch<{ data: { hospital: HospitalProfile } }>('/api/hospitals/me', payload),

  // Doctors
  listDoctors: () =>
    api.get<{ data: { doctors: HospitalDoctor[] } }>('/api/hospitals/me/doctors'),

  updateDoctor: (doctorId: string, payload: {
    full_name?: string;
    specialisation?: string;
    department?: string;
    qualifications?: string;
    registration_number?: string;
    experience_years?: number;
    consultation_fee?: number;
    bio?: string;
    available_from?: string;
    available_to?: string;
    slot_duration_mins?: number;
    verified?: boolean;
  }) =>
    api.patch<{ data: { doctor: HospitalDoctor } }>(
      `/api/hospitals/me/doctors/${doctorId}`,
      payload
    ),

  deleteDoctor: (doctorId: string) =>
    api.delete<{ data: null }>(`/api/hospitals/me/doctors/${doctorId}`),

  // Services
  listServices: () =>
    api.get<{ data: { services: HospitalService[] } }>('/api/hospitals/me/services'),

  createService: (payload: Omit<HospitalService, 'id' | 'hospital_id'>) =>
    api.post<{ data: { service: HospitalService } }>('/api/hospitals/me/services', payload),

  updateService: (serviceId: string, payload: Partial<Omit<HospitalService, 'id' | 'hospital_id'>>) =>
    api.patch<{ data: { service: HospitalService } }>(
      `/api/hospitals/me/services/${serviceId}`,
      payload
    ),

  deleteService: (serviceId: string) =>
    api.delete<{ data: null }>(`/api/hospitals/me/services/${serviceId}`),

  // Doctor Appointments
  listAppointments: (filter?: 'upcoming' | 'past' | 'all') =>
    api.get<{ data: { appointments: HospitalAppointment[] } }>(
      `/api/hospitals/me/appointments${filter ? `?filter=${filter}` : ''}`
    ),

  // Service Appointments
  listServiceAppointments: (params?: {
    filter?: 'upcoming' | 'past' | 'all';
    serviceId?: string;
    status?: ServiceAppointmentStatus;
    date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.filter) query.set('filter', params.filter);
    if (params?.serviceId) query.set('serviceId', params.serviceId);
    if (params?.status) query.set('status', params.status);
    if (params?.date) query.set('date', params.date);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    return api.get<{ data: { appointments: ServiceAppointment[]; total: number } }>(
      `/api/hospitals/me/services/appointments${query.toString() ? `?${query}` : ''}`
    );
  },

  updateServiceAppointmentStatus: (appointmentId: string, status: ServiceAppointmentStatus) =>
    api.patch<{ data: { appointment: { id: string; status: ServiceAppointmentStatus } } }>(
      `/api/hospitals/me/services/appointments/${appointmentId}/status`,
      { status }
    ),

  // Invite doctor
  inviteDoctor: (hospitalId: string, payload: { email: string; full_name: string; specialisation: string }) =>
    api.post(`/api/hospitals/${hospitalId}/doctors/invite`, payload),

  // Slot generation on behalf of a doctor
  generateDoctorSlots: (doctorId: string, payload: {
    working_days: number[];
    start_time: string;
    end_time: string;
    slot_duration_mins: number;
    days_ahead?: number;
  }) => api.post(`/api/hospitals/me/doctors/${doctorId}/slots/generate`, payload),

  // Admin doctor slot management
  listDoctorSlots: (doctorId: string, date?: string) =>
    api.get<{ data: { slots: AdminDoctorSlot[]; date: string } }>(
      `/api/hospitals/me/doctors/${doctorId}/slots${date ? `?date=${date}` : ''}`
    ),

  blockDoctorSlot: (doctorId: string, slotId: string) =>
    api.patch<{ data: { slot: AdminDoctorSlot } }>(
      `/api/hospitals/me/doctors/${doctorId}/slots/${slotId}/block`,
      {}
    ),

  unblockDoctorSlot: (doctorId: string, slotId: string) =>
    api.patch<{ data: { slot: AdminDoctorSlot } }>(
      `/api/hospitals/me/doctors/${doctorId}/slots/${slotId}/unblock`,
      {}
    ),

  deleteDoctorSlot: (doctorId: string, slotId: string) =>
    api.delete<{ data: null }>(
      `/api/hospitals/me/doctors/${doctorId}/slots/${slotId}`
    ),

  bookWalkIn: (doctorId: string, payload: { slot_id: string; patient_id: string; notes?: string }) =>
    api.post<{ data: { appointment: any; patient: { id: string; full_name: string }; doctor: { id: string; full_name: string } } }>(
      `/api/hospitals/me/doctors/${doctorId}/walk-in`,
      payload
    ),

  cancelDoctorAppointment: (doctorId: string, appointmentId: string) =>
    api.patch<{ data: null }>(
      `/api/hospitals/me/doctors/${doctorId}/appointments/${appointmentId}/cancel`,
      {}
    ),

  // Service Slots Management
  generateServiceSlots: (payload: {
    serviceId: string;
    startDate: string;
    endDate: string;
    numberOfSlots?: number;
  }) => api.post('/api/hospitals/me/services/slots/generate', payload),

  updateServiceDaySlots: (payload: {
    serviceId: string;
    slotDate: string;
    numberOfSlots: number;
  }) => api.patch<{ data: { serviceId: string; slotDate: string; requestedSlots: number; total: number; available: number; booked: number; locked: number } }>(
    '/api/hospitals/me/services/slots/day',
    payload
  ),

  listServiceSlots: (params?: { serviceId?: string; date?: string; startDate?: string; endDate?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.serviceId) query.set('serviceId', params.serviceId);
    if (params?.date) query.set('date', params.date);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.status) query.set('status', params.status);
    return api.get<{ data: { services: (HospitalService & { slots: ServiceSlot[] })[] } }>(
      `/api/hospitals/me/services/slots${query.toString() ? `?${query}` : ''}`
    );
  },

  getServiceSlot: (slotId: string) =>
    api.get<{ data: { slot: ServiceSlotWithService } }>(`/api/hospitals/me/services/slots/${slotId}`),

  deleteServiceSlot: (slotId: string) =>
    api.delete<{ data: { success: boolean } }>(`/api/hospitals/me/services/slots/${slotId}`),

  bulkDeleteServiceSlots: (payload: {
    serviceId: string;
    startDate: string;
    endDate: string;
    status?: string;
  }) => api.post('/api/hospitals/me/services/slots/bulk-delete', payload),

  getServiceAvailability: (serviceId: string, startDate: string, endDate: string) =>
    api.get<{ data: { service: HospitalService; availability: Record<string, { total: number; available: number; booked: number; locked: number }> } }>(
      `/api/hospitals/me/services/${serviceId}/availability?startDate=${startDate}&endDate=${endDate}`
    ),
};

// ─── Report Upload ─────────────────────────────────────────────────────────────
// Exported separately because it uses raw fetch (multipart), not the api helper.

const BASE_URL = API_BASE_URL;

export interface HospitalPatient {
  id: string;
  full_name: string;
  phone_number: string | null;
  email: string | null;
}

export interface PatientReport {
  id: string;
  report_name: string;
  report_category: string;
  report_type: string;
  report_url: string;
  uploaded_at: string;
}

export async function uploadPatientReport(
  patientId: string,
  payload: {
    report_name: string;
    report_category: 'lab' | 'radiology' | 'pathology' | 'discharge_summary' | 'other';
    report_type: 'ecg' | 'xray' | 'mri' | 'ct' | 'blood_test' | 'urine_test' | 'other';
    file: File;
  }
): Promise<{ data: { report: any } }> {
  const form = new FormData();
  form.append('report_name', payload.report_name);
  form.append('report_category', payload.report_category);
  form.append('report_type', payload.report_type);
  form.append('file', payload.file);

  const res = await fetch(`${BASE_URL}/api/hospitals/me/patients/${patientId}/reports`, {
    method: 'POST',
    credentials: 'include',
    body: form,
    // Note: do NOT set Content-Type — browser will set it with the correct boundary
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message ?? json?.error ?? `Upload failed (${res.status})`);
  }
  return json;
}

export async function searchHospitalPatients(q: string): Promise<{ data: { patients: HospitalPatient[] } }> {
  return api.get(`/api/hospitals/me/patients/search?q=${encodeURIComponent(q)}`);
}

export async function listPatientReportsForAdmin(patientId: string): Promise<{ data: { reports: PatientReport[] } }> {
  return api.get(`/api/hospitals/me/patients/${patientId}/reports`);
}
