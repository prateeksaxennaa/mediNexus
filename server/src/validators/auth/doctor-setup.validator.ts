import { z } from 'zod';

export const doctorSetupSchema = z.object({
  body: z.object({
    // ── Auth ──────────────────────────────────────────────────────
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).*$/,
        'Password must contain at least one uppercase letter, one number, and one special character',
      ),

    // ── Identity ──────────────────────────────────────────────────
    full_name: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name too long'),

    // ── Professional ──────────────────────────────────────────────
    specialisation: z
      .string()
      .min(2, 'Specialisation must be at least 2 characters')
      .max(100),

    department: z
      .string()
      .min(2, 'Department is required')
      .max(100),

    qualifications: z
      .string()
      .min(2, 'Qualifications are required')
      .max(200),

    registration_number: z
      .string()
      .min(2, 'Medical registration number is required')
      .max(100),

    experience_years: z
      .number()
      .int()
      .min(0, 'Experience must be 0 or greater')
      .max(70),

    consultation_fee: z
      .number()
      .min(0, 'Fee must be 0 or greater')
      .max(1_000_000),

    bio: z
      .string()
      .max(500, 'Bio must be at most 500 characters')
      .optional(),

    // ── Scheduling defaults ───────────────────────────────────────
    available_from: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format, expected HH:MM'),

    available_to: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format, expected HH:MM'),

    slot_duration_mins: z
      .number()
      .int()
      .min(5, 'Slot duration must be at least 5 minutes')
      .max(120, 'Slot duration must be at most 120 minutes'),
  }),
});

export type DoctorSetupBody = z.infer<typeof doctorSetupSchema>['body'];
