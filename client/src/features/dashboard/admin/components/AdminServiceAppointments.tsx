import { useEffect, useState } from 'react';
import { Calendar, CreditCard, Hash, ChevronDown } from 'lucide-react';
import {
  hospitalService,
  type ServiceAppointment,
  type ServiceAppointmentStatus,
  type HospitalService,
} from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

type Filter = 'upcoming' | 'past' | 'all';
const FILTERS: Filter[] = ['upcoming', 'past', 'all'];

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  booked:      { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  checked_in:  { dot: 'bg-yellow-500',  bg: 'bg-yellow-500/10',  text: 'text-yellow-500'  },
  in_progress: { dot: 'bg-orange-500',  bg: 'bg-orange-500/10',  text: 'text-orange-500'  },
  completed:   { dot: 'bg-green-500',   bg: 'bg-green-500/10',   text: 'text-green-500'   },
  cancelled:   { dot: 'bg-red-400',     bg: 'bg-red-500/10',     text: 'text-red-400'     },
  no_show:     { dot: 'bg-muted-foreground', bg: 'bg-muted', text: 'text-muted-foreground' },
  pending:     { dot: 'bg-rose-500',    bg: 'bg-rose-500/10',    text: 'text-rose-500'    },
};

const STATUS_OPTIONS: Array<{ label: string; value: ServiceAppointmentStatus | '' }> = [
  { label: 'All statuses',  value: '' },
  { label: 'Booked',        value: 'booked' },
  { label: 'Checked in',    value: 'checked_in' },
  { label: 'In progress',   value: 'in_progress' },
  { label: 'Completed',     value: 'completed' },
  { label: 'Cancelled',     value: 'cancelled' },
  { label: 'No show',       value: 'no_show' },
];

const NEXT_ACTIONS: Record<ServiceAppointmentStatus, Array<{ label: string; value: ServiceAppointmentStatus }>> = {
  booked:      [{ label: 'Check in',  value: 'checked_in' },
                { label: 'No show',   value: 'no_show'    },
                { label: 'Cancel',    value: 'cancelled'  }],
  checked_in:  [{ label: 'Start',     value: 'in_progress'},
                { label: 'Cancel',    value: 'cancelled'  }],
  in_progress: [{ label: 'Complete',  value: 'completed'  },
                { label: 'Cancel',    value: 'cancelled'  }],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminServiceAppointments = () => {
  const [appointments, setAppointments] = useState<ServiceAppointment[]>([]);
  const [total, setTotal]               = useState(0);
  const [services, setServices]         = useState<HospitalService[]>([]);
  const [filter, setFilter]             = useState<Filter>('upcoming');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter]   = useState<ServiceAppointmentStatus | ''>('');
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    hospitalService
      .listServices()
      .then(res => setServices((res as any).data?.services ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    hospitalService
      .listServiceAppointments({
        filter,
        serviceId: serviceFilter || undefined,
        status:    (statusFilter as ServiceAppointmentStatus) || undefined,
      })
      .then(res => {
        setAppointments((res as any).data?.appointments ?? []);
        setTotal((res as any).data?.total ?? 0);
      })
      .catch(() => toast.error('Failed to load service appointments'))
      .finally(() => setLoading(false));
  }, [filter, serviceFilter, statusFilter]);

  const handleStatusUpdate = (appointmentId: string, newStatus: ServiceAppointmentStatus) => {
    hospitalService
      .updateServiceAppointmentStatus(appointmentId, newStatus)
      .then(() => {
        toast.success(`Appointment marked as ${newStatus.replace(/_/g, ' ')}`);
        setAppointments(prev =>
          prev.map(a => a.id === appointmentId ? { ...a, status: newStatus } : a)
        );
      })
      .catch((e: any) => toast.error(e.message ?? 'Failed to update status'));
  };

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Service Bookings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Patient bookings for your hospital's services.
        </p>
      </div>

      {/* Filters row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-full">
          {FILTERS.map(f => (
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

        {/* Service + Status filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {services.length > 0 && (
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="h-9 rounded-full border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%23888' viewBox='0 0 16 16'%3e%3cpath d='M3.5 5.5l4.5 5 4.5-5z'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '14px' }}
            >
              <option value="">All services</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.service_name}</option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as ServiceAppointmentStatus | '')}
            className="h-9 rounded-full border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-8 cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%23888' viewBox='0 0 16 16'%3e%3cpath d='M3.5 5.5l4.5 5 4.5-5z'/%3e%3c/svg%3e")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', backgroundSize: '14px' }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-muted/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-card border rounded-2xl p-16 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No {filter !== 'all' ? filter : ''} service bookings found.</p>
          {(serviceFilter || statusFilter) && (
            <p className="text-sm mt-1">Try adjusting or clearing the filters above.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(appt => (
            <BookingCard key={appt.id} appt={appt} onStatusUpdate={handleStatusUpdate} />
          ))}
        </div>
      )}

      {/* Footer count */}
      {!loading && appointments.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing 1 to {appointments.length} of {total} bookings
        </p>
      )}
    </div>
  );
};

// ─── Booking card ─────────────────────────────────────────────────────────────

interface CardProps {
  appt: ServiceAppointment;
  onStatusUpdate: (id: string, status: ServiceAppointmentStatus) => void;
}

const BookingCard = ({ appt, onStatusUpdate }: CardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const style = STATUS_STYLES[appt.status] ?? STATUS_STYLES['no_show'];
  const actions = NEXT_ACTIONS[appt.status] ?? [];

  const slotDate   = appt.service_slots?.slot_date;
  const slotNumber = appt.service_slots?.slot_number;

  const patientName  = appt.patients?.full_name ?? 'Unknown Patient';
  const patientPhone = appt.patients?.phone_number;
  const serviceName  = appt.hospital_services?.service_name ?? 'Unknown';
  const department   = appt.hospital_services?.department;
  const fee          = appt.hospital_services?.fee;
  const bookingType  = appt.booking_type;

  return (
    <div className="bg-card border rounded-2xl p-5 flex items-center gap-5 hover:border-primary/20 transition-colors">
      {/* Avatar */}
      <img
        src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${appt.patients?.id ?? appt.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
        alt={patientName}
        className="h-12 w-12 rounded-xl shrink-0 border border-white/10 bg-muted"
      />

      {/* Patient info */}
      <div className="min-w-0 w-40 shrink-0">
        <p className="font-bold text-sm truncate">{patientName}</p>
        {patientPhone && (
          <p className="text-xs text-muted-foreground mt-0.5">{patientPhone}</p>
        )}
      </div>

      {/* Service + slot details */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-xs">
          <span className="text-primary font-bold uppercase tracking-wider text-[10px]">Service</span>
          <span className="text-muted-foreground mx-1.5">·</span>
          <span className="font-semibold text-sm">{serviceName}{department ? ` - ${department}` : ''}</span>
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {slotDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(parseDateOnly(slotDate), 'EEE, MMM d, yyyy')}
            </span>
          )}
          {slotNumber != null && (
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" /> Slot {slotNumber}
            </span>
          )}
          {fee != null && (
            <span className="flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> ₹{fee}
            </span>
          )}
        </div>
        {bookingType && (
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-muted rounded-full px-2.5 py-0.5 text-muted-foreground">
            {bookingType.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Status + booked time  */}
      <div className="text-right shrink-0 space-y-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${style.bg} ${style.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {appt.status.replace(/_/g, ' ')}
        </span>
        {appt.booked_at && (
          <p className="text-[10px] text-muted-foreground/60 italic">
            Booked {format(parseISO(appt.booked_at), 'MMM d, h:mm a')}
          </p>
        )}
      </div>

      {/* Actions dropdown */}
      {actions.length > 0 && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="h-9 rounded-full border border-border px-3 text-xs font-medium flex items-center gap-1 hover:bg-muted transition-colors"
          >
            Actions <ChevronDown className="h-3 w-3" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 z-20 w-36 rounded-xl border bg-popover shadow-lg py-1 overflow-hidden">
                {actions.map(action => (
                  <button
                    key={action.value}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors"
                    onClick={() => { setMenuOpen(false); onStatusUpdate(appt.id, action.value); }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
