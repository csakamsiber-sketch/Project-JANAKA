import { getDeviceFingerprint } from './fingerprint';

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? '/api/v1').replace(/\/$/, '');

function addFingerprintToBody(body: BodyInit | null | undefined, fingerprint: string): BodyInit | null | undefined {
  if (!fingerprint || typeof body !== 'string') return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (!('fingerprint' in parsed)) {
        return JSON.stringify({ ...parsed, fingerprint });
      }
    }
  } catch {
    // Ignore non-JSON body payloads.
  }
  return body;
}

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    if (requestId) this.requestId = requestId;
  }
}

export function notifyGlobalError(message: string, code = 'REQUEST_FAILED') {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('janus:api-error', { detail: { message, code } }));
}

export function notifyGlobalSuccess(message: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('janus:api-success', { detail: { message, code: 'SUCCESS' } }));
}

function csrfToken() {
  return document.cookie.split('; ').find((cookie) => cookie.startsWith('janus_csrf='))?.split('=').slice(1).join('=') ?? '';
}

let refreshInFlight: Promise<void> | undefined;

async function refreshAccessToken(fingerprint: string): Promise<void> {
  await requestOnce('/auth/refresh', { method: 'POST' }, fingerprint);
}

async function authStateIsValid(fingerprint: string): Promise<boolean> {
  try {
    const payload = await requestOnce('/auth/me', { method: 'GET' }, fingerprint) as { id?: string; role?: string } | null;
    const hasSession = Boolean(payload && typeof payload === 'object' && 'id' in payload && payload.id);
    if (!hasSession) {
      console.warn('[auth] auth state check failed: /auth/me returned no active session');
    }
    return hasSession;
  } catch (error) {
    console.warn('[auth] auth state check failed while verifying session validity', error);
    return false;
  }
}

async function requestOnce(path: string, init: RequestInit, fingerprint?: string) {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const resolvedFingerprint = fingerprint ?? '';
  if (resolvedFingerprint) headers.set('X-Fingerprint', resolvedFingerprint);
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-CSRF-Token', csrfToken());
  }
  const nextBody = addFingerprintToBody(init.body, resolvedFingerprint);
  const requestInit: RequestInit = {
    ...init,
    headers,
    credentials: 'include',
    ...(nextBody !== undefined ? { body: nextBody } : {}),
  };
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, requestInit);
  } catch {
    const message = 'Unable to reach the server. Check your connection and try again.';
    notifyGlobalError(message, 'NETWORK_ERROR');
    throw new ApiClientError(0, 'NETWORK_ERROR', message);
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<unknown> & { error?: { code?: string; message?: string; requestId?: string } } | null;
  if (!response.ok) {
    const code = payload?.error?.code ?? 'REQUEST_FAILED';
    const message = payload?.error?.message ?? (response.status >= 500 ? 'The server could not complete the request.' : 'The request could not be completed.');
    notifyGlobalError(message, code);
    throw new ApiClientError(response.status, code, message, payload?.error?.requestId);
  }
  return payload?.data ?? payload;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, options: { retryOnUnauthorized?: boolean } = {}): Promise<T> {
  const fingerprint = await getDeviceFingerprint();
  try {
    const result = await requestOnce(path, init, fingerprint) as T;
    return result;
  } catch (error) {
    const csrfFailure = error instanceof ApiClientError && error.status === 403 && error.code === 'CSRF_TOKEN_INVALID';
    const authFailure = error instanceof ApiClientError && error.status === 401;
    if (!(authFailure || csrfFailure) || options.retryOnUnauthorized === false || path === '/auth/refresh' || path === '/auth/login') throw error;
    console.warn(`[auth] 401 on ${path}; attempting refresh before redirecting to login`);
    const refresh = async () => refreshAccessToken(fingerprint);
    try {
      refreshInFlight ??= refresh().finally(() => {
        refreshInFlight = undefined;
      });
      await refreshInFlight;
      console.info('[auth] refresh succeeded; checking auth state before proceeding');
    } catch (refreshError) {
      console.warn('[auth] refresh attempt failed; verifying whether session is still valid', refreshError);
      const authStillValid = await authStateIsValid(fingerprint);
      if (refreshError instanceof ApiClientError && (refreshError.status === 401 || refreshError.status === 403) && !authStillValid) {
        await requestOnce('/auth/logout', { method: 'POST' }, fingerprint).catch(() => undefined);
        if (typeof window !== 'undefined') window.location.assign('/login');
      }
      throw refreshError;
    }
    try {
      const authStillValid = await authStateIsValid(fingerprint);
      if (!authStillValid) {
        console.warn('[auth] session invalid after refresh; logging out and redirecting to login');
        await requestOnce('/auth/logout', { method: 'POST' }, fingerprint).catch(() => undefined);
        if (typeof window !== 'undefined') window.location.assign('/login');
        throw new ApiClientError(401, 'SESSION_INVALID', 'Session is no longer valid.', undefined);
      }
      return await requestOnce(path, init, fingerprint) as T;
    } catch (retryError) {
      if (retryError instanceof ApiClientError && retryError.status === 401) {
        await requestOnce('/auth/logout', { method: 'POST' }, fingerprint).catch(() => undefined);
        if (typeof window !== 'undefined') window.location.assign('/login');
      }
      throw retryError;
    }
  }
}