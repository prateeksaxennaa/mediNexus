

CREATE TYPE hospital_type   AS ENUM ('government', 'private', 'clinic', 'nursing_home');
CREATE TYPE slot_status      AS ENUM ('available', 'booked', 'locked', 'cancelled');
CREATE TYPE appointment_status AS ENUM ('booked', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE booking_type     AS ENUM ('online', 'walk_in', 'referral');
CREATE TYPE waitlist_status  AS ENUM ('waiting', 'notified', 'accepted', 'expired', 'cancelled');
CREATE TYPE report_type      AS ENUM ('lab', 'radiology', 'pathology', 'discharge_summary', 'other');


-- ─── 1. hospitals ───────────────────────────────────────────

CREATE TABLE hospitals (
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

CREATE INDEX idx_hospitals_city  ON hospitals(city);
CREATE INDEX idx_hospitals_state ON hospitals(state);
CREATE INDEX idx_hospitals_admin ON hospitals(admin_id);

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;


-- ─── 2. hospital_services ───────────────────────────────────

CREATE TABLE hospital_services (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id           UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  service_type          TEXT NOT NULL,
  service_name          TEXT NOT NULL,
  department            TEXT NOT NULL,
  default_duration_mins INT  NOT NULL DEFAULT 30,
  fee                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  pay_at_counter        BOOLEAN NOT NULL DEFAULT false,
  is_available          BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_hospital_services_hospital ON hospital_services(hospital_id);

ALTER TABLE hospital_services ENABLE ROW LEVEL SECURITY;


-- ─── 3. doctors ─────────────────────────────────────────────

CREATE TABLE doctors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id           UUID NOT NULL REFERENCES hospitals(id)  ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  specialisation        TEXT NOT NULL,
  prescription_template TEXT,
  verified              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doctors_hospital ON doctors(hospital_id);
CREATE INDEX idx_doctors_user     ON doctors(user_id);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;


-- ─── 4. patients ────────────────────────────────────────────

CREATE TABLE patients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  phone_number         TEXT,          -- nullable: patient may register with email only
  email                TEXT,          -- nullable: patient may register with phone only
  dob                  DATE,          -- nullable: optional at registration
  blood_group          TEXT,
  known_allergies      TEXT,
  language_preference  TEXT NOT NULL DEFAULT 'en',
  no_show_count        INT  NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patients_contact_check CHECK (phone_number IS NOT NULL OR email IS NOT NULL)
);

CREATE UNIQUE INDEX idx_patients_user ON patients(user_id);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;


-- ─── 5. appointment_slots ───────────────────────────────────

CREATE TABLE appointment_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    UUID NOT NULL REFERENCES doctors(id)   ON DELETE CASCADE,
  slot_start   TIMESTAMPTZ NOT NULL,
  slot_end     TIMESTAMPTZ NOT NULL,
  status       slot_status NOT NULL DEFAULT 'available',
  locked_by    UUID REFERENCES auth.users(id),
  locked_until TIMESTAMPTZ,
  UNIQUE (doctor_id, slot_start)
);

CREATE INDEX idx_slots_doctor ON appointment_slots(doctor_id);
CREATE INDEX idx_slots_start  ON appointment_slots(slot_start);
CREATE INDEX idx_slots_status ON appointment_slots(status);

ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;


-- ─── 6. appointments ───────────────────────────────────────

CREATE TABLE appointments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES doctors(id)           ON DELETE CASCADE,
  hospital_id  UUID NOT NULL REFERENCES hospitals(id)         ON DELETE CASCADE,
  service_id   UUID NOT NULL REFERENCES hospital_services(id) ON DELETE CASCADE,
  booking_type booking_type       NOT NULL DEFAULT 'online',
  status       appointment_status NOT NULL DEFAULT 'booked',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_patient  ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor   ON appointments(doctor_id);
CREATE INDEX idx_appointments_hospital ON appointments(hospital_id);
CREATE INDEX idx_appointments_status   ON appointments(status);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;


-- ─── 7. slot_waitlist ───────────────────────────────────────

CREATE TABLE slot_waitlist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id          UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  queued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at      TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  status           waitlist_status NOT NULL DEFAULT 'waiting'
);

CREATE INDEX idx_waitlist_slot    ON slot_waitlist(slot_id);
CREATE INDEX idx_waitlist_patient ON slot_waitlist(patient_id);

ALTER TABLE slot_waitlist ENABLE ROW LEVEL SECURITY;


-- ─── 8. medicines ───────────────────────────────────────────

CREATE TABLE medicines (
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
    to_tsvector('english',
      coalesce(medicine_name, '') || ' ' ||
      coalesce(composition, '')  || ' ' ||
      coalesce(therapeutic_class, '') || ' ' ||
      coalesce(uses, '')
    )
  ) STORED
);

CREATE INDEX idx_medicines_search ON medicines USING GIN (search_vector);

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;


-- ─── 9. prescriptions ──────────────────────────────────────

CREATE TABLE prescriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  doctor_id           UUID NOT NULL REFERENCES doctors(id)      ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
  illness_description TEXT,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_url             TEXT
);

CREATE INDEX idx_prescriptions_appointment ON prescriptions(appointment_id);
CREATE INDEX idx_prescriptions_patient     ON prescriptions(patient_id);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;


-- ─── 10. prescription_items ─────────────────────────────────

CREATE TABLE prescription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id     UUID NOT NULL REFERENCES medicines(id)     ON DELETE CASCADE,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration        TEXT NOT NULL,
  doctor_comment  TEXT
);

CREATE INDEX idx_prescription_items_prescription ON prescription_items(prescription_id);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;


-- ─── 11. patient_reports ────────────────────────────────────

CREATE TABLE patient_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  report_type report_type NOT NULL,
  report_name TEXT NOT NULL,
  report_url  TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_patient  ON patient_reports(patient_id);
CREATE INDEX idx_reports_hospital ON patient_reports(hospital_id);

ALTER TABLE patient_reports ENABLE ROW LEVEL SECURITY;


-- ─── 12. record_access_grants ───────────────────────────────

CREATE TABLE record_access_grants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             UUID NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  granted_to_hospital_id UUID REFERENCES hospitals(id)          ON DELETE CASCADE,
  granted_to_doctor_id   UUID REFERENCES doctors(id)            ON DELETE CASCADE,
  record_types           TEXT[] NOT NULL DEFAULT '{}',
  valid_until            TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grants_patient  ON record_access_grants(patient_id);
CREATE INDEX idx_grants_hospital ON record_access_grants(granted_to_hospital_id);
CREATE INDEX idx_grants_doctor   ON record_access_grants(granted_to_doctor_id);

ALTER TABLE record_access_grants ENABLE ROW LEVEL SECURITY;


-- ─── 13. search_cache ───────────────────────────────────────

CREATE TABLE search_cache (
  query_hash TEXT PRIMARY KEY,
  results    JSONB NOT NULL DEFAULT '{}',
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;


-- ─── 14. appointment_status_log ─────────────────────────────

CREATE TABLE appointment_status_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  old_status     appointment_status,
  new_status     appointment_status NOT NULL,
  changed_by     UUID NOT NULL REFERENCES auth.users(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_log_appointment ON appointment_status_log(appointment_id);

ALTER TABLE appointment_status_log ENABLE ROW LEVEL SECURITY;
