import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  Loader2,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  patientService,
  type PatientAccessAlert,
  type PatientAccessAlertPreferences,
  type PatientAccessLogItem,
} from '@/services/patient.service';

type PrivacyView = 'timeline' | 'alerts' | 'controls';

const ROLE_OPTIONS = [
  { label: 'All actors', value: '' },
  { label: 'Doctors', value: 'doctor' },
  { label: 'Hospital admins', value: 'hospital_admin' },
  { label: 'System', value: 'system' },
];

const ACTION_OPTIONS = [
  { label: 'All actions', value: '' },
  { label: 'Read', value: 'read' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Export', value: 'export' },
];

const actorRoleLabel: Record<string, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Admin',
  system: 'System',
};

function formatRole(role: string): string {
  return actorRoleLabel[role] ?? role.replace('_', ' ');
}

function formatResourceName(resourceType: string): string {
  return resourceType.replaceAll('_', ' ');
}

function formatRelativeDate(dateIso: string): string {
  try {
    return formatDistanceToNow(parseISO(dateIso), { addSuffix: true });
  } catch {
    return 'just now';
  }
}

function getSeverity(alertType: string): 'high' | 'medium' | 'low' {
  if (alertType === 'bulk_record_access') return 'high';
  if (alertType === 'unusual_hour_access') return 'medium';
  return 'low';
}

export const PatientPrivacyCenter = () => {
  const [view, setView] = useState<PrivacyView>('timeline');
  const [logLoading, setLogLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  const [logs, setLogs] = useState<PatientAccessLogItem[]>([]);
  const [alerts, setAlerts] = useState<PatientAccessAlert[]>([]);
  const [preferences, setPreferences] = useState<PatientAccessAlertPreferences>({
    enabled: true,
    first_time_provider_access: true,
    unusual_hour_access: true,
    bulk_record_access: true,
    updated_at: null,
  });

  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const res = await patientService.getDataAccessLog({
        limit: 30,
        offset: 0,
        actor_role: actorFilter || undefined,
        action: actionFilter || undefined,
      });
      setLogs(res.data?.logs ?? []);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not load access timeline');
    } finally {
      setLogLoading(false);
    }
  };

  const fetchAlerts = async () => {
    setAlertsLoading(true);
    try {
      const res = await patientService.getAccessAlerts({ limit: 20, offset: 0 });
      setAlerts(res.data?.alerts ?? []);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not load privacy alerts');
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchPreferences = async () => {
    setPrefsLoading(true);
    try {
      const res = await patientService.getAccessAlertPreferences();
      setPreferences(res.data?.preferences ?? preferences);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not load alert settings');
    } finally {
      setPrefsLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
    fetchAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorFilter, actionFilter]);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.is_read).length, [alerts]);

  const markAsRead = async (alertId: string) => {
    setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, is_read: true } : alert)));
    try {
      await patientService.markAccessAlertRead(alertId);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not mark alert as read');
      fetchAlerts();
    }
  };

  const updatePreference = async (
    key: 'enabled' | 'first_time_provider_access' | 'unusual_hour_access' | 'bulk_record_access',
    nextValue: boolean
  ) => {
    const oldValue = preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: nextValue }));
    setSavingPref(key);

    try {
      const res = await patientService.updateAccessAlertPreferences({ [key]: nextValue });
      setPreferences(res.data.preferences);
    } catch (e: any) {
      setPreferences((prev) => ({ ...prev, [key]: oldValue }));
      toast.error(e.message ?? 'Could not save preference');
    } finally {
      setSavingPref(null);
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-700 w-[calc(100%-2rem)] max-w-7xl mx-auto pb-32">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-7 py-6 md:px-8 md:py-7">
        <div className="absolute inset-0 pointer-events-none opacity-50 bg-[radial-gradient(circle_at_top_right,oklch(0.88_0.12_292/.25),transparent_55%)]" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs tracking-[0.22em] uppercase text-primary/80 font-semibold">Privacy Center</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold text-foreground tracking-tight">Data Access Activity</h1>
            <p className="mt-2 text-muted-foreground max-w-2xl">
              Track who viewed your health data, review high-risk alerts, and control notification preferences.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto">
            <div className="rounded-2xl border border-border bg-background/80 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Activities</div>
              <div className="text-2xl font-semibold text-foreground mt-1">{logs.length}</div>
            </div>
            <div className="rounded-2xl border border-border bg-background/80 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Unread Alerts</div>
              <div className="text-2xl font-semibold text-amber-500 mt-1">{unreadCount}</div>
            </div>
            <div className="rounded-2xl border border-border bg-background/80 px-4 py-3 col-span-2 md:col-span-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Alert Guard</div>
              <div className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
                <Shield className="h-4 w-4 text-primary" />
                {preferences.enabled ? 'Active' : 'Paused'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2 rounded-full border border-border bg-card p-1.5 w-fit">
        {([
          { key: 'timeline', label: 'Timeline', icon: Eye },
          { key: 'alerts', label: 'Alerts', icon: Bell },
          { key: 'controls', label: 'Controls', icon: ShieldAlert },
        ] as const).map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.key}
              variant="ghost"
              className={`rounded-full px-5 py-2 h-auto text-sm ${
                view === item.key
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setView(item.key)}
            >
              <Icon className="h-4 w-4 mr-2" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {view === 'timeline' && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-primary" />
              Access Timeline
            </h2>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                className="h-9 rounded-full border border-border bg-background px-3 text-sm"
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-full border border-border bg-background px-3 text-sm"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {logLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No activity for this filter yet.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="group rounded-2xl border border-border bg-background/70 p-4 md:p-5 hover:border-primary/35 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 rounded-full bg-primary/12 p-2 border border-primary/20">
                        <UserCircle2 className="h-4 w-4 text-primary" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold leading-6">
                          {log.actor_label ?? 'Unknown actor'}
                          <span className="ml-2 text-xs font-medium text-muted-foreground">
                            ({formatRole(log.actor_role)})
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {log.action.toUpperCase()} · {formatResourceName(log.resource_type)}
                          {log.purpose ? ` · ${formatResourceName(log.purpose)}` : ''}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs text-muted-foreground">{formatRelativeDate(log.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'alerts' && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              High-Risk Alerts
            </h2>
            <Button variant="outline" className="rounded-full" onClick={fetchAlerts}>
              Refresh
            </Button>
          </div>

          {alertsLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No alerts right now. Your record activity looks normal.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {alerts.map((alert) => {
                const severity = getSeverity(alert.alert_type);
                const severityStyles =
                  severity === 'high'
                    ? 'border-red-500/30 bg-red-500/5'
                    : severity === 'medium'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-primary/25 bg-primary/5';

                return (
                  <div key={alert.id} className={`rounded-2xl border p-4 md:p-5 ${severityStyles}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground">{alert.title}</p>
                        <p className="text-sm mt-1 text-muted-foreground">{alert.message}</p>
                        <p className="text-xs mt-2 text-muted-foreground">{formatRelativeDate(alert.created_at)}</p>
                      </div>
                      <div>
                        {alert.is_read ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" /> Read
                          </span>
                        ) : (
                          <Button size="sm" className="rounded-full" onClick={() => markAsRead(alert.id)}>
                            Mark Read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {view === 'controls' && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Alert Controls
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose what activity should trigger patient-side privacy notifications.
          </p>

          {prefsLoading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {[
                {
                  key: 'enabled',
                  title: 'Enable privacy alerts',
                  desc: 'Master switch for in-app access risk alerts.',
                },
                {
                  key: 'first_time_provider_access',
                  title: 'First-time provider access',
                  desc: 'Alert when a provider accesses your records for the first time.',
                },
                {
                  key: 'unusual_hour_access',
                  title: 'Unusual hour access',
                  desc: 'Alert for access outside normal time windows.',
                },
                {
                  key: 'bulk_record_access',
                  title: 'High-volume access',
                  desc: 'Alert when many records are accessed in one action.',
                },
              ].map((setting) => {
                const key = setting.key as keyof PatientAccessAlertPreferences;
                const checked = Boolean(preferences[key]);
                const disabled = savingPref === setting.key;

                return (
                  <div key={setting.key} className="rounded-2xl border border-border bg-background/70 px-4 py-4 md:px-5 md:py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-foreground">{setting.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{setting.desc}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {disabled && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <Switch
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(value) =>
                            updatePreference(
                              setting.key as
                                | 'enabled'
                                | 'first_time_provider_access'
                                | 'unusual_hour_access'
                                | 'bulk_record_access',
                              value
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
