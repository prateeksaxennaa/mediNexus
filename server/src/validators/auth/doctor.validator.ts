import { z } from 'zod';

export const inviteDoctorSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    full_name: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name must be at most 100 characters')
      .trim(),
    specialisation: z
      .string()
      .min(2, 'Specialisation must be at least 2 characters')
      .max(100, 'Specialisation must be at most 100 characters')
      .trim(),
  }),
  params: z.object({
    hospitalId: z.string().uuid('Invalid hospital ID'),
  }),
});

export type InviteDoctorBody = z.infer<typeof inviteDoctorSchema>['body'];
