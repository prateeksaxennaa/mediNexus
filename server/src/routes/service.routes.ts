import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { bookServiceSlotSchema } from '../validators/hospital/serviceSlots.validator.js';

import {
  discoverServices,
  getServiceSlots,
  lockServiceSlot,
  bookServiceSlot,
  releaseServiceSlot,
  listMyServiceAppointments,
  cancelServiceAppointment,
} from '../controllers/patient/serviceSlots.controller.js';

export const serviceRouter = Router();

// ── Public endpoints ───────────────────────────────────────────────────────────
// NOTE: static paths (/discover, /me/*) MUST be declared before wildcard
// /:serviceId to prevent Express treating "discover" or "me" as a serviceId.
serviceRouter.get('/discover', discoverServices);
serviceRouter.get('/:serviceId/slots', getServiceSlots);

// ── Protected endpoints (require authentication) ───────────────────────────────
// My service appointments — /me/* must stay above /:serviceId wildcards
serviceRouter.get('/me/appointments', authenticate, listMyServiceAppointments);
serviceRouter.patch('/me/appointments/:appointmentId/cancel', authenticate, cancelServiceAppointment);

// Booking flow
serviceRouter.post('/lock', authenticate, lockServiceSlot);
serviceRouter.post('/book', authenticate, validate(bookServiceSlotSchema), bookServiceSlot);
serviceRouter.patch('/:slotId/release', authenticate, releaseServiceSlot);
