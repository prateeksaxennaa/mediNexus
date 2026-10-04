import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Clock,
  Loader2,
  ChevronDown,
  BookOpen,
  User,
  Pill,
  FileText,
  ShieldAlert,
  ExternalLink,
  X,
  Sparkles,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowRightLeft,
  Search,
  Send,
  CheckCircle2,
  ActivitySquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { doctorService, type DoctorAppointment, type DoctorSearchResult } from '@/services/doctor.service';
import { format, parseISO, differenceInYears, addDays, subDays, isSameDay } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  PrescriptionViewModal,
  normalizePrescriptionData,
} from '@/features/dashboard/shared/PrescriptionViewModal';

// ─── Constants ────────────────────────────────────────────────────────────────


const STATUS_LABELS: Record<string, string> = {
  booked:      'Booked',
  checked_in:  'Checked In',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
  no_show:     'No Show',
};

const NEXT_STATUSES: Record<string, string[]> = {
  booked:      ['checked_in', 'no_show', 'cancelled'],
  checked_in:  ['in_progress', 'no_show', 'cancelled'],
  in_progress: ['completed', 'no_show'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};



// ─── Passport types ────────────────────────────────────────────────────────────

interface PassportPatient {
  id: string;
  full_name: string;
  dob: string | null;
  blood_group: string | null;
  known_allergies: string | null;
  phone_number: string | null;
  email: string | null;
}

interface PassportPrescription {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string;
  illness_description: string | null;
  issued_at: string;
  pdf_url: string | null;
  doctors: { full_name: string; specialisation: string } | null;
  prescription_items: {
    id: string;
    medicine_id: string;
    dosage: string;
    frequency: string;
    duration: string;
    doctor_comment: string | null;
    medicines: {
      medicine_name: string;
      composition: string | null;
      therapeutic_class: string | null;
    } | null;
  }[];
}

interface PassportReport {
  id: string;
  patient_id: string;
  hospital_id: string | null;
  report_name: string;
  report_type: string | null;
  report_url: string | null;
  uploaded_at: string;
  hospitals: { name: string; city: string } | null;
}

interface PassportData {
  patient: PassportPatient;
  prescriptions: PassportPrescription[];
  reports: PassportReport[];
}

// ─── Passport sheet subcomponents ─────────────────────────────────────────────

function PatientProfileCard({ patient }: { patient: PassportPatient }) {
  const age = patient.dob
    ? differenceInYears(new Date(), parseISO(patient.dob))
    : null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium leading-tight">{patient.full_name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {age != null ? `${age} yrs` : ''}
            {patient.dob
              ? `${age != null ? ' · ' : ''}DOB ${format(parseISO(patient.dob), 'MMM d, yyyy')}`
              : ''}
          </p>
        </div>
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {patient.blood_group && (
          <>
            <span className="text-muted-foreground text-xs">Blood Group</span>
            <span className="text-xs font-medium">{patient.blood_group}</span>
          </>
        )}
        {patient.phone_number && (
          <>
            <span className="text-muted-foreground text-xs">Phone</span>
            <span className="text-xs font-medium">{patient.phone_number}</span>
          </>
        )}
        {patient.email && (
          <>
            <span className="text-muted-foreground text-xs">Email</span>
            <span className="text-xs font-medium truncate">{patient.email}</span>
          </>
        )}
      </div>
      {patient.known_allergies && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <p className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Known Allergies
          </p>
          <p className="text-xs text-amber-700 mt-1">{patient.known_allergies}</p>
        </div>
      )}
    </div>
  );
}

function PrescriptionsList({
  prescriptions,
  onView,
}: {
  prescriptions: PassportPrescription[];
  patientName?: string;
  onView: (rx: PassportPrescription) => void;
}) {
  if (prescriptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No prescriptions shared with you.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {prescriptions.map((rx) => (
        <div key={rx.id} className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight">
                {rx.illness_description ?? 'General Prescription'}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(rx.issued_at), 'MMM d, yyyy')}
                {rx.doctors && ` · Dr. ${rx.doctors.full_name}`}
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onView(rx)}>
              <Pill className="h-3 w-3 mr-1" />
              View
            </Button>
          </div>
          {rx.prescription_items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rx.prescription_items.map((item) => (
                <Badge key={item.id} variant="secondary" className="text-[11px] font-normal">
                  {item.medicines?.medicine_name ?? item.medicine_id}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReportsList({ reports }: { reports: PassportReport[] }) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No reports shared with you.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <div key={report.id} className="rounded-xl border bg-card p-4 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight">{report.report_name}</p>
              <p className="text-xs text-muted-foreground">
                {report.report_type && `${report.report_type} · `}
                {report.hospitals
                  ? `${report.hospitals.name}${report.hospitals.city ? `, ${report.hospitals.city}` : ''}`
                  : 'Unknown hospital'}
                {' · '}
                {format(parseISO(report.uploaded_at), 'MMM d, yyyy')}
              </p>
            </div>
            {report.report_url && (
              <a href={report.report_url!} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open
                </Button>
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Health Passport Sheet ────────────────────────────────────────────────────

// ─── Brief type (mirrors doctor.service return shape) ────────────────────────

interface BriefData {
  patient_name: string;
  age: number | null;
  blood_group: string | null;
  known_allergies: string | null;
  active_medications: string[];
  recent_conditions: string[];
  recent_findings: string[];
  focus_areas: string[];
  narrative: string;
  generated_at: string;
  cached?: boolean;
}

interface PassportSheetProps {
  open: boolean;
  onClose: () => void;
  patientId: string | null;
  patientName: string;
  appointmentId: string | null;
}

function HealthPassportSheet({ open, onClose, patientId, patientName, appointmentId }: PassportSheetProps) {
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Brief state
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  // For drilling into a single prescription
  const [rxOpen, setRxOpen] = useState(false);
  const [selectedRx, setSelectedRx] = useState<PassportPrescription | null>(null);

  // ── Inline referral state ──
  const [referView, setReferView] = useState(false);
  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctorResults, setDoctorResults] = useState<DoctorSearchResult[]>([]);
  const [doctorSearching, setDoctorSearching] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [referralSent, setReferralSent] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset referral form when sheet closes or patient changes
  useEffect(() => {
    if (!open) {
      setReferView(false);
      setReferralSent(false);
      setSelectedDoctor(null);
      setDoctorQuery('');
      setDoctorResults([]);
      setReason('');
    }
  }, [open, patientId]);

  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;

    // Reset brief when a new sheet opens
    setBriefData(null);
    setBriefError(null);
    setBriefLoading(false);

    setLoading(true);
    setError(null);
    setPassport(null);

    doctorService
      .getPatientPassport(patientId)
      .then((res: any) => {
        if (!cancelled) setPassport(res.data);
      })
      .catch((e: any) => {
        if (!cancelled)
          setError(
            e?.message?.includes('No valid access grant')
              ? 'This patient has not shared their records with you yet.'
              : (e?.message ?? 'Failed to load health passport.')
          );
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open, patientId]);

  const handleGenerateBrief = async () => {
    if (!appointmentId) return;
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await doctorService.getAppointmentBrief(appointmentId);
      setBriefData((res as any).data);
    } catch (e: any) {
      setBriefError(e?.message ?? 'Failed to generate brief.');
    } finally {
      setBriefLoading(false);
    }
  };

  const fetchPrescriptionData = useCallback(
    async (_id: string) => {
      if (!selectedRx || !passport) throw new Error('No prescription selected');
      return normalizePrescriptionData({
        ...selectedRx,
        patients: passport.patient,
        appointments: null,
      });
    },
    [selectedRx, passport]
  );

  // ── Doctor search with debounce ──
  const handleDoctorSearch = (q: string) => {
    setDoctorQuery(q);
    setSelectedDoctor(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setDoctorResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setDoctorSearching(true);
      try {
        const res = await doctorService.searchDoctors(q.trim());
        setDoctorResults((res as any).data?.doctors ?? []);
      } catch { /* silent */ } finally {
        setDoctorSearching(false);
      }
    }, 300);
  };

  // ── Submit referral ──
  const handleSendReferral = async () => {
    if (!selectedDoctor || !patientId) return;
    setCreating(true);
    try {
      await doctorService.createReferral({
        patient_id: patientId,
        referred_to_doctor_id: selectedDoctor.id,
        reason: reason.trim() || undefined,
      });
      setReferralSent(true);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send referral');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0" showCloseButton={false}>
          <SheetHeader className="flex flex-row items-center justify-between px-5 py-4 border-b shrink-0 gap-0">
            <div className="flex items-center gap-2">
              {referView ? (
                <Button size="icon" variant="ghost" className="h-7 w-7 mr-1" onClick={() => { setReferView(false); setReferralSent(false); }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              ) : (
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              )}
              <SheetTitle className="text-sm font-medium leading-none">
                {referView ? `Refer ${patientName}` : 'Health Passport'}
              </SheetTitle>
            </div>
            <div className="flex items-center gap-1">
              {!referView && <p className="text-xs text-muted-foreground mr-2">{patientName}</p>}
              {!referView && patientId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs mr-1"
                  onClick={() => setReferView(true)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                  Refer
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ── Inline referral view ── */}
            {referView ? (
              <div className="p-5 space-y-5 animate-in fade-in duration-200">
                {referralSent ? (
                  // ── Success state ──
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-base">Referral sent!</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {patientName} has been referred to Dr. {selectedDoctor?.full_name}.
                      </p>
                      {selectedDoctor?.specialisation && (
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedDoctor.specialisation}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setReferView(false); setReferralSent(false); }}>
                      Back to Health Passport
                    </Button>
                  </div>
                ) : (
                  // ── Referral form ──
                  <>
                    {/* Patient (read-only) */}
                    <div className="space-y-1.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Patient</p>
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2.5">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{patientName}</span>
                      </div>
                    </div>

                    {/* Doctor search */}
                    <div className="space-y-1.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Refer to Doctor</p>
                      {selectedDoctor ? (
                        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium">{selectedDoctor.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedDoctor.specialisation}
                              {selectedDoctor.hospitals?.name && ` · ${selectedDoctor.hospitals.name}`}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedDoctor(null); setDoctorQuery(''); setDoctorResults([]); }}>
                            Change
                          </Button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search by name or specialisation..."
                            className="pl-9"
                            value={doctorQuery}
                            onChange={(e) => handleDoctorSearch(e.target.value)}
                          />
                          {doctorSearching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {doctorResults.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {doctorResults.map((doc) => (
                                <button
                                  key={doc.id}
                                  className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors text-sm"
                                  onClick={() => { setSelectedDoctor(doc); setDoctorQuery(''); setDoctorResults([]); }}
                                >
                                  <p className="font-medium">{doc.full_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {doc.specialisation}
                                    {doc.hospitals?.name && ` · ${doc.hospitals.name}, ${doc.hospitals.city}`}
                                  </p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Reason <span className="normal-case text-muted-foreground/60">(optional)</span></p>
                      <Textarea
                        placeholder="e.g. Patient needs cardiac evaluation following persistent chest pain..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                      />
                    </div>

                    {/* Info note */}
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      Creating a referral automatically copies your document access grants for this patient to the referred doctor.
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" onClick={() => setReferView(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSendReferral}
                        disabled={!selectedDoctor || creating}
                      >
                        {creating ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                        ) : (
                          <><Send className="h-4 w-4 mr-2" />Send Referral</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // ── Normal passport view ──
              <>
                {loading && (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {error && !loading && (
                  <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-3">
                    <ShieldAlert className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                )}

                {passport && !loading && (
                  <div className="p-5 space-y-5">
                    <PatientProfileCard patient={passport.patient} />

                    <Tabs defaultValue="brief">
                      <TabsList className="w-full">
                        <TabsTrigger value="brief" className="flex-1 text-xs">
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          AI Brief
                        </TabsTrigger>
                        <TabsTrigger value="prescriptions" className="flex-1 text-xs">
                          <Pill className="h-3.5 w-3.5 mr-1.5" />
                          Prescriptions
                          {passport.prescriptions.length > 0 && (
                            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                              {passport.prescriptions.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="reports" className="flex-1 text-xs">
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          Reports
                          {passport.reports.length > 0 && (
                            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                              {passport.reports.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>

                      {/* ── AI Brief tab ── */}
                      <TabsContent value="brief" className="mt-4">
                        {!briefData && !briefLoading && !briefError && (
                          <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                              <Sparkles className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">Generate AI Pre-Appointment Brief</p>
                              <p className="text-xs text-muted-foreground max-w-xs">
                                Summarises this patient's medications, conditions, recent findings,
                                and clinical focus areas so you are prepared in seconds.
                              </p>
                            </div>
                            <Button size="sm" onClick={handleGenerateBrief} disabled={!appointmentId}>
                              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                              Generate Brief
                            </Button>
                          </div>
                        )}

                        {briefLoading && (
                          <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Analysing patient records…</p>
                          </div>
                        )}

                        {briefError && !briefLoading && (
                          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                            <AlertCircle className="h-6 w-6 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{briefError}</p>
                            <Button size="sm" variant="outline" onClick={handleGenerateBrief}>
                              Retry
                            </Button>
                          </div>
                        )}

                        {briefData && !briefLoading && (
                          <div className="space-y-4">
                            {/* Narrative */}
                            <div className="rounded-xl border bg-card p-4 space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Summary
                              </p>
                              <p className="text-sm font-light leading-relaxed">{briefData.narrative}</p>
                            </div>

                            {/* Focus areas */}
                            {briefData.focus_areas.length > 0 && (
                              <div className="rounded-xl border bg-card p-4 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Clinical Focus Areas
                                </p>
                                <ul className="space-y-1.5">
                                  {briefData.focus_areas.map((area, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                                      <span className="font-light">{area}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Active medications */}
                            {briefData.active_medications.length > 0 && (
                              <div className="rounded-xl border bg-card p-4 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Active Medications
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {briefData.active_medications.map((med, i) => (
                                    <Badge key={i} variant="secondary" className="text-[11px] font-normal">
                                      {med}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Recent conditions */}
                            {briefData.recent_conditions.length > 0 && (
                              <div className="rounded-xl border bg-card p-4 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Recent Conditions
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {briefData.recent_conditions.map((c, i) => (
                                    <Badge key={i} variant="outline" className="text-[11px] font-normal">
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Recent findings */}
                            {briefData.recent_findings.length > 0 && (
                              <div className="rounded-xl border bg-card p-4 space-y-2">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Recent Findings
                                </p>
                                <ul className="space-y-1.5">
                                  {briefData.recent_findings.map((f, i) => (
                                    <li key={i} className="text-sm font-light text-muted-foreground leading-snug">
                                      {f}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Regenerate */}
                            <div className="flex justify-end pt-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-muted-foreground"
                                onClick={() => { setBriefData(null); setBriefError(null); }}
                              >
                                Regenerate
                              </Button>
                            </div>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="prescriptions" className="mt-4">
                        <PrescriptionsList
                          prescriptions={passport.prescriptions}
                          patientName={passport.patient.full_name}
                          onView={(rx) => { setSelectedRx(rx); setRxOpen(true); }}
                        />
                      </TabsContent>

                      <TabsContent value="reports" className="mt-4">
                        <ReportsList reports={passport.reports} />
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {selectedRx && passport && (
        <PrescriptionViewModal
          open={rxOpen}
          onClose={() => setRxOpen(false)}
          prescriptionId={selectedRx.id}
          label={selectedRx.illness_description ?? 'Prescription'}
          fetchData={fetchPrescriptionData}
        />
      )}
    </>
  );
}

// ─── Appointment Card ──────────────────────────────────────────────────────────

interface AppointmentCardProps {
  appt: DoctorAppointment;
  position: number;
  updating: string | null;
  onStatusChange: (id: string, status: string) => void;
  onOpenPassport: (appt: DoctorAppointment) => void;
  isAfternoon: boolean;
}

function AppointmentCard({ appt, position: _position, updating, onStatusChange, onOpenPassport, isAfternoon }: AppointmentCardProps) {
  const nextStatuses = NEXT_STATUSES[appt.status] ?? [];
  const patient = appt.patients;
  const slot = appt.appointment_slots;

  // Compute age from DOB
  const age = patient?.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : null;
  const genderStr = "Female"; // Hardcoded for demo logic to match mockup density, normally from DB

  
  // Custom states mapping mockup UI
  const isCheckedIn = appt.status === 'checked_in';
  
  if (isAfternoon) {
    // Minimized afternoon row
    return (
       <div className="flex items-center justify-between p-5 bg-card/40 border border-border rounded-[16px] hover:bg-card/80 transition-colors cursor-pointer group" onClick={() => onOpenPassport(appt)}>
          <div className="flex items-center gap-6">
             <div className="text-foreground font-medium text-[15px] opacity-60 group-hover:opacity-100 transition-opacity w-12">
               {slot ? format(parseISO(slot.slot_start), 'HH:mm') : '--:--'}
             </div>
             <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center border border-border shrink-0">
                   <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="font-semibold text-foreground/80 group-hover:text-foreground transition-colors text-[15px]">
                  {patient?.full_name ?? 'Unknown Patient'}
                </div>
             </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden sm:block text-[13px] text-muted-foreground italic">
               {appt.notes ? appt.notes : "Routine Review"}
             </div>
             <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
       </div>
    );
  }

  // Morning / Active row
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-card border border-border rounded-[16px] gap-6 transition-all hover:border-border/80">
      
      {/* Time & Status */}
      <div className="flex flex-col items-center justify-center min-w-[70px]">
         <div className="font-semibold text-[22px] tracking-tight">{slot ? format(parseISO(slot.slot_start), 'HH:mm') : '--:--'}</div>
         <div className={`text-[10px] uppercase font-bold tracking-widest mt-1 ${isCheckedIn ? 'text-red-400' : 'text-muted-foreground'}`}>
           {STATUS_LABELS[appt.status]?.toUpperCase() ?? 'UPCOMING'}
         </div>
      </div>

      {/* Profile */}
      <div className="flex items-center gap-4 flex-1">
         <div className="h-12 w-12 rounded-full overflow-hidden bg-secondary border-2 border-border shadow-sm shrink-0">
            <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${appt.patient_id ?? 'doc'}&backgroundColor=transparent`} alt="avatar" className="h-full w-full object-cover" />
         </div>
         <div>
            <div className="font-bold text-[17px] tracking-tight leading-tight flex items-center gap-2">
               {patient?.full_name ?? 'Unknown Patient'}
            </div>
            <div className="text-[12px] text-muted-foreground font-medium mt-1 flex items-center gap-1.5 opacity-80">
               <ActivitySquare className="h-3 w-3" />
               ID: #ONC-{appt.patient_id?.slice(0,4) ?? '0000'} • {age || '--'}y {genderStr}
            </div>
         </div>
      </div>

      <div className="w-px h-10 bg-border hidden lg:block" />

      {/* Reason */}
      <div className="flex-1 hidden md:block">
         <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">Reason for Visit</div>
         <div className="text-[13px] text-foreground/90 leading-snug pr-4">
           {appt.notes ? appt.notes : "Initial Consultation Review"}
         </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 shrink-0">
         <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase bg-secondary border ${isCheckedIn ? 'border-red-500/30 text-red-400' : 'border-primary/30 text-primary'}`}>
           {isCheckedIn ? 'Urgent' : 'Routine'}
         </span>
         
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <button className="h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-muted transition-colors">
                 {updating === appt.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
               </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border text-foreground">
              {nextStatuses.map((s) => (
                <DropdownMenuItem key={s} onClick={() => onStatusChange(appt.id, s)} className="hover:bg-muted focus:bg-muted cursor-pointer">
                  {STATUS_LABELS[s] ?? s}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onOpenPassport(appt)} className="text-primary hover:bg-primary/10 focus:bg-primary/10 cursor-pointer">
                 Open Health Passport
              </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>

         {isCheckedIn && (
            <button onClick={() => onStatusChange(appt.id, 'in_progress')} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2 rounded-full transition-colors ml-2 shadow-[0_0_15px_rgba(192,132,252,0.2)]">
               Start Session
            </button>
         )}
      </div>

    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const DoctorQueue = () => {
  const [allAppointments, setAllAppointments] = useState<DoctorAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const [passportOpen, setPassportOpen] = useState(false);
  const [passportPatient, setPassportPatient] = useState<{ id: string; name: string; appointmentId: string; } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await doctorService.listAppointments('all');
      const list: DoctorAppointment[] = (res as any).data?.appointments ?? [];
      setAllAppointments(list);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const dayAppointments = allAppointments
    .filter((a) => {
      if (!a.appointment_slots?.slot_start) return false;
      return isSameDay(parseISO(a.appointment_slots.slot_start), currentDate);
    })
    .sort((a, b) => {
      const as = a.appointment_slots?.slot_start ?? '';
      const bs = b.appointment_slots?.slot_start ?? '';
      return as.localeCompare(bs);
    });

  const activeAppts = dayAppointments.filter(a => !['completed', 'cancelled', 'no_show'].includes(a.status));
  const checkedInCount = dayAppointments.filter(a => a.status === 'checked_in').length;
  const pendingCount = activeAppts.length - checkedInCount;

  // Split into Morning / Afternoon trivially based on 12:00 PM for UI grouping
  const morningAppts = dayAppointments.filter(a => {
     if (!a.appointment_slots?.slot_start) return false;
     const hr = parseInt(format(parseISO(a.appointment_slots.slot_start), 'HH'), 10);
     return hr < 12;
  });
  const afternoonAppts = dayAppointments.filter(a => {
     if (!a.appointment_slots?.slot_start) return false;
     const hr = parseInt(format(parseISO(a.appointment_slots.slot_start), 'HH'), 10);
     return hr >= 12;
  });

  const handleStatusChange = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await doctorService.updateAppointmentStatus(id, status);
      toast.success(`Marked as "${STATUS_LABELS[status] ?? status}"`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const handleOpenPassport = (appt: DoctorAppointment) => {
    setPassportPatient({
      id: appt.patient_id,
      name: appt.patients?.full_name ?? 'Patient',
      appointmentId: appt.id,
    });
    setPassportOpen(true);
  };

  return (
    <>
      <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
           <div>
              <p className="text-[11px] text-primary font-bold tracking-[0.2em] uppercase mb-1">Schedule Management</p>
              <h1 className="text-4xl font-extrabold tracking-tight">Daily Appointments</h1>
           </div>
           
           <div className="flex items-center gap-1 bg-card rounded-full p-1 border border-border shadow-sm">
             <button onClick={() => setCurrentDate((d) => subDays(d, 1))} className="px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-full transition-colors">Yesterday</button>
             <button onClick={() => setCurrentDate(new Date())} className="px-5 py-2 text-sm font-semibold bg-secondary shadow-inner text-foreground rounded-full border border-border transition-colors">Today, {format(currentDate, 'MMM dd')}</button>
             <button onClick={() => setCurrentDate((d) => addDays(d, 1))} className="px-5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-full transition-colors">Tomorrow</button>
             <div className="w-px h-6 bg-muted mx-1"></div>
             <button className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <CalendarDays className="h-4 w-4" />
             </button>
           </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
           {/* Total Patients */}
           <div className="bg-card rounded-[20px] p-5 border-l-2 border-l-primary border border-border relative overflow-hidden group hover:bg-secondary transition-all">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Total Patients</p>
              <p className="text-4xl font-bold tracking-tight">{dayAppointments.length.toString().padStart(2, '0')}</p>
              <div className="flex items-center gap-1 text-[11px] text-primary font-medium mt-3">
                 <Sparkles className="h-3 w-3" /> 12% from last week
              </div>
           </div>

           {/* Checked In */}
           <div className="bg-card rounded-[20px] p-5 border-l-2 border-l-red-400 border border-border relative hover:bg-secondary transition-all">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Checked In</p>
              <p className="text-4xl font-bold tracking-tight">{checkedInCount.toString().padStart(2, '0')}</p>
              <div className="flex items-center gap-1 text-[11px] text-red-400 font-medium mt-3">
                 <Clock className="h-3 w-3" /> Avg wait: 12 min
              </div>
           </div>

           {/* Pending */}
           <div className="bg-card rounded-[20px] p-5 border-l-2 border-l-primary border border-border relative hover:bg-secondary transition-all">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Pending</p>
              <p className="text-4xl font-bold tracking-tight">{pendingCount.toString().padStart(2, '0')}</p>
              <div className="flex items-center gap-1 text-[11px] text-primary font-medium mt-3">
                 <ActivitySquare className="h-3 w-3" /> Next: 09:30 AM
              </div>
           </div>

           {/* Efficiency Rank */}
           <div className="bg-secondary rounded-[20px] p-5 border border-border relative flex flex-col items-center justify-center text-center">
              <ActivitySquare className="h-5 w-5 text-primary mb-2 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
              <p className="text-sm font-bold text-foreground mb-0.5">Efficiency Rank</p>
              <p className="text-[11px] text-muted-foreground">Top 5% in Oncology</p>
           </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dayAppointments.length === 0 ? (
          <div className="bg-card border border-border rounded-[24px] p-16 text-center space-y-4">
            <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground font-medium">No appointments scheduled for {format(currentDate, 'MMMM d, yyyy')}</p>
          </div>
        ) : (
          <div className="space-y-10">
             
             {/* Morning Sessions */}
             {morningAppts.length > 0 && (
                <div>
                   <div className="flex items-center justify-between mb-4 px-2">
                     <h2 className="text-xl font-bold">Morning Sessions</h2>
                     <div className="flex items-center gap-2">
                        <button className="h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"><Search className="h-3 w-3" /></button>
                        <button className="h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"><ChevronDown className="h-3 w-3" /></button>
                     </div>
                   </div>
                   <div className="space-y-2 relative">
                      <div className="absolute left-0 top-6 bottom-6 w-1 bg-gradient-to-b from-primary via-primary/50 to-transparent rounded-r-md"></div>
                      {morningAppts.map((appt, idx) => (
                         <AppointmentCard key={appt.id} appt={appt} position={idx + 1} updating={updating} onStatusChange={handleStatusChange} onOpenPassport={handleOpenPassport} isAfternoon={false} />
                      ))}
                   </div>
                </div>
             )}

             {/* Afternoon Sessions */}
             {afternoonAppts.length > 0 && (
                <div>
                   <div className="flex items-center justify-between mb-4 px-2 mt-8">
                     <h2 className="text-xl font-bold">Afternoon Sessions</h2>
                     <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">{afternoonAppts.length} Appointments Remaining</span>
                   </div>
                   <div className="space-y-2">
                      {afternoonAppts.map((appt, idx) => (
                         <AppointmentCard key={appt.id} appt={appt} position={idx + 1} updating={updating} onStatusChange={handleStatusChange} onOpenPassport={handleOpenPassport} isAfternoon={true} />
                      ))}
                   </div>
                </div>
             )}

          </div>
        )}
      </div>

      <HealthPassportSheet
        open={passportOpen}
        onClose={() => setPassportOpen(false)}
        patientId={passportPatient?.id ?? null}
        patientName={passportPatient?.name ?? ''}
        appointmentId={passportPatient?.appointmentId ?? null}
      />
    </>
  );
};

