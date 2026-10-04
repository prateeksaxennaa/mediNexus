import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Pill,
  Share2,
  Loader2,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Shield,
  Clock,
  UserRound,
  Building2,
  ArrowRightLeft,
  Plus,
  Search,
  X,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  Sparkles,
  Calendar,
  ArrowRight,
  Play,
  Pause,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  patientService,
  type PatientPassport,
  type AccessGrant,
  type PatientReferral,
  type DocumentSelection,
} from '@/services/patient.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  PrescriptionViewModal,
  normalizePrescriptionData,
  type PDFPrescriptionData,
} from '@/features/dashboard/shared/PrescriptionViewModal';

type PassportTab = 'prescriptions' | 'reports' | 'grants' | 'referrals' | 'trends';

// ─── Trend types ──────────────────────────────────────────────────────────────

interface TrendItem {
  parameter: string;
  direction: 'improving' | 'declining' | 'stable' | 'variable';
  concern: 'none' | 'watch' | 'urgent';
  note: string;
}

interface TrendsData {
  summary: string;
  trends: TrendItem[];
  report_count: number;
  generated_at: string;
}

// ─── Helper: group grants by doctor ──────────────────────────────────────────

interface GroupedGrant {
  doctorId: string;
  doctorName: string;
  specialisation: string;
  hospitalName: string;
  grants: AccessGrant[];
}

function groupGrantsByDoctor(grants: AccessGrant[]): GroupedGrant[] {
  const map = new Map<string, GroupedGrant>();

  for (const g of grants) {
    const docId = g.granted_to_doctor_id ?? 'unknown';
    if (!map.has(docId)) {
      map.set(docId, {
        doctorId: docId,
        doctorName: g.doctor?.full_name ?? 'Unknown Doctor',
        specialisation: g.doctor?.specialisation ?? '',
        hospitalName: g.doctor?.hospitals?.name ?? '',
        grants: [],
      });
    }
    map.get(docId)!.grants.push(g);
  }

  return [...map.values()].sort((a, b) => {
    // Sort by most recent grant first
    const aLatest = Math.max(...a.grants.map(g => new Date(g.created_at).getTime()));
    const bLatest = Math.max(...b.grants.map(g => new Date(g.created_at).getTime()));
    return bLatest - aLatest;
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const PatientHealthPassport = () => {
  const [tab, setTab] = useState<PassportTab>('prescriptions');
  const [passport, setPassport] = useState<PatientPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingDoctor, setRevokingDoctor] = useState<string | null>(null);

  // PDF modal state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);

  // Collapsible doctor groups
  const [expandedDoctors, setExpandedDoctors] = useState<Set<string>>(new Set());

  // ── Report Audio Analysis ──
  // reportSpeakState: per-report loading/playing state
  // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  type SpeakState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  const [reportSpeakStates, setReportSpeakStates] = useState<Record<string, SpeakState>>({});
  // Per-report language selection; audio is cached per `${reportId}:${lang}`
  const [reportLangs, setReportLangs] = useState<Record<string, 'en' | 'hi'>>({});
  const reportAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const [audioProgress, setAudioProgress] = useState<Record<string, { currentTime: number, duration: number }>>({});

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' + s : s}`;
  };

  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);

  const setSpeakState = (reportId: string, state: SpeakState) =>
    setReportSpeakStates((prev) => ({ ...prev, [reportId]: state }));

  const handleAudioSeek = (e: React.MouseEvent<HTMLDivElement>, reportId: string, lang: 'en' | 'hi') => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const audioKey = `${reportId}:${lang}`;
    const audio = reportAudioRefs.current[audioKey];
    if (audio && audio.duration) {
      audio.currentTime = percent * audio.duration;
      setAudioProgress(prev => ({ ...prev, [reportId]: { ...prev[reportId], currentTime: audio.currentTime }}));
    }
  };

  const handleSpeakReport = async (reportId: string, lang: 'en' | 'hi') => {
    const current = reportSpeakStates[reportId] ?? 'idle';
    const audioKey = `${reportId}:${lang}`;

    // If audio already loaded for this lang — toggle play/pause
    const existing = reportAudioRefs.current[audioKey];
    if (existing && (current === 'playing' || current === 'paused')) {
      if (current === 'playing') {
        existing.pause();
        setSpeakState(reportId, 'paused');
      } else {
        existing.play();
        setSpeakState(reportId, 'playing');
      }
      return;
    }

    // Otherwise: fetch from server
    setSpeakState(reportId, 'loading');
    try {
      const res = await patientService.speakReport(reportId, lang);
      const audioBase64 = res.data?.audio_base64;
      const audioMime = res.data?.audio_mime ?? 'audio/mpeg';
      if (!audioBase64) throw new Error('No audio received');

      const audio = new Audio(`data:${audioMime};base64,${audioBase64}`);
      reportAudioRefs.current[audioKey] = audio;

      audio.onended = () => setSpeakState(reportId, 'idle');
      audio.onpause = () => {
        if (!audio.ended) setSpeakState(reportId, 'paused');
      };
      audio.onplay = () => setSpeakState(reportId, 'playing');

      audio.ontimeupdate = () => {
        setAudioProgress(prev => ({ ...prev, [reportId]: { currentTime: audio.currentTime, duration: audio.duration } }));
      };
      audio.onloadedmetadata = () => {
        setAudioProgress(prev => ({ ...prev, [reportId]: { currentTime: 0, duration: audio.duration } }));
      };

      await audio.play();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate audio');
      setSpeakState(reportId, 'error');
    }
  };

  // ── Health Trends ──
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);

  const handleGenerateTrends = async () => {
    if (trendsLoading) return;
    setTrendsLoading(true);
    setTrendsError(null);
    try {
      const res = await patientService.getHealthTrends();
      setTrendsData(res.data);
    } catch (e: any) {
      setTrendsError(e.message ?? 'Failed to generate trend analysis');
    } finally {
      setTrendsLoading(false);
    }
  };

  // ── Grant Access Dialog ──
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantDoctorQuery, setGrantDoctorQuery] = useState('');
  const [grantDoctorResults, setGrantDoctorResults] = useState<any[]>([]);
  const [grantDoctorSearching, setGrantDoctorSearching] = useState(false);
  const [grantSelectedDoctor, setGrantSelectedDoctor] = useState<any | null>(null);
  const [grantSelectedDocs, setGrantSelectedDocs] = useState<DocumentSelection[]>([]);
  const [grantValidDays, setGrantValidDays] = useState(30);
  const [grantSaving, setGrantSaving] = useState(false);
  const grantDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPassport = async () => {
    setLoading(true);
    try {
      const res = await patientService.getPassport();
      setPassport((res as any).data as PatientPassport);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load health passport');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPassport();
  }, []);

  // ── Grant dialog: debounced doctor search ──
  useEffect(() => {
    if (!grantDialogOpen) return;
    if (grantDoctorQuery.length < 2) {
      setGrantDoctorResults([]);
      return;
    }
    if (grantDebounceRef.current) clearTimeout(grantDebounceRef.current);
    grantDebounceRef.current = setTimeout(async () => {
      setGrantDoctorSearching(true);
      try {
        const res = await patientService.searchDoctors(grantDoctorQuery);
        setGrantDoctorResults((res as any).data?.doctors ?? []);
      } catch {
        setGrantDoctorResults([]);
      } finally {
        setGrantDoctorSearching(false);
      }
    }, 300);
    return () => { if (grantDebounceRef.current) clearTimeout(grantDebounceRef.current); };
  }, [grantDoctorQuery, grantDialogOpen]);

  const openGrantDialog = () => {
    setGrantDoctorQuery('');
    setGrantDoctorResults([]);
    setGrantSelectedDoctor(null);
    setGrantSelectedDocs([]);
    setGrantValidDays(30);
    setGrantDialogOpen(true);
  };

  const toggleGrantDoc = (docType: 'prescription' | 'report', docId: string) => {
    setGrantSelectedDocs(prev => {
      const exists = prev.some(d => d.document_type === docType && d.document_id === docId);
      if (exists) return prev.filter(d => !(d.document_type === docType && d.document_id === docId));
      return [...prev, { document_type: docType, document_id: docId }];
    });
  };

  const isGrantDocSelected = (docType: 'prescription' | 'report', docId: string) =>
    grantSelectedDocs.some(d => d.document_type === docType && d.document_id === docId);

  const handleSubmitGrant = async () => {
    if (!grantSelectedDoctor || grantSelectedDocs.length === 0) return;
    setGrantSaving(true);
    try {
      await patientService.createGrant({
        granted_to_doctor_id: grantSelectedDoctor.id,
        documents: grantSelectedDocs,
        valid_days: grantValidDays,
        source: 'manual',
      });
      toast.success(`Shared ${grantSelectedDocs.length} document${grantSelectedDocs.length !== 1 ? 's' : ''} with ${grantSelectedDoctor.full_name}`);
      setGrantDialogOpen(false);
      fetchPassport();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to grant access');
    } finally {
      setGrantSaving(false);
    }
  };

  // Fetcher for the PDF modal
  const fetchPDFData = useCallback(async (id: string): Promise<PDFPrescriptionData> => {
    const res = await patientService.getPrescription(id);
    const raw = (res as any).data?.prescription;
    if (!raw) throw new Error('Prescription not found');
    return normalizePrescriptionData(raw);
  }, []);

  const openModal = (rxId: string) => {
    setSelectedRxId(rxId);
    setViewModalOpen(true);
  };

  // Revoke a single grant
  const handleRevokeSingle = async (grantId: string) => {
    setRevoking(grantId);
    try {
      await patientService.revokeGrant(grantId);
      toast.success('Access revoked');
      fetchPassport();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to revoke access');
    } finally {
      setRevoking(null);
    }
  };

  // Revoke ALL grants for a doctor
  const handleRevokeAllForDoctor = async (doctorId: string, doctorName: string) => {
    setRevokingDoctor(doctorId);
    try {
      await patientService.revokeAllGrantsForDoctor(doctorId);
      toast.success(`All access for ${doctorName} revoked`);
      fetchPassport();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to revoke access');
    } finally {
      setRevokingDoctor(null);
    }
  };

  const toggleDoctorExpanded = (doctorId: string) => {
    setExpandedDoctors(prev => {
      const next = new Set(prev);
      if (next.has(doctorId)) next.delete(doctorId);
      else next.add(doctorId);
      return next;
    });
  };

  // Grouped grants
  const groupedGrants = useMemo(
    () => groupGrantsByDoctor(passport?.grants ?? []),
    [passport?.grants]
  );

  const activeGrantCount = (passport?.grants ?? []).filter(g => g.is_active).length;
  const expiredGrantCount = (passport?.grants ?? []).filter(g => !g.is_active).length;

  const tabs: { key: PassportTab; label: string; icon: any; badge?: number }[] = [
    { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
    { key: 'reports', label: 'Reports', icon: FileText },
    { key: 'trends', label: 'Health Trends', icon: Activity },
    { key: 'grants', label: 'Access Granted', icon: Share2, badge: activeGrantCount || undefined },
    { key: 'referrals', label: 'Referrals', icon: ArrowRightLeft },
  ];

  return (
    <>
      {/* Waveform bar animation for report speak button */}
      <style>{`
        @keyframes speakBar {
          0%, 100% { transform: scaleY(0.3); }
          50%       { transform: scaleY(1); }
        }
      `}</style>
      <div className="flex flex-col lg:flex-row w-[calc(100%-2rem)] max-w-[1400px] mx-auto animate-in fade-in duration-500 min-h-[85vh] gap-10 py-8">
        {/* ── Left Sidebar (Health Passport Exclusive) ── */}
        <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-8">

          {/* Navigation Links */}
          <nav className="flex flex-col pl-1 flex-1 gap-1">
            {tabs.map(({ key, label, icon: Icon, badge }) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key as PassportTab)}
                  className={`flex items-center gap-4 px-4 py-3 text-sm transition-all text-left ${isActive
                      ? 'bg-primary/5 text-foreground border-r-[3px] border-primary bg-gradient-to-r from-transparent to-primary/5'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-r-lg'
                    }`}
                >
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-primary' : 'opacity-60'}`} />
                  <span className={isActive ? 'font-medium' : ''}>{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-auto bg-primary/10 text-primary text-[10px] font-bold rounded-full px-2 py-0.5">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>


        </aside>

        {/* ── Main Content Area ── */}
        <main className="flex-1 min-w-0">

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── Prescriptions ── */}
              {tab === 'prescriptions' && (
                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-1">Prescriptions</h2>
                      <p className="text-sm text-muted-foreground">Manage and monitor your active medication regime.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {(passport?.prescriptions ?? []).length === 0 ? (
                      <div className="col-span-full bg-card rounded-3xl border border-border p-12 text-center text-muted-foreground">No active prescriptions.</div>
                    ) : (
                      (passport?.prescriptions ?? []).flatMap(rx =>
                        (rx.prescription_items ?? []).map((item: any, idx: number) => (
                          <div key={item.id || idx} className="bg-card rounded-[24px] border border-border p-6 flex flex-col hover:border-primary/30 transition-colors group">
                            {/* Top Header Section */}
                            <div className="flex items-start justify-between mb-6">
                              <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-[16px] bg-gradient-to-br from-primary/10 to-card border border-border flex items-center justify-center shrink-0">
                                  <Pill className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-foreground leading-tight flex items-center gap-2">
                                    {item.medicines?.medicine_name ?? item.medicine_id}
                                    {idx === 0 && <span className="bg-red-500/10 text-red-500 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border border-red-500/20">Critical</span>}
                                  </h3>
                                  <p className="text-[11px] text-muted-foreground mt-1">
                                    Prescribed by {(rx as any).doctors ? `Dr. ${(rx as any).doctors.full_name.replace('Dr. ', '')}` : 'Doctor'} • {rx.illness_description ?? 'General Health'}
                                  </p>
                                </div>
                              </div>
                              <span className="text-3xl font-black text-foreground/5 tabular-nums pointer-events-none">{(idx + 1).toString().padStart(2, '0')}</span>
                            </div>

                            {/* Grid Details */}
                            <div className="grid grid-cols-3 gap-2 mb-6">
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Dosage</p>
                                <p className="text-sm font-medium text-primary">{item.dosage}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Frequency</p>
                                <p className="text-sm font-medium text-primary">{item.frequency.replace('_', ' ')}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Timing</p>
                                <p className="text-sm font-medium text-primary">{item.duration}</p>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-3 mt-auto pt-4 border-t border-border">
                              <button
                                onClick={() => openModal(rx.id)}
                                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold py-2.5 rounded-full flex items-center justify-center gap-2 transition-all"
                              >
                                <FileText className="h-3 w-3" /> View PDF
                              </button>
                              <button
                                onClick={() => toast.info('Refill request sent to doctor.')}
                                className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold py-2.5 rounded-full flex items-center justify-center gap-2 transition-all border border-border"
                              >
                                <Plus className="h-3 w-3" /> Request Refill
                              </button>
                            </div>

                            {/* Footer Info */}
                            <div className="flex items-center gap-4 mt-5 text-[10px] text-muted-foreground font-medium pt-3 border-t border-dashed border-border">
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" /> Next dose: 8:00 PM tonight</span>
                              <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /> 14 days supply remaining</span>
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>
                </div>
              )}

              {/* ── Reports ── */}
              {tab === 'reports' && (
                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-1">
                        Clinical <span className="text-primary">Reports</span> Archive
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 max-w-5xl">
                    {(passport?.reports ?? []).length === 0 ? (
                      <div className="col-span-full bg-card rounded-3xl border border-border p-12 text-center text-muted-foreground">No reports found.</div>
                    ) : (
                      (passport?.reports ?? []).map((report) => {
                        const speakState = reportSpeakStates[report.id] ?? 'idle';
                        const isLoading = speakState === 'loading';
                        const isPlaying = speakState === 'playing';
                        const isError = speakState === 'error';
                        const lang = reportLangs[report.id] ?? 'en';

                        return (
                        <div key={report.id} className="bg-card rounded-3xl border border-border p-2 flex flex-col hover:border-primary/30 transition-colors group">
                          <div className="flex flex-col sm:flex-row gap-4 h-full">
                            {/* Left Text Box */}
                            <div className="flex-1 flex flex-col p-6 pr-2">
                               {/* Icon & Title */}
                               <div className="flex items-start gap-4 mb-4">
                                  <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                      <FileText className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <h3 className="text-xl font-bold text-foreground leading-tight">{report.report_name}</h3>
                                    <p className="text-sm text-muted-foreground mt-1">{report.hospitals?.name ?? 'External Lab'}</p>
                                  </div>
                               </div>

                               <p className="text-sm text-muted-foreground leading-relaxed mb-6 line-clamp-4">
                                 This comprehensive {report.report_type?.toLowerCase() || 'medical'} evaluation provides a detailed baseline. Includes complete analysis and comparative studies with previous records.
                               </p>

                               {/* Tags */}
                               <div className="flex flex-wrap items-center gap-3 mb-6">
                                  <div className="bg-muted rounded-2xl px-4 py-2 border border-border flex flex-col items-start gap-1">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status</span>
                                    <span className="text-sm font-semibold text-rose-500 dark:text-rose-400">Stable</span>
                                  </div>
                                  <div className="bg-muted rounded-2xl px-4 py-2 border border-border flex flex-col items-start gap-1">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Uploaded</span>
                                    <span className="text-sm font-semibold text-foreground">{format(parseISO(report.uploaded_at), 'MMM d, yyyy')}</span>
                                  </div>
                               </div>

                               {/* Buttons container pushed to bottom */}
                               <div className="mt-auto pt-2 flex items-center gap-3">
                                 <button
                                   onClick={() => handleSpeakReport(report.id, lang)}
                                   disabled={isLoading}
                                   className={`px-6 py-3 rounded-[20px] text-sm font-bold transition-all flex items-center gap-2 ${
                                     isError
                                       ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                       : isPlaying
                                       ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                       : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                   } disabled:opacity-50`}
                                 >
                                   <div className="h-4 w-4 bg-primary-foreground dark:bg-background rounded shrink-0 flex items-center justify-center">
                                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <div className="w-1.5 h-1.5 bg-primary rounded-sm" />}
                                   </div>
                                   {isLoading ? 'Loading...' : isPlaying ? 'Pause Audio' : isError ? 'Retry' : 'Full Analysis'}
                                 </button>
                                 <a
                                   href={report.report_url}
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-[20px] flex items-center gap-2 text-sm font-bold transition-all"
                                 >
                                   <Download className="h-4 w-4" /> PDF
                                 </a>
                               </div>
                            </div>
                            
                            {/* Right Image Container - Trigger for modal */}
                            <button
                              onClick={() => setReportPreviewUrl(report.report_url)} 
                              className="w-full sm:w-[350px] shrink-0 rounded-[20px] overflow-hidden bg-muted/30 border border-border flex items-center justify-center relative min-h-[240px] group/preview cursor-pointer"
                            >
                               {/* Preview the image securely using an img tag for known images or object for unknown/pdfs */}
                               {report.report_url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                                  <img src={report.report_url} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover/preview:opacity-100 transition-opacity" />
                               ) : (
                                  <iframe 
                                    src={`${report.report_url}#toolbar=0&navpanes=0&scrollbar=0`} 
                                    className="absolute inset-0 w-full h-full border-0 pointer-events-none opacity-90 group-hover/preview:opacity-100 transition-opacity" 
                                    scrolling="no"
                                  />
                               )}
                               <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] pointer-events-none rounded-[20px]" />
                               
                               {/* Hover Overlay */}
                               <div className="absolute inset-0 bg-background/50 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                  <div className="bg-primary/20 text-primary px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2">
                                     <Eye className="h-4 w-4" /> View Fullscreen
                                  </div>
                               </div>
                            </button>
                          </div>

                          {/* Audio Player Bar - full width at bottom if it's playing/paused/loading */}
                          {(isPlaying || speakState === 'paused' || isLoading) && (
                            <div className="mt-4 bg-muted/30 rounded-[24px] p-5 flex items-center justify-center gap-5 border border-border relative">
                                {/* Top Controls - Just Play/Pause */}
                                <div className="flex items-center justify-center">
                                   <button 
                                      onClick={() => handleSpeakReport(report.id, lang)}
                                      className="h-10 w-10 bg-background hover:bg-muted border border-border text-foreground rounded-full flex items-center justify-center shadow-sm transition-transform hover:scale-105 active:scale-95 shrink-0"
                                   >
                                     {isLoading ? (
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                     ) : isPlaying ? (
                                        <Pause className="h-5 w-5 fill-current" />
                                     ) : (
                                        <Play className="h-5 w-5 fill-current ml-1" />
                                     )}
                                   </button>
                                </div>

                                {/* Scrubber */}
                                <div className="flex-1 flex items-center gap-3">
                                  <span className="text-[12px] font-semibold text-primary w-8 text-right font-mono tracking-tighter shrink-0">
                                    {isLoading ? '...' : formatTime(audioProgress[report.id]?.currentTime || 0)}
                                  </span>
                                  
                                  <div 
                                    className="flex-1 h-3 flex items-center relative overflow-visible cursor-pointer group/scrubber"
                                    onClick={(e) => handleAudioSeek(e, report.id, lang)}
                                  >
                                    <div className="w-full h-1.5 bg-border rounded-full" />
                                    {isLoading ? (
                                      <div className="absolute left-0 h-1.5 bg-primary w-full animate-pulse opacity-40 rounded-full pointer-events-none" />
                                    ) : (
                                      <div 
                                        className="absolute left-0 h-1.5 bg-primary rounded-full transition-all duration-100 ease-linear pointer-events-none"
                                        style={{ width: `${Math.min(100, Math.max(0, ((audioProgress[report.id]?.currentTime || 0) / (audioProgress[report.id]?.duration || 1)) * 100))}%` }}
                                      >
                                          {/* Circle indicator */}
                                          <div className="absolute right-0 top-1/2 -translate-y-1/2 border-[3px] border-background w-3 h-3 bg-primary rounded-full translate-x-1/2 shadow-sm scale-0 group-hover/scrubber:scale-100 transition-transform" />
                                      </div>
                                    )}
                                  </div>
                                  
                                  <span className="text-[12px] font-semibold text-primary w-8 font-mono tracking-tighter shrink-0">
                                    {isLoading ? '...' : formatTime(audioProgress[report.id]?.duration || 0)}
                                  </span>
                                </div>
                            </div>
                          )}
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ── Access Granted ── */}
              {tab === 'grants' && (
                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-1">Access Management</h2>
                      <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">Manage third-party clinical permissions and monitor data sovereignty in real-time.</p>
                    </div>
                    <Button onClick={openGrantDialog} className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Grant Access
                    </Button>
                  </div>

                  {/* Top Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                    <div className="bg-card rounded-[24px] border border-border p-6 flex flex-col justify-between">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-4">Active Grants</p>
                      <div className="flex items-baseline gap-2 mb-6">
                        <span className="text-5xl font-black text-primary">{activeGrantCount.toString().padStart(2, '0')}</span>
                        <span className="text-sm font-medium text-muted-foreground">entities</span>
                      </div>
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" /> Live Monitoring Active</p>
                    </div>
                    <div className="bg-card rounded-[24px] border border-border p-6 flex flex-col justify-between">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-4">Pending / Expired</p>
                      <div className="flex items-baseline gap-2 mb-6">
                        <span className="text-5xl font-black text-red-400">{expiredGrantCount.toString().padStart(2, '0')}</span>
                        <span className="text-sm font-medium text-muted-foreground">waiting</span>
                      </div>
                      <button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">Review requests <ArrowRight className="h-3 w-3" /></button>
                    </div>
                    <div className="bg-card rounded-[24px] border border-border p-6 flex flex-col justify-center">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Shield className="h-4 w-4 text-foreground" />
                        </div>
                        <p className="text-lg font-bold text-foreground leading-tight">Trust Level: High</p>
                      </div>
                      <p className="text-xs text-muted-foreground">No unauthorized attempts detected.</p>
                    </div>
                  </div>

                {/* Sub Navigation */}
                <div className="flex items-center gap-8 border-b border-border mb-8 overflow-x-auto pb-[-1px]">
                  <button className="text-sm font-bold text-primary border-b-2 border-primary pb-3 px-1">Access Granted</button>
                </div>

                  {groupedGrants.length === 0 ? (
                    <div className="bg-card rounded-[24px] border border-border p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                      <UserRound className="h-8 w-8 mb-4 opacity-40" />
                      <p>No active access grants.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {groupedGrants.map((group) => {
                        const isExpanded = expandedDoctors.has(group.doctorId);
                        const activeInGroup = group.grants.filter(g => g.is_active).length;
                        const allExpired = activeInGroup === 0;

                        return (
                          <div key={group.doctorId} className={`bg-card rounded-[24px] border border-border p-6 flex flex-col group transition-all hover:border-primary/30 ${allExpired ? 'opacity-60' : ''}`}>

                            {/* Card Header Avatar */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="h-12 w-12 rounded-full overflow-hidden bg-gradient-to-br from-cyan-500/40 to-primary/40 border-2 border-background shrink-0">
                                <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${group.doctorId}&backgroundColor=transparent`} alt="Avatar" className="w-full h-full object-cover" />
                              </div>
                              <span className={`text-[9px] uppercase font-bold tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5 ${allExpired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${allExpired ? 'bg-muted-foreground' : 'bg-primary'}`} />
                                {allExpired ? 'EXPIRED' : 'ACTIVE'}
                              </span>
                            </div>

                            {/* Doctor Name & Details */}
                            <div className="mb-6 space-y-1">
                              <h3 className="text-lg font-bold text-foreground leading-tight">Dr. {group.doctorName.replace(/^Dr\.\s*/i, '')}</h3>
                              <p className="text-xs text-primary font-medium">{group.specialisation || 'General Physician'}</p>
                            </div>

                            <div className="space-y-2 mb-6">
                              <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-2">
                                <Building2 className="h-3 w-3" /> {group.hospitalName || 'External Facility'}
                              </p>
                              <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-2">
                                <Clock className="h-3 w-3" /> Expires: {group.grants[0] ? format(parseISO(group.grants[0].valid_until), 'MMM d, yyyy') : 'N/A'}
                              </p>
                            </div>

                            {/* Card Action Buttons */}
                            <div className="flex gap-3 mt-auto">
                              <button
                                onClick={() => toggleDoctorExpanded(group.doctorId)}
                                className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold py-2.5 rounded-full transition-colors flex justify-center items-center gap-1"
                              >
                                Manage {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                              <button
                                disabled={revokingDoctor === group.doctorId}
                                onClick={() => handleRevokeAllForDoctor(group.doctorId, group.doctorName)}
                                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold py-2.5 rounded-full transition-colors"
                              >
                                {revokingDoctor === group.doctorId ? 'Revoking...' : 'Revoke'}
                              </button>
                            </div>

                            {/* Expanded Document Details */}
                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-border space-y-3">
                                {group.grants.map((grant) => {
                                  const isActive = grant.is_active;
                                  const docName = grant.document_type === 'prescription' ? (grant.document?.illness_description ?? 'Prescription') : (grant.document?.report_name ?? 'Report');
                                  return (
                                    <div key={grant.id} className="flex items-center justify-between group/doc">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${grant.document_type === 'prescription' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                                        <p className={`text-[11px] truncate ${!isActive ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>{docName}</p>
                                      </div>
                                      {isActive && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleRevokeSingle(grant.id); }}
                                          disabled={revoking === grant.id}
                                          className="text-red-500 hover:text-red-400 opacity-0 group-hover/doc:opacity-100 transition-opacity"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Referrals ── */}
              {tab === 'referrals' && (
                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-1">Care Referrals</h2>
                      <p className="text-sm text-muted-foreground">Track your active medical referrals across the network.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button className="px-5 py-2 rounded-full border border-border text-foreground flex items-center gap-2 hover:bg-muted/50 transition-all text-sm font-medium">
                        History
                      </button>
                      <button onClick={() => toast.info('Coming soon')} className="px-5 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center gap-2 text-sm font-medium">
                        <Plus className="h-4 w-4" /> New Referral
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {(passport?.referrals ?? []).length === 0 ? (
                      <div className="col-span-full bg-card rounded-[24px] border border-border p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                        <ArrowRightLeft className="h-10 w-10 mx-auto mb-3 opacity-40 text-primary" />
                        <p>No active referrals.</p>
                      </div>
                    ) : (
                      (passport?.referrals ?? []).map((referral: PatientReferral) => {
                        const statusColor = {
                          pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
                          accepted: 'bg-green-500/10 text-green-500 border-green-500/20',
                          declined: 'bg-red-500/10 text-red-500 border-red-500/20',
                          completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                        }[referral.status] ?? 'bg-muted text-muted-foreground border-border';

                        return (
                          <div key={referral.id} className="bg-card rounded-[24px] border border-border p-6 hover:border-primary/30 transition-colors flex flex-col">

                            {/* Header */}
                            <div className="flex items-start justify-between mb-6">
                              <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-border flex items-center justify-center shrink-0">
                                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-foreground leading-tight">
                                    {referral.referred_to_doctor?.specialisation || 'Specialist'} Referral
                                  </h3>
                                  <p className="text-xs text-muted-foreground font-medium mt-1">
                                    {referral.referred_to_doctor?.full_name || 'Dr. Unknown'}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-[9px] uppercase font-bold tracking-widest px-3 py-1 rounded-full border ${statusColor}`}>
                                {referral.status}
                              </span>
                            </div>

                            {/* From -> To Context */}
                            <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3 mb-5 border border-border">
                              <div className="flex -space-x-2">
                                <div className="w-8 h-8 rounded-full border-2 border-background bg-muted overflow-hidden"><img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${referral.referring_doctor?.id || '1'}&backgroundColor=transparent`} className="w-full h-full object-cover" /></div>
                                <div className="w-8 h-8 rounded-full border-2 border-background bg-muted overflow-hidden"><img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${referral.referred_to_doctor?.id || '2'}&backgroundColor=transparent`} className="w-full h-full object-cover" /></div>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                Referred from <span className="text-foreground font-medium">{referral.referring_doctor?.full_name || 'Dr. Unknown'}</span>
                              </p>
                            </div>

                            {/* Body Details */}
                            <div className="space-y-3 mb-6 flex-1">
                              {referral.reason && (
                                <p className="text-sm text-muted-foreground italic leading-relaxed bg-muted/30 p-3 rounded-lg border-l-2 border-primary">"{referral.reason}"</p>
                              )}
                              <div className="flex flex-col gap-2 mt-4 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-2"><Calendar className="h-3 w-3" /> Created: {format(parseISO(referral.created_at), 'MMM d, yyyy')}</span>
                                <span className="flex items-center gap-2"><Building2 className="h-3 w-3" /> Location: {referral.referred_to_doctor?.hospitals?.name || 'Network Facility'}</span>
                              </div>
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-border">
                              <button onClick={() => toast.info('Coming soon')} className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold py-2.5 rounded-full transition-colors flex justify-center flex-row items-center gap-2">
                                Schedule
                              </button>
                              <button onClick={() => toast.info('Coming soon')} className="flex-1 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-xs font-bold py-2.5 rounded-full transition-colors flex justify-center flex-row items-center gap-2">
                                Decline
                              </button>
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ── Health Trends ── */}
              {tab === 'trends' && (
                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground mb-1">Health Diagnostics & Trends</h2>
                      <p className="text-sm text-muted-foreground">Longitudinal health trend analysis powered by AI.</p>
                    </div>
                  </div>

                  {/* Generate / Regenerate button */}
                  {!trendsData && !trendsLoading && (
                    <div className="bg-card rounded-[24px] border border-border p-12 flex flex-col items-center gap-5 text-center mt-4">
                      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-transparent flex items-center justify-center border border-primary/20">
                        <Activity className="h-10 w-10 text-primary" />
                      </div>
                      <div className="max-w-md mx-auto">
                        <p className="text-xl font-bold text-foreground mb-2">Generate comprehensive AI overview</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Our intelligence engine connects the dots across your entire medical history. By chronologically analyzing your test results, reports, and readings, it surfaces hidden correlations and tracks key health markers over time.
                        </p>
                      </div>
                      {trendsError && (
                        <p className="text-sm text-red-400 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">{trendsError}</p>
                      )}
                      <button onClick={handleGenerateTrends} className="px-8 py-3.5 mt-2 rounded-full bg-primary text-primary-foreground font-bold shadow-lg hover:bg-primary/90 transition-all flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Analyse My Health Trends
                      </button>
                    </div>
                  )}

                  {trendsLoading && (
                    <div className="bg-card rounded-[24px] border border-border p-20 flex flex-col items-center gap-4 text-center mt-4 tracking-wide">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-base font-medium text-foreground tracking-wide">
                        Synthesizing clinical data...
                      </p>
                      <p className="text-xs text-muted-foreground uppercase font-bold text-wide">Engine running • ETA 15–30s</p>
                    </div>
                  )}

                  {trendsData && !trendsLoading && (
                    <div className="space-y-6">
                      {/* Overall summary card */}
                      <div className="bg-muted/30 border border-primary/20 rounded-[24px] p-6 sm:p-8 space-y-4">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Sparkles className="h-5 w-5 text-primary" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">Executive Summary</h3>
                          </div>
                          <button
                            onClick={() => { setTrendsData(null); handleGenerateTrends(); }}
                            className="px-4 py-2 rounded-full bg-muted text-foreground hover:bg-muted/80 text-xs font-bold transition-colors"
                          >
                            Refresh Data
                          </button>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-4xl">{trendsData.summary}</p>
                        <div className="flex items-center gap-4 mt-6 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> Base: {trendsData.report_count} reports</span>
                          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Refreshed: {format(parseISO(trendsData.generated_at), 'MMM d, yyyy')}</span>
                        </div>
                      </div>

                      {/* Individual trend cards */}
                      {trendsData.trends.length === 0 ? (
                        <div className="bg-card rounded-[24px] border border-border p-12 text-center text-muted-foreground">
                          No measurable parameter trends were found across your reports.
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {trendsData.trends.map((trend, i) => {
                            const directionIcon =
                              trend.direction === 'improving' ? <TrendingUp className="h-4 w-4" /> :
                                trend.direction === 'declining' ? <TrendingDown className="h-4 w-4" /> :
                                  trend.direction === 'variable' ? <Activity className="h-4 w-4" /> :
                                    <Minus className="h-4 w-4" />;

                            const concernColors = {
                              urgent: 'border-red-500/20 bg-red-500/5',
                              watch: 'border-yellow-500/20 bg-yellow-500/5',
                              none: 'border-green-500/20 bg-green-500/5',
                            }[trend.concern] ?? 'border-border bg-card';

                            const directionColors = {
                              improving: 'text-green-400 bg-green-500/10 border border-green-500/20',
                              declining: trend.concern === 'urgent' ? 'text-red-400 bg-red-500/10 border border-red-500/20' : 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20',
                              stable: 'text-green-400 bg-green-500/10 border border-green-500/20',
                              variable: 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20',
                            }[trend.direction] ?? 'text-muted-foreground bg-muted border border-border';

                            const concernLabel = {
                              urgent: '⚠ Needs attention',
                              watch: '· Worth monitoring',
                              none: '· Looking good',
                            }[trend.concern] ?? '';

                            return (
                              <div key={i} className={`rounded-[20px] p-5 flex flex-col justify-between transition-colors ${concernColors}`}>
                                <div className="flex items-start justify-between gap-2 mb-4">
                                  <p className="text-sm font-bold text-foreground leading-tight pr-2">{trend.parameter}</p>
                                  <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${directionColors}`}>
                                    {directionIcon}
                                    {trend.direction}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed mb-4">{trend.note}</p>
                                {trend.concern !== 'none' && (
                                  <p className={`text-[11px] font-bold mt-auto ${trend.concern === 'urgent' ? 'text-red-400' : 'text-yellow-400'}`}>{concernLabel}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {selectedRxId && (
        <PrescriptionViewModal
          open={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          prescriptionId={selectedRxId}
          label="Prescription Preview"
          fetchData={fetchPDFData}
        />
      )}

      {/* ── Grant Access Dialog ── */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Grant Document Access</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
            {/* Step 1 — Doctor search */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Search for a doctor</p>
              {grantSelectedDoctor ? (
                <div className="flex items-center justify-between bg-primary/5 border rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Dr. {grantSelectedDoctor.full_name.replace(/^Dr\.\s*/i, '')}</p>
                    <p className="text-xs text-muted-foreground">
                      {grantSelectedDoctor.specialisation}
                      {grantSelectedDoctor.hospitals?.name && ` · ${grantSelectedDoctor.hospitals.name}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      setGrantSelectedDoctor(null);
                      setGrantDoctorQuery('');
                      setGrantDoctorResults([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9"
                    placeholder="Search by name or specialisation..."
                    value={grantDoctorQuery}
                    onChange={(e) => setGrantDoctorQuery(e.target.value)}
                    autoFocus
                  />
                  {grantDoctorSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {grantDoctorResults.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {grantDoctorResults.map((doc) => (
                        <button
                          key={doc.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                          onClick={() => {
                            setGrantSelectedDoctor(doc);
                            setGrantDoctorQuery('');
                            setGrantDoctorResults([]);
                          }}
                        >
                          <p className="font-medium">Dr. {doc.full_name.replace(/^Dr\.\s*/i, '')}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.specialisation}
                            {doc.hospitals?.name && ` · ${doc.hospitals.name}`}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {!grantDoctorSearching && grantDoctorQuery.length >= 2 && grantDoctorResults.length === 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-sm px-3 py-2 text-sm text-muted-foreground">
                      No doctors found.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2 — Select documents */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Select documents to share</p>

              {/* Prescriptions */}
              {(passport?.prescriptions ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium px-1">
                    Prescriptions
                  </p>
                  {(passport?.prescriptions ?? []).map((rx) => (
                    <label
                      key={rx.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={isGrantDocSelected('prescription', rx.id)}
                        onCheckedChange={() => toggleGrantDoc('prescription', rx.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {rx.illness_description ?? 'Prescription'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(rx.issued_at), 'MMM d, yyyy')}
                          {(rx as any).doctors ? ` · ${(rx as any).doctors.full_name}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Reports */}
              {(passport?.reports ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium px-1">
                    Reports
                  </p>
                  {(passport?.reports ?? []).map((report) => (
                    <label
                      key={report.id}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={isGrantDocSelected('report', report.id)}
                        onCheckedChange={() => toggleGrantDoc('report', report.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{report.report_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {(report.report_category ?? report.report_type ?? '').replace('_', ' ')}
                          {report.report_type && report.report_type !== 'other'
                            ? ` · ${report.report_type.toUpperCase()}`
                            : ''}
                          {' · '}
                          {format(parseISO(report.uploaded_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {(passport?.prescriptions ?? []).length === 0 && (passport?.reports ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                  No documents available to share.
                </p>
              )}
            </div>

            {/* Step 3 — Valid duration */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Access duration</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={grantValidDays}
                  onChange={(e) => setGrantValidDays(Math.min(365, Math.max(1, Number(e.target.value))))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days from today</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t mt-2">
            <Button
              variant="outline"
              onClick={() => setGrantDialogOpen(false)}
              disabled={grantSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitGrant}
              disabled={!grantSelectedDoctor || grantSelectedDocs.length === 0 || grantSaving}
            >
              {grantSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Share2 className="h-4 w-4 mr-2" />
              )}
              Share {grantSelectedDocs.length > 0 ? `${grantSelectedDocs.length} ` : ''}
              {grantSelectedDocs.length === 1 ? 'Document' : 'Documents'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Document Fullscreen Modal ── */}
      <Dialog open={!!reportPreviewUrl} onOpenChange={(open) => !open && setReportPreviewUrl(null)}>
        <DialogContent className="max-w-[95vw] xl:max-w-[1400px] w-full h-[95vh] p-0 overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-border rounded-xl">
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <h2 className="text-lg font-bold">Document Preview</h2>
            {/* The default shadcn/ui DialogContent already provides its own X button in the corner, so we don't need a custom one here! */}
          </div>
          <div className="flex-1 min-h-0 w-full bg-black/5 relative flex items-center justify-center p-6 bg-checkerboard">
            {reportPreviewUrl && (
              reportPreviewUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                <img src={reportPreviewUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
              ) : (
                <iframe src={`${reportPreviewUrl}#view=FitH`} className="w-full h-full rounded-lg bg-card shadow-2xl" />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
