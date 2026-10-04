import { z } from 'zod';

export const updateDoctorProfileSchema = z.object({
  body: z
    .object({
      full_name: z.string().min(2).max(100).trim().optional(),
      specialisation: z.string().min(2).max(100).trim().optional(),
      prescription_template: z.string().max(5000).optional(),
    })
    .refine(
      (data) => Object.values(data).some((v) => v !== undefined),
      { message: 'At least one field must be provided' }
    ),
});

export type UpdateDoctorProfileBody = z.infer<typeof updateDoctorProfileSchema>['body'];
