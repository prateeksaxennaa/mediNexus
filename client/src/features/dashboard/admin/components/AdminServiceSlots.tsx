import { useEffect, useRef, useState } from 'react';
import {
  Calendar, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  Loader2, XCircle, Settings, AlertCircle, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  hospitalService, type HospitalService, type ServiceSlot,
} from '@/services/hospital.service';
import {
  format, addDays, startOfWeek, eachDayOfInterval, parseISO,
} from 'date-fns';

const parseLocalDate = (dateStr: string): Date => parseISO(dateStr);
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const isSunday = (dateStr: string) => parseLocalDate(dateStr).getDay() === 0;

const emptyGenerateForm = () => ({
  startDate: todayStr(),
  endDate: todayStr(),
  numberOfSlots: 10,
});

export const AdminServiceSlots = () => {
  const [services, setServices] = useState<HospitalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [slots, setSlots] = useState<ServiceSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState(emptyGenerateForm());
  const [generateErrors, setGenerateErrors] = useState<Partial<Record<'startDate' | 'endDate' | 'numberOfSlots', string>>>({});
  const [generating, setGenerating] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState<ServiceSlot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [availability, setAvailability] = useState<
    Record<string, { total: number; available: number; booked: number; locked: number }>
  >({});

  const [dayEditDialogOpen, setDayEditDialogOpen] = useState(false);
  const [dayEditDate, setDayEditDate] = useState<string>('');
  const [dayEditSlots, setDayEditSlots] = useState<number>(10);
  const [dayEditError, setDayEditError] = useState<string>('');
  const [dayUpdating, setDayUpdating] = useState(false);

  // Selected day for weekly slot detail panel
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadIdRef = useRef(0);

  useEffect(() => { loadServices(); }, []);

  useEffect(() => {
    if (selectedService) {
      const id = ++loadIdRef.current;
      loadSlots(id);
      loadAvailability(id);
    } else {
      setSlots([]);
      setAvailability({});
    }
  }, [selectedService, currentWeekStart]);

  useEffect(() => {
    if (!selectedService) return;
    const selected = services.find((svc) => svc.id === selectedService);
    setGenerateForm((prev) => ({
      ...prev,
      numberOfSlots: selected?.daily_slot_limit ?? 10,
    }));
  }, [selectedService, services]);

  const weekEnd = addDays(currentWeekStart, 6);
  const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  const loadSlots = async (callId?: number) => {
    if (!selectedService) return;
    setSlotsLoading(true);
    try {
      const res = await hospitalService.listServiceSlots({
        serviceId: selectedService,
        startDate: weekStartStr,
        endDate: weekEndStr,
      });
      if (callId !== undefined && callId !== loadIdRef.current) return;
      const allSlots = (res as any).data?.services?.[0]?.slots ?? [];
      setSlots(allSlots.filter(
        (s: ServiceSlot) => s.slot_date >= weekStartStr && s.slot_date <= weekEndStr
      ));
    } catch {
      toast.error('Failed to load slots');
    } finally {
      setSlotsLoading(false);
    }
  };

  const loadAvailability = async (callId?: number) => {
    if (!selectedService) return;
    try {
      const res = await hospitalService.getServiceAvailability(
        selectedService, weekStartStr, weekEndStr
      );
      if (callId !== undefined && callId !== loadIdRef.current) return;
      setAvailability((res as any).data?.availability ?? {});
    } catch { /* non-critical */ }
  };

  const refreshAll = () => {
    const id = ++loadIdRef.current;
    loadSlots(id);
    loadAvailability(id);
  };

  const validateGenerateForm = (): boolean => {
    const errors: typeof generateErrors = {};
    const today = todayStr();
    if (!generateForm.startDate) errors.startDate = 'Start date is required';
    else if (generateForm.startDate < today) errors.startDate = 'Start date cannot be in the past';
    else if (isSunday(generateForm.startDate)) errors.startDate = 'Start date cannot be a Sunday';
    if (!generateForm.endDate) errors.endDate = 'End date is required';
    else if (generateForm.endDate < generateForm.startDate) errors.endDate = 'End date must be on or after start date';
    if (!generateForm.numberOfSlots || generateForm.numberOfSlots < 1) errors.numberOfSlots = 'At least 1 slot required';
    else if (generateForm.numberOfSlots > 200) errors.numberOfSlots = 'Maximum 200 slots per day';
    setGenerateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGenerateSlots = async () => {
    if (!selectedService || !validateGenerateForm()) return;
    setGenerating(true);
    try {
      const res = await hospitalService.generateServiceSlots({
        serviceId: selectedService,
        startDate: generateForm.startDate,
        endDate: generateForm.endDate,
        numberOfSlots: generateForm.numberOfSlots,
      });
      const d = (res as any).data;
      toast.success(`Generated ${d?.generated ?? 0} slots across ${d?.workingDays ?? '?'} working day(s)`);
      setGenerateDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to generate slots';
      toast.error(Array.isArray(msg) ? msg.map((e: any) => e.message).join(', ') : msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!slotToDelete) return;
    setDeleting(true);
    try {
      await hospitalService.deleteServiceSlot(slotToDelete.id);
      toast.success('Slot deleted');
      refreshAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Failed to delete slot');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedService) return;
    try {
      const res = await hospitalService.bulkDeleteServiceSlots({
        serviceId: selectedService, startDate: weekStartStr, endDate: weekEndStr,
      });
      const deleted = (res as any).data?.deleted ?? 0;
      toast.success(`Deleted ${deleted} available slot${deleted !== 1 ? 's' : ''}`);
      refreshAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Failed to delete slots');
    }
  };

  const openDayEditDialog = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const currentTotal = availability[dateKey]?.total || getSlotsForDay(dateKey).length;
    const selected = services.find((svc) => svc.id === selectedService);
    setDayEditDate(dateKey);
    setDayEditSlots(currentTotal > 0 ? currentTotal : (selected?.daily_slot_limit ?? 10));
    setDayEditError('');
    setDayEditDialogOpen(true);
  };

  const handleDaySlotUpdate = async () => {
    if (!selectedService || !dayEditDate) return;
    if (!dayEditSlots || dayEditSlots < 1) { setDayEditError('At least 1 slot is required'); return; }
    if (dayEditSlots > 200) { setDayEditError('Maximum 200 slots per day'); return; }
    if (isSunday(dayEditDate)) { setDayEditError('Cannot manage slots on a Sunday'); return; }
    setDayEditError('');
    setDayUpdating(true);
    try {
      await hospitalService.updateServiceDaySlots({
        serviceId: selectedService, slotDate: dayEditDate, numberOfSlots: dayEditSlots,
      });
      toast.success(`Updated ${dayEditDate} to ${dayEditSlots} slots`);
      setDayEditDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Failed to update day slots');
    } finally {
      setDayUpdating(false);
    }
  };

  const loadServices = async () => {
    try {
      const res = await hospitalService.listServices();
      const svcs = (res as any).data?.services ?? [];
      setServices(svcs);
      if (svcs.length > 0 && !selectedService) setSelectedService(svcs[0].id);
    } catch {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });
  const getSlotsForDay = (dayKey: string) => slots.filter((s) => s.slot_date === dayKey);
  const selectedSvc = services.find(s => s.id === selectedService);

  // Default selected day to today (or first weekday)
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const activeDay = selectedDay ?? (weekDays.some(d => format(d, 'yyyy-MM-dd') === todayKey) ? todayKey : format(weekDays[0], 'yyyy-MM-dd'));

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Slots</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure availability and capacity for clinical departments.
          </p>
          {/* Service selector + status pill */}
          {services.length > 0 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Select value={selectedService || ''} onValueChange={v => { setSelectedService(v); setSelectedDay(null); }}>
                <SelectTrigger className="h-8 text-sm rounded-full px-4 w-auto min-w-[180px] border border-primary/30 bg-primary/5">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((svc) => (
                    <SelectItem key={svc.id} value={svc.id}>{svc.service_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSvc?.is_available && (
                <span className="text-[10px] font-bold uppercase tracking-widest border border-primary/30 text-primary rounded-full px-3 py-1">
                  Active Service
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            disabled={!selectedService || slotsLoading}
            className="rounded-full px-4 text-destructive hover:text-destructive hover:border-destructive/30"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear Available
          </Button>
          <Button
            onClick={() => { setGenerateErrors({}); setGenerateForm(emptyGenerateForm()); setGenerateDialogOpen(true); }}
            disabled={!selectedService}
            className="rounded-full px-5"
          >
            <Sparkles className="h-4 w-4 mr-2" /> Generate Slots
          </Button>
        </div>
      </div>

      {services.length === 0 && (
        <div className="bg-card border rounded-2xl p-16 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No services configured yet.</p>
          <p className="text-sm mt-1">Add services first from the Services tab.</p>
        </div>
      )}

      {selectedService && (
        <>
          {/* Week navigation + Day summary cards */}
          <div className="bg-card border rounded-2xl overflow-hidden">
            {/* Week nav row */}
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                onClick={() => { setCurrentWeekStart(addDays(currentWeekStart, -7)); setSelectedDay(null); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-sm font-semibold">
                {format(currentWeekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
              </p>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                onClick={() => { setCurrentWeekStart(addDays(currentWeekStart, 7)); setSelectedDay(null); }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Day cards row */}
            <div className="grid grid-cols-7">
              {weekDays.map((day) => {
                const dayKey = format(day, 'yyyy-MM-dd');
                const stats = availability[dayKey] || { total: 0, available: 0, booked: 0, locked: 0 };
                const isSun = day.getDay() === 0;
                const isActive = activeDay === dayKey;
                const isToday = dayKey === todayKey;
                return (
                  <div
                    key={dayKey}
                    onClick={() => !isSun && setSelectedDay(dayKey)}
                    className={`relative p-4 border-r last:border-r-0 transition-colors ${
                      isSun ? 'opacity-40' : 'cursor-pointer hover:bg-muted/30'
                    } ${isActive && !isSun ? 'bg-primary/5 border-b-2 border-b-primary' : ''}`}
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE')}
                    </p>
                    <p className={`text-2xl font-bold ${isToday ? 'text-primary' : ''}`}>
                      {format(day, 'd')}
                    </p>
                    {isSun ? (
                      <p className="text-[10px] text-muted-foreground mt-1">Closed</p>
                    ) : stats.total === 0 ? (
                      <p className="text-[10px] text-muted-foreground mt-1">No slots</p>
                    ) : (
                      <>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium">{stats.total} TOTAL SLOTS</p>
                        <div className="flex gap-2 mt-1.5 text-[10px] flex-wrap">
                          <span className="text-emerald-500 font-bold">{stats.available} <span className="font-normal text-muted-foreground">Open</span></span>
                          <span className="text-violet-400 font-bold">{stats.booked} <span className="font-normal text-muted-foreground">Booked</span></span>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); openDayEditDialog(day); }}
                          className="mt-2 text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          <Settings className="h-2.5 w-2.5" /> Edit
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly Slots Detail */}
          <div className="bg-card border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Weekly Slots Detail</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review and manage specific intervals for {format(parseLocalDate(activeDay), 'EEEE, MMM d')}
                </p>
              </div>
              {slotsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {(() => {
              const daySlots = getSlotsForDay(activeDay);
              if (daySlots.length === 0) {
                return (
                  <div className="p-12 text-center text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No slots for this day. Click "Generate Slots" to create them.</p>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 gap-3 p-4">
                  {daySlots.map((slot) => {
                    const isAvailable = slot.status === 'available';
                    const isBooked = slot.status === 'booked';
                    return (
                      <div
                        key={slot.id}
                        onClick={() => {
                          if (isAvailable) { setSlotToDelete(slot); setDeleteDialogOpen(true); }
                        }}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors ${
                          isAvailable
                            ? 'border-primary/20 bg-primary/5 cursor-pointer hover:border-primary/40'
                            : isBooked
                            ? 'border-border bg-card cursor-default'
                            : 'border-border bg-muted/20 cursor-default'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Slot number bubble */}
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isAvailable ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            #{slot.slot_number}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">
                              Slot #{slot.slot_number}
                            </p>
                            <p className={`text-xs ${isAvailable ? 'text-primary' : 'text-muted-foreground'}`}>
                              {isAvailable ? 'Accepting Patients' : isBooked ? `Slot ${slot.slot_date}` : slot.status}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ${
                            isAvailable
                              ? 'bg-primary/15 text-primary'
                              : isBooked
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-yellow-500/10 text-yellow-500'
                          }`}>
                            {isAvailable ? 'Available' : isBooked ? 'Booked' : slot.status}
                          </span>
                          {isAvailable && <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* ── Generate Dialog ── */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Service Slots</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gen-start">Start Date</Label>
                <Input
                  id="gen-start" type="date" min={todayStr()}
                  value={generateForm.startDate}
                  onChange={(e) => {
                    setGenerateErrors((prev) => ({ ...prev, startDate: undefined }));
                    setGenerateForm((f) => ({
                      ...f, startDate: e.target.value,
                      endDate: f.endDate < e.target.value ? e.target.value : f.endDate,
                    }));
                  }}
                  className={generateErrors.startDate ? 'border-destructive' : ''}
                />
                {generateErrors.startDate && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {generateErrors.startDate}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-end">End Date</Label>
                <Input
                  id="gen-end" type="date" min={generateForm.startDate || todayStr()}
                  value={generateForm.endDate}
                  onChange={(e) => {
                    setGenerateErrors((prev) => ({ ...prev, endDate: undefined }));
                    setGenerateForm((f) => ({ ...f, endDate: e.target.value }));
                  }}
                  className={generateErrors.endDate ? 'border-destructive' : ''}
                />
                {generateErrors.endDate && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {generateErrors.endDate}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Sundays are automatically skipped. Existing slots on a date are kept (duplicates ignored).
            </p>
            <div className="space-y-2">
              <Label>Slots per Working Day</Label>
              <Select
                value={String(generateForm.numberOfSlots)}
                onValueChange={(v) => {
                  setGenerateErrors((prev) => ({ ...prev, numberOfSlots: undefined }));
                  setGenerateForm((f) => ({ ...f, numberOfSlots: Number(v) }));
                }}
              >
                <SelectTrigger className={generateErrors.numberOfSlots ? 'border-destructive' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} slots</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {generateErrors.numberOfSlots && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {generateErrors.numberOfSlots}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Patients book by slot number on a first-come-first-served basis.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerateSlots} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Slot Dialog ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete Slot #{slotToDelete?.slot_number} on {slotToDelete?.slot_date}. Booked or locked slots cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSlot} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Day Slots Dialog ── */}
      <Dialog open={dayEditDialogOpen} onOpenChange={setDayEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Slots for {dayEditDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input value={dayEditDate} disabled />
            </div>
            <div className="space-y-1">
              <Label>Total Slots for This Day</Label>
              <Input
                type="number" min={1} max={200}
                value={dayEditSlots}
                onChange={(e) => { setDayEditError(''); setDayEditSlots(Number(e.target.value) || 1); }}
                className={dayEditError ? 'border-destructive' : ''}
              />
              {dayEditError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {dayEditError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Booked and locked slots are preserved. Only available overflow slots are removed.
              </p>
            </div>
            {availability[dayEditDate] && (
              <div className="rounded-xl bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium">Current breakdown for {dayEditDate}</p>
                <div className="grid grid-cols-3 gap-2 text-center mt-1">
                  <div>
                    <span className="text-emerald-600 font-semibold block">{availability[dayEditDate].available}</span>
                    <span className="text-muted-foreground">Available</span>
                  </div>
                  <div>
                    <span className="text-violet-500 font-semibold block">{availability[dayEditDate].booked}</span>
                    <span className="text-muted-foreground">Booked</span>
                  </div>
                  <div>
                    <span className="text-yellow-600 font-semibold block">{availability[dayEditDate].locked}</span>
                    <span className="text-muted-foreground">Locked</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDaySlotUpdate} disabled={dayUpdating}>
              {dayUpdating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
