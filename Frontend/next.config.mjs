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
 *
 * FIX (Audit fix #7) — Security headers.
 * - Content-Security-Policy REPORT-ONLY pehle (enforce nahi) — CSP galat
 *   ho to bhi site nahi tootegi, sirf browser console me report aayegi.
 *   Deploy ke baad console check karo, phir enforce mode me badlo.
 * - X-Frame-Options DENY + frame-ancestors 'none': site ko iframe me
 *   nahi khola ja sakta (clickjacking band).
 * - X-Content-Type-Options nosniff, Referrer-Policy
 *   strict-origin-when-cross-origin, Permissions-Policy locked down
 *   (sirf geolocation=(self) — lib/useDeviceLocation.ts GPS use karta
 *   hai; baaki sab band: camera, microphone, payment, usb, ...).
 * - CSP me jo origins hain, wo code se verify kiye gaye hain:
 *   scripts: self + Cloudflare Turnstile (challenges.cloudflare.com,
 *   components/TurnstileWidget.tsx) + 'unsafe-inline' (Next.js inline
 *   scripts ke liye lazmi); images: self + data:/blob: (KYC blob previews)
 *   + Cloudinary/Unsplash/R2 (images.remotePatterns wale hosts) + backend
 *   origin (backend se /uploads/* images aati hain, lib/api.ts fileUrl);
 *   connect: self + backend origin + Turnstile; frames: Turnstile + blob:.
 * - Backend origin: NEXT_PUBLIC_API_URL / BACKEND_INTERNAL_URL se liya
 *   jata hai (rewrites() wala pattern). Production backend Render pe hai,
 *   is liye Batch 11 (M3) me connect-src / img-src ko exact Render origin
 *   https://asan-tijarat.onrender.com pe tight kar diya gaya hai (pehle
 *   https://*.onrender.com wildcard tha). Deploy ke baad console reports
 *   2-3 din observe karo, phir enforce karo.
 */

/** Backend ka origin — CSP ke connect-src / img-src ke liye. */
function backendOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_INTERNAL_URL ||
    'http://localhost:5000';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:5000';
  }
}

const BACKEND_ORIGIN = backendOrigin();

/**
 * FIX (New audit #7) — next/image ke liye backend host.
 * Product photos stored paths (`/uploads/products/...`) hain, jo lib/api.ts
 * fileUrl() backend origin ke against resolve karta hai (dev me
 * http://localhost:5000, production me Render URL). Bina is pattern ke
 * next/image un images ko optimize karne se inkar kar deta hai ("hostname is
 * not configured"). Batch 11 (M3) me exact hostname
 * asan-tijarat.onrender.com use ho raha hai (pehle `*.onrender.com`
 * wildcard tha, CSP wali hi approach).
 */
function backendRemotePattern() {
  try {
    const u = new URL(BACKEND_ORIGIN);
    const pattern = {
      protocol: u.protocol.replace(':', ''),
      hostname: u.hostname,
    };
    if (u.port) pattern.port = u.port;
    return pattern;
  } catch {
    return null;
  }
}

const BACKEND_REMOTE_PATTERN = backendRemotePattern();

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev ${BACKEND_ORIGIN} https://asan-tijarat.onrender.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${BACKEND_ORIGIN} https://asan-tijarat.onrender.com https://challenges.cloudflare.com`,
  'frame-src https://challenges.cloudflare.com blob:',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

// Permissions-Policy: sab band, sirf geolocation khula (self) —
// useDeviceLocation.ts GPS use karta hai (registration + settings).
const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=()',
  'battery=()',
  'camera=()',
  'cross-origin-isolated=()',
  'display-capture=()',
  'document-domain=()',
  'encrypted-media=()',
  'execution-while-not-rendered=()',
  'execution-while-out-of-viewport=()',
  'fullscreen=()',
  'geolocation=(self)',
  'gyroscope=()',
  'keyboard-map=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'navigation-override=()',
  'payment=()',
  'picture-in-picture=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'sync-xhr=()',
  'usb=()',
  'web-share=()',
  'xr-spatial-tracking=()',
].join(', ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIX — dev-only: admin.localhost se aane wale /_next/* requests par
  // Next.js 14.2.35 warning deta tha ("Cross origin request detected from
  // admin.localhost"). Wajah: dev server ka default allowed list sirf
  // 'localhost' hai; usme '*.localhost' likha to hai, lekin Next.js ka
  // matcher wildcard ko aakhri 2 segments me invalid manta hai, is liye
  // 'admin.localhost' kabhi match nahi hota (code parh kar verify kiya:
  // block-cross-site.js + csrf-protection.js). Entry sirf hostname hoti
  // hai (port nahi), kyunke check origin ke hostname se hota hai.
  // NOTE: ye set karte hi mode warn se block ho jata hai — list se bahar
  // ka origin dev server par 403 hoga. localhost + admin.localhost dono
  // allowed hain, is liye dev kaam karta rahega. Production par iska
  // koi asar nahi (ye check sirf dev server ka hai).
  allowedDevOrigins: ['admin.localhost'],
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
      // FIX (New audit #7) — backend origin (product photos /uploads/*)
      // + exact Render hostname (Batch 11 M3 — pehle *.onrender.com tha).
      ...(BACKEND_REMOTE_PATTERN ? [BACKEND_REMOTE_PATTERN] : []),
      { protocol: 'https', hostname: 'asan-tijarat.onrender.com' },
    ],
  },
  // FIX (Audit fix #7) — security headers, har route pe.
  // CSP report-only hai (enforce nahi), is liye galat rule se bhi
  // site nahi tootegi — sirf console me report aayegi.
  //
  // FIX (Round-4 M4, Batch 10) — Access-Control-Allow-Origin.
  // Live site pe har Vercel response par `ACAO: *` aa raha tha (audit
  // 2026-11-20, curl se verify: /, /robots.txt, /logo.png, 404). Repo
  // code me kahin `*` set nahi hota — poora repo grep kiya: sirf
  // Backend/server.js ke comments me ACAO ka zikr hai, backend khud
  // allow-listed origins ko hi ACAO deta hai (CLIENT_ORIGIN, `*`
  // explicitly filter hota hai), Frontend/vercel.json me koi headers
  // block nahi, aur next.config.mjs pehle koi ACAO set nahi karta tha.
  // Is liye yahan explicit restrictive origin set kiya hai — site ka
  // apna origin, wildcard nahi.
  // HARD CONSTRAINT: /backend-api/* ko ye header NAHI lagna chahiye —
  // backend apni allow-list ke mutabiq khud ACAO set karta hai, aur API
  // response par EXACTLY ONE ACAO hona chahiye (backend wala). Is liye
  // pehle stub-backend test se verify kiya gaya ke Next.js ke headers()
  // rewritten responses par apply NAHI hote (dekho FIX-NOTE.md, M4
  // section) — is entry ke bawajood /backend-api/* par sirf backend ka
  // ACAO aata hai. Agar kabhi Next.js ka version badle to ye test dobara
  // chalana lazmi hai; agar do ACAO nazar aayen to ye header yahan se
  // hata kar middleware wala tareeqa use karo (FIX-NOTE me likha hai).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: 'https://asan-tijarat.vercel.app' },
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
