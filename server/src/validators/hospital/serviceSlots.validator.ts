import { z } from 'zod';

const isValidDateOnly = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());

export const generateServiceSlotsSchema = z.object({
  body: z
    .object({
      serviceId: z.string().uuid('Invalid service ID'),
      startDate: z
        .string()
        .refine(isValidDateOnly, 'Invalid startDate (expected YYYY-MM-DD)'),
      endDate: z
        .string()
        .refine(isValidDateOnly, 'Invalid endDate (expected YYYY-MM-DD)'),
      numberOfSlots: z
        .number()
        .int()
        .positive()
        .max(200, 'Max 200 slots per day')
        .optional(),
    })
    .refine((data) => data.endDate >= data.startDate, {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    }),
});

export const updateServiceDaySlotsSchema = z.object({
  body: z.object({
    serviceId: z.string().uuid('Invalid service ID'),
    slotDate: z
      .string()
      .refine(isValidDateOnly, 'Invalid slotDate (expected YYYY-MM-DD)'),
    numberOfSlots: z
      .number()
      .int()
      .positive()
      .max(200, 'Max 200 slots per day')
      .min(1, 'Minimum 1 slot per day'),
  }),
});

export const bookServiceSlotSchema = z.object({
  body: z.object({
    slotId: z.string().uuid('Invalid slot ID'),
  }),
});

// 'cancelled' is NOT a valid direct slot status — slots are only
// available / locked / booked / blocked. 'cancelled' belongs to appointments.
export const updateServiceSlotSchema = z.object({
  body: z.object({
    status: z.enum(['available', 'locked', 'booked', 'blocked']).optional(),
  }),
  params: z.object({
    slotId: z.string().uuid('Invalid slot ID'),
  }),
});

export const updateServiceWithSlotsSchema = z.object({
  body: z.object({
    daily_slot_limit: z.number().int().positive().max(200).optional(),
    is_available: z.boolean().optional(),
  }),
  params: z.object({
    serviceId: z.string().uuid('Invalid service ID'),
  }),
});

export type GenerateServiceSlotsBody = z.infer<typeof generateServiceSlotsSchema>['body'];
export type UpdateServiceDaySlotsBody = z.infer<typeof updateServiceDaySlotsSchema>['body'];
export type BookServiceSlotBody = z.infer<typeof bookServiceSlotSchema>['body'];
export type UpdateServiceSlotBody = z.infer<typeof updateServiceSlotSchema>['body'];
export type UpdateServiceWithSlotsBody = z.infer<typeof updateServiceWithSlotsSchema>['body'];
