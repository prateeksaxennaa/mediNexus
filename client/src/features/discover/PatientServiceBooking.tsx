import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  MapPin,
  Calendar,
  Clock,
  Building2,
  Stethoscope,
  CheckCircle2,
  X,
  Activity,
  HeartPulse,
  FlaskConical,
  Scan,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { IconHeartbeat } from '@tabler/icons-react';
import { patientService, releaseServiceSlotBeacon } from '@/services/patient.service';
import { toast } from 'sonner';
import { format, eachDayOfInterval, addMonths, startOfMonth, endOfMonth, isSameDay } from 'date-fns';

interface Service {
  id: string;
  service_name: string;
  service_type: string;
  department: string;
  default_duration_mins: number;
  fee: number;
  pay_at_counter: boolean;
  daily_slot_limit: number;
  hospitals: {
    id: string;
    name: string;
    city: string;
    address: string;
  };
  slotsAvailable?: number;
}

interface ServiceSlot {
  id: string;
  service_id: string;
  slot_date: string;
  slot_number: number;
  status: 'available' | 'locked' | 'booked' | 'cancelled';
}

type Step = 'search' | 'service' | 'confirm' | 'done';

const serviceTypeIcons: Record<string, React.ReactNode> = {
  'ECG': <HeartPulse className="h-5 w-5" />,
  'X-Ray': <Scan className="h-5 w-5" />,
  'CT Scan': <Scan className="h-5 w-5" />,
  'MRI': <Scan className="h-5 w-5" />,
  'Lab': <FlaskConical className="h-5 w-5" />,
  'Blood Test': <FlaskConical className="h-5 w-5" />,
  'Ultrasound': <Activity className="h-5 w-5" />,
  'default': <Stethoscope className="h-5 w-5" />,
};

// Extract a human-readable error string from an axios-style error
const extractError = (err: any, fallback: string): string => {
  return err?.response?.data?.error
    ?? err?.response?.data?.message
    ?? err?.message
    ?? fallback;
};

const PatientServiceBooking = () => {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // viewMonth drives the calendar; selectedDate is the day the user clicked
  const [viewMonth, setViewMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [step, setStep] = useState<Step>('search');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, ServiceSlot[]>>({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<ServiceSlot | null>(null);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  // Live countdown seconds remaining on the lock
  const [lockSecondsLeft, setLockSecondsLeft] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookedAppt, setBookedAppt] = useState<any>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Used to discard stale loadSlots responses when service/month changes quickly
  const loadIdRef = useRef(0);
  // Tracks current locked slot for cleanup on unmount
  const selectedSlotRef = useRef<ServiceSlot | null>(null);

  // ── Search ──────────────────────────────────────────────────────────────────

  const searchServices = useCallback((q: string) => {
    setSearchLoading(true);
    patientService.discoverServices({ search: q })
      .then(res => setServices((res as any).data?.services ?? []))
      .catch(() => toast.error('Search failed'))
      .finally(() => setSearchLoading(false));
  }, []);

  useEffect(() => { searchServices(''); }, []);

  // Release service slot lock on component unmount (covers Close button / browser navigation)
  useEffect(() => {
    const handleUnload = () => {
      if (selectedSlotRef.current) {
        releaseServiceSlotBeacon(selectedSlotRef.current.id);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // Also release on React unmount (SPA navigation)
      if (selectedSlotRef.current) {
        releaseServiceSlotBeacon(selectedSlotRef.current.id);
      }
    };
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchServices(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchServices]);

  // ── Slot loading ─────────────────────────────────────────────────────────────

  const loadSlots = useCallback(async (serviceId: string, month: Date) => {
    const id = ++loadIdRef.current;
    setSlotsLoading(true);
    try {
      const startDate = startOfMonth(month);
      const endDate = endOfMonth(month);
      const res = await patientService.getServiceSlots(serviceId, {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      });
      // Discard if a newer request has been issued
      if (id !== loadIdRef.current) return;
      setSlotsByDate((res as any).data?.slots ?? {});
    } catch (err: any) {
      if (id !== loadIdRef.current) return;
      toast.error(extractError(err, 'Failed to load slots'));
    } finally {
      if (id === loadIdRef.current) setSlotsLoading(false);
    }
  }, []);

  // Re-fetch whenever service or viewed month changes (and we're on the service step)
  useEffect(() => {
    if (step === 'service' && selectedService) {
      loadSlots(selectedService.id, viewMonth);
    }
  }, [selectedService, viewMonth, step, loadSlots]);

  // ── Lock countdown timer ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!lockedUntil) { setLockSecondsLeft(null); return; }

    const tick = () => {
      const secs = Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000));
      setLockSecondsLeft(secs);
      if (secs === 0) {
        // Lock expired — clear selection so user must pick again
        setSelectedSlot(null);
        setLockedUntil(null);
        toast.error('Your slot reservation has expired. Please select a slot again.');
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  // ── Navigation helpers ───────────────────────────────────────────────────────

  const openService = (service: Service) => {
    setSelectedService(service);
    setViewMonth(new Date());
    setSelectedDate(new Date());
    setSelectedSlot(null);
    setLockedUntil(null);
    setSlotsByDate({});
    setStep('service');
  };

  const goBack = async () => {
    if (step === 'done') { resetToSearch(); return; }
    if (step === 'confirm') { setStep('service'); return; }
    if (step === 'service') {
      // Release the active lock before leaving the service page
      if (selectedSlot) {
        patientService.releaseServiceSlot(selectedSlot.id).catch(() => {});
        setSelectedSlot(null);
        setLockedUntil(null);
      }
      setStep('search');
      return;
    }
  };

  const resetToSearch = () => {
    if (selectedSlot) {
      patientService.releaseServiceSlot(selectedSlot.id).catch(() => {});
    }
    setStep('search');
    setSelectedService(null);
    setSelectedSlot(null);
    setLockedUntil(null);
    setBookedAppt(null);
    setSlotsByDate({});
  };

  // ── Slot selection ───────────────────────────────────────────────────────────

  const selectSlot = async (slot: ServiceSlot) => {
    // Release previous lock first (best-effort)
    if (selectedSlot && selectedSlot.id !== slot.id) {
      patientService.releaseServiceSlot(selectedSlot.id).catch(() => {});
    }

    // Optimistically set the slot, but only keep it if lock succeeds
    setSelectedSlot(slot);
    setLockedUntil(null);

    try {
      const res = await patientService.lockServiceSlot(slot.id);
      const until = (res as any).data?.lockedUntil ?? null;
      setLockedUntil(until ? new Date(until) : null);
    } catch (err: any) {
      toast.error(extractError(err, 'Failed to lock slot'));
      // Revert optimistic update — slot not actually locked
      setSelectedSlot(null);
    }
  };

  // ── Booking ──────────────────────────────────────────────────────────────────

  const confirmBooking = async () => {
    if (!selectedSlot || !selectedService) return;
    setBooking(true);
    try {
      const res = await patientService.bookServiceSlot({ slotId: selectedSlot.id });
      setBookedAppt((res as any).data?.appointment ?? null);
      setStep('done');
      toast.success('Service booked!');
    } catch (err: any) {
      toast.error(extractError(err, 'Failed to book service'));
    } finally {
      setBooking(false);
    }
  };

  // ── Calendar helpers ─────────────────────────────────────────────────────────

  const monthDays = eachDayOfInterval({
    start: startOfMonth(viewMonth),
    end: endOfMonth(viewMonth),
  });

  const getSlotsForDate = (date: Date): ServiceSlot[] => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return slotsByDate[dateKey] || [];
  };

  const getDateAvailability = (date: Date) => {
    const dateSlots = getSlotsForDate(date);
    const available = dateSlots.filter(s => s.status === 'available').length;
    const booked = dateSlots.filter(s => s.status === 'booked').length;
    return { total: dateSlots.length, available, booked };
  };

  const getIconForType = (type: string) => {
    const key = Object.keys(serviceTypeIcons).find(k =>
      type.toLowerCase().includes(k.toLowerCase())
    );
    return serviceTypeIcons[key || 'default'];
  };

  const formatCountdown = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-5xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== 'search' && (
              <Button variant="ghost" size="icon" onClick={goBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/patient/dashboard')}>
              <IconHeartbeat className="h-6 w-6 text-primary" />
              <span className="font-serif text-xl font-light">
                mediNexus <span className="text-sm font-medium text-muted-foreground ml-1">Services</span>
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/patient/dashboard')}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
      </header>

      <main className="w-full max-w-4xl mx-auto p-6 space-y-6">

        {/* ── SEARCH ─────────────────────────────────────────────────────────── */}
        {step === 'search' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-3xl font-light tracking-tight">Book a Service</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Find and book diagnostic tests, lab work, and other hospital services.
              </p>
            </div>

            <div className="bg-card rounded-xl border p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Search Services</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="e.g. ECG, Blood Test, X-Ray, MRI..."
                    className="pl-9"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {searchLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : services.length === 0 ? (
              <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
                <Stethoscope className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No services found.</p>
                <p className="text-sm mt-1">Try adjusting your search.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {services.map(svc => {
                  const avail = (svc as any).slotsAvailable ?? 0;
                  return (
                    <div
                      key={svc.id}
                      className="bg-card rounded-xl border p-4 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => openService(svc)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            {getIconForType(svc.service_type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{svc.service_name}</p>
                              <Badge variant="secondary" className="text-[10px]">{svc.service_type}</Badge>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Building2 className="h-3.5 w-3.5" />
                              {svc.hospitals.name}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <MapPin className="h-3 w-3" />
                              {svc.hospitals.city}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">₹{svc.fee}</p>
                          {avail > 0 ? (
                            <p className="text-xs text-green-600 mt-1">{avail} slots open</p>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1">No slots</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SERVICE / SLOT PICKER ───────────────────────────────────────────── */}
        {step === 'service' && selectedService && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  {getIconForType(selectedService.service_type)}
                </div>
                <div>
                  <h1 className="text-2xl font-light tracking-tight">{selectedService.service_name}</h1>
                  <p className="text-muted-foreground text-sm">
                    {selectedService.hospitals.name} · {selectedService.hospitals.city}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Service Fee</p>
                <p className="text-2xl font-light">₹{selectedService.fee}</p>
              </div>
              {selectedService.pay_at_counter && (
                <Badge variant="outline">Pay at Counter</Badge>
              )}
            </div>

            {/* Calendar */}
            <div className="space-y-3">
              <h2 className="font-medium">Select a Date</h2>
              <div className="bg-card rounded-xl border p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMonth(prev => addMonths(prev, -1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium">{format(viewMonth, 'MMMM yyyy')}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMonth(prev => addMonths(prev, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center text-xs text-muted-foreground py-2">{d}</div>
                  ))}
                  {/* Leading blank cells to align the first day */}
                  {Array.from({ length: startOfMonth(viewMonth).getDay() }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {monthDays.map(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const hasSlots = (slotsByDate[dateKey]?.length ?? 0) > 0;
                    const { available } = getDateAvailability(day);
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const isPast = day < new Date() && !isToday;

                    return (
                      <button
                        key={dateKey}
                        disabled={isPast}
                        onClick={() => setSelectedDate(day)}
                        className={`
                          p-2 rounded-lg text-sm text-center transition-colors relative
                          ${isSelected ? 'bg-primary text-primary-foreground' : ''}
                          ${!isSelected && !isPast ? 'hover:bg-muted' : ''}
                          ${isPast ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        {format(day, 'd')}
                        {hasSlots && !isSelected && (
                          <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${available > 0 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Slot grid */}
            <div className="space-y-3">
              <h2 className="font-medium">
                Available Slots for {format(selectedDate, 'EEEE, MMM d')}
              </h2>
              {slotsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {getSlotsForDate(selectedDate).length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No slots available for this date
                    </div>
                  ) : (
                    getSlotsForDate(selectedDate).map(slot => {
                      const isSelected = selectedSlot?.id === slot.id;
                      const isAvailable = slot.status === 'available';

                      return (
                        <button
                          key={slot.id}
                          disabled={!isAvailable}
                          onClick={() => isAvailable && selectSlot(slot)}
                          className={`
                            py-3 px-2 rounded-lg text-sm border transition-colors font-medium
                            ${isSelected ? 'bg-primary text-primary-foreground border-primary' : ''}
                            ${isAvailable && !isSelected ? 'bg-green-500/10 border-green-500/30 text-green-700 hover:bg-green-500/20' : ''}
                            ${!isAvailable ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-dashed' : ''}
                          `}
                        >
                          #{slot.slot_number}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Sticky footer with selected slot & countdown */}
            {selectedSlot && (
              <div className="sticky bottom-4 bg-card border rounded-xl p-4 flex items-center justify-between shadow-lg">
                <div>
                  <p className="font-medium">
                    Slot #{selectedSlot.slot_number} — {format(selectedDate, 'EEE, MMM d')}
                  </p>
                  {lockSecondsLeft !== null && (
                    <p className={`text-xs mt-0.5 ${lockSecondsLeft <= 30 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      Reserved for {formatCountdown(lockSecondsLeft)}
                    </p>
                  )}
                </div>
                <Button onClick={() => setStep('confirm')}>Continue</Button>
              </div>
            )}
          </div>
        )}

        {/* ── CONFIRM ─────────────────────────────────────────────────────────── */}
        {step === 'confirm' && selectedService && selectedSlot && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-3xl font-light tracking-tight">Confirm Booking</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Review your service booking details.
              </p>
            </div>

            <div className="bg-card rounded-xl border divide-y">
              {[
                ['Service', selectedService.service_name],
                ['Hospital', selectedService.hospitals.name],
                ['Location', selectedService.hospitals.address],
                ['Date', format(selectedDate, 'EEEE, MMMM d, yyyy')],
                ['Slot Number', `Slot #${selectedSlot.slot_number}`],
                ['Fee', `₹${selectedService.fee}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium">First Come, First Served</p>
              <p className="mt-1">Your slot #{selectedSlot.slot_number} is reserved. Please arrive at the hospital at your designated time slot.</p>
            </div>

            {selectedService.pay_at_counter && (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
                Payment will be collected at the hospital counter after the service.
              </div>
            )}

            {lockSecondsLeft !== null && (
              <p className={`text-xs text-center ${lockSecondsLeft <= 30 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                Slot reserved for {formatCountdown(lockSecondsLeft)} — confirm before it expires.
              </p>
            )}

            <Button className="w-full h-12" onClick={confirmBooking} disabled={booking}>
              {booking ? 'Booking...' : `Pay ₹${selectedService.fee} & Confirm`}
            </Button>
          </div>
        )}

        {/* ── DONE ────────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="space-y-6 animate-in fade-in duration-300 text-center py-12">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <div>
              <h1 className="text-3xl font-light tracking-tight">Service Booked!</h1>
              <p className="text-muted-foreground text-sm mt-2">
                Your service has been scheduled successfully.
              </p>
            </div>

            {bookedAppt && (
              <div className="bg-card rounded-xl border p-5 text-left max-w-sm mx-auto space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Stethoscope className="h-4 w-4" />
                  {selectedService?.service_name}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  {selectedService?.hospitals.name}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {format(selectedDate, 'EEE, MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Slot #{selectedSlot?.slot_number}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={resetToSearch}>Book Another</Button>
              <Button onClick={() => navigate('/patient/dashboard', { state: { tab: 'appointments' } })}>
                View Appointments
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PatientServiceBooking;
