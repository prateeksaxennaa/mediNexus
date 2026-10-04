-- ═══════════════════════════════════════════════════════════════════════════
-- MediNexus - Complete Database Schema & Migrations (001 - 007)
-- Run this script in the Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. Custom Types / Enums ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hospital_type') THEN
    CREATE TYPE hospital_type AS ENUM ('government', 'private', 'clinic', 'nursing_home');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_status') THEN
    CREATE TYPE slot_status AS ENUM ('available', 'booked', 'locked', 'cancelled', 'blocked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM ('booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_type') THEN
    CREATE TYPE booking_type AS ENUM ('online', 'walk_in', 'referral');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_status') THEN
    CREATE TYPE waitlist_status AS ENUM ('waiting', 'notified', 'accepted', 'expired', 'cancelled', 'offered');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
    CREATE TYPE report_category AS ENUM ('lab', 'radiology', 'pathology', 'discharge_summary', 'other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_status') THEN
    CREATE TYPE referral_status AS ENUM ('pending', 'accepted', 'declined', 'completed');
  END IF;
END $$;

-- ─── 2. Tables ───────────────────────────────────────────────────────────────

-- Hospitals
CREATE TABLE IF NOT EXISTS hospitals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  type                hospital_type NOT NULL DEFAULT 'private',
  address             TEXT NOT NULL,
  city                TEXT NOT NULL,
  state               TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  admin_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_approved         BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_city  ON hospitals(city);
CREATE INDEX IF NOT EXISTS idx_hospitals_state ON hospitals(state);
CREATE INDEX IF NOT EXISTS idx_hospitals_admin ON hospitals(admin_id);
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

-- Hospital Services
CREATE TABLE IF NOT EXISTS hospital_services (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id           UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  service_type          TEXT NOT NULL,
  service_name          TEXT NOT NULL,
  department            TEXT NOT NULL,
  default_duration_mins INT  NOT NULL DEFAULT 30,
  fee                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  pay_at_counter        BOOLEAN NOT NULL DEFAULT false,
  is_available          BOOLEAN NOT NULL DEFAULT true,
  daily_slot_limit      INT NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_hospital_services_hospital ON hospital_services(hospital_id);
ALTER TABLE hospital_services ENABLE ROW LEVEL SECURITY;

-- Doctors
CREATE TABLE IF NOT EXISTS doctors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id           UUID NOT NULL REFERENCES hospitals(id)  ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  specialisation        TEXT NOT NULL,
  prescription_template TEXT,
  qualifications        TEXT,
  registration_number   TEXT,
  experience_years      INT,
  consultation_fee      NUMERIC(10,2),
  department            TEXT,
  bio                   TEXT,
  available_from        TEXT,
  available_to          TEXT,
  slot_duration_mins    INT,
  verified              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON doctors(hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctors_user     ON doctors(user_id);
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  phone_number         TEXT,
  email                TEXT,
  dob                  DATE,
  blood_group          TEXT,
  known_allergies      TEXT,
  language_preference  TEXT NOT NULL DEFAULT 'en',
  no_show_count        INT  NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patients_contact_check CHECK (phone_number IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_user ON patients(user_id);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Doctor Appointment Slots
CREATE TABLE IF NOT EXISTS appointment_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    UUID NOT NULL REFERENCES doctors(id)   ON DELETE CASCADE,
  slot_start   TIMESTAMPTZ NOT NULL,
  slot_end     TIMESTAMPTZ NOT NULL,
  status       slot_status NOT NULL DEFAULT 'available',
  locked_by    UUID REFERENCES auth.users(id),
  locked_until TIMESTAMPTZ,
  UNIQUE (doctor_id, slot_start)
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor ON appointment_slots(doctor_id);
CREATE INDEX IF NOT EXISTS idx_slots_start  ON appointment_slots(slot_start);
CREATE INDEX IF NOT EXISTS idx_slots_status ON appointment_slots(status);
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES doctors(id)           ON DELETE CASCADE,
  hospital_id  UUID NOT NULL REFERENCES hospitals(id)         ON DELETE CASCADE,
  service_id   UUID REFERENCES hospital_services(id)          ON DELETE CASCADE,
  booking_type booking_type       NOT NULL DEFAULT 'online',
  status       appointment_status NOT NULL DEFAULT 'booked',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient  ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor   ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_hospital ON appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status   ON appointments(status);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Service Slots
CREATE TABLE IF NOT EXISTS service_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id   UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  slot_date    DATE NOT NULL,
  slot_number  INT NOT NULL,
  status       slot_status NOT NULL DEFAULT 'available',
  locked_by    UUID REFERENCES auth.users(id),
  locked_until TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, slot_date, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_service_slots_service ON service_slots(service_id);
CREATE INDEX IF NOT EXISTS idx_service_slots_date ON service_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_service_slots_status ON service_slots(status);
CREATE INDEX IF NOT EXISTS idx_service_slots_service_date ON service_slots(service_id, slot_date);
ALTER TABLE service_slots ENABLE ROW LEVEL SECURITY;

-- Service Appointments
CREATE TABLE IF NOT EXISTS service_appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID NOT NULL REFERENCES service_slots(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  service_id   UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  booking_type booking_type NOT NULL DEFAULT 'online',
  status       appointment_status NOT NULL DEFAULT 'booked',
  notes        TEXT,
  booked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_appointments_patient ON service_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_hospital ON service_appointments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_service ON service_appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_service_appointments_slot ON service_appointments(slot_id);
ALTER TABLE service_appointments ENABLE ROW LEVEL SECURITY;

-- Slot Waitlist
CREATE TABLE IF NOT EXISTS slot_waitlist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id          UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  queued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at      TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  status           waitlist_status NOT NULL DEFAULT 'waiting'
);

CREATE INDEX IF NOT EXISTS idx_waitlist_slot    ON slot_waitlist(slot_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_patient ON slot_waitlist(patient_id);
ALTER TABLE slot_waitlist ENABLE ROW LEVEL SECURITY;

-- Medicines Catalog & Full Text Search
CREATE TABLE IF NOT EXISTS medicines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_name     TEXT NOT NULL,
  composition       TEXT,
  therapeutic_class TEXT,
  chemical_class    TEXT,
  uses              TEXT,
  side_effects      TEXT,
  substitutes       TEXT,
  description       TEXT,
  image_url         TEXT,
  search_vector     TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(medicine_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(composition, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(therapeutic_class, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(chemical_class, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(uses, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(side_effects, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(substitutes, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_medicines_search ON medicines USING GIN (search_vector);
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

-- Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id           UUID NOT NULL REFERENCES doctors(id)      ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
  illness_description TEXT,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url             TEXT
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient     ON prescriptions(patient_id);
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Prescription Items
CREATE TABLE IF NOT EXISTS prescription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id     UUID NOT NULL REFERENCES medicines(id)     ON DELETE CASCADE,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration        TEXT NOT NULL,
  doctor_comment  TEXT
);

CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription ON prescription_items(prescription_id);
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

-- Patient Reports
CREATE TABLE IF NOT EXISTS patient_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  hospital_id     UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  report_category report_category NOT NULL DEFAULT 'other',
  report_type     TEXT NOT NULL DEFAULT 'other',
  report_name     TEXT NOT NULL,
  report_url      TEXT NOT NULL,
  uploaded_by     UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_patient  ON patient_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_hospital ON patient_reports(hospital_id);
ALTER TABLE patient_reports ENABLE ROW LEVEL SECURITY;

-- Record Access Grants
CREATE TABLE IF NOT EXISTS record_access_grants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             UUID NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  granted_to_hospital_id UUID REFERENCES hospitals(id)          ON DELETE CASCADE,
  granted_to_doctor_id   UUID REFERENCES doctors(id)            ON DELETE CASCADE,
  record_types           TEXT[] NOT NULL DEFAULT '{}',
  document_type          TEXT,
  document_id            UUID,
  source                 TEXT NOT NULL DEFAULT 'manual',
  valid_until            TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grants_patient   ON record_access_grants(patient_id);
CREATE INDEX IF NOT EXISTS idx_grants_hospital  ON record_access_grants(granted_to_hospital_id);
CREATE INDEX IF NOT EXISTS idx_grants_doctor    ON record_access_grants(granted_to_doctor_id);
CREATE INDEX IF NOT EXISTS idx_grants_document  ON record_access_grants(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_grants_source    ON record_access_grants(source);
ALTER TABLE record_access_grants ENABLE ROW LEVEL SECURITY;

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  referred_to_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reason                TEXT,
  status                referral_status NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referrals_no_self_referral CHECK (referring_doctor_id != referred_to_doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referring ON referrals(referring_doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred  ON referrals(referred_to_doctor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_patient   ON referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status    ON referrals(status);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Report Analysis Cache
CREATE TABLE IF NOT EXISTS report_analysis_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID NOT NULL REFERENCES patient_reports(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL CHECK (lang IN ('en', 'hi')),
  doc_type      TEXT NOT NULL,
  analysis_text TEXT NOT NULL,
  audio_base64  TEXT NOT NULL,
  audio_mime    TEXT NOT NULL DEFAULT 'audio/mpeg',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, lang, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_report_analysis_cache_report ON report_analysis_cache(report_id);
ALTER TABLE report_analysis_cache ENABLE ROW LEVEL SECURITY;

-- Search Cache
CREATE TABLE IF NOT EXISTS search_cache (
  query_hash TEXT PRIMARY KEY,
  results    JSONB NOT NULL DEFAULT '{}',
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

-- Appointment Status Log
CREATE TABLE IF NOT EXISTS appointment_status_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  old_status     appointment_status,
  new_status     appointment_status NOT NULL,
  changed_by     UUID NOT NULL REFERENCES auth.users(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_log_appointment ON appointment_status_log(appointment_id);
ALTER TABLE appointment_status_log ENABLE ROW LEVEL SECURITY;

-- Tracking table for migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (id) VALUES
  ('001_initial_schema'),
  ('002_rls_auth_policies'),
  ('002_service_slots'),
  ('003_extend_enums'),
  ('004_service_id_nullable'),
  ('005_medicines_search_rpc'),
  ('006_document_grants_and_referrals'),
  ('007_report_analysis_cache_and_category')
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Stored Functions ─────────────────────────────────────────────────────

-- Medicines search RPC
CREATE OR REPLACE FUNCTION public.search_medicines(p_query TEXT, p_limit INT DEFAULT 25)
RETURNS TABLE (
  id UUID,
  medicine_name TEXT,
  composition TEXT,
  therapeutic_class TEXT,
  chemical_class TEXT,
  uses TEXT,
  side_effects TEXT,
  substitutes TEXT,
  description TEXT,
  image_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.medicine_name,
    m.composition,
    m.therapeutic_class,
    m.chemical_class,
    m.uses,
    m.side_effects,
    m.substitutes,
    m.description,
    m.image_url,
    ts_rank_cd(m.search_vector, q) AS rank
  FROM medicines m,
       websearch_to_tsquery('english', trim(p_query)) AS q
  WHERE trim(coalesce(p_query, '')) <> ''
    AND m.search_vector @@ q
  ORDER BY rank DESC, m.medicine_name ASC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_medicines(TEXT, INT) TO anon, authenticated, service_role;

-- ─── 4. Storage Bucket Setup ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-reports', 'patient-reports', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  CREATE POLICY "Public Access patient-reports" ON storage.objects
    FOR SELECT USING (bucket_id = 'patient-reports');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated Insert patient-reports" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'patient-reports');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated Delete patient-reports" ON storage.objects
    FOR DELETE USING (bucket_id = 'patient-reports');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 5. Row Level Security Policies ──────────────────────────────────────────

-- Hospitals
CREATE POLICY "hospitals: approved hospitals are publicly readable" ON hospitals FOR SELECT USING (is_approved = true);
CREATE POLICY "hospitals: admin reads own hospital" ON hospitals FOR SELECT USING (admin_id = auth.uid());
CREATE POLICY "hospitals: admin updates own hospital" ON hospitals FOR UPDATE USING (admin_id = auth.uid()) WITH CHECK (admin_id = auth.uid());
CREATE POLICY "hospitals: admin deletes own hospital" ON hospitals FOR DELETE USING (admin_id = auth.uid());

-- Hospital Services
CREATE POLICY "hospital_services: readable for approved hospitals" ON hospital_services FOR SELECT
  USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = hospital_services.hospital_id AND h.is_approved = true));
CREATE POLICY "hospital_services: admin manages own hospital services" ON hospital_services FOR ALL
  USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = hospital_services.hospital_id AND h.admin_id = auth.uid()));

-- Doctors
CREATE POLICY "doctors: publicly readable for verified doctors" ON doctors FOR SELECT USING (verified = true);
CREATE POLICY "doctors: doctor reads own profile" ON doctors FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "doctors: hospital admin reads own doctors" ON doctors FOR SELECT
  USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = doctors.hospital_id AND h.admin_id = auth.uid()));
CREATE POLICY "doctors: doctor updates own profile" ON doctors FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Patients
CREATE POLICY "patients: patient reads own record" ON patients FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "patients: patient updates own record" ON patients FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "patients: doctor reads treated patients" ON patients FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.patient_id = patients.id AND d.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM record_access_grants g JOIN doctors d ON d.id = g.granted_to_doctor_id WHERE g.patient_id = patients.id AND d.user_id = auth.uid() AND g.valid_until > now())
  );

-- Appointment Slots
CREATE POLICY "appointment_slots: readable by authenticated users" ON appointment_slots FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "appointment_slots: doctor manages own slots" ON appointment_slots FOR ALL
  USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = appointment_slots.doctor_id AND d.user_id = auth.uid()));

-- Appointments
CREATE POLICY "appointments: patient views own appointments" ON appointments FOR SELECT
  USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = appointments.patient_id AND p.user_id = auth.uid()));
CREATE POLICY "appointments: doctor views own appointments" ON appointments FOR SELECT
  USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = appointments.doctor_id AND d.user_id = auth.uid()));
CREATE POLICY "appointments: hospital admin views appointments" ON appointments FOR SELECT
  USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = appointments.hospital_id AND h.admin_id = auth.uid()));

-- Service Slots & Service Appointments
CREATE POLICY "service_slots: readable" ON service_slots FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "service_appointments: patient reads own" ON service_appointments FOR SELECT
  USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = service_appointments.patient_id AND p.user_id = auth.uid()));
CREATE POLICY "service_appointments: admin manages" ON service_appointments FOR ALL
  USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = service_appointments.hospital_id AND h.admin_id = auth.uid()));

-- Prescriptions
CREATE POLICY "prescriptions: patient reads own prescriptions" ON prescriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = prescriptions.patient_id AND p.user_id = auth.uid()));
CREATE POLICY "prescriptions: doctor manages own prescriptions" ON prescriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM doctors d WHERE d.id = prescriptions.doctor_id AND d.user_id = auth.uid()));

-- Prescription Items
CREATE POLICY "prescription_items: readable via prescription access" ON prescription_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM prescriptions p WHERE p.id = prescription_items.prescription_id));

-- Patient Reports
CREATE POLICY "patient_reports: patient reads own reports" ON patient_reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = patient_reports.patient_id AND p.user_id = auth.uid()));
CREATE POLICY "patient_reports: hospital admin manages reports" ON patient_reports FOR ALL
  USING (EXISTS (SELECT 1 FROM hospitals h WHERE h.id = patient_reports.hospital_id AND h.admin_id = auth.uid()));

-- Grants
CREATE POLICY "record_access_grants: patient manages own grants" ON record_access_grants FOR ALL
  USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = record_access_grants.patient_id AND p.user_id = auth.uid()));

-- Medicines (publicly readable)
CREATE POLICY "medicines: publicly readable" ON medicines FOR SELECT USING (true);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
