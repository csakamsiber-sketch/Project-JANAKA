function normalizeOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function getAllowedOrigins(): string[] {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((origin): origin is string => Boolean(origin))
    .map((origin) => origin.startsWith('http') ? origin : `https://${origin}`);
  return Array.from(new Set([
    'http://localhost:3000',
    'http://localhost:3110',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3110',
    ...vercelOrigins,
    ...configuredOrigins,
  ]));
}

export function isAllowedRequestOrigin(origin: string | undefined, referer: string | undefined, requestOrigin: string | undefined, allowedOrigins: string[]): boolean {
  const expectedOrigin = normalizeOrigin(requestOrigin);
  const candidateOrigin = normalizeOrigin(origin ?? referer);
  if (!candidateOrigin) return !origin && !referer;
  if (expectedOrigin && candidateOrigin === expectedOrigin) return true;
  return allowedOrigins.some((allowedOrigin) => normalizeOrigin(allowedOrigin) === candidateOrigin);
}
