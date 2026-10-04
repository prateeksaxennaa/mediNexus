import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DoctorProfile {
  id: string;
  user_id: string;
  hospital_id: string;
  full_name: string;
  specialisation: string;
  prescription_template: string | null;
  qualifications: string | null;
  registration_number: string | null;
  experience_years: number | null;
  consultation_fee: number | null;
  department: string | null;
  bio: string | null;
  available_from: string | null;
  available_to: string | null;
  slot_duration_mins: number | null;
  verified: boolean;
  created_at: string;
}

export interface DoctorAppointment {
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
  patients: {
    full_name: string;
    phone_number: string | null;
    email: string | null;
    dob: string | null;
    blood_group: string | null;
    known_allergies: string | null;
  } | null;
  hospitals: { name: string; city: string } | null;
}

export interface DoctorSlot {
  id: string;
  doctor_id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  locked_by: string | null;
  locked_until: string | null;
}

export interface DoctorLetterheadInfo {
  full_name: string;
  specialisation: string;
  qualifications?: string | null;
  registration_number?: string | null;
  department?: string | null;
}

export interface Prescription {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  illness_description: string | null;
  issued_at: string;
  pdf_url: string | null;
  prescription_items?: PrescriptionItem[];
  patients?: { full_name: string; dob?: string | null; blood_group?: string | null; known_allergies?: string | null } | null;
  doctors?: DoctorLetterheadInfo | null;
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

export interface MedicineResult {
  id: string;
  medicine_name: string;
  composition: string | null;
  therapeutic_class: string | null;
  uses: string | null;
  side_effects: string | null;
}

export interface AIInsightSuggestion {
  medicine_name: string;
  therapeutic_class: string | null;
  reason: string;
  co_prescription_count: number;
}

export interface AIInteraction {
  medicines: string[];
  warning: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AIAllergyWarning {
  medicine: string;
  allergen: string;
  warning: string;
}

export interface AIInsights {
  suggestions: AIInsightSuggestion[];
  interactions: AIInteraction[];
  allergyWarnings: AIAllergyWarning[];
  disclaimer: string;
}

export interface CreatePrescriptionPayload {
  illness_description?: string;
  items: {
    medicine_id: string;
    dosage: string;
    frequency: string;
    duration: string;
    doctor_comment?: string;
  }[];
}

export interface DoctorSearchResult {
  id: string;
  full_name: string;
  specialisation: string;
  hospital_id: string;
  hospitals?: { name: string; city: string } | null;
}

export interface Referral {
  id: string;
  referring_doctor_id: string;
  referred_to_doctor_id: string;
  patient_id: string;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  direction: 'sent' | 'received';
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
  patient: {
    id: string;
    full_name: string;
    phone_number: string | null;
    email: string | null;
  } | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const doctorService = {
  // Profile
  getProfile: () =>
    api.get<{ data: { doctor: DoctorProfile } }>('/api/doctors/me'),

  updateProfile: (payload: {
    full_name?: string;
    specialisation?: string;
    prescription_template?: string;
  }) =>
    api.patch<{ data: { doctor: DoctorProfile } }>('/api/doctors/me', payload),

  // Appointments
  listAppointments: (filter: 'upcoming' | 'past' | 'all' = 'all') =>
    api.get<{ data: { appointments: DoctorAppointment[] } }>(
      `/api/doctors/me/appointments?filter=${filter}`
    ),

  updateAppointmentStatus: (
    id: string,
    status: string,
    notes?: string
  ) =>
    api.patch<{ data: { appointment: DoctorAppointment } }>(
      `/api/doctors/me/appointments/${id}/status`,
      { status, notes }
    ),

  // Slots
  listSlots: (opts?: boolean | { upcoming?: boolean; date?: string }) => {
    const upcoming = typeof opts === 'boolean' ? opts : opts?.upcoming ?? true;
    const date = typeof opts === 'boolean' ? undefined : opts?.date;
    const params = new URLSearchParams();
    params.set('upcoming', String(upcoming));
    if (date) params.set('date', date);

    return api.get<{ data: { slots: DoctorSlot[] } }>(
      `/api/doctors/me/slots?${params.toString()}`
    );
  },

  generateSlots: (payload: {
    working_days: number[];
    start_time: string;
    end_time: string;
    slot_duration_mins: number;
    days_ahead?: number;
  }) =>
    api.post<{ data: { generated: number; attempted: number } }>(
      '/api/doctors/me/slots/generate',
      payload
    ),

  blockSlot: (slotId: string) =>
    api.patch<{ data: { slot: DoctorSlot } }>(
      `/api/doctors/me/slots/${slotId}/block`
    ),

  unblockSlot: (slotId: string) =>
    api.patch<{ data: { slot: DoctorSlot } }>(
      `/api/doctors/me/slots/${slotId}/unblock`
    ),

  deleteSlot: (slotId: string) =>
    api.delete<{ data: null }>(`/api/doctors/me/slots/${slotId}`),

  markLeave: (leave_date: string) =>
    api.post<{ data: { blocked: number } }>('/api/doctors/me/leave', { leave_date }),

  // Medicines
  searchMedicines: (q: string) =>
    api.get<{ data: { medicines: MedicineResult[] } }>(
      `/api/doctors/me/medicines/search?q=${encodeURIComponent(q)}`
    ),

  // Prescriptions
  listPrescriptions: () =>
    api.get<{ data: { prescriptions: Prescription[] } }>('/api/doctors/me/prescriptions'),

  getPrescription: (id: string) =>
    api.get<{ data: { prescription: Prescription } }>(`/api/doctors/me/prescriptions/${id}`),

  createPrescription: (appointmentId: string, payload: CreatePrescriptionPayload) =>
    api.post<{ data: { prescription: Prescription } }>(
      `/api/doctors/me/appointments/${appointmentId}/prescriptions`,
      payload
    ),

  // AI Insights
  getAIInsights: (payload: {
    illnessDescription: string;
    currentMedicineIds: string[];
    patientAllergies?: string | null;
    patientBloodGroup?: string | null;
  }) =>
    api.post<{ data: { insights: AIInsights } }>(
      '/api/doctors/me/prescriptions/ai-insights',
      payload
    ),

  // Patient passport
  getPatientPassport: (patientId: string) =>
    api.get<{ data: any }>(`/api/doctors/me/patients/${patientId}/passport`),

  getAccessibleDocuments: (patientId: string) =>
    api.get<{ data: { accessible_prescription_ids: string[]; accessible_report_ids: string[]; total: number } }>(
      `/api/doctors/me/patients/${patientId}/accessible-documents`
    ),

  // Referrals
  listReferrals: () =>
    api.get<{ data: { referrals: Referral[] } }>('/api/doctors/me/referrals'),

  createReferral: (payload: {
    patient_id: string;
    referred_to_doctor_id: string;
    reason?: string;
  }) =>
    api.post<{ data: { referral: Referral; grants_copied: number } }>(
      '/api/doctors/me/referrals',
      payload
    ),

  updateReferralStatus: (referralId: string, status: 'accepted' | 'declined' | 'completed') =>
    api.patch<{ data: { referral: Referral } }>(
      `/api/doctors/me/referrals/${referralId}/status`,
      { status }
    ),

  // Doctor search (for referrals)
  searchDoctors: (q: string) =>
    api.get<{ data: { doctors: DoctorSearchResult[] } }>(
      `/api/doctors/search?q=${encodeURIComponent(q)}`
    ),

  // AI Pre-Appointment Brief
  getAppointmentBrief: (appointmentId: string) =>
    api.post<{
      data: {
        patient_name: string;
        age: number | null;
        blood_group: string | null;
        known_allergies: string | null;
        active_medications: string[];
        recent_conditions: string[];
        recent_findings: string[];
        focus_areas: string[];
        narrative: string;
        generated_at: string;
        cached?: boolean;
      };
    }>(`/api/doctors/me/appointments/${appointmentId}/ai-brief`),
};
