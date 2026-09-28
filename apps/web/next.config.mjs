/** @type {import('next').NextConfig} */
const configuredApiProxyTarget = process.env.API_PROXY_TARGET?.trim();
const apiProxyTarget = configuredApiProxyTarget || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4110');

if (!apiProxyTarget) {
  throw new Error('API_PROXY_TARGET must be set to the backend origin for production builds.');
}

const apiProxyUrl = new URL(apiProxyTarget);
if (!['http:', 'https:'].includes(apiProxyUrl.protocol) || apiProxyUrl.pathname !== '/' || apiProxyUrl.search || apiProxyUrl.hash) {
  throw new Error('API_PROXY_TARGET must be an HTTP(S) origin without a path, query, or fragment.');
}

const apiProxyOrigin = apiProxyUrl.origin;

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${apiProxyOrigin}/api/:path*`,
        },
      ],
    };
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    },
    // Force dynamic client navigations to always revalidate through the proxy;
    // 30 is the minimum Next.js allows for the static bucket.
    staleTimes: {
      dynamic: 0,
      static: 30
    }
  }
};

export default nextConfig;
