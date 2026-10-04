import { Router } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

import { registerPatientSchema } from '../validators/auth/patient.validator.js';
import { registerHospitalAdminSchema } from '../validators/auth/hospital-admin.validator.js';
import { loginSchema, refreshTokenSchema } from '../validators/auth/login.validator.js';
import { doctorSetupSchema } from '../validators/auth/doctor-setup.validator.js';

import { registerPatient } from '../controllers/auth/patient.controller.js';
import { registerHospitalAdmin } from '../controllers/auth/hospital-admin.controller.js';
import { login, refreshToken, logout, getMe } from '../controllers/auth/session.controller.js';
import { doctorSetup } from '../controllers/auth/doctor-setup.controller.js';

export const authRouter = Router();

// ── Patient registration ────────────────────────────────────────────
authRouter.post('/patient/register', validate(registerPatientSchema), registerPatient);

// ── Hospital admin registration ─────────────────────────────────────
authRouter.post('/hospital-admin/register', validate(registerHospitalAdminSchema), registerHospitalAdmin);

// ── Login / Refresh / Logout / Me ───────────────────────────────────
authRouter.post('/login', validate(loginSchema), login);
authRouter.post('/refresh', validate(refreshTokenSchema), refreshToken);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, getMe);

// ── Doctor setup (invite token required) ───────────────────────────
authRouter.post('/doctor/setup', authenticate, validate(doctorSetupSchema), doctorSetup);
