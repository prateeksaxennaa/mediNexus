import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Loader2, X, ArrowRight, Stethoscope, FlaskConical, Hash, Hospital, AlignLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { patientService, type PatientAppointment } from '@/services/patient.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

type Filter = 'upcoming' | 'past' | 'all';
type AppointmentKind = 'doctor' | 'service';

const STATUS_COLORS: Record<string, string> = {
  booked: 'bg-primary/20 text-primary',
  checked_in: 'bg-yellow-500/10 text-yellow-600',
  in_progress: 'bg-orange-500/10 text-orange-500',
  completed: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-red-500/10 text-red-400',
  no_show: 'bg-muted text-muted-foreground',
};

const CANCELLABLE_DOCTOR = ['booked', 'checked_in'];
const CANCELLABLE_SERVICE = ['booked'];

const filterServiceAppointments = (appts: any[], filter: Filter): any[] => {
  const today = new Date().toISOString().split('T')[0];
  if (filter === 'upcoming') return appts.filter(a => (a.service_slots?.slot_date ?? '') >= today && a.status !== 'cancelled');
  if (filter === 'past') return appts.filter(a => (a.service_slots?.slot_date ?? '') < today || a.status === 'cancelled');
  return appts;
};

export const PatientAppointments = ({ setActiveTab }: { setActiveTab?: (tab: string) => void }) => {
  const navigate = useNavigate();
  const [kind, setKind] = useState<AppointmentKind>('doctor');
  const [filter, setFilter] = useState<Filter>('upcoming');

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [serviceAppts, setServiceAppts] = useState<any[]>([]);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [cancellingService, setCancellingService] = useState<string | null>(null);

  const fetchAppointments = async () => {
    setApptLoading(true);
    try {
      const res = await patientService.listAppointments(filter);
      setAppointments((res as any).data?.appointments ?? []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Failed to load appointments');
    } finally {
      setApptLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [filter]);

  const fetchServiceAppointments = async () => {
    setServiceLoading(true);
    try {
      const res = await patientService.listMyServiceAppointments();
      setServiceAppts((res as any).data?.appointments ?? []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Failed to load service appointments');
    } finally {
      setServiceLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceAppointments();
  }, []);

  const handleCancelDoctor = async (id: string) => {
    setCancelling(id);
    try {
      await patientService.cancelAppointment(id);
      toast.success('Appointment cancelled');
      fetchAppointments();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Could not cancel appointment');
    } finally {
      setCancelling(null);
    }
  };

  const handleCancelService = async (id: string) => {
    setCancellingService(id);
    try {
      await patientService.cancelServiceAppointment(id);
      toast.success('Service appointment cancelled');
      fetchServiceAppointments();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? e.message ?? 'Could not cancel appointment');
    } finally {
      setCancellingService(null);
    }
  };

  const filteredServiceAppts = filterServiceAppointments(serviceAppts, filter);
  const loading = kind === 'doctor' ? apptLoading : serviceLoading;

  return (
    <div className="p-8 animate-in fade-in duration-700 w-[calc(100%-2rem)] max-w-7xl mx-auto pb-32">
      
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">My Appointments</h1>
          <p className="text-muted-foreground text-base">Managing your healthcare schedule with clinical precision.</p>
        </div>
        
        <div className="flex items-center bg-card rounded-full p-1 border border-border shadow-inner shrink-0">
          <button
            onClick={() => setKind('doctor')}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              kind === 'doctor'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            Doctor Appointments
          </button>
          <button
            onClick={() => setKind('service')}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              kind === 'service'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            Service Appointments
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-10 text-sm">
        <div className="flex items-center gap-3">
          {setActiveTab && (
            <button
              onClick={() => setActiveTab('waitlist')}
              className="px-5 py-2 rounded-full border border-border bg-card text-foreground hover:bg-secondary transition-colors"
            >
              My Waitlist
            </button>
          )}
          <div className="flex items-center gap-2">
            {(['upcoming', 'past', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-5 py-2 rounded-full border transition-colors capitalize ${
                  filter === f
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary/80 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center text-muted-foreground">
          <AlignLeft className="w-4 h-4 mr-2" />
          Sorted by: Date (Newest)
        </div>
      </div>

      {/* Main List Area */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : kind === 'doctor' ? (
        appointments.length === 0 ? (
          <div className="bg-card rounded-3xl border border-border p-16 text-center text-muted-foreground">
            No {filter === 'all' ? '' : filter} doctor appointments found.
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appt) => (
              <div key={appt.id} className="bg-card rounded-3xl border border-border flex flex-col md:flex-row overflow-hidden group hover:border-border/80 transition-colors">
                
                {/* Decorative image/icon block */}
                <div className="relative w-full md:w-64 h-40 md:h-auto bg-muted/50 flex items-center justify-center shrink-0 border-r border-border">
                  <div className="absolute inset-0 bg-gradient-to-br from-background/60 to-transparent" />
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center z-10 border border-primary/30 border-dashed animate-[spin_10s_linear_infinite]">
                    <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center border border-primary/50 animate-[spin_10s_linear_infinite_reverse]">
                      <Stethoscope className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </div>

                {/* Details block */}
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-foreground">{appt.doctors?.full_name ?? 'Doctor'}</h3>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase ${STATUS_COLORS[appt.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {appt.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center text-muted-foreground text-sm">
                        <User className="w-4 h-4 mr-1.5 opacity-50" />
                        <span>{appt.doctors?.specialisation} &mdash; {appt.hospitals?.name}, {appt.hospitals?.city}</span>
                      </div>
                    </div>

                  </div>

                  {appt.appointment_slots && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-border">
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Date</div>
                        <div className="flex items-center font-medium text-foreground">
                          <Calendar className="w-4 h-4 mr-2 text-primary" />
                          {format(parseISO(appt.appointment_slots.slot_start), 'EEE, MMM d, yyyy')}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Time</div>
                        <div className="flex items-center font-medium text-foreground">
                          <Clock className="w-4 h-4 mr-2 text-primary" />
                          {format(parseISO(appt.appointment_slots.slot_start), 'h:mm a')}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Status</div>
                        <div className="flex items-center font-medium text-muted-foreground">
                          <Hash className="w-4 h-4 mr-2 text-primary" />
                          Ref: #{appt.id.slice(0,6).toUpperCase()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions block */}
                <div className="md:w-24 border-t md:border-t-0 md:border-l border-border flex flex-row md:flex-col items-center justify-center gap-4 p-4 md:p-0 bg-muted/50 shrink-0">
                  {CANCELLABLE_DOCTOR.includes(appt.status) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-12 h-12 rounded-full border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors shadow-inner"
                      disabled={cancelling === appt.id}
                      onClick={() => handleCancelDoctor(appt.id)}
                      title="Cancel Appointment"
                    >
                      {cancelling === appt.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                    </Button>
                  )}
                  {appt.status === 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-12 h-12 rounded-full border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary transition-colors shadow-inner"
                      onClick={() => navigate('/patient/discover')}
                      title="Book Again"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // ── Service appointments ──────────────────────────────────────────────
        filteredServiceAppts.length === 0 ? (
          <div className="bg-card rounded-3xl border border-border p-16 text-center text-muted-foreground flex flex-col items-center">
            <FlaskConical className="h-10 w-10 mb-4 opacity-40 text-primary" />
            <p>No {filter === 'all' ? '' : filter} service appointments found.</p>
            <Button
              variant="outline"
              className="mt-6 border-border bg-secondary hover:bg-secondary/80 hover:text-foreground text-foreground rounded-full px-6"
              onClick={() => navigate('/patient/services')}
            >
              Book a Service
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredServiceAppts.map((appt: any) => (
              <div key={appt.id} className="bg-card rounded-3xl border border-border flex flex-col md:flex-row overflow-hidden group hover:border-border/80 transition-colors">
                
                {/* Decorative image/icon block */}
                <div className="relative w-full md:w-64 h-40 md:h-auto bg-muted/50 flex items-center justify-center shrink-0 border-r border-border">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1e1a24] to-background opacity-80" />
                  <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center z-10 border border-primary/30 border-dashed animate-[spin_10s_linear_infinite]">
                    <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center border border-primary/50 animate-[spin_10s_linear_infinite_reverse]">
                      <FlaskConical className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </div>

                {/* Details block */}
                <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-foreground">{appt.hospital_services?.service_name ?? 'Service'}</h3>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase ${STATUS_COLORS[appt.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {appt.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center text-muted-foreground text-sm">
                        <Hospital className="w-4 h-4 mr-1.5 opacity-50" />
                        <span>
                          {appt.hospital_services?.service_type}
                          {appt.hospital_services?.department ? ` · ${appt.hospital_services.department}` : ''}
                          {appt.hospitals ? ` — ${appt.hospitals.name}, ${appt.hospitals.city}` : ''}
                        </span>
                      </div>
                    </div>
                    {appt.hospital_services?.fee != null ? (
                       <div className="text-right hidden sm:block">
                         <div className="text-2xl font-bold text-primary">₹{appt.hospital_services.fee.toFixed(2)}</div>
                         <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Consultation Fee</div>
                       </div>
                    ) : null}
                  </div>

                  {appt.service_slots && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-border">
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Date</div>
                        <div className="flex items-center font-medium text-foreground">
                          <Calendar className="w-4 h-4 mr-2 text-primary" />
                          {appt.service_slots.slot_date
                            ? format(parseISO(appt.service_slots.slot_date), 'EEE, MMM d, yyyy')
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Time</div>
                        <div className="flex items-center font-medium text-foreground">
                          <Clock className="w-4 h-4 mr-2 text-primary" />
                          Slot #{appt.service_slots.slot_number}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">Reference</div>
                        <div className="flex items-center font-medium text-muted-foreground">
                          <Hash className="w-4 h-4 mr-2 text-primary" />
                          #{appt.id.slice(0,6).toUpperCase()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions block */}
                <div className="md:w-24 border-t md:border-t-0 md:border-l border-border flex flex-row md:flex-col items-center justify-center gap-4 p-4 md:p-0 bg-muted/50 shrink-0">
                  {CANCELLABLE_SERVICE.includes(appt.status) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-12 h-12 rounded-full border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors shadow-inner"
                      disabled={cancellingService === appt.id}
                      onClick={() => handleCancelService(appt.id)}
                      title="Cancel Appointment"
                    >
                      {cancellingService === appt.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                    </Button>
                  )}
                  {appt.status === 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-12 h-12 rounded-full border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary transition-colors shadow-inner"
                      onClick={() => navigate('/patient/services')}
                      title="Book Again"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
