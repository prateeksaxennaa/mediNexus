import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doctorOnboardSchema, type DoctorOnboardType } from '@/validations/auth.validation';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

export default function DoctorOnBoardForm() {
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(doctorOnboardSchema),
    defaultValues: {
      slotDuration: 15,
      availableFrom: "09:00",
      availableTo: "17:00",
      experienceYears: 0,
    }
  });
    const navigate = useNavigate();

  const onSubmit = async (data: DoctorOnboardType) => {
    try {
      // Map form fields to the fields accepted by PATCH /api/doctors/me
      const full_name = `${data.firstName} ${data.lastName}`.trim();
      const specialisation = data.specialization;
      // Store extra info in prescription_template as structured JSON
      const prescription_template = JSON.stringify({
        department: data.department,
        qualifications: data.qualifications,
        experience_years: data.experienceYears,
        consultation_fee: data.consultationFee,
        slot_duration_mins: data.slotDuration,
        available_from: data.availableFrom,
        available_to: data.availableTo,
        bio: data.bio ?? '',
      });

      await api.patch('/api/doctors/me', {
        full_name,
        specialisation,
        prescription_template,
      });

      toast.success("Profile setup complete!");
      navigate("/doctor/dashboard");
    } catch (error: any) {
      toast.error(error.message ?? 'Failed to save profile');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 animate-in fade-in zoom-in duration-300">
      
      {/* Personal & Basic Details */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Personal Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input id="firstName" placeholder="John" {...register('firstName')} />
            {errors.firstName && <p className="text-destructive text-xs">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input id="lastName" placeholder="Doe" {...register('lastName')} />
            {errors.lastName && <p className="text-destructive text-xs">{errors.lastName.message}</p>}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="qualifications">Qualifications (e.g., MBBS, MD)</Label>
            <Input id="qualifications" placeholder="MBBS, MD - Cardiology" {...register('qualifications')} />
            {errors.qualifications && <p className="text-destructive text-xs">{errors.qualifications.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="registrationNumber">Registration Number</Label>
            <Input id="registrationNumber" placeholder="MCI-123456" {...register('registrationNumber')} />
            {errors.registrationNumber && <p className="text-destructive text-xs">{errors.registrationNumber.message}</p>}
          </div>
        </div>
      </div>

      {/* Professional Details */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Professional Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Controller
              control={control}
              name="department"
              render={({ field }) => (
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cardiology">Cardiology</SelectItem>
                    <SelectItem value="neurology">Neurology</SelectItem>
                    <SelectItem value="orthopedics">Orthopedics</SelectItem>
                    <SelectItem value="pediatrics">Pediatrics</SelectItem>
                    <SelectItem value="general">General Medicine</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.department && <p className="text-destructive text-xs">{errors.department.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="specialization">Specialization</Label>
            <Input id="specialization" placeholder="Interventional Cardiology" {...register('specialization')} />
            {errors.specialization && <p className="text-destructive text-xs">{errors.specialization.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div className="space-y-2">
            <Label htmlFor="experienceYears">Experience (Years)</Label>
            <Input id="experienceYears" type="number" min="0" {...register('experienceYears')} />
            {errors.experienceYears && <p className="text-destructive text-xs">{errors.experienceYears.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="consultationFee">Consultation Fee ($)</Label>
            <Input id="consultationFee" type="number" min="0" placeholder="100" {...register('consultationFee')} />
            {errors.consultationFee && <p className="text-destructive text-xs">{errors.consultationFee.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Professional Bio</Label>
          <Textarea 
            id="bio" 
            placeholder="Brief description about your expertise and experience..." 
            className="resize-none h-24"
            {...register('bio')} 
          />
          {errors.bio && <p className="text-destructive text-xs">{errors.bio.message}</p>}
        </div>
      </div>

      {/* Scheduling & Availability */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Scheduling Basics</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="slotDuration">Slot Duration (Mins)</Label>
            <Controller
              control={control}
              name="slotDuration"
              render={({ field }) => (
                <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value?.toString()}>
                  <SelectTrigger>
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 Mins</SelectItem>
                    <SelectItem value="15">15 Mins</SelectItem>
                    <SelectItem value="20">20 Mins</SelectItem>
                    <SelectItem value="30">30 Mins</SelectItem>
                    <SelectItem value="60">60 Mins</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.slotDuration && <p className="text-destructive text-xs">{errors.slotDuration.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="availableFrom">Shift Start (HH:MM)</Label>
            <Input id="availableFrom" type="time" {...register('availableFrom')} />
            {errors.availableFrom && <p className="text-destructive text-xs">{errors.availableFrom.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="availableTo">Shift End (HH:MM)</Label>
            <Input id="availableTo" type="time" {...register('availableTo')} />
            {errors.availableTo && <p className="text-destructive text-xs">{errors.availableTo.message}</p>}
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full h-12 text-md mt-6" disabled={isSubmitting}>
        {isSubmitting ? 'Saving Profile...' : 'Complete Profile Setup'}
      </Button>
    </form>
  );
}