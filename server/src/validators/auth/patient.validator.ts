import { z } from 'zod';

// E.164 phone number format: +[country code][number], e.g. +14155552671
const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format (e.g. +14155552671)');

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const registerPatientSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address').optional(),
      phone: e164Phone.optional(),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(72, 'Password must be at most 72 characters'),
      full_name: z
        .string()
        .min(2, 'Full name must be at least 2 characters')
        .max(100, 'Full name must be at most 100 characters')
        .trim(),
      dob: z.string().date('Invalid date format. Use YYYY-MM-DD').optional(),
      blood_group: z.enum(bloodGroups, { message: 'Invalid blood group' }).optional(),
      language_preference: z.string().min(2).max(10).optional(),
    })
    .refine((data) => data.email || data.phone, {
      message: 'At least one of email or phone number is required',
      path: ['email'],
    }),
});

export type RegisterPatientBody = z.infer<typeof registerPatientSchema>['body'];
