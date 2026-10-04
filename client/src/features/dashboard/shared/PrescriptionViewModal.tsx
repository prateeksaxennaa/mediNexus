import { useState, useEffect } from 'react';
import { Loader2, Download, X, Heart } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  PrescriptionPDFDocument,
  type PDFPrescriptionData,
} from './PrescriptionPDFDocument';

export type { PDFPrescriptionData };
import { format, parseISO, differenceInYears } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────────────────────

type FetchFn = (id: string) => Promise<PDFPrescriptionData>;

export interface PrescriptionViewModalProps {
  open: boolean;
  onClose: () => void;
  prescriptionId: string;
  label?: string;
  fetchData: FetchFn;
}

// ─── Normaliser ──────────────────────────────────────────────────────────────

export function normalizePrescriptionData(raw: any): PDFPrescriptionData {
  const doctorInfo = raw.doctors ?? null;
  const appt = raw.appointments ?? null;
  const hospital = appt?.hospitals ?? null;
  const patient = raw.patients ?? null;

  const items: PDFPrescriptionData['items'] = (raw.prescription_items ?? []).map((item: any) => ({
    id: item.id,
    medicine_name: item.medicines?.medicine_name ?? item.medicine_id,
    therapeutic_class: item.medicines?.therapeutic_class ?? null,
    dosage: item.dosage,
    frequency: item.frequency,
    duration: item.duration,
    doctor_comment: item.doctor_comment && item.doctor_comment !== 'null' ? item.doctor_comment : null,
  }));

  return {
    id: raw.id,
    issued_at: raw.issued_at,
    illness_description: raw.illness_description ?? null,
    pdf_url: raw.pdf_url ?? null,
    doctor: doctorInfo
      ? {
          full_name: doctorInfo.full_name,
          specialisation: doctorInfo.specialisation,
          qualifications: doctorInfo.qualifications ?? null,
          registration_number: doctorInfo.registration_number ?? null,
          department: doctorInfo.department ?? null,
        }
      : null,
    patient: patient
      ? {
          full_name: patient.full_name,
          dob: patient.dob ?? null,
          blood_group: patient.blood_group ?? null,
          known_allergies: patient.known_allergies ?? null,
        }
      : null,
    hospital,
    items,
  };
}

// ─── HTML Prescription Preview ───────────────────────────────────────────────

function RxPreview({ data }: { data: PDFPrescriptionData }) {
  const doctor = data.doctor;
  const patient = data.patient;
  const hospital = data.hospital;

  const patientAge = patient?.dob
    ? differenceInYears(new Date(), parseISO(patient.dob))
    : null;

  const issuedDate = format(parseISO(data.issued_at), 'MMMM d, yyyy');

  const hospitalLabel = hospital
    ? `${hospital.name}${hospital.city ? `, ${hospital.city}` : ''}`
    : 'mediNexus';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm font-sans text-gray-900 overflow-hidden">
      {/* ── Letterhead ── */}
      <div className="px-10 pt-7 pb-5 border-b border-gray-100 bg-gradient-to-b from-blue-50/40 to-white">
        <div className="flex items-start justify-between">
          {/* Left: branding */}
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Heart className="h-5 w-5 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-serif text-base font-semibold text-gray-900 leading-tight">
                mediNexus
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{hospitalLabel}</p>
            </div>
          </div>

          {/* Right: doctor info */}
          {doctor && (
            <div className="text-right">
              <p className="font-semibold text-gray-900 text-sm">{doctor.full_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{doctor.specialisation}</p>
              {doctor.qualifications && (
                <p className="text-xs text-gray-400 mt-0.5">{doctor.qualifications}</p>
              )}
              {doctor.registration_number && (
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                  Reg. {doctor.registration_number}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Patient bar ── */}
      <div className="px-10 py-4 bg-gray-50/60 border-b border-gray-100">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <p className="font-medium text-gray-900 text-sm">{patient?.full_name ?? '—'}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
              {patientAge != null && <span>{patientAge} yrs</span>}
              {patient?.blood_group && <span>· {patient.blood_group}</span>}
            </div>
            {patient?.known_allergies && (
              <p className="text-xs text-amber-600 mt-0.5">
                Allergies: {patient.known_allergies}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-400">Date</p>
            <p className="text-sm text-gray-700 font-medium mt-0.5">{issuedDate}</p>
            {data.illness_description && (
              <p className="text-xs text-gray-500 mt-1 max-w-[240px] text-right leading-snug">
                {data.illness_description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Rx Symbol + items ── */}
      <div className="px-10 pt-6 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-serif text-3xl text-gray-700 leading-none select-none">℞</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {data.items.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No medicines prescribed.</p>
        ) : (
          <div className="space-y-0">
            {data.items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-start justify-between py-4 border-b border-dashed border-gray-100 last:border-0"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="text-xs text-gray-400 font-serif mt-0.5 w-5 shrink-0">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-tight">
                      {item.medicine_name}
                    </p>
                    {item.therapeutic_class && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.therapeutic_class}</p>
                    )}
                    {item.doctor_comment && item.doctor_comment !== 'null' && (
                      <p className="text-xs text-gray-500 italic mt-1">{item.doctor_comment}</p>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600 space-y-0.5 shrink-0 ml-6">
                  <p className="font-semibold text-gray-800">{item.dosage}</p>
                  <p className="text-xs text-gray-500">{item.frequency} · {item.duration}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Signature ── */}
      <div className="px-10 pb-7 flex justify-end">
        <div className="text-center">
          <div className="border-b border-gray-300 w-44 mb-1.5" />
          <p className="text-xs text-gray-500">Doctor's Signature</p>
          {doctor && (
            <p className="text-xs text-gray-400 font-medium mt-0.5">{doctor.full_name}</p>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-10 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <p className="text-[10px] text-gray-300">mediNexus — Digital Health Record</p>
        <p className="text-[10px] text-gray-300 font-mono">{data.id}</p>
      </div>
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export const PrescriptionViewModal = ({
  open,
  onClose,
  prescriptionId,
  label,
  fetchData,
}: PrescriptionViewModalProps) => {
  const [data, setData] = useState<PDFPrescriptionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setData(null);

    fetchData(prescriptionId)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? 'Failed to load prescription'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open, prescriptionId, fetchData]);

  const fileName = data
    ? `prescription-${(data.patient?.full_name ?? 'patient').replace(/\s+/g, '-').toLowerCase()}-${format(parseISO(data.issued_at), 'yyyy-MM-dd')}.pdf`
    : 'prescription.pdf';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl w-full p-0 gap-0 overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-3 border-b flex-shrink-0 gap-0">
          <DialogTitle className="text-sm font-medium text-foreground">
            {label ?? 'Prescription Preview'}
          </DialogTitle>
          <div className="flex items-center gap-2 ml-auto">
            {data && (
              <PDFDownloadLink
                document={<PrescriptionPDFDocument data={data} />}
                fileName={fileName}
              >
                {({ loading: pdfLoading }) => (
                  <Button size="sm" variant="outline" disabled={pdfLoading} className="h-8 text-xs">
                    {pdfLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      : <Download className="h-3.5 w-3.5 mr-1.5" />
                    }
                    Download PDF
                  </Button>
                )}
              </PDFDownloadLink>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-muted/20 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-20 text-destructive text-sm">
              {error}
            </div>
          )}

          {data && !loading && <RxPreview data={data} />}
        </div>
      </DialogContent>
    </Dialog>
  );
};
