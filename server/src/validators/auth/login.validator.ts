import { z } from 'zod';

// E.164 phone number format: +[country code][number], e.g. +14155552671
const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format (e.g. +14155552671)');

export const loginSchema = z.object({
  body: z
    .object({
      email: z.string().email('Invalid email address').optional(),
      phone: e164Phone.optional(),
      password: z.string().min(1, 'Password is required'),
    })
    .refine((data) => data.email || data.phone, {
      message: 'At least one of email or phone number is required',
      path: ['email'],
    }),
});

export type LoginBody = z.infer<typeof loginSchema>['body'];

// ─── Refresh token ───────────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'refresh_token is required'),
  }),
});

export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>['body'];
