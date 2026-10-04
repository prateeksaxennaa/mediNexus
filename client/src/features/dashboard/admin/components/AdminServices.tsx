import { useEffect, useState } from 'react';
import {
  Plus, Edit2, Trash2, Check, Clock, Users, CreditCard,
  HeartPulse, Stethoscope, Droplet, ScanLine, Activity,
  FlaskConical, BrainCircuit, Bone, Eye, Pill,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hospitalService, type HospitalService } from '@/services/hospital.service';
import { toast } from 'sonner';

const emptyForm = {
  service_type: '',
  service_name: '',
  department: '',
  default_duration_mins: 15,
  daily_slot_limit: 10,
  fee: 0,
  pay_at_counter: false,
  is_available: true,
};

// Pick an icon based on service type / name keywords
const getServiceIcon = (name: string, type: string) => {
  const key = `${name} ${type}`.toLowerCase();
  if (key.includes('cardio') || key.includes('heart') || key.includes('ecg') || key.includes('cardiogram'))
    return HeartPulse;
  if (key.includes('blood') || key.includes('glucose') || key.includes('haemo'))
    return Droplet;
  if (key.includes('xray') || key.includes('x-ray') || key.includes('radiol') || key.includes('mri') || key.includes('ct'))
    return ScanLine;
  if (key.includes('consult') || key.includes('opd') || key.includes('general'))
    return Stethoscope;
  if (key.includes('lab') || key.includes('path') || key.includes('test'))
    return FlaskConical;
  if (key.includes('neuro') || key.includes('brain'))
    return BrainCircuit;
  if (key.includes('ortho') || key.includes('bone'))
    return Bone;
  if (key.includes('eye') || key.includes('ophthal'))
    return Eye;
  if (key.includes('pharma') || key.includes('medic') || key.includes('drug'))
    return Pill;
  return Activity;
};

// Accent color per service class
const ICON_COLORS: Record<string, string> = {
  HeartPulse: 'text-rose-400 bg-rose-500/10',
  Droplet: 'text-sky-400 bg-sky-500/10',
  ScanLine: 'text-violet-400 bg-violet-500/10',
  Stethoscope: 'text-emerald-400 bg-emerald-500/10',
  FlaskConical: 'text-amber-400 bg-amber-500/10',
  BrainCircuit: 'text-fuchsia-400 bg-fuchsia-500/10',
  Bone: 'text-orange-400 bg-orange-500/10',
  Eye: 'text-teal-400 bg-teal-500/10',
  Pill: 'text-indigo-400 bg-indigo-500/10',
  Activity: 'text-primary bg-primary/10',
};

export const AdminServices = () => {
  const [services, setServices] = useState<HospitalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HospitalService | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HospitalService | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    hospitalService
      .listServices()
      .then(res => setServices((res as any).data?.services ?? []))
      .catch(() => toast.error('Failed to load services'))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (svc: HospitalService) => {
    setEditTarget(svc);
    setForm({
      service_type: svc.service_type,
      service_name: svc.service_name,
      department: svc.department,
      default_duration_mins: svc.default_duration_mins,
      daily_slot_limit: svc.daily_slot_limit || 10,
      fee: svc.fee,
      pay_at_counter: svc.pay_at_counter,
      is_available: svc.is_available,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.service_name.trim() || !form.service_type.trim() || !form.department.trim()) {
      toast.error('Name, type, and department are required');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        const res = await hospitalService.updateService(editTarget.id, form);
        const updated = (res as any).data?.service;
        setServices(svcs => svcs.map(s => s.id === editTarget.id ? { ...s, ...updated } : s));
        toast.success('Service updated');
      } else {
        const res = await hospitalService.createService(form);
        const created = (res as any).data?.service;
        if (created) setServices(svcs => [created, ...svcs]);
        toast.success('Service created');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await hospitalService.deleteService(deleteTarget.id);
      setServices(svcs => svcs.filter(s => s.id !== deleteTarget.id));
      toast.success('Service deleted');
    } catch {
      toast.error('Failed to delete service');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-in fade-in duration-300">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  const availableCount = services.filter(s => s.is_available).length;

  return (
    <div className="p-6 animate-in fade-in duration-500 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hospital Services</h1>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            {services.length} service{services.length !== 1 ? 's' : ''} configured
            <span className="text-muted-foreground">·</span>
            {availableCount} available
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-full px-5 shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Add Service
        </Button>
      </div>

      {/* Service catalogue */}
      {services.length === 0 ? (
        <div className="bg-card border rounded-2xl p-16 text-center text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No services configured yet.</p>
          <p className="text-sm mt-1">Add your first service to let patients book.</p>
        </div>
      ) : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Service Catalogue</p>
          </div>
          <div className="divide-y">
            {services.map(svc => {
              const Icon = getServiceIcon(svc.service_name, svc.service_type);
              const colorClass = ICON_COLORS[Icon.displayName ?? Icon.name] ?? ICON_COLORS['Activity'];

              return (
                <div key={svc.id} className="flex items-start gap-5 px-6 py-5 hover:bg-muted/20 transition-colors group">
                  {/* Service icon */}
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon className="h-7 w-7" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Name + badge */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="font-bold text-base">{svc.service_name}</p>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        svc.is_available
                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25'
                          : 'bg-muted text-muted-foreground border'
                      }`}>
                        {svc.is_available ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                    {/* Sub-type */}
                    <p className="text-sm text-muted-foreground">
                      {svc.department} · <span className="capitalize">{svc.service_type}</span>
                    </p>
                    {/* Metadata row */}
                    <div className="flex items-center gap-5 flex-wrap text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground/60" />
                        ₹ {svc.fee}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                        {svc.default_duration_mins} min
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground/60" />
                        {svc.daily_slot_limit || 10} slots/day
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
                        {svc.pay_at_counter ? 'Pay at counter' : 'Pre-pay only'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(svc)}
                      className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(svc)}
                      className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Service Name</Label>
              <Input
                placeholder="e.g. General Consultation"
                value={form.service_name}
                onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Input
                placeholder="e.g. consultation"
                value={form.service_type}
                onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input
                placeholder="e.g. General Medicine"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number" min={5}
                value={form.default_duration_mins}
                onChange={e => setForm(f => ({ ...f, default_duration_mins: parseInt(e.target.value) || 15 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Daily Slot Limit</Label>
              <Input
                type="number" min={1} max={100}
                value={form.daily_slot_limit}
                onChange={e => setForm(f => ({ ...f, daily_slot_limit: parseInt(e.target.value) || 10 }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Fee (₹)</Label>
              <Input
                type="number" min={0}
                value={form.fee}
                onChange={e => setForm(f => ({ ...f, fee: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.pay_at_counter} onCheckedChange={v => setForm(f => ({ ...f, pay_at_counter: v }))} />
              <Label>Pay at Counter</Label>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.is_available} onCheckedChange={v => setForm(f => ({ ...f, is_available: v }))} />
              <Label>Available</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '…' : editTarget
                ? <><Check className="h-4 w-4 mr-1" />Save</>
                : <><Plus className="h-4 w-4 mr-1" />Create</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.service_name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
