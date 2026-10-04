import { useEffect, useState } from 'react';
import { 
  Loader2, Check, Pen, Download, Contact, UserCircle, 
  AtSign, Smartphone, Lock, CalendarDays, AlertCircle
} from 'lucide-react';
import { patientService, type PatientProfile } from '@/services/patient.service';
import { toast } from 'sonner';

export const PatientProfilePage = () => {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientService.getProfile()
      .then((res) => setProfile((res as any).data?.patient ?? null))
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
    <div className="p-4 sm:p-8 max-w-5xl mx-auto flex flex-col gap-6 animate-in fade-in duration-500 mb-8 relative">
      
      {/* Header Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="h-36 w-36 rounded-2xl bg-muted/50 overflow-hidden border border-border shrink-0 flex items-end justify-center pt-4">
                <img src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${profile.id}&backgroundColor=transparent&top=shortHair&clothing=shirtCrewNeck`} alt="Avatar" className="w-[120%] h-[120%] object-cover object-top" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-primary rounded-full flex items-center justify-center border-4 border-background shadow-lg">
              <Check className="h-4 w-4 text-primary-foreground stroke-[3]" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">{profile.full_name}</h1>
            <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5"><AtSign className="h-4 w-4" /> {profile.email}</span>
              {profile.phone_number && (
                <>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> {profile.phone_number}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => toast.info('Edit profile coming soon')} className="px-6 py-2.5 rounded-full bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold transition-colors flex items-center gap-2 text-sm">
             <Pen className="h-4 w-4" /> Edit Profile
          </button>
          <button onClick={() => toast.info('Generating Summary...')} className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg font-semibold transition-all flex items-center gap-2 text-sm">
             <Download className="h-4 w-4" /> Download Summary
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Personal Details */}
        <div className="bg-card rounded-[24px] border border-border p-8 lg:col-span-2">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
               <Contact className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-wide">Personal Details</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-y-10 gap-x-8">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Full Name</p>
              <p className="text-lg font-bold text-foreground">{profile.full_name}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Date of Birth</p>
              <p className="text-lg font-bold text-foreground">{new Date(profile.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Blood Group</p>
              <div className="flex items-center gap-3">
                <p className="text-lg font-bold text-foreground">{profile.blood_group || 'Unknown'}</p>
                {profile.blood_group === 'O-' && (
                  <span className="text-[9px] uppercase tracking-wider font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Universal Donor</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Language Preference</p>
              <p className="text-lg font-bold text-foreground">{profile.language_preference || 'English (US)'}</p>
            </div>
          </div>
        </div>

        {/* Account Metrics */}
        <div className="bg-card rounded-[24px] border border-border p-8 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
               <UserCircle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-wide">Account</h2>
          </div>

          <div className="space-y-4 flex-1">
            <div className="bg-muted/50 rounded-[16px] p-5 border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Member Since</p>
              <p className="text-lg font-bold text-primary">{new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </div>

            <div className="bg-muted/50 rounded-[16px] p-5 border border-border flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">No-Show Count</p>
                <p className="text-xl font-black text-foreground">{String(profile.no_show_count).padStart(2, '0')}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          {profile.no_show_count > 0 && (
             <div className="mt-4 flex items-center gap-2 text-red-400 text-xs font-semibold px-2">
               <AlertCircle className="h-3.5 w-3.5" />
               1 outstanding bill requires attention
             </div>
          )}
        </div>
      </div>

      {/* Row details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card rounded-[20px] border border-border p-6 flex items-center gap-4 hover:bg-muted/30 transition-colors">
          <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center shrink-0 border border-border">
             <AtSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Contact Email</p>
            <p className="text-sm font-bold text-foreground">{profile.email}</p>
          </div>
        </div>
        <div className="bg-card rounded-[20px] border border-border p-6 flex items-center gap-4 hover:bg-muted/30 transition-colors">
          <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center shrink-0 border border-border">
             <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Phone Number</p>
            <p className="text-sm font-bold text-foreground">{profile.phone_number}</p>
          </div>
        </div>
        <div className="bg-card rounded-[20px] border border-border p-6 flex items-center gap-4 hover:bg-muted/30 transition-colors">
          <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center shrink-0 border border-border">
             <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Identity Verification</p>
            <p className="text-sm font-bold text-foreground">Verified via Aadhaar</p>
          </div>
        </div>
      </div>

    </div>
  );
};
