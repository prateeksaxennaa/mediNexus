import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, ROLE_DASHBOARD } from '@/context/AuthContext';
import { type UserRole } from '@/services/auth.service';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, redirects users whose role doesn't match to their own dashboard. */
  allowedRole?: UserRole;
}

const ProtectedRoute = ({ children, allowedRole }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If a specific role is required and the user's role doesn't match,
  // redirect them to their correct dashboard.
  if (allowedRole && user?.role !== allowedRole) {
    const correctPath =
      user?.role ? (ROLE_DASHBOARD[user.role] ?? '/login') : '/login';
    return <Navigate to={correctPath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
