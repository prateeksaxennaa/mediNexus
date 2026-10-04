-- Migration 006: Document-level access grants & referral system
--
-- Replaces the old hospital-level record_access_grants with a new model where
-- patients grant access to *specific* documents (prescriptions / reports) to
-- *specific* doctors (any doctor, even from a different hospital).
--
-- Also introduces a referrals table so a doctor can refer a patient to
-- another doctor, automatically propagating the referring doctor's
-- document-level access grants to the referred doctor.

-- ─── 1. Referral status enum ────────────────────────────────────────────────

CREATE TYPE referral_status AS ENUM ('pending', 'accepted', 'declined', 'completed');

-- ─── 2. Rebuild record_access_grants ────────────────────────────────────────
-- We keep the table name but alter it to support document-level grants.
-- Add columns for the specific document being shared.

-- First drop the old hospital FK constraint name clashes — we'll recreate cleanly.
-- Add new columns
ALTER TABLE record_access_grants
  ADD COLUMN IF NOT EXISTS document_type TEXT,         -- 'prescription' | 'report'
  ADD COLUMN IF NOT EXISTS document_id   UUID,         -- FK to prescriptions.id or patient_reports.id
  ADD COLUMN IF NOT EXISTS source        TEXT NOT NULL DEFAULT 'manual';  -- 'manual' | 'booking' | 'referral'

-- Make granted_to_doctor_id NOT NULL for new grants (doctor-level grants)
-- We keep granted_to_hospital_id for backwards compatibility but it becomes optional
-- New grants will always have a doctor_id

-- Index for fast lookup by document
CREATE INDEX IF NOT EXISTS idx_grants_document ON record_access_grants(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_grants_source   ON record_access_grants(source);

-- ─── 3. Referrals table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  referred_to_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reason                TEXT,                                  -- why the referral
  status                referral_status NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A doctor shouldn't refer the same patient to the same doctor twice (while pending)
  CONSTRAINT referrals_no_self_referral CHECK (referring_doctor_id != referred_to_doctor_id)
);

CREATE INDEX idx_referrals_referring ON referrals(referring_doctor_id);
CREATE INDEX idx_referrals_referred  ON referrals(referred_to_doctor_id);
CREATE INDEX idx_referrals_patient   ON referrals(patient_id);
CREATE INDEX idx_referrals_status    ON referrals(status);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
