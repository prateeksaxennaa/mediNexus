// ─── Enums ──────────────────────────────────────────────────────────

export type SlotStatus = 'available' | 'booked' | 'locked' | 'cancelled' | 'blocked';

export type AppointmentStatus =
  | 'booked'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type BookingType = 'online' | 'walk_in' | 'referral';

export type WaitlistStatus = 'waiting' | 'notified' | 'offered' | 'accepted' | 'expired' | 'cancelled';

export type ReportType = 'lab' | 'radiology' | 'pathology' | 'discharge_summary' | 'other';

export type HospitalType = 'government' | 'private' | 'clinic' | 'nursing_home';

export type ReferralStatus = 'pending' | 'accepted' | 'declined' | 'completed';

export type GrantSource = 'manual' | 'booking' | 'referral';

// ─── Table Row Types ────────────────────────────────────────────────

export interface Hospital {
  id: string;
  name: string;
  type: HospitalType;
  address: string;
  city: string;
  state: string;
  registration_number: string;
  admin_id: string;
  is_approved: boolean;
  created_at: string;
  search_vector: unknown; // tsvector — opaque on the client
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
  daily_slot_limit: number;
  search_vector: unknown; // tsvector — opaque on the client
}

export interface ServiceSlot {
  id: string;
  service_id: string;
  slot_date: string;
  slot_number: number;
  status: SlotStatus;
  locked_by: string | null;
  locked_until: string | null;
  created_at: string;
}

export interface ServiceAppointment {
  id: string;
  slot_id: string;
  patient_id: string;
  hospital_id: string;
  service_id: string;
  booking_type: BookingType;
  status: AppointmentStatus;
  notes: string | null;
  booked_at: string;
  created_at: string;
}

export interface Doctor {
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
  search_vector: unknown; // tsvector — opaque on the client
}

export interface Patient {
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

export interface AppointmentSlot {
  id: string;
  doctor_id: string;
  slot_start: string;
  slot_end: string;
  status: SlotStatus;
  locked_by: string | null;
  locked_until: string | null;
}

export interface Appointment {
  id: string;
  slot_id: string;
  patient_id: string;
  doctor_id: string;
  hospital_id: string;
  service_id: string | null;
  booking_type: BookingType;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
}

export interface SlotWaitlist {
  id: string;
  slot_id: string;
  patient_id: string;
  queued_at: string;
  notified_at: string | null;
  offer_expires_at: string | null;
  status: WaitlistStatus;
}

export interface Medicine {
  id: string;
  medicine_name: string;
  composition: string | null;
  therapeutic_class: string | null;
  chemical_class: string | null;
  uses: string | null;
  side_effects: string | null;
  substitutes: string | null;
  description: string | null;
  image_url: string | null;
  search_vector: unknown; // tsvector — opaque on the client
}

export interface Prescription {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  illness_description: string | null;
  issued_at: string;
  pdf_url: string | null;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string;
  dosage: string;
  frequency: string;
  duration: string;
  doctor_comment: string | null;
}

export interface PatientReport {
  id: string;
  patient_id: string;
  hospital_id: string;
  report_type: ReportType;
  report_name: string;
  report_url: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface RecordAccessGrant {
  id: string;
  patient_id: string;
  granted_to_hospital_id: string | null;
  granted_to_doctor_id: string | null;
  record_types: string[];
  document_type: string | null;
  document_id: string | null;
  source: GrantSource;
  valid_until: string;
  created_at: string;
}

export interface Referral {
  id: string;
  referring_doctor_id: string;
  referred_to_doctor_id: string;
  patient_id: string;
  reason: string | null;
  status: ReferralStatus;
  created_at: string;
  updated_at: string;
}

export interface SearchCache {
  query_hash: string;
  results: Record<string, unknown>;
  cached_at: string;
  expires_at: string;
}

export interface AppointmentStatusLog {
  id: string;
  appointment_id: string;
  old_status: AppointmentStatus | null;
  new_status: AppointmentStatus;
  changed_by: string;
  changed_at: string;
}

// ─── Master Database Type ───────────────────────────────────────────
//
// Matches the exact format produced by `supabase gen types typescript`.
// Row types reference the interfaces defined above; Insert/Update use
// the same inline shapes required by @supabase/postgrest-js v12.
// Empty Views/Functions/CompositeTypes use the `{ [_ in never]: never }`
// mapped-type pattern (Supabase's canonical empty-schema notation).

export type Database = {
  public: {
    Tables: {
      hospitals: {
        Row: {
          id: string;
          name: string;
          type: HospitalType;
          address: string;
          city: string;
          state: string;
          registration_number: string;
          admin_id: string;
          is_approved: boolean;
          created_at: string;
          search_vector: unknown;
        };
        Insert: {
          id?: string;
          name: string;
          type: HospitalType;
          address: string;
          city: string;
          state: string;
          registration_number: string;
          admin_id: string;
          is_approved?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          type?: HospitalType;
          address?: string;
          city?: string;
          state?: string;
          registration_number?: string;
          admin_id?: string;
          is_approved?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      hospital_services: {
        Row: {
          id: string;
          hospital_id: string;
          service_type: string;
          service_name: string;
          department: string;
          default_duration_mins: number;
          fee: number;
          pay_at_counter: boolean;
          is_available: boolean;
          daily_slot_limit: number;
          search_vector: unknown;
        };
        Insert: {
          id?: string;
          hospital_id: string;
          service_type: string;
          service_name: string;
          department: string;
          default_duration_mins: number;
          fee: number;
          pay_at_counter?: boolean;
          is_available?: boolean;
          daily_slot_limit?: number;
        };
        Update: {
          id?: string;
          hospital_id?: string;
          service_type?: string;
          service_name?: string;
          department?: string;
          default_duration_mins?: number;
          fee?: number;
          pay_at_counter?: boolean;
          is_available?: boolean;
          daily_slot_limit?: number;
        };
        Relationships: [];
      };
      doctors: {
        Row: {
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
          search_vector: unknown;
        };
        Insert: {
          id?: string;
          user_id: string;
          hospital_id: string;
          full_name: string;
          specialisation: string;
          prescription_template?: string | null;
          qualifications?: string | null;
          registration_number?: string | null;
          experience_years?: number | null;
          consultation_fee?: number | null;
          department?: string | null;
          bio?: string | null;
          available_from?: string | null;
          available_to?: string | null;
          slot_duration_mins?: number | null;
          verified?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          hospital_id?: string;
          full_name?: string;
          specialisation?: string;
          prescription_template?: string | null;
          qualifications?: string | null;
          registration_number?: string | null;
          experience_years?: number | null;
          consultation_fee?: number | null;
          department?: string | null;
          bio?: string | null;
          available_from?: string | null;
          available_to?: string | null;
          slot_duration_mins?: number | null;
          verified?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      patients: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          phone_number: string | null;
          email: string | null;
          dob: string | null;
          blood_group: string | null;
          known_allergies: string | null;
          language_preference: string;
          no_show_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          phone_number?: string | null;
          email?: string | null;
          dob?: string | null;
          blood_group?: string | null;
          known_allergies?: string | null;
          language_preference?: string | null;
          no_show_count?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          phone_number?: string | null;
          email?: string | null;
          dob?: string | null;
          blood_group?: string | null;
          known_allergies?: string | null;
          language_preference?: string | null;
          no_show_count?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      appointment_slots: {
        Row: {
          id: string;
          doctor_id: string;
          slot_start: string;
          slot_end: string;
          status: SlotStatus;
          locked_by: string | null;
          locked_until: string | null;
        };
        Insert: {
          id?: string;
          doctor_id: string;
          slot_start: string;
          slot_end: string;
          status: SlotStatus;
          locked_by?: string | null;
          locked_until?: string | null;
        };
        Update: {
          id?: string;
          doctor_id?: string;
          slot_start?: string;
          slot_end?: string;
          status?: SlotStatus;
          locked_by?: string | null;
          locked_until?: string | null;
        };
        Relationships: [];
      };
      service_slots: {
        Row: {
          id: string;
          service_id: string;
          slot_date: string;
          slot_number: number;
          status: SlotStatus;
          locked_by: string | null;
          locked_until: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          service_id: string;
          slot_date: string;
          slot_number: number;
          status?: SlotStatus;
          locked_by?: string | null;
          locked_until?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          service_id?: string;
          slot_date?: string;
          slot_number?: number;
          status?: SlotStatus;
          locked_by?: string | null;
          locked_until?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          slot_id: string;
          patient_id: string;
          doctor_id: string;
          hospital_id: string;
          service_id: string | null;
          booking_type: BookingType;
          status: AppointmentStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          patient_id: string;
          doctor_id: string;
          hospital_id: string;
          service_id?: string | null;
          booking_type: BookingType;
          status: AppointmentStatus;
          notes?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          slot_id?: string;
          patient_id?: string;
          doctor_id?: string;
          hospital_id?: string;
          service_id?: string;
          booking_type?: BookingType;
          status?: AppointmentStatus;
          notes?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      service_appointments: {
        Row: {
          id: string;
          slot_id: string;
          patient_id: string;
          hospital_id: string;
          service_id: string;
          booking_type: BookingType;
          status: AppointmentStatus;
          notes: string | null;
          booked_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          patient_id: string;
          hospital_id: string;
          service_id: string;
          booking_type?: BookingType;
          status?: AppointmentStatus;
          notes?: string | null;
          booked_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          patient_id?: string;
          hospital_id?: string;
          service_id?: string;
          booking_type?: BookingType;
          status?: AppointmentStatus;
          notes?: string | null;
          booked_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      slot_waitlist: {
        Row: {
          id: string;
          slot_id: string;
          patient_id: string;
          queued_at: string;
          notified_at: string | null;
          offer_expires_at: string | null;
          status: WaitlistStatus;
        };
        Insert: {
          id?: string;
          slot_id: string;
          patient_id: string;
          queued_at: string;
          notified_at?: string | null;
          offer_expires_at?: string | null;
          status: WaitlistStatus;
        };
        Update: {
          id?: string;
          slot_id?: string;
          patient_id?: string;
          queued_at?: string;
          notified_at?: string | null;
          offer_expires_at?: string | null;
          status?: WaitlistStatus;
        };
        Relationships: [];
      };
      medicines: {
        Row: {
          id: string;
          medicine_name: string;
          composition: string | null;
          therapeutic_class: string | null;
          chemical_class: string | null;
          uses: string | null;
          side_effects: string | null;
          substitutes: string | null;
          description: string | null;
          image_url: string | null;
          search_vector: unknown;
        };
        Insert: {
          id?: string;
          medicine_name: string;
          composition?: string | null;
          therapeutic_class?: string | null;
          chemical_class?: string | null;
          uses?: string | null;
          side_effects?: string | null;
          substitutes?: string | null;
          description?: string | null;
          image_url?: string | null;
        };
        Update: {
          id?: string;
          medicine_name?: string;
          composition?: string | null;
          therapeutic_class?: string | null;
          chemical_class?: string | null;
          uses?: string | null;
          side_effects?: string | null;
          substitutes?: string | null;
          description?: string | null;
          image_url?: string | null;
        };
        Relationships: [];
      };
      prescriptions: {
        Row: {
          id: string;
          appointment_id: string;
          doctor_id: string;
          patient_id: string;
          illness_description: string | null;
          issued_at: string;
          pdf_url: string | null;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          doctor_id: string;
          patient_id: string;
          illness_description?: string | null;
          issued_at: string;
          pdf_url?: string | null;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          doctor_id?: string;
          patient_id?: string;
          illness_description?: string | null;
          issued_at?: string;
          pdf_url?: string | null;
        };
        Relationships: [];
      };
      prescription_items: {
        Row: {
          id: string;
          prescription_id: string;
          medicine_id: string;
          dosage: string;
          frequency: string;
          duration: string;
          doctor_comment: string | null;
        };
        Insert: {
          id?: string;
          prescription_id: string;
          medicine_id: string;
          dosage: string;
          frequency: string;
          duration: string;
          doctor_comment?: string | null;
        };
        Update: {
          id?: string;
          prescription_id?: string;
          medicine_id?: string;
          dosage?: string;
          frequency?: string;
          duration?: string;
          doctor_comment?: string | null;
        };
        Relationships: [];
      };
      patient_reports: {
        Row: {
          id: string;
          patient_id: string;
          hospital_id: string;
          report_type: ReportType;
          report_name: string;
          report_url: string;
          uploaded_by: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          hospital_id: string;
          report_type: ReportType;
          report_name: string;
          report_url: string;
          uploaded_by: string;
          uploaded_at: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          hospital_id?: string;
          report_type?: ReportType;
          report_name?: string;
          report_url?: string;
          uploaded_by?: string;
          uploaded_at?: string;
        };
        Relationships: [];
      };
      record_access_grants: {
        Row: {
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
        };
        Insert: {
          id?: string;
          patient_id: string;
          granted_to_hospital_id?: string | null;
          granted_to_doctor_id?: string | null;
          record_types: string[];
          document_type?: string | null;
          document_id?: string | null;
          source?: string;
          valid_until: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          patient_id?: string;
          granted_to_hospital_id?: string | null;
          granted_to_doctor_id?: string | null;
          record_types?: string[];
          document_type?: string | null;
          document_id?: string | null;
          source?: string;
          valid_until?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      search_cache: {
        Row: {
          query_hash: string;
          results: Record<string, unknown>;
          cached_at: string;
          expires_at: string;
        };
        Insert: {
          query_hash: string;
          results: Record<string, unknown>;
          cached_at: string;
          expires_at: string;
        };
        Update: {
          query_hash?: string;
          results?: Record<string, unknown>;
          cached_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      appointment_status_log: {
        Row: {
          id: string;
          appointment_id: string;
          old_status: AppointmentStatus | null;
          new_status: AppointmentStatus;
          changed_by: string;
          changed_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          old_status?: AppointmentStatus | null;
          new_status: AppointmentStatus;
          changed_by: string;
          changed_at: string;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          old_status?: AppointmentStatus | null;
          new_status?: AppointmentStatus;
          changed_by?: string;
          changed_at?: string;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          referring_doctor_id: string;
          referred_to_doctor_id: string;
          patient_id: string;
          reason: string | null;
          status: ReferralStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          referring_doctor_id: string;
          referred_to_doctor_id: string;
          patient_id: string;
          reason?: string | null;
          status?: ReferralStatus;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          referring_doctor_id?: string;
          referred_to_doctor_id?: string;
          patient_id?: string;
          reason?: string | null;
          status?: ReferralStatus;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_hospitals: {
        Args: {
          search_query?: string | null;
          filter_city?: string | null;
          filter_speciality?: string | null;
          result_limit?: number;
        };
        Returns: {
          id: string;
          name: string;
          type: string;
          address: string;
          city: string;
          state: string;
          is_approved: boolean;
          rank: number;
        }[];
      };
    };
    Enums: {
      slot_status: SlotStatus;
      appointment_status: AppointmentStatus;
      booking_type: BookingType;
      waitlist_status: WaitlistStatus;
      report_type: ReportType;
      hospital_type: HospitalType;
      referral_status: ReferralStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
