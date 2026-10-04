import { supabaseAdmin } from '../config/supabase.js';

type AccessActorRole = 'patient' | 'doctor' | 'hospital_admin' | 'system';

interface LogPatientDataAccessInput {
  patientId: string;
  actorUserId: string | null;
  actorRole: AccessActorRole;
  actorLabel?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  purpose?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  createdAtIso?: string;
}

interface AlertPreferenceRow {
  enabled: boolean;
  first_time_provider_access: boolean;
  unusual_hour_access: boolean;
  bulk_record_access: boolean;
}

const BULK_ACCESS_THRESHOLD = 25;

function isUnusualHour(dateIso: string): boolean {
  const hour = new Date(dateIso).getUTCHours();
  return hour < 6 || hour >= 22;
}

async function maybeCreateAlerts(
  auditLogId: string,
  input: LogPatientDataAccessInput,
  createdAtIso: string
): Promise<void> {
  if (input.actorRole === 'patient') return;

  const adminAny = supabaseAdmin as any;

  const { data: prefRow } = await adminAny
    .from('patient_access_alert_preferences')
    .select('enabled, first_time_provider_access, unusual_hour_access, bulk_record_access')
    .eq('patient_id', input.patientId)
    .maybeSingle();

  const prefs: AlertPreferenceRow = {
    enabled: prefRow?.enabled ?? true,
    first_time_provider_access: prefRow?.first_time_provider_access ?? true,
    unusual_hour_access: prefRow?.unusual_hour_access ?? true,
    bulk_record_access: prefRow?.bulk_record_access ?? true,
  };

  if (!prefs.enabled) return;

  const alerts: Array<{ alert_type: string; title: string; message: string }> = [];

  if (prefs.first_time_provider_access && input.actorUserId) {
    const { count } = await adminAny
      .from('data_access_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', input.patientId)
      .eq('actor_user_id', input.actorUserId)
      .eq('actor_role', input.actorRole)
      .neq('id', auditLogId);

    const actor = input.actorLabel ?? 'A provider';
    if ((count ?? 0) === 0) {
      alerts.push({
        alert_type: 'first_time_provider_access',
        title: 'First-time provider access',
        message: `${actor} accessed your health records for the first time.`,
      });
    }
  }

  if (prefs.unusual_hour_access && isUnusualHour(createdAtIso)) {
    const actor = input.actorLabel ?? 'A provider';
    alerts.push({
      alert_type: 'unusual_hour_access',
      title: 'Record access at unusual hour',
      message: `${actor} accessed your records outside regular hours.`,
    });
  }

  const recordCount = Number(input.metadata?.['record_count'] ?? 0);
  if (prefs.bulk_record_access && Number.isFinite(recordCount) && recordCount >= BULK_ACCESS_THRESHOLD) {
    const actor = input.actorLabel ?? 'A provider';
    alerts.push({
      alert_type: 'bulk_record_access',
      title: 'High-volume record access',
      message: `${actor} accessed ${recordCount} records in a single action.`,
    });
  }

  if (alerts.length === 0) return;

  const rows = alerts.map((alert) => ({
    patient_id: input.patientId,
    audit_log_id: auditLogId,
    alert_type: alert.alert_type,
    title: alert.title,
    message: alert.message,
    created_at: createdAtIso,
  }));

  await adminAny.from('patient_access_alerts').insert(rows);
}

export async function logPatientDataAccess(input: LogPatientDataAccessInput): Promise<void> {
  try {
    const adminAny = supabaseAdmin as any;
    const createdAtIso = input.createdAtIso ?? new Date().toISOString();

    const { data: created, error } = await adminAny
      .from('data_access_audit_log')
      .insert({
        patient_id: input.patientId,
        actor_user_id: input.actorUserId,
        actor_role: input.actorRole,
        actor_label: input.actorLabel ?? null,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        purpose: input.purpose ?? null,
        metadata: input.metadata ?? {},
        ip_address: input.ipAddress ?? null,
        created_at: createdAtIso,
      })
      .select('id')
      .single();

    if (error || !created?.id) {
      console.error('[privacyAudit] failed to insert audit log:', error?.message ?? 'unknown error');
      return;
    }

    await maybeCreateAlerts(created.id, input, createdAtIso);
  } catch (err) {
    console.error('[privacyAudit] unexpected failure:', (err as Error).message);
  }
}
