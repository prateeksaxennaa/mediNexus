export { authService } from './auth.service';
export type {
  AuthUser,
  AuthSession,
  UserRole,
  LoginPayload,
  RegisterPatientPayload,
  RegisterHospitalAdminPayload,
  DoctorSetupPayload,
  LoginResponse,
  RegisterResponse,
  MeResponse,
  LogoutResponse,
  RefreshResponse,
} from './auth.service';

export { patientService } from './patient.service';
export type {
  PatientAppointment,
  PatientPassport,
  PatientPrescription,
  PatientReport,
  AccessGrant,
  WaitlistEntry,
} from './patient.service';

export { doctorService } from './doctor.service';
export type {
  DoctorProfile,
  DoctorAppointment,
  DoctorSlot,
  Prescription,
  PrescriptionItem,
  MedicineResult,
  CreatePrescriptionPayload,
} from './doctor.service';

export { hospitalService } from './hospital.service';
export type {
  HospitalProfile,
  HospitalDoctor,
  HospitalService,
  HospitalAppointment,
} from './hospital.service';

