/**
 * Startup migration runner.
 * Runs any pending SQL migrations that have not yet been applied to the live DB.
 * Uses a simple `schema_migrations` tracking table so each migration is idempotent.
 *
 * Only runs when DATABASE_URL is set.  Failures are logged but do NOT crash the
 * server — the app can still start; only the features that depend on missing
 * schema will be broken.
 *
 * After applying migrations, sends `NOTIFY pgrst, 'reload schema'` so that
 * Supabase's PostgREST layer picks up new tables/columns immediately.
 */

import pg from 'pg';

const { Pool } = pg;

// ─── Inline SQL for each migration ──────────────────────────────────────────
// Keep every migration as a single transaction so it's atomic.

const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: '006_document_grants_and_referrals',
    sql: `
      -- 1. referral_status enum (safe to re-run via DO block)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_status') THEN
          CREATE TYPE referral_status AS ENUM ('pending', 'accepted', 'declined', 'completed');
        END IF;
      END
      $$;

      -- 2. record_access_grants columns
      ALTER TABLE record_access_grants
        ADD COLUMN IF NOT EXISTS document_type TEXT,
        ADD COLUMN IF NOT EXISTS document_id   UUID,
        ADD COLUMN IF NOT EXISTS source        TEXT NOT NULL DEFAULT 'manual';

      CREATE INDEX IF NOT EXISTS idx_grants_document ON record_access_grants(document_type, document_id);
      CREATE INDEX IF NOT EXISTS idx_grants_source   ON record_access_grants(source);

      -- 3. referrals table
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

      -- RLS enabled but no policies = service-role bypasses, anon/users blocked
      ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
    `,
  },
  {
    id: '007_report_analysis_cache_and_category',
    sql: `
      -- ── A. report_analysis_cache table ─────────────────────────────────────
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

      -- ── B. Rename report_type → report_category + add new report_type TEXT ──
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_category') THEN
          CREATE TYPE report_category AS ENUM ('lab', 'radiology', 'pathology', 'discharge_summary', 'other');
        END IF;
      END
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'patient_reports' AND column_name = 'report_category'
        ) THEN
          ALTER TABLE patient_reports ADD COLUMN report_category report_category;
          UPDATE patient_reports SET report_category = report_type::text::report_category;
          ALTER TABLE patient_reports ALTER COLUMN report_category SET NOT NULL;
          ALTER TABLE patient_reports ALTER COLUMN report_category SET DEFAULT 'other';
          ALTER TABLE patient_reports DROP COLUMN report_type;
          ALTER TABLE patient_reports ADD COLUMN report_type TEXT NOT NULL DEFAULT 'other';
          DROP TYPE IF EXISTS report_type;
        END IF;
      END
      $$;
    `,
  },
  {
    id: '008_patient_grant_otp',
    sql: `
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
    `,
  },
  {
    id: '009_privacy_access_audit',
    sql: `
      CREATE TABLE IF NOT EXISTS data_access_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        actor_role TEXT NOT NULL,
        actor_label TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id UUID,
        purpose TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_data_access_audit_patient_time
        ON data_access_audit_log(patient_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_data_access_audit_actor
        ON data_access_audit_log(actor_user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS patient_access_alert_preferences (
        patient_id UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT true,
        first_time_provider_access BOOLEAN NOT NULL DEFAULT true,
        unusual_hour_access BOOLEAN NOT NULL DEFAULT true,
        bulk_record_access BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS patient_access_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        audit_log_id UUID REFERENCES data_access_audit_log(id) ON DELETE SET NULL,
        alert_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_patient_access_alerts_patient_time
        ON patient_access_alerts(patient_id, created_at DESC);

      ALTER TABLE data_access_audit_log ENABLE ROW LEVEL SECURITY;
      ALTER TABLE patient_access_alert_preferences ENABLE ROW LEVEL SECURITY;
      ALTER TABLE patient_access_alerts ENABLE ROW LEVEL SECURITY;
    `,
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('[migrations] DATABASE_URL not set — skipping startup migrations.');
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  let anyApplied = false;

  try {
    // Ensure tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Map of migration id → a table name to verify actually exists after recording
    const VERIFY_TABLE: Record<string, string> = {
      '006_document_grants_and_referrals': 'referrals',
      '007_report_analysis_cache_and_category': 'report_analysis_cache',
      '008_patient_grant_otp': 'patient_grant_otp_challenges',
      '009_privacy_access_audit': 'data_access_audit_log',
    };

    for (const migration of MIGRATIONS) {
      const { rows } = await pool.query(
        'SELECT id FROM schema_migrations WHERE id = $1',
        [migration.id]
      );

      if (rows.length > 0) {
        const verifyTable = VERIFY_TABLE[migration.id];
        if (verifyTable) {
          const { rows: tableCheck } = await pool.query(
            `SELECT to_regclass('public.${verifyTable}') AS tbl`
          );
          const tableExists = tableCheck[0]?.tbl != null;
          if (tableExists) {
            console.log(`[migrations] ${migration.id} — already applied, skipping.`);
            continue;
          }
          // Table missing despite being recorded — re-apply
          console.log(`[migrations] ${migration.id} — recorded but table missing, re-applying...`);
          await pool.query(`DELETE FROM schema_migrations WHERE id = $1`, [migration.id]);
        } else {
          console.log(`[migrations] ${migration.id} — already applied, skipping.`);
          continue;
        }
      }

      console.log(`[migrations] Applying ${migration.id}...`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (id) VALUES ($1)',
          [migration.id]
        );
        await client.query('COMMIT');
        console.log(`[migrations] ${migration.id} — applied successfully.`);
        anyApplied = true;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // After applying new migrations, notify PostgREST to reload its schema cache
    // so Supabase's REST API immediately recognises new tables/columns.
    if (anyApplied) {
      try {
        await pool.query(`NOTIFY pgrst, 'reload schema'`);
        console.log('[migrations] PostgREST schema cache reload triggered.');
      } catch (notifyErr) {
        // Non-fatal — PostgREST will reload on its own schedule
        console.warn('[migrations] Could not notify PostgREST to reload schema:', (notifyErr as Error).message);
      }
    }
  } catch (err) {
    console.error('[migrations] Migration failed:', (err as Error).message);
    console.error('[migrations] The server will continue but referrals feature may not work.');
  } finally {
    await pool.end();
  }
}
