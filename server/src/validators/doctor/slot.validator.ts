import { z } from 'zod';

const slotShape = z.object({
  slot_start: z.string().datetime({ message: 'slot_start must be an ISO 8601 datetime' }),
  slot_end: z.string().datetime({ message: 'slot_end must be an ISO 8601 datetime' }),
});

export const createSlotsSchema = z.object({
  body: z.object({
    slots: z
      .array(slotShape)
      .min(1, 'At least one slot is required')
      .max(50, 'Maximum 50 slots per request'),
  }),
});

export type CreateSlotsBody = z.infer<typeof createSlotsSchema>['body'];
