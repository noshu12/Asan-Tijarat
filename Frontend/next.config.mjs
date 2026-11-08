/**
 * next.config.mjs — MERGED config (FIX for Batch 01)
 *
 * Pehle do config files thi: next.config.js (sirf /backend-api rewrites)
 * aur next.config.mjs (sirf images.remotePatterns). Next.js sirf ek ko
 * jeetata hai, doosri capability chup-chap kho jati thi.
 *
 * FIX: dono ko ek file me merge kar diya hai.
 * - Frontend/next.config.js ko DELETE karo, sirf ye file rakho.
 * - rewrites: /backend-api/* -> backend /api/* (admin subdomain ke liye,
 *   taake asan_admin_token cookie host-only set ho)
 * - images.remotePatterns: Cloudinary host ADD kiya (production image
 *   store), via.placeholder.com HATA diya (placeholder service, "no mock
 *   data" rule ke khilaf tha). Unsplash/R2 hosts waise hi rakhe hain.
 */

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
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
      { protocol: 'https', hostname: 'pub-940ccf6255b54fa799a9b01050e6c227.r2.dev' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
};

export default nextConfig;
