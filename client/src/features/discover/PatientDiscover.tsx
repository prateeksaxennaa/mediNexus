import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Radio,
  Bell,
  BellOff,
  FileText,
  FlaskConical,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { IconHeartbeat } from '@tabler/icons-react';
import { patientService, releaseSlotLockBeacon, type PatientPrescription, type PatientReport, type DocumentSelection } from '@/services/patient.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useSlotStream, type SlotUpdatePayload } from '@/hooks/useSlotStream';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscoverHospital {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  is_approved: boolean;
  has_slots_today: boolean;
  hospital_services?: { id: string; service_name: string; department: string }[];
  doctors?: { id: string; full_name: string; specialisation: string; verified: boolean }[];
}

interface Slot {
  id: string;
  doctor_id: string;
  slot_start: string;
  slot_end: string;
  status: string;
}

type Step = 'search' | 'hospital' | 'slots' | 'confirm' | 'grant-access' | 'done';

// ─── Component ────────────────────────────────────────────────────────────────

const PatientDiscover = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Search state
  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [specFilter, setSpecFilter] = useState('');
  const [hospitals, setHospitals] = useState<DiscoverHospital[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Step navigation
  const [step, setStep] = useState<Step>('search');
  const [selectedHospital, setSelectedHospital] = useState<DiscoverHospital | null>(null);
  const [hospitalDetail, setHospitalDetail] = useState<DiscoverHospital | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<{ id: string; full_name: string; specialisation: string } | null>(null);
  const [slotDate, setSlotDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Booking state
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookedAppt, setBookedAppt] = useState<any>(null);

  // Ref to always track the current locked slot for cleanup on unmount
  const selectedSlotRef = useRef<Slot | null>(null);

  // Waitlist — track which slot IDs the patient just joined so the button updates immediately
  const [waitlistedSlotIds, setWaitlistedSlotIds] = useState<Set<string>>(new Set());

  // Grant-access step state
  const [patientPrescriptions, setPatientPrescriptions] = useState<PatientPrescription[]>([]);
  const [patientReports, setPatientReports] = useState<PatientReport[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentSelection[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsSaving, setGrantsSaving] = useState(false);
  const [grantOtpSent, setGrantOtpSent] = useState(false);
  const [grantOtpCode, setGrantOtpCode] = useState('');
  const [grantOtpExpiresAt, setGrantOtpExpiresAt] = useState<string | null>(null);
  const [grantOtpSending, setGrantOtpSending] = useState(false);
  const [grantOtpVerifying, setGrantOtpVerifying] = useState(false);

  // ── Release slot lock on component unmount (user navigates away) ──
  useEffect(() => {
    const handleUnload = () => {
      if (selectedSlotRef.current) {
        releaseSlotLockBeacon(selectedSlotRef.current.id);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // Also release on React unmount (SPA navigation)
      if (selectedSlotRef.current) {
        releaseSlotLockBeacon(selectedSlotRef.current.id);
      }
    };
  }, []);

  // Keep ref in sync with state so the unmount cleanup always sees the latest value
  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  // ── Handle incoming waitlist-accepted slot (from PatientDashboard) ──
  // When a patient accepts a waitlist offer they are navigated here with
  // router state: { waitlistSlot: { id, slot_start, slot_end, doctor_id, locked_until } }
  // We load the doctor info and jump straight to the confirm step.
  useEffect(() => {
    const ws = (location.state as any)?.waitlistSlot;
    if (!ws) return;

    // Clear the router state so refreshing doesn't replay this
    window.history.replaceState({}, document.title);

    // We have the slot; we need the doctor + hospital to fill the confirm step.
    patientService.getDoctorSlots(ws.doctor_id).then((res: any) => {
      const doctor = res.data?.doctor;
      if (!doctor) {
        toast.error('Could not load doctor info. Please book manually.');
        return;
      }

      const slot: Slot = {
        id: ws.id,
        doctor_id: ws.doctor_id,
        slot_start: ws.slot_start,
        slot_end: ws.slot_end,
        status: 'locked',
      };

      // Build a minimal hospital object from the doctor's hospitals join
      const hospital = doctor.hospitals
        ? { id: doctor.hospital_id ?? '', name: doctor.hospitals.name, type: '', address: '', city: doctor.hospitals.city, state: '', is_approved: true, has_slots_today: false }
        : null;

      setSelectedDoctor({ id: ws.doctor_id, full_name: doctor.full_name, specialisation: doctor.specialisation });
      setSelectedSlot(slot);
      setLockedUntil(ws.locked_until);
      if (hospital) setSelectedHospital(hospital);
      setStep('confirm');
    }).catch(() => {
      toast.error('Could not load booking details. Please find the slot manually.');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time slot stream ──
  // `streamConnected` is purely cosmetic — shows a live indicator badge.
  const [streamConnected, setStreamConnected] = useState(false);

  // Active doctor + date being watched (empty strings = stream paused)
  const streamDoctorId = step === 'slots' && selectedDoctor ? selectedDoctor.id : '';
  const streamDate     = step === 'slots' ? (slotDate || format(new Date(), 'yyyy-MM-dd')) : '';

  useSlotStream(streamDoctorId, streamDate, (payload: SlotUpdatePayload) => {
    setStreamConnected(true); // at least one event received = definitely live

    setSlots((prev) => {
      if (payload.event === 'DELETE') {
        // Row hard-deleted — remove it
        return prev.filter((s) => s.id !== payload.slot.id);
      }

      if (payload.event === 'INSERT') {
        // New slot created — add if available or booked, and not already present
        if (payload.slot.status !== 'available' && payload.slot.status !== 'booked') return prev;
        if (prev.some((s) => s.id === payload.slot.id)) return prev;
        const newSlot: Slot = {
          id: payload.slot.id,
          doctor_id: payload.slot.doctor_id,
          slot_start: payload.slot.slot_start,
          slot_end: payload.slot.slot_end,
          status: payload.slot.status,
        };
        return [...prev, newSlot].sort(
          (a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime()
        );
      }

      // UPDATE — most common path
      const { id, status } = payload.slot;

      if (status !== 'available' && status !== 'booked') {
        // Slot is now locked/cancelled — remove from grid entirely
        if (selectedSlot?.id === id) {
          setSelectedSlot(null);
          setLockedUntil(null);
          toast.warning('The slot you selected was just taken. Please choose another.');
        }
        return prev.filter((s) => s.id !== id);
      }

      if (status === 'booked') {
        // Slot just got booked — deselect if the patient had it selected, but keep in grid
        if (selectedSlot?.id === id) {
          setSelectedSlot(null);
          setLockedUntil(null);
          toast.warning('The slot you selected was just booked. You can join the waitlist instead.');
        }
        return prev.map((s) => (s.id === id ? { ...s, status } : s));
      }

      // Status flipped back to available (e.g. lock expired, booking cancelled)
      const existing = prev.find((s) => s.id === id);
      if (existing) {
        return prev.map((s) => (s.id === id ? { ...s, status } : s));
      }
      // Slot re-appeared — add it back
      const restored: Slot = {
        id: payload.slot.id,
        doctor_id: payload.slot.doctor_id,
        slot_start: payload.slot.slot_start,
        slot_end: payload.slot.slot_end,
        status: payload.slot.status,
      };
      return [...prev, restored].sort(
        (a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime()
      );
    });
  });

  // ── Search ──
  const doSearch = useCallback(() => {
    setSearchLoading(true);
    patientService
      .discoverHospitals({ q: query, city: cityFilter, speciality: specFilter })
      .then(res => setHospitals((res as any).data?.hospitals ?? []))
      .catch(() => toast.error('Search failed'))
      .finally(() => setSearchLoading(false));
  }, [query, cityFilter, specFilter]);

  // Initial search on mount
  useEffect(() => { doSearch(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-search whenever query/city/speciality changes (300 ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { doSearch(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, cityFilter, specFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hospital detail ──
  const openHospital = async (h: DiscoverHospital) => {
    setSelectedHospital(h);
    setStep('hospital');
    try {
      const res = await patientService.getHospitalDetails(h.id);
      setHospitalDetail((res as any).data?.hospital ?? null);
    } catch {
      toast.error('Failed to load hospital details');
    }
  };

  // ── Doctor slots ──
  const openDoctorSlots = async (doc: { id: string; full_name: string; specialisation: string }) => {
    setSelectedDoctor(doc);
    setSelectedSlot(null);
    setSlots([]);
    setStreamConnected(false);
    setWaitlistedSlotIds(new Set());
    setStep('slots');
    const date = slotDate || format(new Date(), 'yyyy-MM-dd');
    setSlotsLoading(true);
    try {
      const [resSlots, resWL] = await Promise.all([
        patientService.getDoctorSlots(doc.id, date),
        patientService.listWaitlist().catch(() => ({ data: { waitlist: [] } }))
      ]);
      setSlots((resSlots as any).data?.slots ?? []);
      
      const wl = (resWL as any).data?.waitlist ?? [];
      const wlSet = new Set<string>();
      wl.forEach((w: any) => wlSet.add(w.slot_id));
      setWaitlistedSlotIds(wlSet);
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setSlotsLoading(false);
    }
  };

  const reloadSlots = async (date: string) => {
    if (!selectedDoctor) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setStreamConnected(false);
    try {
      const [resSlots, resWL] = await Promise.all([
        patientService.getDoctorSlots(selectedDoctor.id, date),
        patientService.listWaitlist().catch(() => ({ data: { waitlist: [] } }))
      ]);
      setSlots((resSlots as any).data?.slots ?? []);
      
      const wl = (resWL as any).data?.waitlist ?? [];
      const wlSet = new Set<string>();
      wl.forEach((w: any) => wlSet.add(w.slot_id));
      setWaitlistedSlotIds(wlSet);
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setSlotsLoading(false);
    }
  };

  // ── Select slot → lock ──
  const selectSlot = async (slot: Slot) => {
    // Release previous lock if any
    if (selectedSlot) {
      patientService.releaseSlotLock(selectedSlot.id).catch(() => {});
    }
    setSelectedSlot(slot);
    try {
      const res = await patientService.lockSlot(slot.id);
      setLockedUntil((res as any).data?.locked_until ?? null);
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to lock slot';
      toast.error(msg);
      setSelectedSlot(null);
      // Refresh slots so the now-taken slot disappears
      reloadSlots(slotDate || format(new Date(), 'yyyy-MM-dd'));
    }
  };

  // ── Confirm booking ──
  const confirmBooking = async () => {
    if (!selectedSlot || !selectedDoctor || !selectedHospital) return;
    setBooking(true);
    try {
      // Best-effort: find a matching hospital service for the doctor's specialisation
      const services = hospitalDetail?.hospital_services ?? selectedHospital.hospital_services ?? [];
      const matchedService = services.find(
        (s) => s.department?.toLowerCase().includes(selectedDoctor.specialisation?.toLowerCase())
          || selectedDoctor.specialisation?.toLowerCase().includes(s.department?.toLowerCase())
      ) ?? services[0] ?? null;

      const res = await patientService.bookAppointment({
        slot_id: selectedSlot.id,
        doctor_id: selectedDoctor.id,
        hospital_id: selectedHospital.id,
        ...(matchedService ? { service_id: matchedService.id } : {}),
        booking_type: 'online',
      });
      setBookedAppt((res as any).data?.appointment ?? null);
      toast.success('Appointment booked!');
      // Proceed to grant-access step so the patient can share documents
      loadDocumentsForGrant();
      setStep('grant-access');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to book appointment');
    } finally {
      setBooking(false);
    }
  };

  // ── Load patient documents for the grant-access step ──
  const loadDocumentsForGrant = async () => {
    setGrantsLoading(true);
    setSelectedDocuments([]);
    setGrantOtpSent(false);
    setGrantOtpCode('');
    setGrantOtpExpiresAt(null);
    try {
      const res = await patientService.getPassport();
      const data = (res as any).data;
      setPatientPrescriptions(data?.prescriptions ?? []);
      setPatientReports(data?.reports ?? []);
    } catch {
      toast.error('Failed to load your documents');
    } finally {
      setGrantsLoading(false);
    }
  };

  // ── Toggle document selection ──
  const toggleDocument = (docType: 'prescription' | 'report', docId: string) => {
    setGrantOtpSent(false);
    setGrantOtpCode('');
    setGrantOtpExpiresAt(null);
    setSelectedDocuments((prev) => {
      const exists = prev.some((d) => d.document_type === docType && d.document_id === docId);
      if (exists) return prev.filter((d) => !(d.document_type === docType && d.document_id === docId));
      return [...prev, { document_type: docType, document_id: docId }];
    });
  };

  const isDocSelected = (docType: 'prescription' | 'report', docId: string) =>
    selectedDocuments.some((d) => d.document_type === docType && d.document_id === docId);

  // ── Select / deselect all ──
  const selectAllDocuments = () => {
    setGrantOtpSent(false);
    setGrantOtpCode('');
    setGrantOtpExpiresAt(null);
    const all: DocumentSelection[] = [
      ...patientPrescriptions.map((p) => ({ document_type: 'prescription' as const, document_id: p.id })),
      ...patientReports.map((r) => ({ document_type: 'report' as const, document_id: r.id })),
    ];
    setSelectedDocuments(all);
  };

  const deselectAllDocuments = () => {
    setGrantOtpSent(false);
    setGrantOtpCode('');
    setGrantOtpExpiresAt(null);
    setSelectedDocuments([]);
  };

  // ── Request OTP for booking grant ──
  const submitGrants = async () => {
    if (!selectedDoctor || selectedDocuments.length === 0) return;
    setGrantOtpSending(true);
    try {
      const res = await patientService.initiateBookingGrantOtp({
        granted_to_doctor_id: selectedDoctor.id,
        documents: selectedDocuments,
        valid_days: 90,
        source: 'booking',
      });
      setGrantOtpSent(true);
      setGrantOtpExpiresAt((res as any).data?.expires_at ?? null);
      toast.success('OTP sent to your WhatsApp number');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send OTP');
    } finally {
      setGrantOtpSending(false);
    }
  };

  // ── Verify OTP and create grants ──
  const verifyOtpAndSubmitGrants = async () => {
    if (!selectedDoctor || selectedDocuments.length === 0) return;
    if (!/^\d{6}$/.test(grantOtpCode.trim())) {
      toast.error('Enter a valid 6-digit OTP');
      return;
    }

    setGrantOtpVerifying(true);
    setGrantsSaving(true);
    try {
      const verifyRes = await patientService.verifyBookingGrantOtp({
        granted_to_doctor_id: selectedDoctor.id,
        documents: selectedDocuments,
        valid_days: 90,
        source: 'booking',
        otp_code: grantOtpCode.trim(),
      });

      const verificationToken = (verifyRes as any).data?.verification_token;
      if (!verificationToken) {
        throw new Error('OTP verification failed. Please request a new OTP.');
      }

      await patientService.createGrant({
        granted_to_doctor_id: selectedDoctor.id,
        documents: selectedDocuments,
        valid_days: 90,
        source: 'booking',
        verification_token: verificationToken,
      });

      toast.success(`Shared ${selectedDocuments.length} document${selectedDocuments.length > 1 ? 's' : ''} with ${selectedDoctor.full_name}`);
      setGrantOtpCode('');
      setGrantOtpSent(false);
      setGrantOtpExpiresAt(null);
      setStep('done');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to verify OTP and share documents');
    } finally {
      setGrantOtpVerifying(false);
      setGrantsSaving(false);
    }
  };

  // ── Skip grants (go straight to done) ──
  const skipGrants = () => setStep('done');

  // ── Join waitlist for a booked slot ──
  const joinWaitlistForSlot = async (slot: Slot) => {
    try {
      await patientService.joinWaitlist(slot.id);
      setWaitlistedSlotIds((prev) => new Set([...prev, slot.id]));
      toast.success("You're on the waitlist! We'll notify you when this slot opens.", {
        action: {
          label: 'View Waitlist',
          onClick: () => navigate('/patient/dashboard', { state: { tab: 'waitlist' } }),
        },
      });
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to join waitlist');
    }
  };

  const resetToSearch = () => {
    if (selectedSlot) {
      patientService.releaseSlotLock(selectedSlot.id).catch(() => {});
    }
    setStep('search');
    setSelectedHospital(null);
    setHospitalDetail(null);
    setSelectedDoctor(null);
    setSelectedSlot(null);
    setLockedUntil(null);
    setBookedAppt(null);
    setSlots([]);
    setStreamConnected(false);
    setWaitlistedSlotIds(new Set());
    setPatientPrescriptions([]);
    setPatientReports([]);
    setSelectedDocuments([]);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== 'search' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (step === 'done') { resetToSearch(); return; }
                  if (step === 'grant-access') { /* can't go back — booking already confirmed */ setStep('done'); return; }
                  if (step === 'confirm') { setStep('slots'); return; }
                  if (step === 'slots') {
                    // Release any locked slot before leaving the slots view
                    if (selectedSlot) {
                      patientService.releaseSlotLock(selectedSlot.id).catch(() => {});
                      setSelectedSlot(null);
                      setLockedUntil(null);
                    }
                    setStep('hospital');
                    return;
                  }
                  if (step === 'hospital') { setStep('search'); return; }
                }}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div
              className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => navigate('/patient/dashboard')}
            >
              <IconHeartbeat className="h-6 w-6 text-primary" />
              <span className="font-serif text-xl font-light">
                mediNexus
                <span className="text-sm font-medium text-muted-foreground ml-1">Discover</span>
              </span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/patient/dashboard')}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
      </header>

      <main className="w-full max-w-4xl mx-auto p-6 space-y-6">

        {/* ── Step: Search ── */}
        {step === 'search' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-3xl font-light tracking-tight">Find a Doctor</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Search hospitals near you and book an appointment.
              </p>
            </div>

            {/* Search filters */}
            <div className="bg-card rounded-xl border p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1 space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <Input
                      placeholder="Doctor, hospital, speciality…"
                      className="pl-9"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doSearch()}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">City</Label>
                  <Input
                    placeholder="e.g. Mumbai"
                    value={cityFilter}
                    onChange={e => setCityFilter(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Speciality</Label>
                  <Input
                    placeholder="e.g. Cardiology"
                    value={specFilter}
                    onChange={e => setSpecFilter(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                  />
                </div>
              </div>
              <Button onClick={doSearch} disabled={searchLoading} className="w-full sm:w-auto">
                <Search className="h-4 w-4 mr-2" />
                {searchLoading ? 'Searching…' : 'Search'}
              </Button>
            </div>

            {/* Results */}
            {searchLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : hospitals.length === 0 ? (
              <div className="bg-card rounded-xl border p-12 text-center text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No hospitals found.</p>
                <p className="text-sm mt-1">Try adjusting your search filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{hospitals.length} hospital{hospitals.length !== 1 ? 's' : ''} found</p>
                {hospitals.map(h => (
                  <div
                    key={h.id}
                    className="bg-card rounded-xl border p-4 cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => openHospital(h)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{h.name}</p>
                          <span className="text-xs capitalize text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                            {h.type?.replace('_', ' ')}
                          </span>
                          {h.has_slots_today && (
                            <span className="text-xs bg-green-500/10 text-green-600 rounded px-1.5 py-0.5">
                              Slots today
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {h.address}, {h.city}, {h.state}
                        </div>
                        {h.doctors && h.doctors.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {h.doctors.length} doctor{h.doctors.length !== 1 ? 's' : ''} · {[...new Set(h.doctors.map(d => d.specialisation))].slice(0, 3).join(', ')}
                          </p>
                        )}
                      </div>
                      <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0 mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Hospital Detail ── */}
        {step === 'hospital' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-3xl font-light tracking-tight">
                {hospitalDetail?.name ?? selectedHospital?.name}
              </h1>
              <div className="flex items-center gap-1 text-muted-foreground text-sm mt-1">
                <MapPin className="h-4 w-4 shrink-0" />
                {(hospitalDetail ?? selectedHospital)?.address},{' '}
                {(hospitalDetail ?? selectedHospital)?.city},{' '}
                {(hospitalDetail ?? selectedHospital)?.state}
              </div>
            </div>

            {/* Services */}
            {hospitalDetail?.hospital_services && hospitalDetail.hospital_services.length > 0 && (
              <div className="bg-card rounded-xl border p-4 space-y-3">
                <h2 className="font-medium flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" /> Services
                </h2>
                <div className="flex flex-wrap gap-2">
                  {hospitalDetail.hospital_services.map((svc, i) => (
                    <span
                      key={i}
                      className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs"
                    >
                      {svc.service_name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Doctors */}
            <div className="space-y-3">
              <h2 className="font-medium">Select a Doctor</h2>
              {!hospitalDetail ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (hospitalDetail.doctors ?? []).length === 0 ? (
                <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground">
                  <p>No doctors available at this hospital.</p>
                </div>
              ) : (
                (hospitalDetail.doctors ?? []).map(doc => (
                  <div
                    key={doc.id}
                    className="bg-card rounded-xl border p-4 cursor-pointer hover:border-primary/40 transition-colors flex items-center justify-between gap-4"
                    onClick={() => openDoctorSlots(doc)}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{doc.full_name}</p>
                        {doc.verified && (
                          <span className="text-xs bg-green-500/10 text-green-600 rounded px-1.5 py-0.5">
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{doc.specialisation}</p>
                    </div>
                    <Button size="sm" variant="outline">
                      View Slots
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Step: Doctor Slots ── */}
        {step === 'slots' && selectedDoctor && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-light tracking-tight">{selectedDoctor.full_name}</h1>
                {/* Live indicator — shown once the SSE stream delivers its first event */}
                {streamConnected && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-green-500/10 text-green-600 rounded-full px-2.5 py-1 font-medium">
                    <Radio className="h-3 w-3 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                {selectedDoctor.specialisation} · {selectedHospital?.name}
              </p>
            </div>

            {/* Date picker */}
            <div className="bg-card rounded-xl border p-4 flex items-end gap-4">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 inline mr-1" /> Select Date
                </Label>
                <Input
                  type="date"
                  value={slotDate}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={e => {
                    setSlotDate(e.target.value);
                    reloadSlots(e.target.value);
                  }}
                />
              </div>
            </div>

            {/* Slots grid */}
            {slotsLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No available slots{slotDate ? ` on ${format(parseISO(slotDate), 'MMM d')}` : ''}.</p>
                <p className="text-sm mt-1">Try a different date.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {slots.filter(s => s.status === 'available').length} available
                  {slots.filter(s => s.status === 'booked').length > 0 && (
                    <span className="ml-2 text-muted-foreground/60">
                      · {slots.filter(s => s.status === 'booked').length} booked (join waitlist)
                    </span>
                  )}
                  {streamConnected && (
                    <span className="ml-2 text-green-600">· updating live</span>
                  )}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {slots.map(slot => {
                    const isSelected = selectedSlot?.id === slot.id;
                    const isBooked = slot.status === 'booked';
                    const alreadyWaiting = waitlistedSlotIds.has(slot.id);

                    if (isBooked) {
                      return (
                        <button
                          key={slot.id}
                          onClick={() => !alreadyWaiting && joinWaitlistForSlot(slot)}
                          disabled={alreadyWaiting}
                          className={`rounded-lg border p-3 text-sm transition-colors text-center ${
                            alreadyWaiting
                              ? 'border-primary/30 bg-primary/5 text-primary opacity-70 cursor-default'
                              : 'border-dashed border-muted-foreground/30 bg-muted/30 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary'
                          }`}
                        >
                          <div className="font-medium text-xs">
                            {format(parseISO(slot.slot_start), 'h:mm a')}
                          </div>
                          <div className="text-xs mt-0.5 opacity-75">
                            {format(parseISO(slot.slot_start), 'MMM d')}
                          </div>
                          <div className="flex items-center justify-center gap-0.5 mt-1 text-[10px]">
                            {alreadyWaiting ? (
                              <><BellOff className="h-2.5 w-2.5" /> Waiting</>
                            ) : (
                              <><Bell className="h-2.5 w-2.5" /> Waitlist</>
                            )}
                          </div>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={slot.id}
                        onClick={() => selectSlot(slot)}
                        className={`rounded-lg border p-3 text-sm transition-colors text-center ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'bg-card hover:border-primary/40 text-foreground'
                        }`}
                      >
                        <div className="font-medium">
                          {format(parseISO(slot.slot_start), 'h:mm a')}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(slot.slot_start), 'MMM d')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedSlot && (
              <div className="sticky bottom-4 bg-card border rounded-xl p-4 flex items-center justify-between gap-4 shadow-lg">
                <div className="text-sm">
                  <p className="font-medium">
                    {format(parseISO(selectedSlot.slot_start), 'EEE, MMM d')} at{' '}
                    {format(parseISO(selectedSlot.slot_start), 'h:mm a')}
                  </p>
                  {lockedUntil && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Held until {format(parseISO(lockedUntil), 'h:mm:ss a')}
                    </p>
                  )}
                </div>
                <Button onClick={() => setStep('confirm')}>
                  Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && selectedSlot && selectedDoctor && selectedHospital && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h1 className="text-3xl font-light tracking-tight">Confirm Booking</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Review your appointment details before confirming.
              </p>
            </div>

            <div className="bg-card rounded-xl border divide-y">
              {[
                ['Hospital', selectedHospital.name],
                ['Doctor', selectedDoctor.full_name],
                ['Specialisation', selectedDoctor.specialisation],
                ['Date', format(parseISO(selectedSlot.slot_start), 'EEEE, MMMM d, yyyy')],
                ['Time', `${format(parseISO(selectedSlot.slot_start), 'h:mm a')} – ${format(parseISO(selectedSlot.slot_end), 'h:mm a')}`],
                ['Type', 'Online Booking'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>

            {lockedUntil && (
              <p className="text-xs text-muted-foreground text-center">
                This slot is reserved for you until {format(parseISO(lockedUntil), 'h:mm:ss a')}.
              </p>
            )}

            <Button
              className="w-full h-12"
              onClick={confirmBooking}
              disabled={booking}
            >
              {booking ? 'Booking…' : 'Confirm Appointment'}
            </Button>
          </div>
        )}

        {/* ── Step: Grant Access ── */}
        {step === 'grant-access' && selectedDoctor && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <div>
                  <h1 className="text-3xl font-light tracking-tight">Share Medical Records</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    Select which documents to share with <span className="font-medium text-foreground">{selectedDoctor.full_name}</span>. This is optional — you can skip or manage access later from your Health Passport.
                  </p>
                </div>
              </div>
            </div>

            {grantsLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            ) : patientPrescriptions.length === 0 && patientReports.length === 0 ? (
              <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No medical documents found.</p>
                <p className="text-sm mt-1">You don't have any prescriptions or reports yet.</p>
              </div>
            ) : (
              <>
                {/* Select / Deselect All */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {selectedDocuments.length} of {patientPrescriptions.length + patientReports.length} selected
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAllDocuments}>
                      Select All
                    </Button>
                    {selectedDocuments.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={deselectAllDocuments}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                {/* Prescriptions */}
                {patientPrescriptions.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Prescriptions ({patientPrescriptions.length})
                    </h3>
                    <div className="space-y-1.5">
                      {patientPrescriptions.map((rx) => {
                        const checked = isDocSelected('prescription', rx.id);
                        return (
                          <label
                            key={rx.id}
                            className={`flex items-start gap-3 bg-card rounded-lg border p-3.5 cursor-pointer transition-colors ${
                              checked ? 'border-primary/40 bg-primary/5' : 'hover:border-muted-foreground/30'
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleDocument('prescription', rx.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {rx.illness_description || 'Prescription'}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Dr. {rx.doctors?.full_name ?? 'Unknown'}
                                {rx.appointments?.hospitals?.name && ` · ${rx.appointments.hospitals.name}`}
                                {rx.issued_at && ` · ${format(parseISO(rx.issued_at), 'MMM d, yyyy')}`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reports */}
                {patientReports.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-muted-foreground" />
                      Reports ({patientReports.length})
                    </h3>
                    <div className="space-y-1.5">
                      {patientReports.map((rpt) => {
                        const checked = isDocSelected('report', rpt.id);
                        return (
                          <label
                            key={rpt.id}
                            className={`flex items-start gap-3 bg-card rounded-lg border p-3.5 cursor-pointer transition-colors ${
                              checked ? 'border-primary/40 bg-primary/5' : 'hover:border-muted-foreground/30'
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleDocument('report', rpt.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {rpt.report_name}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {rpt.report_type}
                                {rpt.hospitals?.name && ` · ${rpt.hospitals.name}`}
                                {rpt.uploaded_at && ` · ${format(parseISO(rpt.uploaded_at), 'MMM d, yyyy')}`}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {grantOtpSent && selectedDocuments.length > 0 && (
              <div className="bg-card rounded-xl border p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">Verify OTP to complete consent</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the 6-digit OTP sent on WhatsApp.
                    {grantOtpExpiresAt ? ` Expires at ${format(parseISO(grantOtpExpiresAt), 'h:mm:ss a')}.` : ''}
                  </p>
                </div>
                <div className="max-w-xs">
                  <Label htmlFor="grant-otp" className="text-xs">OTP Code</Label>
                  <Input
                    id="grant-otp"
                    placeholder="Enter 6-digit OTP"
                    value={grantOtpCode}
                    maxLength={6}
                    onChange={(e) => setGrantOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={skipGrants}
              >
                Skip for Now
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={grantOtpSent ? verifyOtpAndSubmitGrants : submitGrants}
                disabled={
                  selectedDocuments.length === 0 ||
                  grantsSaving ||
                  grantOtpSending ||
                  grantOtpVerifying ||
                  (grantOtpSent && grantOtpCode.trim().length !== 6)
                }
              >
                {grantOtpSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending OTP…
                  </>
                ) : grantOtpVerifying || grantsSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying…
                  </>
                ) : grantOtpSent ? (
                  'Verify OTP & Share'
                ) : (
                  `Send OTP to Share ${selectedDocuments.length > 0 ? selectedDocuments.length + ' ' : ''}Document${selectedDocuments.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>

            {grantOtpSent && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  className="h-9 px-2 text-xs"
                  onClick={submitGrants}
                  disabled={grantOtpSending || grantOtpVerifying || grantsSaving}
                >
                  Resend OTP
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="space-y-6 animate-in fade-in duration-300 text-center py-12">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <div>
              <h1 className="text-3xl font-light tracking-tight">Appointment Booked!</h1>
              <p className="text-muted-foreground text-sm mt-2">
                Your appointment has been confirmed.
              </p>
            </div>

            {bookedAppt?.appointment_slots && (
              <div className="bg-card rounded-xl border p-5 text-left max-w-sm mx-auto space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {format(parseISO(bookedAppt.appointment_slots.slot_start), 'EEE, MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {format(parseISO(bookedAppt.appointment_slots.slot_start), 'h:mm a')}
                  {' – '}
                  {format(parseISO(bookedAppt.appointment_slots.slot_end), 'h:mm a')}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={resetToSearch}>
                Book Another
              </Button>
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

export default PatientDiscover;
