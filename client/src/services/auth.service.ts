import { api } from '@/lib/api';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'hospital_admin' | 'doctor';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole | null;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// ─── Request payload types ────────────────────────────────────────────────────

export interface LoginPayload {
  email?: string;
  phone?: string;
  password: string;
}

export interface RegisterPatientPayload {
  email?: string;
  /** E.164 format, e.g. +919876543210 */
  phone?: string;
  password: string;
  full_name: string;
  /** YYYY-MM-DD */
  dob?: string;
  blood_group?: string;
}

export interface RegisterHospitalAdminPayload {
  email: string;
  password: string;
  full_name: string;
  hospital_name: string;
  hospital_type: 'government' | 'private' | 'clinic' | 'nursing_home';
  address: string;
  city: string;
  state: string;
  registration_number: string;
  /** E.164 format, e.g. +919876543210 */
  contact_phone: string;
}

export interface DoctorSetupPayload {
  // Auth
  password: string;
  // Identity
  full_name: string;
  // Professional
  specialisation: string;
  department: string;
  qualifications: string;
  registration_number: string;
  experience_years: number;
  consultation_fee: number;
  bio?: string;
  // Scheduling
  available_from: string;
  available_to: string;
  slot_duration_mins: number;
}

// ─── Response envelope types ──────────────────────────────────────────────────

interface ApiEnvelope<T> {
  data: T;
  message: string;
}

export type LoginResponse = ApiEnvelope<{
  user: AuthUser;
}>;

export type RegisterResponse = ApiEnvelope<{
  user: AuthUser;
  profile?: Record<string, unknown>;
}>;

export type MeResponse = ApiEnvelope<{
  user: AuthUser;
  profile: Record<string, unknown> | null;
}>;

export type LogoutResponse = ApiEnvelope<null>;

export type RefreshResponse = ApiEnvelope<{
  session: AuthSession;
}>;

// ─── Auth service ─────────────────────────────────────────────────────────────

export const authService = {
  /**
   * POST /api/auth/login
   * Unified login for all roles.  Returns user + session tokens.
   */
  login: (payload: LoginPayload) =>
    api.post<LoginResponse>('/api/auth/login', payload, { skipAuth: true }),

  /**
   * POST /api/auth/patient/register
   * Creates a new patient account and returns a session immediately.
   */
  registerPatient: (payload: RegisterPatientPayload) =>
    api.post<RegisterResponse>('/api/auth/patient/register', payload, { skipAuth: true }),

  /**
   * POST /api/auth/hospital-admin/register
   * Creates a hospital admin + hospital row.  Hospital starts as unapproved.
   */
  registerHospitalAdmin: (payload: RegisterHospitalAdminPayload) =>
    api.post<RegisterResponse>('/api/auth/hospital-admin/register', payload, { skipAuth: true }),

  /**
   * POST /api/auth/logout
   * Revokes the current session on the server.
   */
  logout: () => api.post<LogoutResponse>('/api/auth/logout'),

  /**
   * GET /api/auth/me
   * Returns the authenticated user and their role-specific profile.
   */
  getMe: () => api.get<MeResponse>('/api/auth/me'),

  /**
   * POST /api/auth/refresh
   * Exchanges a refresh_token for a new token pair.
   */
  refresh: (refresh_token: string) =>
    api.post<RefreshResponse>('/api/auth/refresh', { refresh_token }, { skipAuth: true }),

  /**
   * POST /api/auth/doctor/setup
   * Used by a doctor responding to an invite link.
   * The Supabase-issued token from the URL hash is sent as the Bearer credential.
   */
  doctorSetup: (payload: DoctorSetupPayload, inviteToken: string) =>
    api.post<RegisterResponse>('/api/auth/doctor/setup', payload, {
      bearerToken: inviteToken,
    }),
};
