/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
