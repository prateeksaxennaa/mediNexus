import { useState, useEffect, useCallback } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowLeft, ArrowRight, Loader2, FileText, User, Stethoscope } from 'lucide-react';
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
import { format, parseISO, differenceInYears } from 'date-fns';
import { toast } from 'sonner';

import { doctorService, type DoctorAppointment } from '@/services/doctor.service';
import { MedicineSearchPanel } from './MedicineSearchPanel';
import { RxPad, RX_DROP_ZONE_ID, type RxItem, type PatientInfo, type DoctorLetterhead } from './RxPad';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtendedDoctorProfile {
  full_name: string;
  specialisation: string;
  qualifications?: string | null;
  registration_number?: string | null;
  department?: string | null;
}

// ─── Step 1: Patient Intake Form ─────────────────────────────────────────────

interface PatientIntakeFormProps {
  appointments: DoctorAppointment[];
  loadingAppts: boolean;
  selectedApptId: string;
  patientInfo: PatientInfo;
  onApptChange: (apptId: string) => void;
  onPatientInfoChange: (field: keyof PatientInfo, value: string) => void;
  onContinue: () => void;
}

const PatientIntakeForm = ({
  appointments,
  loadingAppts,
  selectedApptId,
  patientInfo,
  onApptChange,
  onPatientInfoChange,
  onContinue,
}: PatientIntakeFormProps) => {
  const canContinue =
    selectedApptId &&
    patientInfo.name.trim() &&
    patientInfo.age.trim() &&
    patientInfo.gender.trim();

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary mb-3">
            <User className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-wide">Step 1 of 2</span>
          </div>
          <h2 className="text-2xl font-light tracking-tight">Patient Intake</h2>
          <p className="text-sm text-muted-foreground">
            Select the appointment and confirm patient details before writing the prescription.
          </p>
        </div>

        {/* Appointment selector */}
        <div className="space-y-2">
          <Label>Appointment</Label>
          {loadingAppts ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading appointments…
            </div>
          ) : (
            <Select value={selectedApptId} onValueChange={onApptChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select appointment…" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {appointments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.patients?.full_name ?? 'Patient'} —{' '}
                    {a.appointment_slots
                      ? format(parseISO(a.appointment_slots.slot_start), 'MMM d, h:mm a')
                      : a.id.slice(0, 8)}{' '}
                    [{a.status}]
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Patient fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Patient Name</Label>
            <Input
              placeholder="Full name"
              value={patientInfo.name}
              onChange={(e) => onPatientInfoChange('name', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Age (years)</Label>
            <Input
              type="number"
              min="0"
              max="150"
              placeholder="e.g. 35"
              value={patientInfo.age}
              onChange={(e) => onPatientInfoChange('age', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={patientInfo.gender}
              onValueChange={(val) => onPatientInfoChange('gender', val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Weight (kg) <span className="text-muted-foreground font-normal text-xs">optional</span></Label>
            <Input
              type="number"
              min="0"
              placeholder="e.g. 70"
              value={patientInfo.weight}
              onChange={(e) => onPatientInfoChange('weight', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Blood Group <span className="text-muted-foreground font-normal text-xs">pre-filled</span></Label>
            <Input
              value={patientInfo.blood_group ?? ''}
              onChange={(e) => onPatientInfoChange('blood_group', e.target.value)}
              placeholder="e.g. O+"
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Known Allergies <span className="text-muted-foreground font-normal text-xs">pre-filled</span></Label>
            <Input
              value={patientInfo.known_allergies ?? ''}
              onChange={(e) => onPatientInfoChange('known_allergies', e.target.value)}
              placeholder="None known"
            />
          </div>
        </div>

        <Button
          className="w-full"
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue to Prescription
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

// ─── Prescription Writer ──────────────────────────────────────────────────────

interface PrescriptionWriterProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export const PrescriptionWriter = ({ onCancel, onSuccess }: PrescriptionWriterProps) => {
  const [step, setStep] = useState<1 | 2>(1);

  // Doctor profile for letterhead
  const [doctor, setDoctor] = useState<ExtendedDoctorProfile>({
    full_name: 'Doctor',
    specialisation: '',
  });

  // Appointments
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [selectedApptId, setSelectedApptId] = useState('');

  // Patient intake
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: '',
    age: '',
    gender: '',
    weight: '',
    blood_group: null,
    known_allergies: null,
  });

  // Prescription content
  const [illnessDescription, setIllnessDescription] = useState('');
  const [rxItems, setRxItems] = useState<RxItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // dnd-kit sensors — require 8px drag movement to start
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Load doctor profile + appointments on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, apptRes] = await Promise.all([
          doctorService.getProfile(),
          doctorService.listAppointments('all'),
        ]);
        const d = (profileRes as any).data?.doctor;
        if (d) {
          setDoctor({
            full_name: d.full_name,
            specialisation: d.specialisation,
            qualifications: d.qualifications ?? null,
            registration_number: d.registration_number ?? null,
            department: d.department ?? null,
          });
        }
        const allAppts: DoctorAppointment[] = (apptRes as any).data?.appointments ?? [];
        setAppointments(
          allAppts.filter((a) =>
            ['booked', 'checked_in', 'in_progress'].includes(a.status)
          )
        );
      } catch (e: any) {
        toast.error(e.message ?? 'Failed to load data');
      } finally {
        setLoadingAppts(false);
      }
    };
    load();
  }, []);

  // When appointment changes, pre-fill patient fields
  const handleApptChange = useCallback(
    (apptId: string) => {
      setSelectedApptId(apptId);
      const appt = appointments.find((a) => a.id === apptId);
      if (!appt) return;

      const p = appt.patients;
      const age = p?.dob
        ? String(differenceInYears(new Date(), parseISO(p.dob)))
        : '';

      setPatientInfo({
        name: p?.full_name ?? '',
        age,
        gender: '',
        weight: '',
        blood_group: p?.blood_group ?? null,
        known_allergies: p?.known_allergies ?? null,
      });
    },
    [appointments]
  );

  const handlePatientInfoChange = useCallback((field: keyof PatientInfo, value: string) => {
    setPatientInfo((prev) => ({ ...prev, [field]: value }));
  }, []);

  // DnD: when a medicine card is dropped onto the Rx pad
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { over, active } = event;
    if (over?.id !== RX_DROP_ZONE_ID) return;

    const medicine = active.data.current?.medicine;
    if (!medicine) return;

    // Prevent duplicates
    if (rxItems.some((item) => item.medicine.id === medicine.id)) {
      toast.info(`${medicine.medicine_name} is already on the prescription`);
      return;
    }

    setRxItems((prev) => [
      ...prev,
      { medicine, dosage: '', frequency: '', duration: '', doctor_comment: '' },
    ]);
  }, [rxItems]);

  const handleRxItemChange = useCallback(
    (index: number, field: keyof RxItem, value: string) => {
      setRxItems((prev) => {
        const updated = [...prev];
        (updated[index] as any)[field] = value;
        return updated;
      });
    },
    []
  );

  const handleRxItemRemove = useCallback((index: number) => {
    setRxItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Derive selected appointment's hospital info
  const selectedAppt = appointments.find((a) => a.id === selectedApptId);
  const hospitalName = selectedAppt?.hospitals?.name ?? 'Hospital';
  const hospitalCity = selectedAppt?.hospitals?.city ?? '';

  const handleSubmit = async () => {
    if (!selectedApptId) {
      toast.error('No appointment selected');
      return;
    }

    const validItems = rxItems.filter(
      (it) => it.dosage.trim() && it.frequency.trim() && it.duration.trim()
    );
    if (validItems.length === 0) {
      toast.error('Add at least one medicine with dosage, frequency, and duration filled in');
      return;
    }

    setSubmitting(true);
    try {
      await doctorService.createPrescription(selectedApptId, {
        illness_description: illnessDescription.trim() || undefined,
        items: validItems.map((it) => ({
          medicine_id: it.medicine.id,
          dosage: it.dosage,
          frequency: it.frequency,
          duration: it.duration,
          doctor_comment: it.doctor_comment.trim() || undefined,
        })),
      });
      toast.success('Prescription issued successfully');
      onSuccess();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to issue prescription');
    } finally {
      setSubmitting(false);
    }
  };

  const today = format(new Date(), 'MMMM d, yyyy');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background/95 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Stethoscope className="h-4 w-4" />
            <span className="font-medium text-foreground">New Prescription</span>
          </div>
        </div>

        {step === 2 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {rxItems.length} medicine{rxItems.length !== 1 ? 's' : ''} added
            </span>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || rxItems.length === 0}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Issue Prescription
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {step === 1 ? (
        <PatientIntakeForm
          appointments={appointments}
          loadingAppts={loadingAppts}
          selectedApptId={selectedApptId}
          patientInfo={patientInfo}
          onApptChange={handleApptChange}
          onPatientInfoChange={handlePatientInfoChange}
          onContinue={() => setStep(2)}
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left panel */}
            <div className="w-[380px] flex-shrink-0 border-r overflow-hidden flex flex-col">
              <MedicineSearchPanel
                illnessDescription={illnessDescription}
                onIllnessDescriptionChange={setIllnessDescription}
                rxItems={rxItems}
                patientAllergies={patientInfo.known_allergies}
                patientBloodGroup={patientInfo.blood_group}
              />
            </div>

            {/* Right panel */}
            <div className="flex-1 overflow-hidden flex flex-col p-5 bg-muted/20">
              <RxPad
                doctor={doctor as DoctorLetterhead}
                hospitalName={hospitalName}
                hospitalCity={hospitalCity}
                patient={patientInfo}
                illnessDescription={illnessDescription}
                issuedDate={today}
                items={rxItems}
                onItemChange={handleRxItemChange}
                onItemRemove={handleRxItemRemove}
              />
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
};
