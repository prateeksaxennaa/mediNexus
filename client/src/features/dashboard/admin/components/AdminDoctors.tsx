import { useEffect, useState } from 'react';
import { Users, Mail, Plus, Edit2, Trash2, Check, BadgeCheck, ShieldCheck, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hospitalService, type HospitalDoctor, type HospitalProfile } from '@/services/hospital.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

interface EditForm {
  full_name: string;
  specialisation: string;
  department: string;
  qualifications: string;
  registration_number: string;
  experience_years: string;
  consultation_fee: string;
  bio: string;
  available_from: string;
  available_to: string;
  slot_duration_mins: string;
  verified: boolean;
}

const emptyEditForm = (doc: HospitalDoctor): EditForm => ({
  full_name: doc.full_name ?? '',
  specialisation: doc.specialisation ?? '',
  department: doc.department ?? '',
  qualifications: doc.qualifications ?? '',
  registration_number: doc.registration_number ?? '',
  experience_years: doc.experience_years != null ? String(doc.experience_years) : '',
  consultation_fee: doc.consultation_fee != null ? String(doc.consultation_fee) : '',
  bio: doc.bio ?? '',
  available_from: doc.available_from ?? '09:00',
  available_to: doc.available_to ?? '17:00',
  slot_duration_mins: doc.slot_duration_mins != null ? String(doc.slot_duration_mins) : '15',
  verified: doc.verified,
});

// Specialisation → accent color
const SPEC_COLORS: Record<string, string> = {
  cardiology: 'text-rose-400',
  neurology: 'text-violet-400',
  oncology: 'text-amber-400',
  orthopedics: 'text-sky-400',
  dentist: 'text-teal-400',
  psychiatry: 'text-fuchsia-400',
};

const specColor = (s?: string) => {
  if (!s) return 'text-primary';
  return SPEC_COLORS[s.toLowerCase()] ?? 'text-primary';
};

export const AdminDoctors = () => {
  const [doctors, setDoctors] = useState<HospitalDoctor[]>([]);
  const [hospital, setHospital] = useState<HospitalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSpec, setInviteSpec] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<HospitalDoctor | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<HospitalDoctor | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([hospitalService.listDoctors(), hospitalService.getProfile()])
      .then(([docRes, profRes]) => {
        setDoctors((docRes as any).data?.doctors ?? []);
        setHospital((profRes as any).data?.hospital ?? null);
      })
      .catch(() => toast.error('Failed to load doctors'))
      .finally(() => setLoading(false));
  }, []);

  const toggleVerified = async (doc: HospitalDoctor) => {
    setTogglingId(doc.id);
    try {
      const res = await hospitalService.updateDoctor(doc.id, { verified: !doc.verified });
      const updated = (res as any).data?.doctor;
      setDoctors(ds => ds.map(d => d.id === doc.id ? { ...d, ...updated } : d));
      toast.success(`${doc.full_name} ${!doc.verified ? 'verified' : 'unverified'}`);
    } catch {
      toast.error('Failed to update doctor');
    } finally {
      setTogglingId(null);
    }
  };

  const handleInvite = async () => {
    if (!hospital) return;
    if (!inviteEmail.trim() || !inviteName.trim() || !inviteSpec.trim()) {
      toast.error('All fields are required');
      return;
    }
    setInviting(true);
    try {
      await hospitalService.inviteDoctor(hospital.id, {
        email: inviteEmail.trim(),
        full_name: inviteName.trim(),
        specialisation: inviteSpec.trim(),
      });
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail(''); setInviteName(''); setInviteSpec('');
    } catch {
      toast.error('Failed to send invite');
    } finally {
      setInviting(false);
    }
  };

  const openEdit = (doc: HospitalDoctor) => {
    setEditTarget(doc);
    setEditForm(emptyEditForm(doc));
  };

  const setF = (patch: Partial<EditForm>) =>
    setEditForm(f => f ? { ...f, ...patch } : f);

  const handleSave = async () => {
    if (!editTarget || !editForm) return;
    if (!editForm.full_name.trim() || !editForm.specialisation.trim()) {
      toast.error('Name and specialisation are required');
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof hospitalService.updateDoctor>[1] = {
        full_name: editForm.full_name.trim(),
        specialisation: editForm.specialisation.trim(),
        department: editForm.department.trim() || undefined,
        qualifications: editForm.qualifications.trim() || undefined,
        registration_number: editForm.registration_number.trim() || undefined,
        experience_years: editForm.experience_years !== '' ? Number(editForm.experience_years) : undefined,
        consultation_fee: editForm.consultation_fee !== '' ? Number(editForm.consultation_fee) : undefined,
        bio: editForm.bio.trim() || undefined,
        available_from: editForm.available_from || undefined,
        available_to: editForm.available_to || undefined,
        slot_duration_mins: editForm.slot_duration_mins !== '' ? Number(editForm.slot_duration_mins) : undefined,
        verified: editForm.verified,
      };
      const res = await hospitalService.updateDoctor(editTarget.id, payload);
      const updated = (res as any).data?.doctor;
      setDoctors(ds => ds.map(d => d.id === editTarget.id ? { ...d, ...updated } : d));
      toast.success('Doctor updated');
      setEditTarget(null);
      setEditForm(null);
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await hospitalService.deleteDoctor(deleteTarget.id);
      setDoctors(ds => ds.filter(d => d.id !== deleteTarget.id));
      toast.success(`${deleteTarget.full_name} removed`);
    } catch {
      toast.error('Failed to delete doctor');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-in fade-in duration-300">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  const verifiedCount = doctors.filter(d => d.verified).length;
  const pendingCount = doctors.length - verifiedCount;

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Registered Doctors</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-md">
            Oversee medical staff credentials and operational availability within the Clinical ecosystem.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="rounded-full px-5 shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Register Doctor
        </Button>
      </div>

      {/* Stat cards — matching image */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Physicians', value: doctors.length, icon: Users },
          { label: 'Verified', value: verifiedCount, icon: ShieldCheck },
          { label: 'Pending Review', value: pendingCount, icon: ClipboardList },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card border rounded-2xl p-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
              <p className="text-5xl font-bold">{value}</p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-7 w-7 text-primary/60" />
            </div>
          </div>
        ))}
      </div>

      {/* Doctor registry table */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Doctor Registry</p>
          <p className="text-xs text-muted-foreground">Showing {doctors.length} result{doctors.length !== 1 ? 's' : ''}</p>
        </div>

        {doctors.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No doctors registered yet.</p>
            <p className="text-sm mt-1">Use "Register Doctor" to send an invite.</p>
          </div>
        ) : (
          <div className="divide-y">
            {doctors.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-4 px-6 py-5 hover:bg-muted/20 transition-colors"
              >
                {/* Avatar */}
                <img
                  src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${doc.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                  alt={doc.full_name}
                  className="h-12 w-12 rounded-xl shrink-0 border border-white/10 bg-muted object-cover"
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate">{doc.full_name}</p>
                  <p className="text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold ${specColor(doc.specialisation)}`}>
                      {doc.specialisation ?? 'General'}
                    </span>
                    {doc.experience_years != null && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{doc.experience_years} Years Experience</span>
                      </>
                    )}
                    {doc.consultation_fee != null && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">Fee: ₹{doc.consultation_fee}</span>
                      </>
                    )}
                    {doc.experience_years == null && doc.consultation_fee == null && (
                      <span className="text-muted-foreground text-xs">
                        Joined {format(parseISO(doc.created_at), 'MMM d, yyyy')}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Verified badge pill */}
                  {doc.verified && (
                    <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-bold">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}

                  {/* Verify / Unverify action pill */}
                  <button
                    onClick={() => toggleVerified(doc)}
                    disabled={togglingId === doc.id}
                    className={`rounded-full px-3 py-1 text-xs font-bold border transition-all ${
                      doc.verified
                        ? 'border-destructive/50 text-destructive hover:bg-destructive/10'
                        : 'border-primary/50 text-primary hover:bg-primary/10'
                    } disabled:opacity-50`}
                  >
                    {togglingId === doc.id ? '…' : doc.verified ? 'Unverify' : 'Verify Now'}
                  </button>

                  <button
                    onClick={() => openEdit(doc)}
                    className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(doc)}
                    className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Invite Dialog ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register a Doctor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input placeholder="Dr. Jane Smith" value={inviteName} onChange={e => setInviteName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="doctor@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Specialisation</Label>
              <Input placeholder="e.g. Cardiology" value={inviteSpec} onChange={e => setInviteSpec(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting}>
              <Mail className="h-4 w-4 mr-2" />
              {inviting ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) { setEditTarget(null); setEditForm(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Doctor — {editTarget?.full_name}</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Full Name</Label>
                <Input value={editForm.full_name} onChange={e => setF({ full_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Specialisation</Label>
                <Input value={editForm.specialisation} onChange={e => setF({ specialisation: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="e.g. Cardiology Dept." value={editForm.department} onChange={e => setF({ department: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Qualifications</Label>
                <Input placeholder="e.g. MBBS, MD" value={editForm.qualifications} onChange={e => setF({ qualifications: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Registration No.</Label>
                <Input value={editForm.registration_number} onChange={e => setF({ registration_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Years of Experience</Label>
                <Input type="number" min={0} max={70} value={editForm.experience_years} onChange={e => setF({ experience_years: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Consultation Fee (₹)</Label>
                <Input type="number" min={0} step="0.01" value={editForm.consultation_fee} onChange={e => setF({ consultation_fee: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Available From</Label>
                <Input type="time" value={editForm.available_from} onChange={e => setF({ available_from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Available To</Label>
                <Input type="time" value={editForm.available_to} onChange={e => setF({ available_to: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Slot Duration (mins)</Label>
                <Input type="number" min={5} max={120} step={5} value={editForm.slot_duration_mins} onChange={e => setF({ slot_duration_mins: e.target.value })} />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={editForm.verified}
                  onClick={() => setF({ verified: !editForm.verified })}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    editForm.verified ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    editForm.verified ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
                <Label>Verified</Label>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Bio <span className="text-muted-foreground font-normal text-sm">(optional)</span></Label>
                <Textarea rows={3} maxLength={500} placeholder="Brief description…" value={editForm.bio} onChange={e => setF({ bio: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setEditForm(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '…' : <><Check className="h-4 w-4 mr-1" />Save Changes</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Doctor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.full_name}</strong> from your
              hospital and revoke their account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
