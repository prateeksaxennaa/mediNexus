import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { hospitalRouter } from './hospital.routes.js';
import { patientRouter } from './patient.routes.js';
import { doctorRouter } from './doctor.routes.js';
import { healthRouter } from './health.routes.js';
import { discoverRouter } from './discover.routes.js';
import { serviceRouter } from './service.routes.js';
import { whatsappRouter } from './whatsapp.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/hospitals', hospitalRouter);
apiRouter.use('/patients', patientRouter);
apiRouter.use('/doctors', doctorRouter);
apiRouter.use('/discover', discoverRouter);
apiRouter.use('/services', serviceRouter);
apiRouter.use('/webhooks/whatsapp', whatsappRouter);
