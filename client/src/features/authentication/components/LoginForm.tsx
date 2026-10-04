import { useState, type FunctionComponent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { userLogInSchema, type userLogInType } from '@/validations/auth.validation';
import { toast } from 'sonner';
import { type LoginFormProps } from '@/types';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_DASHBOARD } from '@/context/AuthContext';

const LoginForm: FunctionComponent<LoginFormProps> = ({ role }) => {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

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

  const onSubmit = async (data: userLogInType) => {
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

  return (
    <div className="w-full space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
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
            <a href="#" className="text-sm text-primary hover:underline">Forgot password?</a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter password"
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

        <Button type="submit" className="w-full h-11 rounded-lg font-medium" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Log in'}
        </Button>
      </form>
      
      {role === 'doctor' && (
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm text-muted-foreground">
            Doctor accounts are created by hospital administrators. Please contact your admin for login credentials.
          </p>
        </div>
      )}
    </div>
  );
};

export default LoginForm;
