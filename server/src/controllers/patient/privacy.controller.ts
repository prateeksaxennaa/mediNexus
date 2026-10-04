import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError, BadRequestError, NotFoundError } from '../../utils/errors.js';
import { requirePatient } from '../../utils/lookup.js';

function parseNumberQuery(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

/**
 * GET /api/patients/me/privacy/access-log
 */
export async function getPatientDataAccessLog(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const adminAny = supabaseAdmin as any;

    const limit = Math.max(1, Math.min(100, parseNumberQuery(req.query['limit'], 20)));
    const offset = Math.max(0, parseNumberQuery(req.query['offset'], 0));
    const action = String(req.query['action'] ?? '').trim();
    const actorRole = String(req.query['actor_role'] ?? '').trim();

    let query = adminAny
      .from('data_access_audit_log')
      .select(
        'id, actor_user_id, actor_role, actor_label, action, resource_type, resource_id, purpose, metadata, created_at',
        { count: 'exact' }
      )
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq('action', action);
    if (actorRole) query = query.eq('actor_role', actorRole);

    const { data, error, count } = await query;
    if (error) {
      console.error('[getPatientDataAccessLog] query failed:', error.message);
      throw new AppError('Failed to fetch data access log', 500);
    }

    sendSuccess(
      res,
      {
        logs: data ?? [],
        pagination: {
          limit,
          offset,
          total: count ?? 0,
        },
      },
      'Data access log retrieved'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/me/privacy/alerts
 */
export async function listPatientAccessAlerts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const adminAny = supabaseAdmin as any;

    const limit = Math.max(1, Math.min(100, parseNumberQuery(req.query['limit'], 20)));
    const offset = Math.max(0, parseNumberQuery(req.query['offset'], 0));
    const unreadOnly = String(req.query['unread_only'] ?? 'false') === 'true';

    let query = adminAny
      .from('patient_access_alerts')
      .select('id, alert_type, title, message, is_read, read_at, created_at', { count: 'exact' })
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error, count } = await query;
    if (error) {
      console.error('[listPatientAccessAlerts] query failed:', error.message);
      throw new AppError('Failed to fetch access alerts', 500);
    }

    sendSuccess(
      res,
      {
        alerts: data ?? [],
        pagination: {
          limit,
          offset,
          total: count ?? 0,
        },
      },
      'Access alerts retrieved'
    );
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me/privacy/alerts/:alertId/read
 */
export async function markPatientAccessAlertRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const { alertId } = req.params as { alertId: string };

    const adminAny = supabaseAdmin as any;
    const { data, error } = await adminAny
      .from('patient_access_alerts')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', alertId)
      .eq('patient_id', patient.id)
      .select('id, is_read, read_at')
      .single();

    if (error || !data) {
      throw new NotFoundError('Alert not found');
    }

    sendSuccess(res, { alert: data }, 'Access alert marked as read');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients/me/privacy/alert-preferences
 */
export async function getPatientAccessAlertPreferences(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const adminAny = supabaseAdmin as any;

    const { data, error } = await adminAny
      .from('patient_access_alert_preferences')
      .select('enabled, first_time_provider_access, unusual_hour_access, bulk_record_access, updated_at')
      .eq('patient_id', patient.id)
      .maybeSingle();

    if (error) {
      console.error('[getPatientAccessAlertPreferences] query failed:', error.message);
      throw new AppError('Failed to fetch alert preferences', 500);
    }

    const preferences = {
      enabled: data?.enabled ?? true,
      first_time_provider_access: data?.first_time_provider_access ?? true,
      unusual_hour_access: data?.unusual_hour_access ?? true,
      bulk_record_access: data?.bulk_record_access ?? true,
      updated_at: data?.updated_at ?? null,
    };

    sendSuccess(res, { preferences }, 'Access alert preferences retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/patients/me/privacy/alert-preferences
 */
export async function updatePatientAccessAlertPreferences(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Authenticated user not found', 401);

    const patient = await requirePatient(userId);
    const body = req.body as Record<string, unknown>;

    const allowed = [
      'enabled',
      'first_time_provider_access',
      'unusual_hour_access',
      'bulk_record_access',
    ] as const;

    const payload: Record<string, boolean | string> = {
      patient_id: patient.id,
      updated_at: new Date().toISOString(),
    };

    let changedCount = 0;
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'boolean') {
          throw new BadRequestError(`${key} must be a boolean`);
        }
        payload[key] = body[key] as boolean;
        changedCount += 1;
      }
    }

    if (changedCount === 0) {
      throw new BadRequestError('Provide at least one preference field to update');
    }

    const adminAny = supabaseAdmin as any;
    const { data, error } = await adminAny
      .from('patient_access_alert_preferences')
      .upsert(payload, { onConflict: 'patient_id' })
      .select('enabled, first_time_provider_access, unusual_hour_access, bulk_record_access, updated_at')
      .single();

    if (error || !data) {
      console.error('[updatePatientAccessAlertPreferences] upsert failed:', error?.message);
      throw new AppError('Failed to update alert preferences', 500);
    }

    sendSuccess(res, { preferences: data }, 'Access alert preferences updated');
  } catch (err) {
    next(err);
  }
}
