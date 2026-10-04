import { z } from 'zod';

// E.164 phone number format: +[country code][number], e.g. +14155552671
const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format (e.g. +14155552671)');

const hospitalTypes = ['government', 'private', 'clinic', 'nursing_home'] as const;

export const registerHospitalAdminSchema = z.object({
  body: z.object({
    // Admin credentials
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
    full_name: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name must be at most 100 characters')
      .trim(),

    // Hospital info
    hospital_name: z
      .string()
      .min(2, 'Hospital name must be at least 2 characters')
      .max(200, 'Hospital name must be at most 200 characters')
      .trim(),
    hospital_type: z.enum(hospitalTypes, {
      message: 'Hospital type must be one of: government, private, clinic, nursing_home',
    }),
    address: z
      .string()
      .min(5, 'Address must be at least 5 characters')
      .max(500, 'Address must be at most 500 characters')
      .trim(),
    city: z.string().min(2).max(100).trim(),
    state: z.string().min(2).max(100).trim(),
    registration_number: z
      .string()
      .min(2, 'Registration number must be at least 2 characters')
      .max(100, 'Registration number must be at most 100 characters')
      .trim(),
    contact_phone: e164Phone,
  }),
});

export type RegisterHospitalAdminBody = z.infer<typeof registerHospitalAdminSchema>['body'];
