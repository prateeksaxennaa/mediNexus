import { z } from 'zod';

export const createServiceSchema = z.object({
  body: z.object({
    service_type: z.string().min(2).max(100).trim(),
    service_name: z.string().min(2).max(200).trim(),
    department: z.string().min(2).max(100).trim(),
    default_duration_mins: z
      .number({ message: 'default_duration_mins must be a number' })
      .int()
      .positive('Duration must be positive'),
    fee: z
      .number({ message: 'fee must be a number' })
      .nonnegative('Fee must be non-negative'),
    daily_slot_limit: z
      .number({ message: 'daily_slot_limit must be a number' })
      .int()
      .positive('daily_slot_limit must be positive')
      .optional(),
    pay_at_counter: z.boolean().optional().default(false),
    is_available: z.boolean().optional().default(true),
  }),
});

export const updateServiceSchema = z.object({
  body: z
    .object({
      service_type: z.string().min(2).max(100).trim().optional(),
      service_name: z.string().min(2).max(200).trim().optional(),
      department: z.string().min(2).max(100).trim().optional(),
      default_duration_mins: z.number().int().positive().optional(),
      fee: z.number().nonnegative().optional(),
      daily_slot_limit: z.number().int().positive().optional(),
      pay_at_counter: z.boolean().optional(),
      is_available: z.boolean().optional(),
    })
    .refine(
      (data) => Object.values(data).some((v) => v !== undefined),
      { message: 'At least one field must be provided' }
    ),
  params: z.object({
    serviceId: z.string().uuid('Invalid service ID'),
  }),
});

export type CreateServiceBody = z.infer<typeof createServiceSchema>['body'];
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>['body'];
