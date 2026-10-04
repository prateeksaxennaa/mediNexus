const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestOptions = Omit<RequestInit, 'headers'> & {
  /**
   * When true, no Authorization header is attached and the request is not
   * retried after a 401 (login / register endpoints).
   * Ignored if `bearerToken` is provided.
   */
  skipAuth?: boolean;
  /**
   * Use this specific token as the Bearer credential instead of the cookie.
   * Used for the doctor invite setup flow where Supabase returns the token
   * in the URL hash.
   */
  bearerToken?: string;
  headers?: Record<string, string>;
};

// ─── Silent refresh ───────────────────────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(ok: boolean) => void> = [];

/**
 * Attempts to silently refresh the session by calling POST /api/auth/refresh.
 * The server reads the refresh token from the httpOnly cookie and sets new
 * auth cookies on success.
 *
 * Returns true if new cookies were set, false if the session is unrecoverable.
 */
async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Serialises concurrent refresh attempts so only one refresh request is
 * in-flight at a time.  All concurrent callers await the same promise.
 */
async function refreshOnce(): Promise<boolean> {
  if (isRefreshing) {
    return new Promise<boolean>((resolve) => {
      refreshQueue.push(resolve);
    });
  }

  isRefreshing = true;
  const ok = await doRefresh();
  isRefreshing = false;

  refreshQueue.forEach((cb) => cb(ok));
  refreshQueue = [];

  return ok;
}

// ─── Core request helper ──────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth = false, bearerToken, headers: extraHeaders, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  // Doctor invite setup flow: explicit Bearer token overrides cookie auth
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include', // always send & receive httpOnly cookies
  });

  // On 401, attempt a silent token refresh and retry — unless this is a
  // public endpoint (skipAuth) or an explicit bearerToken request.
  if (res.status === 401 && !skipAuth && !bearerToken) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      // Retry the original request with the new cookies
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });

      const retryJson = await retryRes.json().catch(() => null);

      if (!retryRes.ok) {
        const message: string = retryJson?.message ?? retryJson?.error ?? `Request failed (${retryRes.status})`;
        throw new Error(message);
      }

      return retryJson as T;
    }

    // Refresh failed — session is gone; broadcast so all tabs log out
    try {
      const channel = new BroadcastChannel('mdn_auth');
      channel.postMessage('logout');
      channel.close();
    } catch {
      // BroadcastChannel not available in this environment — ignore
    }

    throw new Error('Session expired. Please log in again.');
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message: string = json?.message ?? json?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json as T;
}

// ─── Public API surface ───────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
