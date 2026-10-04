import { z } from 'zod';

const appointmentStatuses = [
  'booked',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

export const updateAppointmentStatusSchema = z.object({
  body: z.object({
    status: z.enum(appointmentStatuses, { message: 'Invalid appointment status' }),
    notes: z.string().max(2000).optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid appointment ID'),
  }),
});

export type UpdateAppointmentStatusBody = z.infer<typeof updateAppointmentStatusSchema>['body'];
