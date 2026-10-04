import { useEffect, useState } from 'react';
import {
  Loader2, Check, Pen, Stethoscope, BadgeCheck,
  CalendarDays, Clock, BookOpen,
} from 'lucide-react';
import { doctorService, type DoctorProfile } from '@/services/doctor.service';
import { toast } from 'sonner';

export const DoctorProfilePage = () => {
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    doctorService.getProfile()
      .then((res) => setProfile((res as any).data?.doctor ?? null))
      .catch((e: any) => toast.error(e.message ?? 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 animate-in fade-in">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
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
            <div className="h-36 w-36 rounded-2xl bg-muted/50 overflow-hidden border border-border shrink-0 flex items-end justify-center pt-4">
              <img
                src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${profile.id ?? profile.full_name}&backgroundColor=transparent&top=shortHair&clothing=shirtCrewNeck`}
                alt="Avatar"
                className="w-[120%] h-[120%] object-cover object-top"
              />
            </div>
            {profile.verified && (
              <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-primary rounded-full flex items-center justify-center border-4 border-background shadow-lg">
                <Check className="h-4 w-4 text-primary-foreground stroke-[3]" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">{profile.full_name}</h1>
            <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <span>{[profile.specialisation, profile.department].filter(Boolean).join(' · ')}</span>
            </div>
            {profile.verified && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-semibold mt-2">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => toast.info('Edit profile coming soon')}
            className="px-6 py-2.5 rounded-full bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold transition-colors flex items-center gap-2 text-sm"
          >
            <Pen className="h-4 w-4" /> Edit Profile
          </button>
        </div>
      </div>

      {/* ═══ Professional Details + Account ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Professional Details */}
        <div className="bg-card rounded-[24px] border border-border p-8 lg:col-span-2">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-wide">Professional Details</h2>
          </div>

          <div className="grid grid-cols-2 gap-y-10 gap-x-8">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Specialisation</p>
              <p className="text-lg font-bold text-foreground">{profile.specialisation || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Department</p>
              <p className="text-lg font-bold text-foreground">{profile.department || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Qualifications</p>
              <p className="text-lg font-bold text-foreground">{profile.qualifications || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Registration No.</p>
              <p className="text-lg font-bold text-primary">{profile.registration_number || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Experience</p>
              <p className="text-lg font-bold text-foreground">{profile.experience_years != null ? `${profile.experience_years} years` : '—'}</p>
            </div>
          </div>
        </div>

        {/* Account Sidebar */}
        <div className="bg-card rounded-[24px] border border-border p-8 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-wide">Account</h2>
          </div>

          <div className="space-y-4 flex-1">
            <div className="bg-muted/50 rounded-[16px] p-5 border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Member Since</p>
              <p className="text-lg font-bold text-primary">
                {profile.created_at
                  ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                  : '—'}
              </p>
            </div>

            <div className="bg-muted/50 rounded-[16px] p-5 border border-border flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Status</p>
                <p className="text-xl font-black text-foreground">{profile.verified ? 'Verified' : 'Pending'}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <BadgeCheck className={`h-5 w-5 ${profile.verified ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Availability & Fees ═══ */}
      <div className="bg-card rounded-[24px] border border-border p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-wide">Availability & Fees</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-8">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Available From</p>
            <p className="text-lg font-bold text-foreground">{profile.available_from || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Available To</p>
            <p className="text-lg font-bold text-foreground">{profile.available_to || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Slot Duration</p>
            <p className="text-lg font-bold text-foreground">{profile.slot_duration_mins != null ? `${profile.slot_duration_mins} min` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Consultation Fee</p>
            <p className="text-lg font-bold text-primary">{profile.consultation_fee != null ? `₹${profile.consultation_fee}` : '—'}</p>
          </div>
        </div>
      </div>

      {/* ═══ Bio ═══ */}
      {profile.bio && (
        <div className="bg-card rounded-[24px] border border-border p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-wide">Bio</h2>
          </div>
          <p className="text-sm text-primary/80 leading-relaxed">{profile.bio}</p>
        </div>
      )}
    </div>
  );
};
