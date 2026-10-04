import { useEffect, useState } from 'react';
import {
  Loader2, Check, Pen, X, Building2, MapPin,
  BadgeCheck, CalendarDays,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { hospitalService, type HospitalProfile } from '@/services/hospital.service';
import { toast } from 'sonner';

export const AdminProfilePage = () => {
  const [hospital, setHospital] = useState<HospitalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Pick<HospitalProfile, 'name' | 'type' | 'address' | 'city' | 'state'>>>({});

  useEffect(() => {
    hospitalService.getProfile()
      .then((res) => {
        const h = (res as any).data?.hospital ?? null;
        setHospital(h);
        if (h) setForm({ name: h.name, type: h.type, address: h.address, city: h.city, state: h.state });
      })
      .catch((e: any) => toast.error(e.message ?? 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!hospital) return;
    setSaving(true);
    try {
      const res = await hospitalService.updateProfile(form);
      const updated = (res as any).data?.hospital ?? hospital;
      setHospital(updated);
      setForm({ name: updated.name, type: updated.type, address: updated.address, city: updated.city, state: updated.state });
      setEditing(false);
      toast.success('Hospital profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hospital) setForm({ name: hospital.name, type: hospital.type, address: hospital.address, city: hospital.city, state: hospital.state });
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 animate-in fade-in">
        <Loader2 className="h-8 w-8 animate-spin text-[#c084fc]" />
      </div>
    );
  }

  if (!hospital) {
    return (
      <div className="flex items-center justify-center py-24 text-[#888888]">
        Could not load profile data.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto flex flex-col gap-6 animate-in fade-in duration-500 mb-8">

      {/* ═══ Header Block ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="h-36 w-36 rounded-2xl bg-[#111823] overflow-hidden border border-white/5 shrink-0 flex items-center justify-center">
              <Building2 className="h-16 w-16 text-[#c084fc]/30" />
            </div>
            {hospital.is_approved && (
              <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-[#c084fc] rounded-full flex items-center justify-center border-4 border-[#0a0a0a] shadow-lg">
                <Check className="h-4 w-4 text-black stroke-[3]" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">{hospital.name}</h1>
            <div className="flex items-center gap-3 text-sm font-medium text-[#888888]">
              <span className="capitalize">{hospital.type?.replace('_', ' ')}</span>
              <span className="text-white/20">·</span>
              <span>{hospital.city}, {hospital.state}</span>
            </div>
            {hospital.is_approved ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold mt-2">
                <BadgeCheck className="h-3.5 w-3.5" /> Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400 font-semibold mt-2">
                Pending Approval
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-6 py-2.5 rounded-full bg-[#1a1a1a] hover:bg-[#222222] border border-white/5 text-white font-semibold transition-colors flex items-center gap-2 text-sm"
            >
              <Pen className="h-4 w-4" /> Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-full bg-[#c084fc] hover:bg-[#c084fc]/90 text-black shadow-[0_0_20px_rgba(192,132,252,0.3)] font-semibold transition-all flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="px-6 py-2.5 rounded-full bg-[#1a1a1a] hover:bg-[#222222] border border-white/5 text-white font-semibold transition-colors flex items-center gap-2 text-sm"
              >
                <X className="h-4 w-4" /> Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Hospital Details ═══ */}
      <div className="bg-[#161616] rounded-[24px] border border-white/5 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[#c084fc]/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-[#c084fc]" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Hospital Details</h2>
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-y-10 gap-x-8">
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">Name</p>
              <p className="text-lg font-bold text-white">{hospital.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">Type</p>
              <p className="text-lg font-bold text-[#c084fc] capitalize">{hospital.type?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">Registration No.</p>
              <p className="text-lg font-bold text-[#c084fc]">{hospital.registration_number || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">Approved</p>
              <p className="text-lg font-bold text-white">{hospital.is_approved ? 'Yes' : 'No'}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-[10px] font-bold text-[#888888] uppercase tracking-widest">Name</Label>
              <Input className="rounded-xl bg-[#0a0a0a] border-white/5" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-[10px] font-bold text-[#888888] uppercase tracking-widest">Type</Label>
              <Select value={form.type ?? ''} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="rounded-xl bg-[#0a0a0a] border-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="government">Government</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="nursing_home">Nursing Home</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Location ═══ */}
      <div className="bg-[#161616] rounded-[24px] border border-white/5 p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-[#c084fc]/10 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-[#c084fc]" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Location</h2>
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-y-10 gap-x-8">
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">Address</p>
              <p className="text-lg font-bold text-white">{hospital.address || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">City</p>
              <p className="text-lg font-bold text-white">{hospital.city || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-1.5">State</p>
              <p className="text-lg font-bold text-white">{hospital.state || '—'}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-[10px] font-bold text-[#888888] uppercase tracking-widest">Address</Label>
              <Input className="rounded-xl bg-[#0a0a0a] border-white/5" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#888888] uppercase tracking-widest">City</Label>
              <Input className="rounded-xl bg-[#0a0a0a] border-white/5" value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#888888] uppercase tracking-widest">State</Label>
              <Input className="rounded-xl bg-[#0a0a0a] border-white/5" value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ Account ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#161616] rounded-[20px] border border-white/5 p-6 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
          <div className="h-12 w-12 rounded-full bg-[#1e1a24] flex items-center justify-center shrink-0 border border-white/5">
            <CalendarDays className="h-5 w-5 text-[#c084fc]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-0.5">Member Since</p>
            <p className="text-sm font-bold text-white">
              {hospital.created_at
                ? new Date(hospital.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>
        <div className="bg-[#161616] rounded-[20px] border border-white/5 p-6 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
          <div className="h-12 w-12 rounded-full bg-[#1e1a24] flex items-center justify-center shrink-0 border border-white/5">
            <Building2 className="h-5 w-5 text-[#c084fc]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#888888] uppercase tracking-widest mb-0.5">Registration No.</p>
            <p className="text-sm font-bold text-[#c084fc]">{hospital.registration_number || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
