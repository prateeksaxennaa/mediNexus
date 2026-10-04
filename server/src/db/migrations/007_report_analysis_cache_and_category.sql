-- Migration 007: Report Analysis Cache + Report Category/Type Refactor
--
-- 1. Creates a `report_analysis_cache` table to persist LLM analysis and TTS audio
--    so they survive server restarts and provide fast retrieval.
--
-- 2. Renames the current `report_type` column (which holds *category* values like
--    lab/radiology/pathology) to `report_category`, and adds a new `report_type`
--    TEXT column for the actual modality (ecg, xray, mri, ct, blood_test, etc.).

-- ── A. report_analysis_cache ───────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_report_analysis_cache_report
  ON report_analysis_cache(report_id);

ALTER TABLE report_analysis_cache ENABLE ROW LEVEL SECURITY;

-- ── B. Rename report_type → report_category ────────────────────────────────────

-- Create the new report_category enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
    CREATE TYPE report_category AS ENUM ('lab', 'radiology', 'pathology', 'discharge_summary', 'other');
  END IF;
END
$$;

-- Add report_category column if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patient_reports' AND column_name = 'report_category'
  ) THEN
    ALTER TABLE patient_reports ADD COLUMN report_category report_category;

    -- Copy existing report_type enum values into report_category
    UPDATE patient_reports SET report_category = report_type::text::report_category;

    ALTER TABLE patient_reports ALTER COLUMN report_category SET NOT NULL;
    ALTER TABLE patient_reports ALTER COLUMN report_category SET DEFAULT 'other';

    -- Drop the old report_type column (was the enum)
    ALTER TABLE patient_reports DROP COLUMN report_type;

    -- Add new report_type as TEXT for modality (ecg, xray, mri, ct, etc.)
    ALTER TABLE patient_reports ADD COLUMN report_type TEXT NOT NULL DEFAULT 'other';

    -- Drop the old enum type
    DROP TYPE IF EXISTS report_type;
  END IF;
END
$$;
