// Components
import { PatientDashboardHeader } from "./patient/components/PatientDashboardHeader";
import { PatientHome } from "./patient/components/PatientHome";
import { PatientAppointments } from "./patient/components/PatientAppointments";
import { PatientHealthPassport } from "./patient/components/PatientHealthPassport";
import { WaitlistPanel } from "./patient/components/WaitlistPanel";
import { PatientProfilePage } from "./patient/components/PatientProfilePage";
import { PatientPrivacyCenter } from "./patient/components/PatientPrivacyCenter";
import {DoctorQueue} from "./doctor/components/DoctorQueue";
import {DoctorSchedule} from "./doctor/components/DoctorSchedule";
import {DoctorPrescriptions} from "./doctor/components/DoctorPrescriptions";
import { DoctorDashboardHeader } from "./doctor/components/DoctorDashboardHeader";
import { DoctorReferrals } from "./doctor/components/DoctorReferrals";
import { DoctorProfilePage } from "./doctor/components/DoctorProfilePage";

export { PatientDashboardHeader, PatientHome, PatientAppointments, PatientHealthPassport, WaitlistPanel, PatientProfilePage, PatientPrivacyCenter, DoctorQueue, DoctorSchedule, DoctorPrescriptions, DoctorDashboardHeader, DoctorReferrals, DoctorProfilePage };


// Pages
import { PatientDashboard } from "./patient/pages/PatientDashboard";
import AdminDashboard from "./admin/pages/AdminDashboard";
import {DoctorDashboard} from "./doctor/pages/DoctorDashboard";

export { PatientDashboard, AdminDashboard, DoctorDashboard };