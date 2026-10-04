import { useState, useEffect, type FunctionComponent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, ShieldCheck, ArrowRight, RefreshCw, Smartphone, Mail } from 'lucide-react';
import { userLogInSchema, type userLogInType } from '@/validations/auth.validation';
import { toast } from 'sonner';
import { type LoginFormProps } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_DASHBOARD } from '@/context/AuthContext';
import { authService } from '@/services/auth.service';

const LoginForm: FunctionComponent<LoginFormProps> = ({ role }) => {
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login, loginWithOtp } = useAuth();

  // ── OTP State ────────────────────────────────────────────────────────────
  const [otpStep, setOtpStep] = useState<'input' | 'verify'>('input');
  const [identifier, setIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ── Password Form ────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<userLogInType>({
    resolver: zodResolver(userLogInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onPasswordSubmit = async (data: userLogInType) => {
    try {
      const user = await login(data.email, data.password);

      if (!user.role) {
        toast.error('Your account has no role assigned. Please contact support.');
        return;
      }

      toast.success('Successfully logged in');
      navigate(ROLE_DASHBOARD[user.role]);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Login failed. Please try again.';
      toast.error(message);
    }
  };

  // ── OTP Handlers ─────────────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identifier.trim()) {
      toast.error('Please enter your email or phone number');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await authService.sendOtp(identifier.trim());
      toast.success(`Verification code sent to ${identifier.trim()}`);
      if (res.data?.devOtp) {
        setDevOtp(res.data.devOtp);
      }
      setOtpStep('verify');
      setCooldown(30);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send verification code. Please check your details.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const user = await loginWithOtp(identifier.trim(), otpCode.trim());

      if (!user.role) {
        toast.error('Your account has no role assigned. Please contact support.');
        return;
      }

      toast.success('Successfully authenticated with OTP');
      navigate(ROLE_DASHBOARD[user.role]);
    } catch (err: any) {
      toast.error(err?.message || 'Invalid or expired OTP code. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      {/* Auth Method Switcher Toggle */}
      <div className="flex p-1 bg-muted/50 rounded-xl border border-border/60">
        <button
          type="button"
          onClick={() => {
            setAuthMethod('password');
            setOtpStep('input');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
            authMethod === 'password'
              ? 'bg-background text-foreground shadow-sm border border-border/40 font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          Password Login
        </button>
        <button
          type="button"
          onClick={() => setAuthMethod('otp')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
            authMethod === 'otp'
              ? 'bg-background text-foreground shadow-sm border border-border/40 font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Instant OTP
        </button>
      </div>

      {/* ── 1. PASSWORD MODE ── */}
      {authMethod === 'password' && (
        <form onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="e.g. yourname@example.com"
              className="h-11 rounded-lg"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-destructive text-sm">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                className="h-11 rounded-lg pr-10"
                {...register('password')}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full h-11 rounded-lg font-medium shadow-sm" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in with Password'}
          </Button>
        </form>
      )}

      {/* ── 2. OTP MODE ── */}
      {authMethod === 'otp' && otpStep === 'input' && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp-identifier" className="text-sm font-medium">
              Email or WhatsApp Phone Number
            </Label>
            <div className="relative">
              <Input
                id="otp-identifier"
                type="text"
                placeholder="e.g. patient@example.com or +919876543210"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-11 rounded-lg pl-10"
                autoFocus
              />
              <div className="absolute left-3 top-3 text-muted-foreground pointer-events-none">
                {identifier.includes('@') ? (
                  <Mail className="w-5 h-5" />
                ) : (
                  <Smartphone className="w-5 h-5" />
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              We'll send a 6-digit one-time code to your registered email or WhatsApp.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full h-11 rounded-lg font-medium shadow-sm flex items-center justify-center gap-2"
            disabled={isSendingOtp || !identifier.trim()}
          >
            {isSendingOtp ? 'Sending code...' : (
              <>
                Send Verification Code
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>
      )}

      {/* ── 3. OTP VERIFY STEP ── */}
      {authMethod === 'otp' && otpStep === 'verify' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary flex items-center justify-between">
            <span className="truncate">Sent code to: <strong>{identifier}</strong></span>
            <button
              type="button"
              onClick={() => {
                setOtpStep('input');
                setOtpCode('');
                setDevOtp(null);
              }}
              className="text-xs underline hover:text-primary font-medium shrink-0 ml-2"
            >
              Change
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="otp-code" className="text-sm font-medium">
              Enter 6-Digit Code
            </Label>
            <Input
              id="otp-code"
              type="text"
              maxLength={6}
              placeholder="••••••"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              className="h-12 rounded-lg text-center tracking-[0.5em] font-mono text-xl font-bold"
              autoFocus
            />

            {devOtp && (
              <button
                type="button"
                onClick={() => setOtpCode(devOtp)}
                className="w-full text-center text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md py-1.5 hover:bg-emerald-500/20 transition-all font-mono"
              >
                ⚡ Click to fill verification code: <strong>{devOtp}</strong>
              </button>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-11 rounded-lg font-medium shadow-sm"
            disabled={isVerifyingOtp || otpCode.length < 6}
          >
            {isVerifyingOtp ? 'Verifying...' : 'Verify & Sign in'}
          </Button>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>Didn't receive the code?</span>
            <button
              type="button"
              onClick={() => handleSendOtp()}
              disabled={cooldown > 0 || isSendingOtp}
              className="flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            >
              <RefreshCw className={`w-3 h-3 ${isSendingOtp ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
      )}

      {/* Role specific info notice */}
      {role === 'doctor' && (
        <div className="text-center p-3.5 rounded-lg bg-muted/40 border border-border/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Doctor accounts are provisioned by hospital administrators. Use your verified doctor email or phone to receive login OTP.
          </p>
        </div>
      )}

      {role === 'admin' && (
        <div className="text-center p-3.5 rounded-lg bg-muted/40 border border-border/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Hospital Administration Portal: Authorized administrative and clinical facility staff only.
          </p>
        </div>
      )}
    </div>
  );
};

export default LoginForm;
