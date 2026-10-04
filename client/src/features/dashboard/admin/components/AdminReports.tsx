import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  X,
  ExternalLink,
  ShieldCheck,
  UserSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  uploadPatientReport,
  searchHospitalPatients,
  listPatientReportsForAdmin,
  type HospitalPatient,
  type PatientReport,
} from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

type ReportCategory = 'lab' | 'radiology' | 'pathology' | 'discharge_summary' | 'other';
type ReportType = 'ecg' | 'xray' | 'mri' | 'ct' | 'blood_test' | 'urine_test' | 'other';

const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  lab: 'Lab Report',
  radiology: 'Radiology',
  pathology: 'Pathology',
  discharge_summary: 'Discharge Summary',
  other: 'Other',
};

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  ecg: 'ECG',
  xray: 'X-Ray',
  mri: 'MRI',
  ct: 'CT Scan',
  blood_test: 'Blood Test',
  urine_test: 'Urine Test',
  other: 'Other',
};

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_MB = 20;

export const AdminReports = () => {
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<HospitalPatient[]>([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<HospitalPatient | null>(null);
  const patientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [existingReports, setExistingReports] = useState<PatientReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const [reportName, setReportName] = useState('');
  const [reportCategory, setReportCategory] = useState<ReportCategory | ''>('');
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (patientQuery.length < 2) {
      setPatientResults([]);
      return;
    }
    if (patientDebounceRef.current) clearTimeout(patientDebounceRef.current);
    patientDebounceRef.current = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const res = await searchHospitalPatients(patientQuery);
        setPatientResults((res as any).data?.patients ?? []);
      } catch {
        setPatientResults([]);
      } finally {
        setPatientSearching(false);
      }
    }, 300);
    return () => { if (patientDebounceRef.current) clearTimeout(patientDebounceRef.current); };
  }, [patientQuery]);

  useEffect(() => {
    if (!selectedPatient) {
      setExistingReports([]);
      return;
    }
    setLoadingReports(true);
    listPatientReportsForAdmin(selectedPatient.id)
      .then(res => setExistingReports((res as any).data?.reports ?? []))
      .catch(() => setExistingReports([]))
      .finally(() => setLoadingReports(false));
  }, [selectedPatient]);

  const selectPatient = (p: HospitalPatient) => {
    setSelectedPatient(p);
    setPatientQuery('');
    setPatientResults([]);
    setSuccess(false);
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setPatientQuery('');
    setPatientResults([]);
    setExistingReports([]);
    resetForm();
  };

  const resetForm = () => {
    setReportName('');
    setReportCategory('');
    setReportType('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      toast.error('Only PDF, JPEG, PNG, or WebP files are allowed.');
      e.target.value = '';
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File must be smaller than ${MAX_FILE_MB} MB.`);
      e.target.value = '';
      return;
    }
    setFile(f);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return toast.error('Please select a patient first.');
    if (!reportName.trim()) return toast.error('Report name is required.');
    if (!reportCategory) return toast.error('Report category is required.');
    if (!reportType) return toast.error('Report type is required.');
    if (!file) return toast.error('Please choose a file to upload.');

    setUploading(true);
    setSuccess(false);

    try {
      await uploadPatientReport(selectedPatient.id, {
        report_name: reportName.trim(),
        report_category: reportCategory,
        report_type: reportType,
        file,
      });
      toast.success(`Report uploaded for ${selectedPatient.full_name}.`);
      setSuccess(true);
      resetForm();
      const res = await listPatientReportsForAdmin(selectedPatient.id);
      setExistingReports((res as any).data?.reports ?? []);
    } catch (err: any) {
      toast.error(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Patient Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload lab results, scans, or any medical report. The patient will see it in their{' '}
          <span className="text-primary font-medium">Health Passport</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══════════════ Left column ═══════════════ */}
        <div className="bg-card border rounded-2xl p-6 space-y-6">
          {/* Step indicator */}
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">1</div>
            <h2 className="text-sm font-bold uppercase tracking-widest">Select Patient</h2>
          </div>

          {/* Search */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Search Database</p>
            {selectedPatient ? (
              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <img
                    src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${selectedPatient.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                    alt={selectedPatient.full_name}
                    className="h-9 w-9 rounded-full shrink-0 bg-muted border border-white/10"
                  />
                  <div>
                    <p className="font-bold text-sm">{selectedPatient.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: #{selectedPatient.id.slice(0, 8)}
                      {selectedPatient.phone_number && <> · {selectedPatient.phone_number}</>}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={clearPatient}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <UserSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 rounded-xl"
                  placeholder="Search by patient name or phone nu..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
                {patientSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {patientResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-accent transition-colors flex items-center gap-3"
                        onClick={() => selectPatient(p)}
                      >
                        <img
                          src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${p.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                          alt={p.full_name}
                          className="h-8 w-8 rounded-full shrink-0 bg-muted border border-white/10"
                        />
                        <div>
                          <p className="font-semibold">{p.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            ID: #{p.id.slice(0, 8)}
                            {p.phone_number && <> · {p.phone_number}</>}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!patientSearching && patientQuery.length >= 2 && patientResults.length === 0 && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-sm px-4 py-3 text-sm text-muted-foreground">
                    No patients found.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent patients / existing reports */}
          {selectedPatient && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Previously Uploaded</p>
              {loadingReports ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading reports…
                </div>
              ) : existingReports.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No reports yet for {selectedPatient.full_name}.</p>
              ) : (
                <div className="divide-y">
                  {existingReports.map((report) => (
                    <div key={report.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{report.report_name}</p>
                          <p className="text-xs text-muted-foreground capitalize truncate">
                            {(report.report_category ?? '').replace('_', ' ')}
                            {report.report_type && report.report_type !== 'other'
                              ? ` · ${(REPORT_TYPE_LABELS as Record<string, string>)[report.report_type] ?? report.report_type}`
                              : ''
                            }
                            {' · '}{format(parseISO(report.uploaded_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <a
                        href={report.report_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0 ml-2"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ Right column ═══════════════ */}
        {selectedPatient ? (
          <div className="bg-card border rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">2</div>
              <h2 className="text-sm font-bold uppercase tracking-widest">Upload Report</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reportName">Report Name</Label>
                <Input
                  id="reportName"
                  className="rounded-xl"
                  placeholder="e.g. Complete Blood Count, Chest X-Ray"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={reportCategory} onValueChange={(v) => setReportCategory(v as ReportCategory)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(REPORT_CATEGORY_LABELS) as [ReportCategory, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(REPORT_TYPE_LABELS) as [ReportType, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* File picker */}
              <div className="space-y-1.5">
                <Label>File</Label>
                <div
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors hover:bg-muted/30 ${
                    file ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/20'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8 opacity-40" />
                      <p className="text-sm font-medium">Click to choose a file</p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {['PDF', 'DICOM', 'JPG/PNG'].map(t => (
                          <span key={t} className="text-[10px] font-bold uppercase tracking-wide bg-muted rounded-full px-2.5 py-1">{t}</span>
                        ))}
                      </div>
                      <p className="text-xs">max {MAX_FILE_MB} MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" disabled={uploading} className="flex-1 rounded-full">
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Uploading…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Process & Archive Report</>
                  )}
                </Button>
                {success && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 shrink-0">
                    <CheckCircle2 className="h-4 w-4" /> Done
                  </span>
                )}
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-card border rounded-2xl flex flex-col items-center justify-center text-center text-muted-foreground min-h-[400px] p-8">
            <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
              <UserSearch className="h-10 w-10 opacity-20" />
            </div>
            <p className="text-xl font-bold text-foreground">Select a patient first</p>
            <p className="text-sm mt-2 max-w-xs">
              Search and select a patient on the left to upload their report. You'll be able to drag and drop files once a patient is linked.
            </p>
          </div>
        )}
      </div>

      {/* Footer compliance bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            Secure 256-bit Encryption
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            HIPAA Compliant Storage
          </span>
        </div>
      </div>
    </div>
  );
};
