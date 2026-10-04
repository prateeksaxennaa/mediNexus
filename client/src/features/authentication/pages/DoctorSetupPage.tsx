import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, User, Stethoscope, Clock } from 'lucide-react';
import { IconHeartbeat } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { authService } from '@/services/auth.service';
import { useAuth, ROLE_DASHBOARD } from '@/context/AuthContext';

// Read the invite token from the URL hash ONCE, synchronously, before any
// React rendering or effects can strip it.  window.location.hash is available
// immediately when the module is evaluated.
const _rawHash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
const _hashParams = new URLSearchParams(_rawHash);
const INVITE_TOKEN_FROM_HASH = _hashParams.get('access_token');

// Immediately clean the hash from the address bar so the token is not visible
// in the URL during form fill.  We do this here (not inside useEffect) to avoid
// a race where a second useEffect run sees an empty hash and redirects away.
if (typeof window !== 'undefined' && INVITE_TOKEN_FROM_HASH) {
  window.history.replaceState(null, '', window.location.pathname);
}

const doctorSetupSchema = z
  .object({
    // Identity
    full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),

    // Auth
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).*$/,
        'Must contain an uppercase letter, a number, and a special character',
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),

    // Professional
    specialisation: z.string().min(2, 'Required').max(100),
    department: z.string().min(2, 'Required').max(100),
    qualifications: z.string().min(2, 'Required').max(200),
    registration_number: z.string().min(2, 'Required').max(100),
    experience_years: z.number().int().min(0).max(70),
    consultation_fee: z.number().min(0).max(1_000_000),
    bio: z.string().max(500, 'Bio must be at most 500 characters').optional(),

    // Scheduling
    available_from: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time, expected HH:MM'),
    available_to: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time, expected HH:MM'),
    slot_duration_mins: z.number().int().min(5, 'Minimum 5 minutes').max(120, 'Maximum 120 minutes'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type DoctorSetupForm = z.infer<typeof doctorSetupSchema>;

// ─── Helper: section header ───────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-2">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="font-medium leading-none">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// ─── Helper: field error ──────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Doctor invite setup page — single page, collects all profile fields.
 *
 * Flow:
 * 1. Extracts access_token from the URL hash (emailed magic link).
 * 2. Shows a comprehensive form: identity, password, professional info, scheduling.
 * 3. Calls POST /api/auth/doctor/setup with the invite token as Bearer.
 * 4. Calls applySession() then navigates to the doctor dashboard.
 */
const DoctorSetupPage = () => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const { applySession } = useAuth();
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Validate the token captured at module load time.
  // Empty dep array — runs exactly once, navigate reference changes cannot
  // re-trigger this and accidentally redirect after the hash is already gone.
  useEffect(() => {
    if (!INVITE_TOKEN_FROM_HASH) {
      toast.error('Invalid or expired invite link.');
      navigateRef.current('/login', { replace: true });
      return;
    }
    setInviteToken(INVITE_TOKEN_FROM_HASH);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DoctorSetupForm>({
    resolver: zodResolver(doctorSetupSchema),
    defaultValues: {
      experience_years: 0,
      consultation_fee: 0,
      slot_duration_mins: 15,
      available_from: '09:00',
      available_to: '17:00',
    },
  });

  const onSubmit = async (data: DoctorSetupForm) => {
    if (!inviteToken) return;

    try {
      await authService.doctorSetup(
        {
          password: data.password,
          full_name: data.full_name,
          specialisation: data.specialisation,
          department: data.department,
          qualifications: data.qualifications,
          registration_number: data.registration_number,
          experience_years: data.experience_years,
          consultation_fee: data.consultation_fee,
          bio: data.bio || undefined,
          available_from: data.available_from,
          available_to: data.available_to,
          slot_duration_mins: data.slot_duration_mins,
        },
        inviteToken,
      );

      await applySession();

      toast.success('Account set up successfully. Welcome!');
      navigate(ROLE_DASHBOARD['doctor'], { replace: true });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Setup failed. Please try again.';
      toast.error(message);
    }
  };

  if (!inviteToken) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 py-12">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex items-center gap-2 font-serif text-2xl">
            <IconHeartbeat className="h-8 w-8 text-primary" />
            mediNexus
          </div>
          <h1 className="text-3xl font-light tracking-tight">Complete your account</h1>
          <p className="text-muted-foreground max-w-md">
            You've been invited to join as a doctor. Fill in your profile details to get
            started.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* ── Section 1: Identity & Password ── */}
          <div className="space-y-5">
            <SectionHeader
              icon={User}
              title="Identity & Access"
              description="Your name and login credentials"
            />
            <Separator />

            <div className="grid grid-cols-1 gap-5">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input id="full_name" placeholder="Dr. Jane Smith" {...register('full_name')} />
                <FieldError message={errors.full_name?.message} />
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      {...register('password')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                      onClick={() => setShowPassword((p) => !p)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <FieldError message={errors.password?.message} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Repeat password"
                      {...register('confirmPassword')}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                      onClick={() => setShowConfirm((p) => !p)}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <FieldError message={errors.confirmPassword?.message} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Professional Info ── */}
          <div className="space-y-5">
            <SectionHeader
              icon={Stethoscope}
              title="Professional Details"
              description="Your medical credentials and practice information"
            />
            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="specialisation">Specialisation</Label>
                <Input
                  id="specialisation"
                  placeholder="e.g. Cardiology"
                  {...register('specialisation')}
                />
                <FieldError message={errors.specialisation?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  placeholder="e.g. Cardiology Dept."
                  {...register('department')}
                />
                <FieldError message={errors.department?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="qualifications">Qualifications</Label>
                <Input
                  id="qualifications"
                  placeholder="e.g. MBBS, MD, DM"
                  {...register('qualifications')}
                />
                <FieldError message={errors.qualifications?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="registration_number">Medical Registration No.</Label>
                <Input
                  id="registration_number"
                  placeholder="e.g. MCI-12345"
                  {...register('registration_number')}
                />
                <FieldError message={errors.registration_number?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="experience_years">Years of Experience</Label>
                <Input
                  id="experience_years"
                  type="number"
                  min={0}
                  max={70}
                  placeholder="0"
                  {...register('experience_years', { valueAsNumber: true })}
                />
                <FieldError message={errors.experience_years?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consultation_fee">Consultation Fee (₹)</Label>
                <Input
                  id="consultation_fee"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="500"
                  {...register('consultation_fee', { valueAsNumber: true })}
                />
                <FieldError message={errors.consultation_fee?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">
                Bio{' '}
                <span className="text-muted-foreground font-normal text-sm">(optional)</span>
              </Label>
              <Textarea
                id="bio"
                placeholder="A brief description about yourself, your approach, and areas of interest…"
                rows={3}
                maxLength={500}
                {...register('bio')}
              />
              <FieldError message={errors.bio?.message} />
            </div>
          </div>

          {/* ── Section 3: Scheduling Defaults ── */}
          <div className="space-y-5">
            <SectionHeader
              icon={Clock}
              title="Scheduling Defaults"
              description="Your typical working hours and appointment slot length"
            />
            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="available_from">Available From</Label>
                <Input
                  id="available_from"
                  type="time"
                  {...register('available_from')}
                />
                <FieldError message={errors.available_from?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="available_to">Available To</Label>
                <Input
                  id="available_to"
                  type="time"
                  {...register('available_to')}
                />
                <FieldError message={errors.available_to?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slot_duration_mins">Slot Duration (mins)</Label>
                <Input
                  id="slot_duration_mins"
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  placeholder="15"
                  {...register('slot_duration_mins', { valueAsNumber: true })}
                />
                <FieldError message={errors.slot_duration_mins?.message} />
              </div>
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
            {isSubmitting ? 'Setting up your account…' : 'Complete setup & go to dashboard'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default DoctorSetupPage;
