import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, User, Phone, Search,
  Lock, Info, Trash2, CalendarX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  hospitalService,
  type AdminDoctorSlot,
  type AdminDoctorSlotStatus,
  type HospitalDoctor,
} from '@/services/hospital.service';
import { searchHospitalPatients, type HospitalPatient } from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';

// ─── Status styling ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<AdminDoctorSlotStatus, { dot: string; bg: string; text: string; border: string }> = {
  available: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/5',  text: 'text-emerald-500', border: 'border-emerald-500/20' },
  booked:    { dot: 'bg-violet-500',  bg: 'bg-violet-500/5',   text: 'text-violet-500',  border: 'border-violet-500/20' },
  locked:    { dot: 'bg-yellow-500',  bg: 'bg-yellow-500/5',   text: 'text-yellow-500',  border: 'border-yellow-500/20' },
  blocked:   { dot: 'bg-red-500',     bg: 'bg-red-500/5',      text: 'text-red-500',     border: 'border-red-500/20' },
  cancelled: { dot: 'bg-muted-foreground', bg: 'bg-muted/30', text: 'text-muted-foreground', border: 'border-border' },
};

const STATUS_LABEL: Record<AdminDoctorSlotStatus, string> = {
  available: 'Available',
  booked:    'Booked',
  locked:    'Locked',
  blocked:   'Blocked',
  cancelled: 'Cancelled',
};

const BOOKING_TYPE_COLORS: Record<string, string> = {
  online:   'bg-indigo-500/10 text-indigo-500',
  walk_in:  'bg-orange-500/10 text-orange-500',
  referral: 'bg-purple-500/10 text-purple-500',
};

// ─── Walk-in Dialog ───────────────────────────────────────────────────────────

interface WalkInDialogProps {
  doctorId: string;
  slot: AdminDoctorSlot;
  onClose: () => void;
  onSuccess: (updated: AdminDoctorSlot) => void;
}

const WalkInDialog = ({ doctorId, slot, onClose, onSuccess }: WalkInDialogProps) => {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<HospitalPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<HospitalPatient | null>(null);
  const [notes, setNotes] = useState('');
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await searchHospitalPatients(query.trim());
      setPatients((res as any).data?.patients ?? []);
    } catch {
      toast.error('Failed to search patients');
    } finally {
      setSearching(false);
    }
  };

  const handleBook = async () => {
    if (!selectedPatient) return;
    setBooking(true);
    try {
      await hospitalService.bookWalkIn(doctorId, {
        slot_id: slot.id,
        patient_id: selectedPatient.id,
        notes: notes.trim() || undefined,
      });
      toast.success(`Walk-in booked for ${selectedPatient.full_name}`);
      onSuccess({ ...slot, status: 'booked' });
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to book walk-in');
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border rounded-2xl w-full max-w-md mx-4 p-6 space-y-4 shadow-2xl">
        <h2 className="text-lg font-bold">Book Walk-in</h2>
        <p className="text-sm text-muted-foreground">
          Slot: <strong>{format(parseISO(slot.slot_start), 'h:mm a')} – {format(parseISO(slot.slot_end), 'h:mm a')}</strong>
        </p>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Search Patient</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name or phone..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" variant="outline" onClick={handleSearch} disabled={searching} className="rounded-xl">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {patients.length > 0 && (
            <div className="max-h-36 overflow-y-auto border rounded-xl divide-y">
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatient(p); setPatients([]); setQuery(p.full_name); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${selectedPatient?.id === p.id ? 'bg-muted' : ''}`}
                >
                  <div className="font-medium">{p.full_name}</div>
                  {p.phone_number && <div className="text-muted-foreground text-xs">{p.phone_number}</div>}
                </button>
              ))}
            </div>
          )}

          {selectedPatient && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <User className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-emerald-600">{selectedPatient.full_name}</span>
              <button onClick={() => { setSelectedPatient(null); setQuery(''); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Reason for visit..."
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={booking} className="rounded-full px-4">Cancel</Button>
          <Button size="sm" onClick={handleBook} disabled={!selectedPatient || booking} className="rounded-full px-4">
            {booking ? 'Booking…' : 'Confirm Walk-in'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Slot Card ────────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: AdminDoctorSlot;
  doctorId: string;
  onSlotUpdate: (updated: AdminDoctorSlot) => void;
  onSlotDelete: (slotId: string) => void;
}

const SlotCard = ({ slot, doctorId, onSlotUpdate, onSlotDelete }: SlotCardProps) => {
  const [loading, setLoading] = useState(false);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const start = parseISO(slot.slot_start);
  const end   = parseISO(slot.slot_end);
  const style = STATUS_STYLES[slot.status] ?? STATUS_STYLES.cancelled;

  const lockExpiry = slot.locked_until ? parseISO(slot.locked_until) : null;
  const lockMinsLeft = lockExpiry ? Math.max(0, Math.ceil((lockExpiry.getTime() - Date.now()) / 60000)) : null;

  const handleBlock = async () => {
    setLoading(true);
    try {
      const res = await hospitalService.blockDoctorSlot(doctorId, slot.id);
      onSlotUpdate((res as any).data?.slot ?? { ...slot, status: 'blocked' });
      toast.success('Slot blocked');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to block slot');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async () => {
    setLoading(true);
    try {
      const res = await hospitalService.unblockDoctorSlot(doctorId, slot.id);
      onSlotUpdate((res as any).data?.slot ?? { ...slot, status: 'available' });
      toast.success('Slot unblocked');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to unblock slot');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setLoading(true);
    try {
      await hospitalService.deleteDoctorSlot(doctorId, slot.id);
      onSlotDelete(slot.id);
      toast.success('Slot deleted');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete slot');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!slot.appointment) return;
    setConfirmCancel(false);
    setLoading(true);
    try {
      await hospitalService.cancelDoctorAppointment(doctorId, slot.appointment.id);
      onSlotUpdate({ ...slot, status: 'available', appointment: null });
      toast.success('Appointment cancelled — slot freed');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to cancel appointment');
    } finally {
      setLoading(false);
    }
  };

  const patient = slot.appointment?.patients;

  return (
    <>
      <div className={`rounded-2xl border p-5 space-y-3 transition-all ${style.bg} ${style.border}`}>
        {/* Time row + status */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold">
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </p>
            <span className={`mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 ${style.bg} ${style.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              {STATUS_LABEL[slot.status]}
            </span>
          </div>
          {slot.status !== 'booked' && slot.status !== 'locked' && slot.status !== 'cancelled' && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              className="h-8 w-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
              title="Delete slot"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Booked patient */}
        {slot.status === 'booked' && patient && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <img
                src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${patient.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                alt={patient.full_name}
                className="h-8 w-8 rounded-lg shrink-0 border border-white/10 bg-muted"
              />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{patient.full_name}</p>
                {patient.phone_number && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {patient.phone_number}
                  </p>
                )}
              </div>
            </div>
            {slot.appointment?.booking_type && (
              <span className={`inline-block text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5 ${BOOKING_TYPE_COLORS[slot.appointment.booking_type] ?? 'bg-muted text-muted-foreground'}`}>
                {slot.appointment.booking_type.replace('_', ' ')}
              </span>
            )}
          </div>
        )}

        {/* Locked info */}
        {slot.status === 'locked' && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-500">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Patient mid-booking{lockMinsLeft !== null ? ` (~${lockMinsLeft}m left)` : ''}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {slot.status === 'available' && (
            <>
              <button
                onClick={handleBlock}
                disabled={loading}
                className="h-7 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Block
              </button>
              <button
                onClick={() => setShowWalkIn(true)}
                disabled={loading}
                className="h-7 rounded-full bg-primary text-primary-foreground px-3 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Walk-in
              </button>
            </>
          )}
          {slot.status === 'blocked' && (
            <>
              <button
                onClick={handleUnblock}
                disabled={loading}
                className="h-7 rounded-full border border-border px-3 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Unblock
              </button>
              <button
                onClick={() => setShowWalkIn(true)}
                disabled={loading}
                className="h-7 rounded-full bg-primary text-primary-foreground px-3 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Walk-in
              </button>
            </>
          )}
          {slot.status === 'booked' && slot.appointment && (
            <button
              onClick={() => setConfirmCancel(true)}
              disabled={loading}
              className="h-7 rounded-full border border-destructive/30 text-destructive px-3 text-xs font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              Cancel Appointment
            </button>
          )}
          {slot.status === 'locked' && (
            <span className="text-xs text-muted-foreground italic">Read-only while locked</span>
          )}
          {slot.status === 'cancelled' && (
            <span className="text-xs text-muted-foreground italic">Cancelled</span>
          )}
        </div>
      </div>

      {/* Walk-in Dialog */}
      {showWalkIn && (
        <WalkInDialog
          doctorId={doctorId}
          slot={slot}
          onClose={() => setShowWalkIn(false)}
          onSuccess={(updated) => { onSlotUpdate(updated); setShowWalkIn(false); }}
        />
      )}

      {/* Cancel confirmation */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl max-w-sm w-full mx-4 p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold">Cancel appointment?</h3>
            <p className="text-sm text-muted-foreground">
              This will cancel the appointment for <strong>{patient?.full_name ?? 'this patient'}</strong> and free the slot for new bookings.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmCancel(false)} className="rounded-full px-4">Keep</Button>
              <Button size="sm" variant="destructive" onClick={handleCancel} className="rounded-full px-4">Yes, cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl max-w-sm w-full mx-4 p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold">Delete slot?</h3>
            <p className="text-sm text-muted-foreground">
              This will permanently remove the <strong>{format(start, 'h:mm a')}</strong> slot. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} className="rounded-full px-4">Keep</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} className="rounded-full px-4">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AdminDoctorSlots = () => {
  const [doctors, setDoctors]       = useState<HospitalDoctor[]>([]);
  const [doctorId, setDoctorId]     = useState<string>('');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [slots, setSlots]           = useState<AdminDoctorSlot[]>([]);
  const [loading, setLoading]       = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  const dateStr = format(currentDate, 'yyyy-MM-dd');

  useEffect(() => {
    setLoadingDoctors(true);
    hospitalService
      .listDoctors()
      .then(res => {
        const list: HospitalDoctor[] = (res as any).data?.doctors ?? [];
        setDoctors(list);
        if (list.length > 0) setDoctorId(list[0].id);
      })
      .catch(() => toast.error('Failed to load doctors'))
      .finally(() => setLoadingDoctors(false));
  }, []);

  const fetchSlots = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    try {
      const res = await hospitalService.listDoctorSlots(doctorId, dateStr);
      setSlots((res as any).data?.slots ?? []);
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setLoading(false);
    }
  }, [doctorId, dateStr]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const handleSlotUpdate = (updated: AdminDoctorSlot) => {
    setSlots(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const handleSlotDelete = (slotId: string) => {
    setSlots(prev => prev.filter(s => s.id !== slotId));
  };



  const slotsByStatus = {
    available: slots.filter(s => s.status === 'available'),
    booked:    slots.filter(s => s.status === 'booked'),
    blocked:   slots.filter(s => s.status === 'blocked'),
    locked:    slots.filter(s => s.status === 'locked'),
    cancelled: slots.filter(s => s.status === 'cancelled'),
  };

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Doctor Slots</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage and schedule availability for medical consultations across your clinical team.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <p className="text-foreground/80">
          Any changes made to the slot timings will be <strong className="text-primary">propagated in real time</strong> to the patient app. Please ensure accuracy before confirming the schedule to maintain clinical continuity.
        </p>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Practitioner selector */}
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select Practitioner</p>
          <Select value={doctorId} onValueChange={setDoctorId} disabled={loadingDoctors}>
            <SelectTrigger className="h-10 min-w-[240px] rounded-xl bg-card border text-sm">
              <SelectValue placeholder={loadingDoctors ? 'Loading…' : 'Select doctor'} />
            </SelectTrigger>
            <SelectContent>
              {doctors.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.full_name}{d.specialisation ? ` (${d.specialisation})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full border" onClick={() => setCurrentDate(d => subDays(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
              isToday(currentDate)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border hover:border-primary/30'
            }`}
          >
            {isToday(currentDate) ? 'Today' : format(currentDate, 'EEE, MMM d')}
          </button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full border" onClick={() => setCurrentDate(d => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Slot stats summary */}
      {!loading && slots.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {([
            { label: 'Available', count: slotsByStatus.available.length, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: 'Booked',    count: slotsByStatus.booked.length,    color: 'text-violet-500',  bg: 'bg-violet-500/10' },
            { label: 'Blocked',   count: slotsByStatus.blocked.length,   color: 'text-red-500',     bg: 'bg-red-500/10' },
            { label: 'Locked',    count: slotsByStatus.locked.length,    color: 'text-yellow-500',  bg: 'bg-yellow-500/10' },
          ] as const).filter(s => s.count > 0).map(s => (
            <div key={s.label} className={`flex items-center gap-2 text-sm rounded-full px-4 py-1.5 ${s.bg}`}>
              <span className={`font-bold ${s.color}`}>{s.count}</span>
              <span className="text-muted-foreground text-xs">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Slot grid / empty state */}
      {loading ? (
        <div className="bg-card border rounded-2xl p-12 text-center">
          <div className="text-sm text-muted-foreground animate-pulse">Loading slots…</div>
        </div>
      ) : slots.length === 0 ? (
        <div className="bg-card border rounded-2xl py-20 px-8 text-center space-y-4">
          <div className="flex justify-center gap-3 opacity-20">
            <CalendarX className="h-16 w-16 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xl font-bold">No slots found</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              {doctorId
                ? `There are no consultation slots defined for the selected date. Start by creating a recurring schedule or add a one-off custom slot.`
                : 'Select a doctor to view their slots.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {slots.map(slot => (
            <SlotCard
              key={slot.id}
              slot={slot}
              doctorId={doctorId}
              onSlotUpdate={handleSlotUpdate}
              onSlotDelete={handleSlotDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
