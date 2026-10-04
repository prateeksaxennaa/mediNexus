import type { HospitalType } from '../models/database.types.js';

// ─── Role ────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'hospital_admin' | 'doctor';

// ─── JWT app_metadata shape ──────────────────────────────────────────

export interface AppMetadata {
  role: UserRole;
  /** Present only on doctor accounts */
  hospital_id?: string;
}

// ─── Registration payloads ───────────────────────────────────────────

export interface RegisterPatientDto {
  /** Provide email OR phone (at least one required) */
  email?: string;
  phone?: string;
  password: string;
  full_name: string;
  dob?: string;
  blood_group?: string;
  language_preference?: string;
}

export interface RegisterHospitalAdminDto {
  email: string;
  password: string;
  full_name: string;
  hospital_name: string;
  hospital_type: HospitalType;
  address: string;
  city: string;
  state: string;
  registration_number: string;
  contact_phone: string;
}

// ─── Login payload ───────────────────────────────────────────────────

export interface LoginDto {
  /** Provide email OR phone (at least one required) */
  email?: string;
  phone?: string;
  password: string;
}

// ─── Doctor invite payload ───────────────────────────────────────────

export interface InviteDoctorDto {
  email: string;
  full_name: string;
  specialisation: string;
}

// ─── API response shapes ─────────────────────────────────────────────

export interface SessionTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AuthUserPayload {
  id: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  role: UserRole;
}

export interface PatientProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  dob: string | null;
  blood_group: string | null;
  language_preference: string;
}

export interface HospitalAdminProfile {
  id: string;
  name: string;
  type: HospitalType;
  city: string;
  state: string;
  is_approved: boolean;
}
