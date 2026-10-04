import { useEffect, useState } from 'react';
import { Calendar, Info, Loader2, Lock, Unlock, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { doctorService, type DoctorSlot } from '@/services/doctor.service';
import { format, parseISO, startOfDay, endOfDay, addDays, subDays, isToday } from 'date-fns';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-secondary text-foreground border-border hover:border-primary/50',
  booked: 'bg-primary/10 text-foreground border-primary/30',
  locked: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  cancelled: 'bg-card text-muted-foreground border-border opacity-50',
  blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const DOT_COLORS: Record<string, string> = {
  available: 'bg-green-400',
  booked: 'bg-primary',
  locked: 'bg-yellow-500',
  cancelled: 'bg-muted-foreground',
  blocked: 'bg-red-400',
};

export const DoctorSchedule = () => {
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(new Date());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Leave form
  const [leaveDate, setLeaveDate] = useState('');
  const [markingLeave, setMarkingLeave] = useState(false);

   const fetchSlots = async (date: Date) => {
    setLoading(true);
    try {
         const res = await doctorService.listSlots({
            upcoming: false,
            date: format(date, 'yyyy-MM-dd'),
         });
      setSlots((res as any).data?.slots ?? []);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
      fetchSlots(viewDate);
   }, [viewDate]);

  const slotsForDay = slots
    .filter((s) => {
      const slotDate = parseISO(s.slot_start);
      return slotDate >= startOfDay(viewDate) && slotDate <= endOfDay(viewDate);
    })
    .sort((a, b) => a.slot_start.localeCompare(b.slot_start));

  const handleBlock = async (slotId: string) => {
    setActionLoading(slotId);
    try {
      await doctorService.blockSlot(slotId);
      toast.success('Slot blocked');
         fetchSlots(viewDate);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to block slot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnblock = async (slotId: string) => {
    setActionLoading(slotId);
    try {
      await doctorService.unblockSlot(slotId);
      toast.success('Slot unblocked');
         fetchSlots(viewDate);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to unblock slot');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkLeave = async () => {
    if (!leaveDate) {
      toast.error('Select a leave date');
      return;
    }
    setMarkingLeave(true);
    try {
      const res = await doctorService.markLeave(leaveDate);
      const { blocked } = (res as any).data ?? {};
      toast.success(`${blocked} slot(s) blocked for leave day`);
      setLeaveDate('');
         fetchSlots(viewDate);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to mark leave');
    } finally {
      setMarkingLeave(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-500 flex flex-col lg:flex-row gap-8">
      
      {/* Main Content */}
      <div className="flex-[3] space-y-8">
         <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
               <p className="text-[11px] text-primary font-bold tracking-[0.2em] uppercase mb-1">Time Management</p>
               <h1 className="text-4xl font-extrabold tracking-tight">Master Schedule</h1>
            </div>
         </div>

         {/* Auto-seeding info banner */}
         <div className="bg-card border-l-2 border-primary rounded-[20px] p-5 flex items-start gap-4">
            <Info className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Slots are <strong className="text-foreground">automatically generated</strong> for the next 31 days based on your availability schedule (Mon–Sat). To change your hours or slot duration, update your profile. Use the leave tool to block off entire days.
            </p>
         </div>

         {/* Day navigation */}
         <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1 bg-card rounded-full p-1 border border-border shadow-sm">
               <button onClick={() => setViewDate((d) => subDays(d, 1))} className="px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-full transition-colors"><ChevronLeft className="h-4 w-4" /></button>
               <button onClick={() => setViewDate(new Date())} className="px-6 py-2.5 text-[14px] font-bold bg-secondary shadow-inner text-foreground rounded-full border border-border transition-colors">
                 {isToday(viewDate) ? 'Today - ' : ''}{format(viewDate, 'EEEE, MMM d')}
               </button>
               <button onClick={() => setViewDate((d) => addDays(d, 1))} className="px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground rounded-full transition-colors"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest bg-card border border-border px-4 py-2 rounded-full">
              {slotsForDay.length} Slots Available
            </div>
         </div>

         {/* Grid */}
         {loading ? (
            <div className="flex items-center justify-center py-20">
               <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
         ) : slotsForDay.length === 0 ? (
            <div className="bg-card rounded-[24px] border border-border p-16 text-center text-muted-foreground">
               <Calendar className="h-10 w-10 mx-auto mb-4 opacity-50" />
               <p className="font-medium">No slots generated for this date.</p>
            </div>
         ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {slotsForDay.map((slot) => {
                 const colorClass = STATUS_COLORS[slot.status] ?? STATUS_COLORS.cancelled;
                 const dotClass = DOT_COLORS[slot.status] ?? 'bg-muted-foreground';
                 const isBlocked = slot.status === 'blocked';
                 const isAvailable = slot.status === 'available';

                 return (
                   <div key={slot.id} className={`rounded-[16px] border p-4 flex flex-col justify-between h-[100px] transition-colors group ${colorClass}`}>
                      <div className="flex items-center justify-between">
                         <div className="flex items-baseline gap-1">
                            <span className="font-bold text-[18px]">{format(parseISO(slot.slot_start), 'HH:mm')}</span>
                         </div>
                         <div className={`h-2 w-2 rounded-full ${dotClass}`}></div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{slot.status}</span>
                         {(isAvailable || isBlocked) && (
                            <button
                               className="opacity-50 hover:opacity-100 transition-opacity bg-card/50 rounded-full p-1.5"
                               disabled={actionLoading === slot.id}
                               onClick={() => isAvailable ? handleBlock(slot.id) : handleUnblock(slot.id)}
                            >
                               {actionLoading === slot.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                               ) : isAvailable ? (
                                  <Lock className="h-3 w-3 text-foreground" />
                               ) : (
                                  <Unlock className="h-3 w-3 text-foreground" />
                               )}
                            </button>
                         )}
                      </div>
                   </div>
                 );
               })}
            </div>
         )}
      </div>

      {/* Sidebar Elements */}
      <div className="flex-1 space-y-6 lg:max-w-[320px]">
         
         {/* Efficiency Pulse */}
         <div className="bg-card rounded-[24px] border border-primary/30 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
               <TrendingUp className="h-24 w-24 text-primary" />
            </div>
            <div className="relative z-10 flex flex-col pb-4 border-b border-border">
                <p className="text-[10px] text-primary font-bold tracking-[0.2em] uppercase mb-1">Efficiency Pulse</p>
                <div className="flex items-end gap-2">
                   <h2 className="text-4xl font-extrabold tracking-tight">92%</h2>
                   <span className="text-[12px] text-green-400 font-bold tracking-wide mb-1 flex items-center"><TrendingUp className="h-3 w-3 mr-1"/>+4%</span>
                </div>
            </div>
            <div className="relative z-10 pt-4 space-y-4">
                <div>
                   <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">Time Utility</span>
                      <span className="text-[11px] text-foreground font-bold">88%</span>
                   </div>
                   <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: '88%' }}></div>
                   </div>
                </div>
                <div>
                   <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">Completion Rate</span>
                      <span className="text-[11px] text-foreground font-bold">96%</span>
                   </div>
                   <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 rounded-full" style={{ width: '96%' }}></div>
                   </div>
                </div>
            </div>
         </div>

         {/* Leave Manager Tool */}
         <div className="bg-secondary rounded-[24px] border border-red-500/20 p-6 space-y-4">
            <div>
               <h3 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-red-400" /> Day Off Manager
               </h3>
               <p className="text-[12px] text-muted-foreground mt-1">Block all slots on a specific date for leave.</p>
            </div>
            
            <div className="space-y-3">
               <div className="relative">
                 <input 
                   type="date" 
                   value={leaveDate} 
                   onChange={(e) => setLeaveDate(e.target.value)} 
                   className="w-full h-12 rounded-xl bg-card border border-border px-4 text-sm text-foreground focus:outline-none focus:border-red-500/50 transition-colors"
                 />
               </div>
               <Button onClick={handleMarkLeave} disabled={markingLeave || !leaveDate} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-xl h-12 transition-colors border border-red-500/20">
                 {markingLeave ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Block Entire Day"}
               </Button>
            </div>
         </div>

      </div>

    </div>
  );
};

