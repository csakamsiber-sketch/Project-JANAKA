/** @type {import('next').NextConfig} */
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
  throw new Error('NEXT_PUBLIC_TURNSTILE_SITE_KEY must be configured for Vercel deployments.');
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
