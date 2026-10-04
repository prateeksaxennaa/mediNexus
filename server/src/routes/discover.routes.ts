import { Router } from 'express';
import {
  discoverHospitals,
  getHospitalDetails,
  getDoctorSlots,
  searchDoctorsPublic,
} from '../controllers/patient/discovery.controller.js';
import { streamDoctorSlots } from '../controllers/sse/slots.controller.js';

export const discoverRouter = Router();

// Public discovery endpoints — no authentication required
discoverRouter.get('/hospitals', discoverHospitals);
discoverRouter.get('/hospitals/:hospitalId', getHospitalDetails);
// Doctor search must come BEFORE /:doctorId/* routes to avoid Express path shadowing
discoverRouter.get('/doctors/search', searchDoctorsPublic);
discoverRouter.get('/doctors/:doctorId/slots', getDoctorSlots);

// SSE — real-time slot availability stream for a doctor on a given date.
// Must be declared BEFORE the generic /slots route so Express does not shadow it.
discoverRouter.get('/doctors/:doctorId/slots/stream', streamDoctorSlots);
