import { supabaseAdmin } from '../config/supabase.js';
import { NotFoundError } from './errors.js';
import type { Patient, Doctor, Hospital } from '../models/database.types.js';

// ─── Lookup helpers ──────────────────────────────────────────────────
//
// Each helper fetches a profile row by the auth user_id (or admin_id for
// hospitals).  They throw NotFoundError if the row does not exist so
// controllers don't have to repeat the same null-check pattern.

/**
 * Fetches the patient profile for the given auth user_id.
 * Throws NotFoundError if not found.
 */
export async function requirePatient(userId: string): Promise<Patient> {
  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Patient profile not found');
  }

  return data as Patient;
}

/**
 * Fetches the hospital owned by the given admin user_id.
 * Throws NotFoundError if not found.
 */
export async function requireHospital(adminId: string): Promise<Hospital> {
  const { data, error } = await supabaseAdmin
    .from('hospitals')
    .select('*')
    .eq('admin_id', adminId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Hospital profile not found');
  }

  return data as Hospital;
}

/**
 * Fetches the doctor profile for the given auth user_id.
 * Throws NotFoundError if not found.
 */
export async function requireDoctor(userId: string): Promise<Doctor> {
  const { data, error } = await supabaseAdmin
    .from('doctors')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Doctor profile not found');
  }

  return data as Doctor;
}
