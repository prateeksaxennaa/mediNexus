import { useEffect, useState } from 'react';
import { Users, Stethoscope, Calendar, Edit2, Check, X, BadgeCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { hospitalService, type HospitalProfile } from '@/services/hospital.service';
import { toast } from 'sonner';

export const AdminOverview = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const [hospital, setHospital] = useState<HospitalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<HospitalProfile>>({});
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [serviceCount, setServiceCount] = useState<number | null>(null);
  const [apptCount, setApptCount] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      hospitalService.getProfile(),
      hospitalService.listDoctors(),
      hospitalService.listServices(),
      hospitalService.listAppointments('upcoming'),
    ])
      .then(([profRes, docRes, svcRes, apptRes]) => {
        const h = (profRes as any).data?.hospital;
        setHospital(h);
        setForm({ name: h?.name, type: h?.type, address: h?.address, city: h?.city, state: h?.state });
        setDoctorCount((docRes as any).data?.doctors?.length ?? 0);
        setServiceCount((svcRes as any).data?.services?.length ?? 0);
        setApptCount((apptRes as any).data?.appointments?.length ?? 0);
      })
      .catch(() => toast.error('Failed to load hospital data'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!hospital) return;
    setSaving(true);
    try {
      const res = await hospitalService.updateProfile(form);
      setHospital((res as any).data?.hospital ?? hospital);
      setEditing(false);
      toast.success('Hospital profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({ name: hospital?.name, type: hospital?.type, address: hospital?.address, city: hospital?.city, state: hospital?.state });
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-in fade-in duration-300">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 bg-muted/50 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const typeLabel = hospital?.type
    ? hospital.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
    : '—';

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hospital Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time status and operational metrics for the facility.
          </p>
        </div>
        <div className="shrink-0">
          {!editing ? (
            <Button onClick={() => setEditing(true)} className="rounded-full px-5">
              <Edit2 className="h-4 w-4 mr-2" /> Update Facility
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving} className="rounded-full px-5">
                <Check className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel} className="rounded-full px-5">
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards — matching image layout */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'Total Doctors',
            value: doctorCount,
            icon: Users,
            sub: 'Fully credentialled',
            subColor: 'text-violet-400',
            tab: 'doctors',
          },
          {
            label: 'Active Services',
            value: serviceCount,
            icon: Stethoscope,
            sub: 'Operational departments',
            subColor: 'text-violet-400',
            tab: 'services',
          },
          {
            label: 'Upcoming Appointments',
            value: apptCount,
            icon: Calendar,
            sub: 'Priority scheduled for today',
            subColor: 'text-rose-400',
            tab: 'appointments',
          },
        ].map(({ label, value, icon: Icon, sub, subColor, tab }) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="bg-card border rounded-2xl p-6 cursor-pointer hover:border-primary/40 transition-all group relative overflow-hidden"
          >
            {/* Background icon */}
            <Icon className="absolute right-4 top-4 h-12 w-12 text-muted-foreground/10 group-hover:text-primary/10 transition-colors" />
            <p className="text-sm text-muted-foreground font-medium mb-3">{label}</p>
            <p className="text-5xl font-bold text-foreground mb-4">{value ?? '—'}</p>
            <p className={`text-xs font-semibold flex items-center gap-1.5 ${subColor}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current inline-block" />
              {sub}
            </p>
          </div>
        ))}
      </div>

      {/* Hospital Details card */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">Hospital Details</h2>
          {hospital?.is_approved && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified Record
            </span>
          )}
        </div>

        {!editing ? (
          <div className="p-6 grid grid-cols-2 gap-x-12 gap-y-7">
            {/* Facility Name */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Facility Name</p>
              <p className="text-xl font-semibold">{hospital?.name ?? '—'}</p>
            </div>
            {/* Entity Type */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Entity Type</p>
              <p className="text-xl font-semibold">{typeLabel}</p>
            </div>
            {/* Official Address */}
            <div className="col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Official Address</p>
              <p className="text-xl font-semibold">{hospital?.address ?? '—'}</p>
            </div>
            {/* City */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">City</p>
              <p className="text-xl font-semibold">{hospital?.city ?? '—'}</p>
            </div>
            {/* State */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">State</p>
              <p className="text-xl font-semibold">{hospital?.state ?? '—'}</p>
            </div>
            {/* Registration No */}
            <div className="col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Registration No.</p>
              <p className="text-xl font-bold text-primary flex items-center gap-2">
                {hospital?.registration_number ?? '—'}
                {hospital?.registration_number && (
                  <BadgeCheck className="h-5 w-5 text-primary" />
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Facility Name</Label>
              <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Entity Type</Label>
              <Select value={form.type ?? ''} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="government">Government</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="nursing_home">Nursing Home</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Official Address</Label>
              <Input value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">City</Label>
              <Input value={form.city ?? ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">State</Label>
              <Input value={form.state ?? ''} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
        )}

        {/* Footer compliance note */}
        <div className="border-t px-6 py-3 flex items-center justify-center gap-2 bg-muted/20">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground italic">
            All facility data is encrypted and managed under HIPAA compliance guidelines.
          </p>
        </div>
      </div>
    </div>
  );
};
