type CookieRequest = {
  cookies?: Record<string, string | undefined>;
  headers: { cookie?: string | undefined };
};

export function getRequestCookies(request: CookieRequest): Record<string, string> {
  if (request.cookies && Object.keys(request.cookies).length > 0) {
    return Object.entries(request.cookies).reduce<Record<string, string>>((cookies, [name, value]) => {
      if (value !== undefined) cookies[name] = value;
      return cookies;
    }, {});
  }

  return (request.headers.cookie ?? '').split(';').reduce<Record<string, string>>((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator > 0) {
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (name && value) cookies[name] = value;
    }
    return cookies;
  }, {});
}

export function getRequestAccessToken(request: { headers: { authorization?: string | string[] | undefined } }): string | undefined {
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization;
  if (typeof authorization !== 'string') return undefined;
  const [scheme, token] = authorization.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}