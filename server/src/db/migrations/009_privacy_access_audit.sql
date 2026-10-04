-- Privacy access audit + patient in-app alerts

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
