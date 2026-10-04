import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authService, type AuthUser, type UserRole } from '@/services/auth.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The currently authenticated user, or null if not signed in. */
  user: AuthUser | null;
  /** Convenience boolean — true when user is not null. */
  isAuthenticated: boolean;
  /**
   * True while the initial session rehydration is in progress.
   * Consumers should render a loading state until this is false.
   */
  isLoading: boolean;

  /**
   * Signs the user in.  The server sets httpOnly auth cookies on success.
   * Updates auth state and broadcasts the login to other tabs.
   * Returns the authenticated user so callers can read the role immediately.
   */
  login: (email: string, password: string) => Promise<AuthUser>;

  /** Signs the user out — revokes the server session, clears cookies, updates state. */
  logout: () => Promise<void>;

  /**
   * Called after registration flows where the server has already set cookies.
   * Fetches the current user profile and updates auth state.
   */
  applySession: () => Promise<AuthUser>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Role → dashboard path map ────────────────────────────────────────────────

export const ROLE_DASHBOARD: Record<UserRole, string> = {
  patient: '/patient/dashboard',
  hospital_admin: '/admin/dashboard',
  doctor: '/doctor/dashboard',
};

// ─── BroadcastChannel setup ───────────────────────────────────────────────────

type AuthMessage = 'login' | 'logout';

function openChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel('mdn_auth');
  } catch {
    return null;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Fetches the current user from the server (cookie sent automatically). */
  const fetchUser = async (): Promise<AuthUser | null> => {
    try {
      const { data } = await authService.getMe();
      return data.user;
    } catch {
      return null;
    }
  };

  // On mount, rehydrate session from the httpOnly cookie (cookie is sent
  // automatically with credentials:'include'; no token reading needed).
  useEffect(() => {
    fetchUser()
      .then((u) => setUser(u))
      .finally(() => setIsLoading(false));
  }, []);

  // Cross-tab auth sync via BroadcastChannel
  useEffect(() => {
    const channel = openChannel();
    if (!channel) return;

    channel.onmessage = (event: MessageEvent<AuthMessage>) => {
      if (event.data === 'login') {
        fetchUser().then((u) => setUser(u));
      } else if (event.data === 'logout') {
        setUser(null);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const { data } = await authService.login({ email, password });
    // Server has set httpOnly cookies; just update local state.
    setUser(data.user);

    // Notify other tabs
    const channel = openChannel();
    if (channel) {
      channel.postMessage('login' satisfies AuthMessage);
      channel.close();
    }

    return data.user;
  };

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore server errors — still clear local state.
    } finally {
      setUser(null);

      // Notify other tabs
      const channel = openChannel();
      if (channel) {
        channel.postMessage('logout' satisfies AuthMessage);
        channel.close();
      }
    }
  };

  // ── applySession ───────────────────────────────────────────────────────────
  // Called after registration: cookies already set by the server, just fetch user.

  const applySession = async (): Promise<AuthUser> => {
    const { data } = await authService.getMe();
    setUser(data.user);

    const channel = openChannel();
    if (channel) {
      channel.postMessage('login' satisfies AuthMessage);
      channel.close();
    }

    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
        applySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
