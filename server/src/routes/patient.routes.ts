import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updatePatientProfileSchema } from '../validators/patient/profile.validator.js';

import { getPatientProfile, updatePatientProfile } from '../controllers/patient/profile.controller.js';
import {
  listPatientAppointments,
  getPatientAppointment,
  cancelPatientAppointment,
} from '../controllers/patient/appointments.controller.js';
import {
  listPatientPrescriptions,
  getPatientPrescription,
} from '../controllers/patient/prescriptions.controller.js';
import { listPatientReports } from '../controllers/patient/reports.controller.js';
import { reportSpeak } from '../controllers/patient/reportSpeak.controller.js';
import { getHealthTrends } from '../controllers/patient/healthTrends.controller.js';
import {
  lockSlot,
  bookAppointment,
  releaseSlotLock,
  joinWaitlist,
  listPatientWaitlist,
  acceptWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist,
} from '../controllers/patient/booking.controller.js';
import { getPatientPassport } from '../controllers/patient/passport.controller.js';
import {
  listAccessGrants,
  createAccessGrant,
  revokeAccessGrant,
  revokeAllGrantsForDoctor,
  initiateBookingGrantOtp,
  verifyBookingGrantOtp,
} from '../controllers/patient/grants.controller.js';
import {
  getPatientDataAccessLog,
  listPatientAccessAlerts,
  markPatientAccessAlertRead,
  getPatientAccessAlertPreferences,
  updatePatientAccessAlertPreferences,
} from '../controllers/patient/privacy.controller.js';
import { streamPatientWaitlist } from '../controllers/sse/waitlist.controller.js';
import { patientAIChat } from '../controllers/patient/aiChat.controller.js';

export const patientRouter = Router();

// All routes require authentication + patient role
patientRouter.use(authenticate, requireRole('patient'));

// ── Profile ─────────────────────────────────────────────────────────
patientRouter.get('/me', getPatientProfile);
patientRouter.patch('/me', validate(updatePatientProfileSchema), updatePatientProfile);

// ── Appointments ─────────────────────────────────────────────────────
patientRouter.get('/me/appointments', listPatientAppointments);
patientRouter.get('/me/appointments/:id', getPatientAppointment);
patientRouter.post('/me/appointments', bookAppointment);
patientRouter.patch('/me/appointments/:id/cancel', cancelPatientAppointment);

// ── Slot Booking (soft-lock) ──────────────────────────────────────────
patientRouter.post('/me/slots/lock', lockSlot);
patientRouter.patch('/me/slots/:slotId/release', releaseSlotLock);

// ── Waitlist ──────────────────────────────────────────────────────────
// SSE stream must be declared BEFORE the plain GET /me/waitlist route
patientRouter.get('/me/waitlist/stream', streamPatientWaitlist);
patientRouter.get('/me/waitlist', listPatientWaitlist);
patientRouter.post('/me/waitlist', joinWaitlist);
patientRouter.patch('/me/waitlist/:entryId/accept', acceptWaitlistOffer);
patientRouter.patch('/me/waitlist/:entryId/decline', declineWaitlistOffer);
patientRouter.delete('/me/waitlist/:entryId', leaveWaitlist);

// ── Prescriptions ────────────────────────────────────────────────────
patientRouter.get('/me/prescriptions', listPatientPrescriptions);
patientRouter.get('/me/prescriptions/:id', getPatientPrescription);

// ── Reports ──────────────────────────────────────────────────────────
patientRouter.get('/me/reports', listPatientReports);
patientRouter.post('/me/reports/:reportId/speak', reportSpeak);

// ── Health Trends ─────────────────────────────────────────────────────
patientRouter.get('/me/health-trends', getHealthTrends);

// ── Health Passport ───────────────────────────────────────────────────
patientRouter.get('/me/passport', getPatientPassport);

// ── Record Access Grants ──────────────────────────────────────────────
patientRouter.get('/me/grants', listAccessGrants);
patientRouter.post('/me/grants/booking/otp/initiate', initiateBookingGrantOtp);
patientRouter.post('/me/grants/booking/otp/verify', verifyBookingGrantOtp);
patientRouter.post('/me/grants', createAccessGrant);
patientRouter.delete('/me/grants/doctor/:doctorId', revokeAllGrantsForDoctor);
patientRouter.delete('/me/grants/:grantId', revokeAccessGrant);

// ── Privacy Activity & Alerts ──────────────────────────────────────────
patientRouter.get('/me/privacy/access-log', getPatientDataAccessLog);
patientRouter.get('/me/privacy/alerts', listPatientAccessAlerts);
patientRouter.patch('/me/privacy/alerts/:alertId/read', markPatientAccessAlertRead);
patientRouter.get('/me/privacy/alert-preferences', getPatientAccessAlertPreferences);
patientRouter.patch('/me/privacy/alert-preferences', updatePatientAccessAlertPreferences);

// ── AI Health Assistant ───────────────────────────────────────────────
patientRouter.post('/me/ai-chat', patientAIChat);
