import { z } from 'zod';
import type { HospitalType } from '../../models/database.types.js';

const hospitalTypes = ['government', 'private', 'clinic', 'nursing_home'] as const satisfies readonly HospitalType[];

export const updateHospitalProfileSchema = z.object({
  body: z
    .object({
      name: z.string().min(2).max(200).trim().optional(),
      type: z.enum(hospitalTypes, { message: 'Invalid hospital type' }).optional(),
      address: z.string().min(5).max(300).trim().optional(),
      city: z.string().min(2).max(100).trim().optional(),
      state: z.string().min(2).max(100).trim().optional(),
    })
    .refine(
      (data) => Object.values(data).some((v) => v !== undefined),
      { message: 'At least one field must be provided' }
    ),
});

export type UpdateHospitalProfileBody = z.infer<typeof updateHospitalProfileSchema>['body'];
