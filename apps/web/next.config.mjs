/** @type {import('next').NextConfig} */
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? (process.env.NODE_ENV === 'production'
  ? 'https://project-janaka-api.vercel.app'
  : 'http://localhost:4110')).replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${apiProxyTarget}/api/:path*`,
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
