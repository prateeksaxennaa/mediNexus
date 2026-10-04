/**
 * Token storage — stubbed out after migration to httpOnly cookies.
 *
 * All token management is now handled server-side via Set-Cookie headers.
 * These stubs exist only to avoid breaking any lingering import sites during
 * the transition; they do nothing.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function saveTokens(
  _access_token: string,
  _refresh_token: string,
  _expires_at?: number | null,
): void {
  // no-op: tokens live in httpOnly cookies set by the server
}

export function getAccessToken(): string | null {
  return null; // httpOnly cookies are not readable by JS
}

export function getRefreshToken(): string | null {
  return null; // httpOnly cookies are not readable by JS
}

export function getExpiresAt(): number | null {
  return null;
}

/** Always returns false — expiry is enforced server-side. */
export function isTokenExpired(): boolean {
  return false;
}

export function clearTokens(): void {
  // no-op: cookies are cleared server-side on logout
}
