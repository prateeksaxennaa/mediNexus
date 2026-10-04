import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search,
  Send,
  Loader2,
  Plus,
  User,
  ChevronDown,
  ChevronUp,
  Network,
  ActivitySquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  doctorService,
  type Referral,
  type DoctorAppointment,
  type DoctorSearchResult,
} from '@/services/doctor.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  pending: 'text-muted-foreground',
  accepted: 'text-green-400',
  declined: 'text-red-400',
  completed: 'text-primary',
};

const DOT_COLOR: Record<string, string> = {
  pending: 'bg-muted-foreground',
  accepted: 'bg-green-400',
  declined: 'bg-red-400',
  completed: 'bg-primary',
};

// ─── Component ───────────────────────────────────────────────────────────────

export const DoctorReferrals = () => {
  // ── Referrals list ──
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'received' | 'sent'>('received');

  // ── Create referral form ──
  const [showForm, setShowForm] = useState(false);
  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctorResults, setDoctorResults] = useState<DoctorSearchResult[]>([]);
  const [doctorSearching, setDoctorSearching] = useState(false);
  const [selectedReferDoctor, setSelectedReferDoctor] = useState<DoctorSearchResult | null>(null);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; full_name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Action loading ──
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Collapsible referral details ──
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Fetch referrals ──
  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
       const res = await doctorService.listReferrals();
       setReferrals((res as any).data?.referrals ?? []);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      // Graceful fallback when the referrals table hasn't been migrated yet
      if (
        msg.toLowerCase().includes('relation') ||
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('schema cache') ||
        msg.toLowerCase().includes("could not find the table")
      ) {
        setReferrals([]);
        toast.error('Referrals table not yet set up — restart the server to apply migrations.');
      } else {
        toast.error(msg || 'Failed to fetch referrals');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

  // ── Fetch patients ──
  const fetchPatients = useCallback(async (ensurePatient?: { id: string; full_name: string }) => {
    setPatientsLoading(true);
    try {
      const res = await doctorService.listAppointments('all');
      const appts: DoctorAppointment[] = (res as any).data?.appointments ?? [];
      const seen = new Set<string>();
      const uniquePatients: { id: string; full_name: string }[] = [];
      for (const a of appts) {
        if (!seen.has(a.patient_id) && a.patients?.full_name) {
          seen.add(a.patient_id);
          uniquePatients.push({ id: a.patient_id, full_name: a.patients.full_name });
        }
      }
      if (ensurePatient && !seen.has(ensurePatient.id)) {
        uniquePatients.push(ensurePatient);
      }
      uniquePatients.sort((a, b) => a.full_name.localeCompare(b.full_name));
      setPatients(uniquePatients);
    } catch {
      toast.error('Failed to load patients');
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  // ── Doctor search with debounce ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDoctorSearch = (q: string) => {
    setDoctorQuery(q);
    setSelectedReferDoctor(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setDoctorResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setDoctorSearching(true);
      try {
        const res = await doctorService.searchDoctors(q.trim());
        setDoctorResults((res as any).data?.doctors ?? []);
      } catch {
        // silent
      } finally {
        setDoctorSearching(false);
      }
    }, 300);
  };

  const openForm = () => {
    setShowForm(!showForm);
    if (!showForm) {
       setDoctorQuery('');
       setDoctorResults([]);
       setSelectedReferDoctor(null);
       setSelectedPatient(null);
       setReason('');
       fetchPatients();
    }
  };

  const handleCreate = async () => {
    if (!selectedReferDoctor || !selectedPatient) return;
    setCreating(true);
    try {
      const res = await doctorService.createReferral({
        patient_id: selectedPatient.id,
        referred_to_doctor_id: selectedReferDoctor.id,
        reason: reason.trim() || undefined,
      });
      const grantsCopied = (res as any).data?.grants_copied ?? 0;
      toast.success(
        `Referral sent to ${selectedReferDoctor.full_name}` +
          (grantsCopied > 0 ? `. ${grantsCopied} document access grant${grantsCopied > 1 ? 's' : ''} copied.` : '')
      );
      setShowForm(false);
      fetchReferrals();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create referral');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusUpdate = async (referralId: string, status: 'accepted' | 'declined' | 'completed') => {
    setActionLoading(referralId);
    try {
      await doctorService.updateReferralStatus(referralId, status);
      toast.success(`Referral ${status}`);
      fetchReferrals();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update referral');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = referrals.filter((r) => r.direction === tab);
  const received = referrals.filter((r) => r.direction === 'received');
  const sent = referrals.filter((r) => r.direction === 'sent');

  const pendingCount = received.filter(r => r.status === 'pending').length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
         <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Clinical Network</h1>
            <p className="text-[14px] text-muted-foreground font-medium mt-1">
              Managing incoming and outgoing patient referrals.
            </p>
         </div>
         
         <div className="flex items-center gap-4">
            <div className="bg-card rounded-[20px] p-5 border border-border flex items-center gap-4 min-w-[200px]">
               <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                  <Network className="h-5 w-5 text-primary" />
               </div>
               <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Network</p>
                  <p className="text-2xl font-bold">34</p>
               </div>
            </div>

            <div className="bg-card rounded-[20px] p-5 border border-border flex items-center gap-4 min-w-[200px]">
               <div className="h-10 w-10 rounded-xl bg-muted-foreground/10 flex items-center justify-center border border-border shrink-0">
                  <ActivitySquare className="h-5 w-5 text-muted-foreground" />
               </div>
               <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Pending</p>
                  <p className="text-2xl font-bold">{pendingCount}</p>
               </div>
            </div>
         </div>
      </div>

      {/* Action / Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <div className="flex items-center gap-2 bg-card rounded-full p-1 border border-border">
            <button
              className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                tab === 'received' ? 'bg-secondary text-foreground shadow-inner border border-border' : 'text-muted-foreground hover:text-white'
              }`}
              onClick={() => setTab('received')}
            >
              Received <span className="ml-1 opacity-50">({received.length})</span>
            </button>
            <button
              className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
                tab === 'sent' ? 'bg-secondary text-foreground shadow-inner border border-border' : 'text-muted-foreground hover:text-white'
              }`}
              onClick={() => setTab('sent')}
            >
              Sent <span className="ml-1 opacity-50">({sent.length})</span>
            </button>
         </div>

         <button 
           onClick={openForm} 
           className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm font-bold shadow-[0_0_15px_rgba(192,132,252,0.2)] transition-all"
         >
           <Plus className="h-4 w-4" />
           {showForm ? 'Cancel Referral' : 'Create Referral'}
         </button>
      </div>

      {/* Create Referral Form */}
      {showForm && (
        <div className="bg-card rounded-[24px] border border-primary/30 p-8 space-y-6 animate-in slide-in-from-top-2 duration-300 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent"></div>
          
          <div>
             <h3 className="text-2xl font-bold tracking-tight">New Referral</h3>
             <p className="text-[13px] text-muted-foreground mt-1">Send a patient to a specialist in the network.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Select Patient */}
             <div className="space-y-2">
               <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Select Patient</Label>
               {patientsLoading ? (
                 <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                   <Loader2 className="h-4 w-4 animate-spin" /> Loading patients...
                 </div>
               ) : (
                 <select
                   className="w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                   value={selectedPatient?.id ?? ''}
                   onChange={(e) => {
                     const p = patients.find((pt) => pt.id === e.target.value) ?? null;
                     setSelectedPatient(p);
                   }}
                 >
                   <option value="">Choose a patient...</option>
                   {patients.map((p) => (
                     <option key={p.id} value={p.id}>{p.full_name}</option>
                   ))}
                 </select>
               )}
             </div>

             {/* Search Doctor */}
             <div className="space-y-2 relative">
               <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Select Specialist</Label>
               {selectedReferDoctor ? (
                 <div className="flex items-center justify-between bg-secondary border border-primary/30 rounded-xl p-3 h-12">
                   <div>
                     <p className="text-sm font-bold text-foreground">{selectedReferDoctor.full_name}</p>
                   </div>
                   <Button variant="ghost" size="sm" className="h-6 text-primary hover:text-foreground" onClick={() => setSelectedReferDoctor(null)}>
                     Change
                   </Button>
                 </div>
               ) : (
                 <>
                   <div className="relative">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <input
                       type="text"
                       placeholder="Search by name or specialty..."
                       className="w-full h-12 rounded-xl bg-secondary border border-border pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                       value={doctorQuery}
                       onChange={(e) => handleDoctorSearch(e.target.value)}
                     />
                     {doctorSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                   </div>
                   {doctorResults.length > 0 && (
                     <div className="absolute z-20 w-full mt-2 bg-card border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                       {doctorResults.map((doc) => (
                         <button
                           key={doc.id}
                           className="w-full text-left px-4 py-3 hover:bg-secondary transition-colors border-b border-border last:border-0"
                           onClick={() => {
                             setSelectedReferDoctor(doc);
                             setDoctorQuery('');
                             setDoctorResults([]);
                           }}
                         >
                           <p className="font-bold text-sm text-foreground">{doc.full_name}</p>
                           <p className="text-[11px] text-muted-foreground mt-0.5">{doc.specialisation} {doc.hospitals?.name ? `· ${doc.hospitals.name}` : ''}</p>
                         </button>
                       ))}
                     </div>
                   )}
                 </>
               )}
             </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
             <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Reason & Notes</Label>
             <Textarea
               placeholder="Provide context for this referral..."
               value={reason}
               onChange={(e) => setReason(e.target.value)}
               rows={3}
               className="bg-secondary border-border text-foreground resize-none rounded-xl p-4 placeholder:text-muted-foreground focus:border-primary/50"
             />
          </div>

          <div className="flex justify-end pt-2">
             <Button className="px-8 py-6 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm" onClick={handleCreate} disabled={!selectedPatient || !selectedReferDoctor || creating}>
               {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
               Submit Referral
             </Button>
          </div>
        </div>
      )}

      {/* Referrals list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-[24px] p-16 text-center text-muted-foreground">
          <Network className="h-10 w-10 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No {tab} referrals found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ref) => {
            const isExpanded = expandedId === ref.id;
            const otherDoctor = tab === 'received' ? ref.referring_doctor : ref.referred_to_doctor;
            const isPending = ref.status === 'pending';
            const isActioning = actionLoading === ref.id;
            
            // Dummy logic matching aesthetics
            const ptId = ref.patient?.id || '294';

            return (
              <div key={ref.id} className="bg-card rounded-[20px] border border-border overflow-hidden transition-all hover:bg-secondary">
                <div onClick={() => setExpandedId(isExpanded ? null : ref.id)} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer">
                   
                   {/* Patient Info */}
                   <div className="flex items-center gap-4 md:w-3/12">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-secondary shadow-inner shrink-0 border border-border">
                         <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${ptId}&backgroundColor=transparent`} alt="avatar" className="h-full w-full object-cover" />
                      </div>
                      <div>
                         <p className="font-bold text-[16px] text-foreground tracking-tight">{ref.patient?.full_name ?? 'Unknown'}</p>
                         <p className="text-[12px] text-muted-foreground font-medium tracking-wide">ID: #REF-{ptId.slice(0,5)}</p>
                      </div>
                   </div>

                   {/* Other Doctor */}
                   <div className="flex items-center gap-3 md:w-3/12">
                      <div className="h-10 w-10 rounded-full bg-secondary border border-primary/30 flex items-center justify-center shrink-0">
                         <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                         <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">{tab === 'received' ? 'Referred From' : 'Referred To'}</p>
                         <p className="font-semibold text-[13px] text-foreground">{otherDoctor?.full_name ?? 'Unknown'}</p>
                         <p className="text-[11px] text-muted-foreground">{otherDoctor?.specialisation || 'Physician'}</p>
                      </div>
                   </div>

                   {/* Status */}
                   <div className="md:w-2/12">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5">Status</p>
                      <div className="flex items-center gap-2">
                         <span className={`h-2 w-2 rounded-full ${DOT_COLOR[ref.status] || DOT_COLOR.pending}`}></span>
                         <span className={`font-bold text-[12px] uppercase tracking-wider ${STATUS_BADGE[ref.status] || STATUS_BADGE.pending}`}>{ref.status}</span>
                      </div>
                   </div>

                   {/* Next Step / Reason Snippet */}
                   <div className="md:w-3/12 flex flex-col items-start gap-2">
                      <p className="text-[12px] text-muted-foreground line-clamp-1 italic">{ref.reason || "Standard evaluation requested."}</p>
                      <span className="text-[10px] text-foreground/50">{format(parseISO(ref.created_at), 'MMM d, yyyy h:mm a')}</span>
                   </div>

                   {/* Caret */}
                   <div className="flex items-center justify-end md:w-1/12 shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                   </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-border">
                     <div className="bg-secondary rounded-[16px] p-5">
                       <h4 className="text-[11px] text-primary font-bold uppercase tracking-widest mb-2">Referral Context</h4>
                       <p className="text-[14px] text-foreground/90 leading-relaxed mb-6">{ref.reason || "No explicit reason was provided for this referral workflow."}</p>
                       
                       <div className="flex flex-wrap gap-4 items-center">
                          {tab === 'received' && isPending && (
                             <>
                                <button onClick={() => handleStatusUpdate(ref.id, 'accepted')} disabled={isActioning} className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-[0_0_15px_rgba(192,132,252,0.2)] hover:bg-primary/90 transition-colors">
                                   Accept Referral
                                </button>
                                <button onClick={() => handleStatusUpdate(ref.id, 'declined')} disabled={isActioning} className="px-6 py-2.5 rounded-full bg-red-400/10 text-red-400 font-bold text-sm border border-red-400/20 hover:bg-red-400/20 transition-colors">
                                   Decline
                                </button>
                             </>
                          )}
                          {ref.status === 'accepted' && (
                             <button onClick={() => handleStatusUpdate(ref.id, 'completed')} disabled={isActioning} className="px-6 py-2.5 rounded-full bg-muted text-foreground font-bold text-sm hover:bg-muted/80 transition-colors border border-border">
                                Mark as Completed
                             </button>
                          )}
                       </div>
                     </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

