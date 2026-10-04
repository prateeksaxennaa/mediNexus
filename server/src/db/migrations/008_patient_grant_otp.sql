-- Migration 008: Patient booking-grant OTP challenges
-- Purpose: enforce patient-side OTP verification before creating booking-source
-- record access grants.

CREATE TABLE IF NOT EXISTS patient_grant_otp_challenges (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  phone_number       TEXT NOT NULL,
  intent_hash        TEXT NOT NULL,
  otp_hash           TEXT NOT NULL,
  verification_token UUID,
  channel            TEXT NOT NULL DEFAULT 'whatsapp',
  status             TEXT NOT NULL DEFAULT 'sent',
  attempt_count      INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  verified_at        TIMESTAMPTZ,
  consumed_at        TIMESTAMPTZ,
  CONSTRAINT patient_grant_otp_status_check
    CHECK (status IN ('sent', 'verified', 'consumed', 'expired', 'locked'))
);

CREATE INDEX IF NOT EXISTS idx_patient_grant_otp_patient
  ON patient_grant_otp_challenges(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_grant_otp_intent
  ON patient_grant_otp_challenges(patient_id, intent_hash, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_grant_otp_verification_token
  ON patient_grant_otp_challenges(verification_token)
  WHERE verification_token IS NOT NULL;

ALTER TABLE patient_grant_otp_challenges ENABLE ROW LEVEL SECURITY;
