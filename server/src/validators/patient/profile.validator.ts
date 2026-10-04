import { z } from 'zod';

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const updatePatientProfileSchema = z.object({
  body: z
    .object({
      full_name: z
        .string()
        .min(2, 'Full name must be at least 2 characters')
        .max(100, 'Full name must be at most 100 characters')
        .trim()
        .optional(),
      dob: z.string().date('Invalid date format. Use YYYY-MM-DD').optional(),
      blood_group: z.enum(bloodGroups, { message: 'Invalid blood group' }).optional(),
      known_allergies: z.string().max(500).optional(),
      language_preference: z.string().min(2).max(10).optional(),
    })
    .refine(
      (data) => Object.values(data).some((v) => v !== undefined),
      { message: 'At least one field must be provided' }
    ),
});

export type UpdatePatientProfileBody = z.infer<typeof updatePatientProfileSchema>['body'];
