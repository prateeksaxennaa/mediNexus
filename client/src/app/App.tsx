import { Toaster } from '@/components/ui/sonner';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AuthProvider, useAuth, ROLE_DASHBOARD } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import PublicOnlyRoute from '@/components/PublicOnlyRoute';
import { LandingPage } from '@/features/landing';
import { LoginPage, DoctorLoginPage, AdminLoginPage, SignupPage, DoctorSetupPage } from '@/features/authentication';
import { PatientDashboard, AdminDashboard, DoctorDashboard } from '@/features/dashboard';
import PatientDiscover from '@/features/discover/PatientDiscover';
import PatientServiceBooking from '@/features/discover/PatientServiceBooking';

/**
 * DoctorRoute: Displays DoctorLoginPage when unauthenticated,
 * or routes to DoctorDashboard when authenticated as a doctor.
 */
const DoctorRoute = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAuthenticated || !user?.role) {
    return <DoctorLoginPage />;
  }
  if (user.role !== 'doctor') {
    return <Navigate to={ROLE_DASHBOARD[user.role] ?? '/login'} replace />;
  }
  return (
    <Routes>
      <Route path="dashboard" element={<DoctorDashboard />} />
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
};

/**
 * AdminRoute: Displays AdminLoginPage when unauthenticated,
 * or routes to AdminDashboard when authenticated as a hospital admin.
 */
const AdminRoute = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAuthenticated || !user?.role) {
    return <AdminLoginPage />;
  }
  if (user.role !== 'hospital_admin') {
    return <Navigate to={ROLE_DASHBOARD[user.role] ?? '/login'} replace />;
  }
  return (
    <Routes>
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark">
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
          {/* Universal Top-Right Gradient Glow */}
          <div className="absolute -top-64 -right-64 w-[800px] h-[800px] bg-primary/10 blur-[150px] rounded-full pointer-events-none z-0" />
          <div className="relative z-10 h-full">
            <Routes>
              {/* ── Public routes ───────────────────────────────────────────── */}
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/login"
                element={
                  <PublicOnlyRoute>
                    <LoginPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicOnlyRoute>
                    <SignupPage />
                  </PublicOnlyRoute>
                }
              />

              {/* Doctor invite setup — token arrives in URL hash, no prior auth needed */}
              <Route path="/doctor/setup" element={<DoctorSetupPage />} />

              {/* ── Doctor Portal (/doctor & /docter) ────────────────────────── */}
              <Route path="/doctor/*" element={<DoctorRoute />} />
              <Route path="/docter/*" element={<Navigate to="/doctor" replace />} />
              <Route path="/docter" element={<Navigate to="/doctor" replace />} />

              {/* ── Hospital Admin Portal (/admin) ─────────────────────────── */}
              <Route path="/admin/*" element={<AdminRoute />} />

              {/* ── Protected: Patient ─────────────────────────────────────── */}
              <Route
                path="/patient/*"
                element={
                  <ProtectedRoute allowedRole="patient">
                    <Routes>
                      <Route path="dashboard" element={<PatientDashboard />} />
                      <Route path="discover" element={<PatientDiscover />} />
                      <Route path="services" element={<PatientServiceBooking />} />
                    </Routes>
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="bottom-right" theme="dark" richColors={true} />
          </div>
        </div>
      </AuthProvider>
    </Router>
  </ThemeProvider>
);

export default App;
