import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, ROLE_DASHBOARD } from '@/context/AuthContext';

interface PublicOnlyRouteProps {
  children: ReactNode;
}

/**
 * Wraps public-only routes (login, register) so that already-authenticated
 * users are redirected to their role-specific dashboard instead of being
 * allowed to re-visit the auth pages.
 */
const PublicOnlyRoute = ({ children }: PublicOnlyRouteProps) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isAuthenticated && user?.role) {
    return <Navigate to={ROLE_DASHBOARD[user.role]} replace />;
  }

  return <>{children}</>;
};

export default PublicOnlyRoute;
