import { NextRequest, NextResponse } from 'next/server';

const protectedPaths = ['/dashboard', '/applications', '/cti', '/findings', '/meetings', '/my-schedule', '/user-management', '/settings'];
const preAuthPaths = ['/', '/login'];
const applicationAccessRoles = new Set(['SUPERADMIN', 'OVERSEER', 'VERIFICATOR']);
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4110/api/v1').replace(/\/api\/v1\/?$/, '');

type SessionUser = { id?: string; role?: string };

async function fetchMe(cookieHeader: string): Promise<SessionUser | null> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: SessionUser };
    return payload?.data?.id ? payload.data : null;
  } catch {
    return null;
  }
}

async function resolveSession(request: NextRequest): Promise<{ user: SessionUser | null; setCookieHeaders: string[] }> {
  const sessionCookie = request.cookies.get('janus_session');
  if (sessionCookie) {
    const user = await fetchMe(`janus_session=${sessionCookie.value}`);
    if (user) return { user, setCookieHeaders: [] };
  }

  return { user: null, setCookieHeaders: [] };
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

function withSessionCookies(response: NextResponse, setCookieHeaders: string[]): NextResponse {
  for (const cookie of setCookieHeaders) response.headers.append('set-cookie', cookie);
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const isProtectedPath = protectedPaths.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isPreAuthPath = preAuthPaths.includes(pathname);

  const { user, setCookieHeaders } = await resolveSession(request);
  const isAuthenticated = Boolean(user?.id);

  if (isAuthenticated && isPreAuthPath) {
    return withSessionCookies(withNoStore(NextResponse.redirect(new URL('/dashboard', request.url))), setCookieHeaders);
  }

  if (!isAuthenticated) {
    if (isProtectedPath) return withNoStore(NextResponse.next());
    return withNoStore(NextResponse.next());
  }

  if (!user?.role) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return withNoStore(NextResponse.redirect(loginUrl));
  }

  if (pathname === '/applications' && !applicationAccessRoles.has(user.role)) {
    return withSessionCookies(withNoStore(NextResponse.redirect(new URL('/dashboard', request.url))), setCookieHeaders);
  }

  if ((pathname === '/user-management' || pathname.startsWith('/user-management/')) && user.role !== 'SUPERADMIN') {
    return withSessionCookies(withNoStore(NextResponse.redirect(new URL('/dashboard', request.url))), setCookieHeaders);
  }

  if (pathname === '/my-schedule' && user.role !== 'VERIFICATOR') {
    return withSessionCookies(withNoStore(NextResponse.redirect(new URL('/dashboard', request.url))), setCookieHeaders);
  }

  return withSessionCookies(withNoStore(NextResponse.next()), setCookieHeaders);
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
    '/applications/:path*',
    '/cti/:path*',
    '/findings/:path*',
    '/meetings/:path*',
    '/my-schedule/:path*',
    '/user-management/:path*',
    '/settings/:path*',
  ],
};
