import { useDroppable } from '@dnd-kit/core';
import { Trash2, ClipboardPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { IconHeartbeat } from '@tabler/icons-react';
import type { MedicineResult } from '@/services/doctor.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RxItem {
  medicine: MedicineResult;
  dosage: string;
  frequency: string;
  duration: string;
  doctor_comment: string;
}

export interface PatientInfo {
  name: string;
  age: string;
  gender: string;
  weight: string;
  blood_group: string | null;
  known_allergies: string | null;
}

export const RX_DROP_ZONE_ID = 'rx-drop-zone';

// ─── Extended doctor profile for letterhead ──────────────────────────────────

export interface DoctorLetterhead {
  full_name: string;
  specialisation: string;
  qualifications?: string | null;
  registration_number?: string | null;
  department?: string | null;
}

// ─── Individual Rx row ───────────────────────────────────────────────────────

interface RxRowProps {
  item: RxItem;
  index: number;
  onChange: (index: number, field: keyof RxItem, value: string) => void;
  onRemove: (index: number) => void;
}

const RxRow = ({ item, index, onChange, onRemove }: RxRowProps) => (
  <div className="group py-3 border-b border-dashed border-gray-200 last:border-0">
    {/* Medicine name row */}
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex items-start gap-2">
        <span className="text-gray-400 font-serif text-sm mt-0.5 select-none">
          {index + 1}.
        </span>
        <div>
          <p className="font-medium text-gray-900 text-sm leading-tight">
            {item.medicine.medicine_name}
          </p>
          {item.medicine.therapeutic_class && (
            <p className="text-[11px] text-gray-400">{item.medicine.therapeutic_class}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 flex-shrink-0 mt-0.5"
        type="button"
        title="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>

    {/* Inline editable fields */}
    <div className="grid grid-cols-3 gap-2 ml-5">
      <div>
        <p className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Dosage</p>
        <Input
          className="h-7 text-xs border-gray-200 focus:border-gray-400 bg-gray-50/50"
          placeholder="e.g. 500mg"
          value={item.dosage}
          onChange={(e) => onChange(index, 'dosage', e.target.value)}
        />
      </div>
      <div>
        <p className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Frequency</p>
        <Input
          className="h-7 text-xs border-gray-200 focus:border-gray-400 bg-gray-50/50"
          placeholder="e.g. twice daily"
          value={item.frequency}
          onChange={(e) => onChange(index, 'frequency', e.target.value)}
        />
      </div>
      <div>
        <p className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Duration</p>
        <Input
          className="h-7 text-xs border-gray-200 focus:border-gray-400 bg-gray-50/50"
          placeholder="e.g. 7 days"
          value={item.duration}
          onChange={(e) => onChange(index, 'duration', e.target.value)}
        />
      </div>
    </div>

    <div className="ml-5 mt-2">
      <p className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Note (optional)</p>
      <Input
        className="h-7 text-xs border-gray-200 focus:border-gray-400 bg-gray-50/50"
        placeholder="Doctor's note or instruction…"
        value={item.doctor_comment}
        onChange={(e) => onChange(index, 'doctor_comment', e.target.value)}
      />
    </div>
  </div>
);

// ─── Rx Pad ──────────────────────────────────────────────────────────────────

interface RxPadProps {
  doctor: DoctorLetterhead;
  hospitalName: string;
  hospitalCity: string;
  patient: PatientInfo;
  illnessDescription: string;
  issuedDate: string;
  items: RxItem[];
  onItemChange: (index: number, field: keyof RxItem, value: string) => void;
  onItemRemove: (index: number) => void;
}

export const RxPad = ({
  doctor,
  hospitalName,
  hospitalCity,
  patient,
  illnessDescription,
  issuedDate,
  items,
  onItemChange,
  onItemRemove,
}: RxPadProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: RX_DROP_ZONE_ID });

  return (
    <div className="h-full overflow-y-auto bg-white rounded-xl border shadow-sm flex flex-col">
      {/* ── Letterhead ── */}
      <div className="px-7 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-b from-blue-50/40 to-white flex-shrink-0">
        <div className="flex items-start justify-between">
          {/* Left: branding */}
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <IconHeartbeat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-serif text-base font-medium text-gray-900 leading-tight">
                mediNexus
              </p>
              <p className="text-[11px] text-gray-500">{hospitalName}{hospitalCity ? `, ${hospitalCity}` : ''}</p>
            </div>
          </div>

          {/* Right: doctor info */}
          <div className="text-right">
            <p className="font-semibold text-gray-900 text-sm">{doctor.full_name}</p>
            <p className="text-xs text-gray-500">{doctor.specialisation}</p>
            {doctor.qualifications && (
              <p className="text-[11px] text-gray-400">{doctor.qualifications}</p>
            )}
            {doctor.registration_number && (
              <p className="text-[10px] text-gray-400 font-mono">
                Reg. {doctor.registration_number}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Patient bar ── */}
      <div className="px-7 py-3 bg-gray-50/60 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <p className="font-medium text-gray-900 text-sm">{patient.name || '—'}</p>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
              {patient.age && <span>{patient.age} yrs</span>}
              {patient.gender && <span>· {patient.gender}</span>}
              {patient.weight && <span>· {patient.weight} kg</span>}
              {patient.blood_group && <span>· {patient.blood_group}</span>}
            </div>
            {patient.known_allergies && (
              <p className="text-[10px] text-amber-600 mt-0.5">
                Allergies: {patient.known_allergies}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400">Date</p>
            <p className="text-xs text-gray-700 font-medium">{issuedDate}</p>
            {illnessDescription && (
              <p className="text-[11px] text-gray-500 mt-1 max-w-[180px] text-right leading-snug">
                {illnessDescription}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Rx Symbol + Drop zone ── */}
      <div className="flex-1 flex flex-col px-7 pt-4 pb-6 min-h-0">
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <span className="font-serif text-3xl text-gray-700 leading-none select-none">℞</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* Drop zone */}
        <div
          ref={setNodeRef}
          className={`
            flex-1 rounded-xl border-2 border-dashed transition-all duration-150
            ${isOver
              ? 'border-primary/70 bg-primary/5 shadow-inner'
              : items.length === 0
                ? 'border-gray-200 bg-gray-50/30'
                : 'border-transparent bg-transparent'
            }
          `}
        >
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[180px] gap-3 text-center px-6">
              <div
                className={`rounded-full p-4 transition-colors ${isOver ? 'bg-primary/10' : 'bg-gray-100'}`}
              >
                <ClipboardPlus
                  className={`h-6 w-6 transition-colors ${isOver ? 'text-primary' : 'text-gray-300'}`}
                />
              </div>
              <p className={`text-sm transition-colors ${isOver ? 'text-primary font-medium' : 'text-gray-300'}`}>
                {isOver ? 'Release to add medicine' : 'Drag medicines here'}
              </p>
            </div>
          ) : (
            <div className="px-2 py-1">
              {items.map((item, idx) => (
                <RxRow
                  key={`${item.medicine.id}-${idx}`}
                  item={item}
                  index={idx}
                  onChange={onItemChange}
                  onRemove={onItemRemove}
                />
              ))}

              {/* Visual hint for adding more */}
              {isOver && (
                <div className="flex items-center justify-center py-3 text-primary/60 text-xs gap-1.5 border-t border-dashed border-primary/20 mt-2">
                  <ClipboardPlus className="h-3.5 w-3.5" />
                  <span>Release to add</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Signature line ── */}
      <div className="px-7 pb-6 flex-shrink-0">
        <div className="flex items-end justify-end">
          <div className="text-center">
            <div className="border-b border-gray-300 w-40 mb-1" />
            <p className="text-[11px] text-gray-500">Doctor's Signature</p>
            <p className="text-[10px] text-gray-400 font-medium">{doctor.full_name}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
