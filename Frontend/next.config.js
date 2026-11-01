// next.config.js — admin-subdomain API proxy (#4, 8/8).
//
// /backend-api/* is proxied to the Express backend. The admin subdomain
// (admin.asantijarat.com) calls the backend through this same-origin path,
// so the Set-Cookie for asan_admin_token comes from the admin host itself —
// that is what makes the cookie host-only (no Domain attribute).
//
// BACKEND_INTERNAL_URL: server-side backend origin (no trailing slash).
// Falls back to NEXT_PUBLIC_API_URL, then localhost:5000 for dev.
//
// NOTE: if your project already has a next.config.js with other settings,
// do NOT replace it wholesale — copy the `rewrites` block into yours.

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backend =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000';
    return [
      {
        source: '/backend-api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
