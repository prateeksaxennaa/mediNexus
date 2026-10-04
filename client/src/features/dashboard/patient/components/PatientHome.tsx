import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Contact,
  BriefcaseMedical,
  Search,
  Syringe,
  ShieldPlus,
  Heart,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { patientService, type PatientAppointment } from '@/services/patient.service';
import { useAppointmentRefresh } from '@/hooks/useAppointmentRefresh';
import { toast } from 'sonner';

export const PatientHome = ({ setActiveTab }: { setActiveTab?: (tab: string) => void }) => {
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState<PatientAppointment[]>([]);

  const fetchUpcoming = useCallback(() => {
    patientService
      .listAppointments('upcoming')
      .then((res) => setUpcoming((res as any).data?.appointments ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  useAppointmentRefresh(fetchUpcoming);

  return (
    <div className="relative p-8 animate-in fade-in duration-700 w-[calc(100%-2rem)] max-w-7xl mx-auto pb-32 overflow-hidden">
      
      {/* ── Welcome & System Status ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">Welcome Back, Dev</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            You have no clinical emergencies today. Your current health metrics are within the optimal threshold.
          </p>
        </div>
        

      </div>

      {/* ── Top Main Cards Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
        
        {/* Card 1: Appointments */}
        <div className="relative bg-card border border-border rounded-2xl p-6 overflow-hidden group">
          <div className="flex justify-between items-start mb-6 z-10 relative">
            <Calendar className="w-5 h-5 text-primary/70" />
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-full bg-muted text-muted-foreground">
              Active Queue
            </span>
          </div>
          <div className="relative z-10">
            <h3 className="text-lg font-semibold text-foreground mb-2">Upcoming Appointments</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No scheduled consultations for the next 24 hours.
            </p>
          </div>
          {/* Subtle background number watermark */}
          <div className="absolute -bottom-8 -left-2 text-[120px] font-black text-foreground/[0.03] leading-none pointer-events-none">
            {upcoming.length}
          </div>
        </div>

        {/* Card 2: Health Passport */}
        <div className="relative bg-card border border-border rounded-2xl p-6 group cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setActiveTab?.('passport')}>
          <div className="mb-6">
            <Contact className="w-5 h-5 text-primary/70" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Health Passport</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Access your immutable medical history, immunization records, and diagnostic reports.
            </p>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-primary group-hover:text-primary/80 transition-colors">
              View full records <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 3: Find a Doctor */}
        <div className="relative bg-card border border-border rounded-2xl p-6 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/patient/discover')}>
          <div className="mb-6">
            <BriefcaseMedical className="w-5 h-5 text-primary/70" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Find a Doctor</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              Search across our network of Clinical Luminaries and specialized hospitals.
            </p>
            <div className="relative">
              <Input 
                placeholder="Search specialized clinic..." 
                className="bg-muted/50 border-border rounded-xl h-10 px-4 text-sm focus-visible:ring-primary/50 placeholder:text-muted-foreground/60"
              />
              <Search className="w-3.5 h-3.5 absolute right-3 top-3 text-muted-foreground/60" />
            </div>
          </div>
        </div>

      </div>

      {/* ── Clinical Quick Actions Divider ── */}
      <div className="text-center mb-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
          Clinical Quick Actions
        </span>
      </div>

      {/* ── Quick Actions Horizontal Bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
        
        <Button 
          variant="outline" 
          className="h-14 bg-secondary border-border hover:bg-secondary/80 hover:text-foreground text-muted-foreground rounded-2xl shadow-sm transition-all"
          onClick={() => navigate('/patient/discover')}
        >
          <Search className="w-4 h-4 mr-2 text-muted-foreground" />
          <span className="font-semibold text-[13px]">Find a Doctor</span>
        </Button>

        <Button 
          variant="outline" 
          className="h-14 bg-secondary border-border hover:bg-secondary/80 hover:text-foreground text-muted-foreground rounded-2xl shadow-sm transition-all"
          onClick={() => navigate('/patient/services')}
        >
          <Syringe className="w-4 h-4 mr-2 text-muted-foreground" />
          <span className="font-semibold text-[13px]">Book a Service</span>
        </Button>

        <Button 
          variant="outline" 
          className="h-14 bg-secondary border-border hover:bg-secondary/80 hover:text-foreground text-muted-foreground rounded-2xl shadow-sm transition-all"
          onClick={() => setActiveTab?.('appointments')}
        >
          <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
          <span className="font-semibold text-[13px]">My Appointments</span>
        </Button>

        <Button 
          variant="outline" 
          className="h-14 bg-secondary border-border hover:bg-secondary/80 hover:text-foreground text-muted-foreground rounded-2xl shadow-sm transition-all"
          onClick={() => setActiveTab?.('passport')}
        >
          <ShieldPlus className="w-4 h-4 mr-2 text-muted-foreground" />
          <span className="font-semibold text-[13px]">Health Passport</span>
        </Button>

      </div>

      {/* ── Health Tip of the Day ── */}
      <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 hover:border-border/80 transition-colors">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex shrink-0 items-center justify-center shadow-inner">
          <Heart className="w-7 h-7 text-rose-400 fill-rose-400/20" />
        </div>
        
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-rose-400 font-semibold text-lg mb-2">Health Tip of the Day</h3>
          <p className="text-muted-foreground text-[15px] leading-relaxed max-w-3xl">
            Maintaining a consistent sleep cycle of 7-9 hours per day enhances cognitive recovery and regulates your resting heart rate. Try setting a "wind-down" alert 30 minutes before bed.
          </p>
        </div>

        <div className="flex-shrink-0 mt-4 sm:mt-0 self-center">
          <Button 
            variant="secondary" 
            className="bg-secondary hover:bg-secondary/80 text-foreground rounded-full px-6 text-xs font-bold tracking-wider uppercase h-10"
            onClick={() => toast.info('Detailed insights module coming soon!')}
          >
            More Insights
          </Button>
        </div>
      </div>



    </div>
  );
};

