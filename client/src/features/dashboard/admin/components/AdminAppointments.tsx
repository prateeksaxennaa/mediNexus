import { useEffect, useState } from 'react';
import { Calendar, Stethoscope } from 'lucide-react';
import { hospitalService, type HospitalAppointment } from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

type FilterType = 'upcoming' | 'past' | 'all';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  booked:      { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: 'bg-emerald-500', label: 'Confirmed' },
  checked_in:  { bg: 'bg-yellow-500/10',  text: 'text-yellow-500',  dot: 'bg-yellow-500',  label: 'On Hold' },
  in_progress: { bg: 'bg-primary/15',     text: 'text-primary',     dot: 'bg-primary',     label: 'In Progress' },
  completed:   { bg: 'bg-green-500/10',   text: 'text-green-500',   dot: 'bg-green-500',   label: 'Completed' },
  cancelled:   { bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Cancelled' },
  no_show:     { bg: 'bg-muted',          text: 'text-muted-foreground', dot: 'bg-muted-foreground', label: 'No Show' },
  pending:     { bg: 'bg-muted',          text: 'text-muted-foreground', dot: 'bg-muted-foreground', label: 'Pending' },
};

export const AdminAppointments = () => {
  const [appointments, setAppointments] = useState<HospitalAppointment[]>([]);
  const [filter, setFilter] = useState<FilterType>('upcoming');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    hospitalService
      .listAppointments(filter)
      .then(res => setAppointments((res as any).data?.appointments ?? []))
      .catch(() => toast.error('Failed to load appointments'))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Clinical Operations</p>
          <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-full">
          {(['upcoming', 'past', 'all'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium capitalize transition-all ${
                filter === f
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-card rounded-2xl border p-16 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No {filter !== 'all' ? filter : ''} appointments found.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2.5fr_2fr_1.5fr_1fr] gap-4 px-6 py-3 border-b">
            {['Patient Profile', 'Assigned Practitioner', 'Scheduled Time', 'Status'].map(h => (
              <p key={h} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{h}</p>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y">
            {appointments.map(appt => {
              const style = STATUS_STYLES[appt.status] ?? STATUS_STYLES['pending'];
              const isInProgress = appt.status === 'in_progress';

              return (
                <div
                  key={appt.id}
                  className={`grid grid-cols-[2.5fr_2fr_1.5fr_1fr] gap-4 items-center px-6 py-5 transition-colors ${
                    isInProgress ? 'bg-primary/5' : 'hover:bg-muted/20'
                  }`}
                >
                  {/* Patient Profile */}
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${appt.patients?.id ?? appt.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                      alt={appt.patients?.full_name ?? 'Patient'}
                      className="h-11 w-11 rounded-xl shrink-0 border border-white/10 bg-muted"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{appt.patients?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {appt.patients?.phone_number
                          ? appt.patients.phone_number
                          : `ID: ${appt.patients?.id?.slice(0, 8) ?? '—'}`}
                        {appt.doctors?.specialisation && (
                          <> · {appt.doctors.specialisation}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Assigned Practitioner */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Stethoscope className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium truncate">
                      {appt.doctors?.full_name ?? 'Unknown'}
                    </p>
                  </div>

                  {/* Scheduled Time */}
                  <div className="text-right pr-4">
                    {appt.appointment_slots ? (
                      <>
                        <p className={`text-sm font-bold ${isInProgress ? 'text-primary' : ''}`}>
                          {isInProgress
                            ? 'CURRENT'
                            : format(parseISO(appt.appointment_slots.slot_start), 'hh:mm a')}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                          {isInProgress
                            ? 'Started recently'
                            : format(parseISO(appt.appointment_slots.slot_start), 'MMMM d, yyyy')}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex justify-end">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {style.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      {!loading && appointments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing <strong>{appointments.length}</strong> clinical sessions scheduled
        </p>
      )}
    </div>
  );
};
