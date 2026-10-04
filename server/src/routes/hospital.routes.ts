import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { inviteDoctorSchema } from '../validators/auth/doctor.validator.js';
import { updateHospitalProfileSchema } from '../validators/hospital/profile.validator.js';
import { createServiceSchema, updateServiceSchema } from '../validators/hospital/service.validator.js';
import { generateServiceSlotsSchema, updateServiceDaySlotsSchema } from '../validators/hospital/serviceSlots.validator.js';

import { inviteDoctor } from '../controllers/auth/doctor.controller.js';
import { getHospitalProfile, updateHospitalProfile } from '../controllers/hospital/profile.controller.js';
import { listHospitalDoctors, updateHospitalDoctor, deleteHospitalDoctor } from '../controllers/hospital/doctors.controller.js';
import { listHospitalServices, createHospitalService, updateHospitalService, deleteHospitalService } from '../controllers/hospital/services.controller.js';
import { listHospitalAppointments } from '../controllers/hospital/appointments.controller.js';
import { generateHospitalDoctorSlots } from '../controllers/hospital/slots.controller.js';
import {
  listAdminDoctorSlots,
  adminBlockDoctorSlot,
  adminUnblockDoctorSlot,
  adminDeleteDoctorSlot,
  adminBookWalkIn,
  adminCancelDoctorAppointment,
} from '../controllers/hospital/doctorSlots.controller.js';
import {
  generateServiceSlots,
  listServiceSlots,
  getServiceSlotDetails,
  deleteServiceSlot,
  bulkDeleteServiceSlots,
  getServiceSlotAvailability,
  updateServiceDaySlots,
} from '../controllers/hospital/serviceSlots.controller.js';
import { listServiceAppointments, updateServiceAppointmentStatus } from '../controllers/hospital/serviceAppointments.controller.js';
import {
  uploadReportMiddleware,
  uploadPatientReport,
  searchHospitalPatients,
  listPatientReportsForAdmin,
} from '../controllers/patient/uploadReport.controller.js';

export const hospitalRouter = Router();

// POST /api/hospitals/:hospitalId/doctors/invite
hospitalRouter.post(
  '/:hospitalId/doctors/invite',
  authenticate,
  requireRole('hospital_admin'),
  validate(inviteDoctorSchema),
  inviteDoctor
);

// All /me/* routes require authentication + hospital_admin role
hospitalRouter.use('/me', authenticate, requireRole('hospital_admin'));

// Profile
hospitalRouter.get('/me', getHospitalProfile);
hospitalRouter.patch('/me', validate(updateHospitalProfileSchema), updateHospitalProfile);

// Doctors
hospitalRouter.get('/me/doctors', listHospitalDoctors);
hospitalRouter.patch('/me/doctors/:doctorId', updateHospitalDoctor);
hospitalRouter.delete('/me/doctors/:doctorId', deleteHospitalDoctor);

// Doctor slot management (admin) — must be BEFORE /slots/generate to avoid Express path shadowing
hospitalRouter.get('/me/doctors/:doctorId/slots', listAdminDoctorSlots);
hospitalRouter.patch('/me/doctors/:doctorId/slots/:slotId/block', adminBlockDoctorSlot);
hospitalRouter.patch('/me/doctors/:doctorId/slots/:slotId/unblock', adminUnblockDoctorSlot);
hospitalRouter.delete('/me/doctors/:doctorId/slots/:slotId', adminDeleteDoctorSlot);
hospitalRouter.post('/me/doctors/:doctorId/walk-in', adminBookWalkIn);
hospitalRouter.patch('/me/doctors/:doctorId/appointments/:appointmentId/cancel', adminCancelDoctorAppointment);

// Doctor slot generation (admin on behalf of doctor)
hospitalRouter.post('/me/doctors/:doctorId/slots/generate', generateHospitalDoctorSlots);

// Service Slots Management (must be before /me/services/:serviceId to avoid shadowing)
hospitalRouter.get('/me/services/slots', listServiceSlots);
hospitalRouter.get('/me/services/slots/:slotId', getServiceSlotDetails);
hospitalRouter.post('/me/services/slots/generate', validate(generateServiceSlotsSchema), generateServiceSlots);
hospitalRouter.patch('/me/services/slots/day', validate(updateServiceDaySlotsSchema), updateServiceDaySlots);
hospitalRouter.delete('/me/services/slots/:slotId', deleteServiceSlot);
hospitalRouter.post('/me/services/slots/bulk-delete', bulkDeleteServiceSlots);

// Service Appointments — must be before /me/services/:serviceId to avoid shadowing
hospitalRouter.get('/me/services/appointments', listServiceAppointments);
hospitalRouter.patch('/me/services/appointments/:appointmentId/status', updateServiceAppointmentStatus);

// Services
hospitalRouter.get('/me/services', listHospitalServices);
hospitalRouter.post('/me/services', validate(createServiceSchema), createHospitalService);
hospitalRouter.patch('/me/services/:serviceId', validate(updateServiceSchema), updateHospitalService);
hospitalRouter.delete('/me/services/:serviceId', deleteHospitalService);
hospitalRouter.get('/me/services/:serviceId/availability', getServiceSlotAvailability);

// Doctor Appointments
hospitalRouter.get('/me/appointments', listHospitalAppointments);

// Patient reports — hospital staff upload on behalf of a patient
hospitalRouter.get('/me/patients/search', searchHospitalPatients);
hospitalRouter.get('/me/patients/:patientId/reports', listPatientReportsForAdmin);
hospitalRouter.post(
  '/me/patients/:patientId/reports',
  uploadReportMiddleware,
  uploadPatientReport
);
