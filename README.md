# 🛒 Asan Tijarat — B2B Wholesale Marketplace

> 🇵🇰 Pakistan's B2B wholesale marketplace connecting **suppliers** and **shopkeepers**,
> with a separate **admin** portal. Bulk orders with minimum order quantity (MOQ),
> transparent **price per pack**, **escrow-protected payments**, and a **15-reason
> dispute system** — all in one place.

[![CI](https://github.com/noshu12/Asan-Tijarat/actions/workflows/ci.yml/badge.svg)](https://github.com/noshu12/Asan-Tijarat/actions/workflows/ci.yml)
🌐 **Live:** https://asan-tijarat.vercel.app

Built with **Next.js, Express, and MongoDB** — a Final Year Project (FYP), built as a real startup.

---

## ✨ What Is Asan Tijarat?

Pakistan's wholesale economy runs on trust and relationships — but finding
reliable suppliers, negotiating fair prices, and ordering in bulk has always
been a struggle. Traders lose time and money to middlemen who add cost
without value.

**Asan Tijarat fixes this.** Suppliers list their products, shopkeepers
browse the marketplace, and orders move through clear stages from pending
to delivered. Payments are held in **escrow** until delivery is confirmed.
If something goes wrong, a **15-reason dispute system** protects both sides.
No middlemen. No guesswork. Just trade — made easy.

---

## 🚀 Features

### 🏪 Marketplace

- 🛍️ Browse real products listed by suppliers — no mock or dummy products
- 🔍 Search by product, supplier, city, and category — with price and stock filters
- 🏷️ Category filters with the exact 14 wholesale categories (see below)
- 💰 Price shown clearly **per pack**, with pack type and pack weight
- 📦 Stock and MOQ shown on every product card
- 🖼️ Product detail **page** (`/product/[id]`) — photo gallery, description,
  supplier + city, price, MOQ, stock, and a quantity selector with live total
- ⚡ Product photos served through `next/image` (optimised, lazy-loaded)

### 👥 Four Portals, Four Roles

| Role | Can do |
| --- | --- |
| 🧑‍💼 **Supplier** | Add and manage products, manage orders, upload delivery proof, chat with shopkeepers, view own dashboard, analytics, ratings, profile and settings |
| 🛒 **Shopkeeper** | Browse marketplace, add to cart, place bulk orders, pay online, track orders, chat, file disputes, rate suppliers, profile and settings |
| 🛡️ **Admin** | Verify accounts and KYC, moderate users, products, orders and disputes, view admin dashboard, statistics, audit log, contact inbox, and create/delete sub-admin accounts |
| 👤 **Sub-Admin** | Everything the main admin can do — **except** creating/deleting sub-admin accounts and touching admin accounts. Mandatory TOTP 2FA (max 10 sub-admins) |

> ⚠️ **Admin limits (by design):** an admin **cannot change a user's role**
> and **cannot change a supplier's product status**. Role and status show as
> plain text in the admin panel. Admin can still Verify / Unverify accounts
> and delete accounts or listings.

### 📝 Registration & KYC Review

- ✅ Business name and city are mandatory for both roles
- 🪪 Suppliers provide **NTN**; shopkeepers provide a **utility bill**
- 📄 KYC documents uploaded at registration: CNIC front, CNIC back, NTN / utility bill
- 📧 **Email OTP** verification (6-digit code, 5-minute expiry)
- ⏳ New accounts stay **pending** until an admin verifies them
- 🔒 Admin accounts are provisioned directly in the database —
  there is **no admin self-registration**
- 👁️ KYC document views are written to the **audit log**

### 📦 Orders

- 🛒 Browser-based cart (shopkeepers only — guests are sent to sign in,
  suppliers/admins see a listing label, not a buy button)
- 🔢 Atomic order numbers (`AT-2026-XXXX`) — two orders placed at the same
  moment can never get the same number
- 🔒 Two-phase stock reservation at checkout — products cannot be oversold
- 📈 Order stages, in order:

```
pending → confirmed → processing → shipped → delivered
                            ↘ cancelled
```

- 🧾 Printable invoice with totals **recomputed from the line items**
- 👁️ Shopkeepers see every stage in **My Orders**; suppliers manage
  orders from the **supplier portal**

### 💳 Payments & Escrow

- 💵 **Two online methods only** — no cash on delivery:
  - **(a) Online advance** — shopkeeper pays at order time (bank / JazzCash / Raast);
    money is held in **escrow** until delivery, then released to the supplier
  - **(b) Online at delivery** — shopkeeper pays online after checking the goods
- 🏦 Transfers happen in the user's own bank / JazzCash app; the platform
  records the transaction reference, payment status and escrow state
- 🧮 Platform fee is configurable (`PLATFORM_FEE_PERCENT`, default `0` —
  the percentage is still undecided)
- ✅ Admin **Confirm Payment** button on the admin orders page (only when a
  payment is `payment_submitted`)
- 🔒 Money stays frozen while a dispute is open

### ⚖️ Disputes — 15 Reasons

- 🗣️ Shopkeeper talks to the **supplier first**; if the supplier accepts fault,
  no dispute opens — otherwise the shopkeeper files a claim to the **admin**
- 📋 All 15 reasons: wrong goods, wrong quantity, defective, expired,
  fake/counterfeit, damaged in transit, different from listing, wrong pack/weight,
  never arrived, partial delivery, supplier cancelled after advance,
  payment dispute, overcharge, shopkeeper refuses delivery, shopkeeper refuses to pay
- ⏰ **Late delivery is deliberately NOT a dispute reason**
- 🧊 Payment is **frozen** while a dispute is open — no payment action can move it
- 👨‍⚖️ Admin decides after seeing the order, the chat and the delivery photo:
  release to supplier / full refund / partial refund / return goods
- 📦 Reasons 1–8: supplier takes the goods back. Reasons 9–11: money stays
  in escrow until delivery is confirmed (delivery photo as proof)

### ⭐ Ratings & Reviews

- ⭐ One rating per delivered order (1–5 stars + comment)
- 📊 Supplier's average rating shows on their profile
- 🚫 Rating before delivery is blocked; double rating is blocked

### 🔔 Notifications & Chat

- 🔔 Real notifications with an unread-count bell — order updates, payment
  held/released, disputes, chat messages, ratings, KYC decisions
- 💬 Per-order chat between shopkeeper and supplier; the admin can read
  the thread as dispute evidence
- 📸 Delivery proof: supplier uploads a photo taken at delivery;
  shopkeeper confirms receipt in the app

### 🛡️ Admin Panel

- 👤 **Users & KYC:** approve accounts, view full registration details,
  and preview KYC documents through an authenticated viewer
- 👥 **Sub-Admins:** create and delete sub-admin accounts (main admin only),
  with 2FA status badges and a 10-account limit
- 📦 **Products:** view all marketplace listings, delete a listing
- 🧾 **Orders:** view orders and confirm submitted payments
- ⚖️ **Disputes:** dispute queue with evidence view (order summary, chat, delivery photo)
- 📊 **Dashboard:** real counts from the database — no hardcoded numbers
- 📜 **Audit log:** admin actions recorded, including KYC views

### ✉️ Contact

- 📬 Contact form saves messages to the database via the public API
- 🗂️ Messages are stored in the `contacts` collection for admin review
- 📧 Admin replies by email (Brevo)

---

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| 🎨 Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Poppins font |
| ⚙️ Backend | Node.js, Express 5, MongoDB with Mongoose |
| 🗄️ Database | MongoDB Atlas |
| 🔐 Auth | httpOnly cookie (`asan_token`), bcrypt passwords, email OTP, TOTP 2FA for sub-admins, Cloudflare Turnstile |
| 📧 Email | Brevo (HTTPS API — OTP, forgot-password links, approval emails) |
| 🖼️ Uploads | Cloudinary in production (public product photos, private KYC with short-lived signed URLs); local disk is the dev fallback only |
| 🖼️ Images | `next/image` optimisation for product photos |
| 🔍 SEO | Unique title + meta per page, robots.txt, sitemap.xml, Open Graph with per-product metadata, canonical URLs |
| 🛡️ Security | Security headers (CSP report-only), CORS allow-list, rate limits, per-IP OTP limit |
| 🚀 Deploy | Vercel (frontend), Render (backend), MongoDB Atlas |
| ✅ CI | GitHub Actions — typecheck, lint, build (frontend) + syntax check (backend) on every PR and push to `main` |

---

## 📁 Project Structure

```
asan_tijarat/
├── Frontend/                 # Next.js app
│   ├── app/                  # App Router pages (see Pages below)
│   ├── components/           # ProductCard, ProductImage, KYC viewer, Sidebar, Navbar, …
│   ├── context/              # AuthProvider (httpOnly cookie session)
│   ├── lib/                  # api.ts, cart.ts, invoice.ts, types.ts, utils.ts
│   ├── public/               # Static assets (logo.png, og-image.png)
│   ├── next.config.mjs       # Rewrites, image hosts, security headers
│   ├── vercel.json           # Vercel build config
│   └── package.json
├── Backend/                  # Express API
│   ├── server.js             # Entry point, fail-loud boot checks, health check
│   ├── src/
│   │   ├── constants/        # The exact 14 categories
│   │   ├── controllers/      # auth, product, order, payment, dispute, rating,
│   │   │                     # message, notification, admin, analytics
│   │   ├── middleware/       # auth (cookie only), error handler, rate limits
│   │   ├── models/           # User, Product, Order, Counter, Notification,
│   │   │                     # Dispute, Rating, Message, ContactMessage, AuditLog
│   │   ├── routes/           # auth, product, order, payment, dispute, rating,
│   │   │                     # message, notification, admin, public
│   │   └── utils/            # jwt, sendEmail (Brevo), Cloudinary storage,
│   │                         # payment, notify, delivery proof
│   ├── uploads/              # Dev fallback only — NEVER public in production
│   └── package.json
├── .github/workflows/ci.yml  # CI: typecheck + lint + build (frontend),
│                              # syntax check (backend)
├── render.yaml               # Render Blueprint for the backend service
└── README.md
```

---

## 📄 Pages

| Page | Who can use it |
| --- | --- |
| 🏠 `/` — Home (hero, real stats, top products, categories, how it works, dual-portal cards) | Everyone |
| 🛍️ `/marketplace` — Product listing with filters and sort | Everyone (buying needs a shopkeeper login) |
| 🖼️ `/product/[id]` — Product detail page (gallery, specs, supplier profile, MOQ breakdown) | Everyone |
| ℹ️ `/about` | Everyone |
| ✉️ `/contact` | Everyone |
| 🔑 `/signin` | Everyone |
| 📝 `/getstarted` — Registration wizard (details → documents → OTP) | Guests |
| 🔐 `/forgot-password` and `/reset-password` | Everyone |
| 🧑‍💼 `/supplier/dashboard`, `/supplier/my-products`, `/supplier/add-product`, `/supplier/orders`, `/supplier/analytics`, `/supplier/profile`, `/supplier/settings` | Suppliers |
| 🛒 `/shopkeeper/dashboard`, `/shopkeeper/orders`, `/shopkeeper/cart`, `/shopkeeper/analytics`, `/shopkeeper/profile`, `/shopkeeper/settings` | Shopkeepers |
| 🛡️ `/admin/dashboard`, `/admin/users`, `/admin/products`, `/admin/orders`, `/admin/disputes`, `/admin/messages`, `/admin/subadmins`, `/admin/security` | Admins (sub-admins: everything except `/admin/subadmins`) |
| 🔐 `/subadmin-setup` — First-time TOTP 2FA setup for new sub-admins | New sub-admins |

---

## 🏷️ The 14 Categories (Locked)

These are the **only** categories in the system — for products, filters,
and supplier profiles. No subcategories.

1. Staples, Grains & Flours
2. Pulses, Lentils & Beans
3. Cooking Oils, Ghee & Fats
4. Spices, Herbs & Baking
5. Packaged Foods, Recipe Mixes & Sauces
6. Beverages & Cold Corner
7. Tea, Coffee & Dairy
8. Snacks, Biscuits & Confectionery
9. Instant & Ready-to-Cook Foods
10. Home Cleaning & Sanitation
11. Personal Care & Hygiene
12. Mother & Baby Care
13. Paper Products, Wraps & Utilities
14. Over-the-Counter Healthcare

> 📦 Pack sizes are **product fields** (pack type + pack weight), not
> categories. Example: price `Rs 10,000 / bag`, `Min: 5 bag`,
> `1 bag = 25 kg`.

---

## 🔐 Authentication & Security

- 🍪 Auth token lives **only** in the httpOnly `asan_token` cookie —
  never in localStorage and never in API response bodies
- 🔑 Passwords are bcrypt-hashed; login locks after 5 failed attempts
  (15 minutes)
- 🚫 Suspended accounts are blocked at login (403) before any token
  is issued — a suspended-but-verified account cannot sign in
- 📧 OTP is 6 digits, SHA-256 hashed, 5-minute expiry, 60-second resend
  gap, 5 wrong attempts block it — plus a **per-IP rate limit**
  (5 OTP requests / 15 minutes)
- 🔗 Forgot-password tokens are 15-minute, single-use, hashed, and
  never appear in API responses
- 🛡️ Helmet-style security headers (CSP report-only, X-Frame-Options DENY,
  nosniff, Referrer-Policy, Permissions-Policy), API rate limits
  (300 / 15 min) and auth rate limits (50 / 15 min) on the backend
- 📦 JSON body limit is **1 MB** globally (25 MB only on the 4 upload routes)
- 🪪 KYC files are served **only** via the authenticated admin route
  (`GET /api/admin/users/:id/kyc/:field`) — the raw uploads folder
  is not public; Cloudinary private docs use 10-minute signed URLs
- 🔐 Sub-admins must complete **mandatory TOTP 2FA** setup on first sign-in
- 🚫 `.env` files and `Backend/uploads/` are git-ignored and must
  **never** be committed. If a real secret was ever pushed, rotate it —
  deleting it in a later commit does not remove it from git history
- 🌱 There is **no seed script** anymore. Never re-run an old seed file
  and never delete the database to reset accounts — edit accounts
  directly in the database instead

---

## ⚙️ Setup

### ✅ Prerequisites

- Node.js **20 LTS** and npm (Next.js 14 does not work with newer major Node versions)
- MongoDB — local or a MongoDB Atlas cluster
- A Brevo account (OTP / password-reset emails), a Cloudinary account
  (uploads), and a Cloudflare Turnstile site key (captcha on auth forms)

> ⚠️ Local development and the live site share the same Atlas database,
> so local edits change live data — use test accounts and test orders only.

### 🎨 Frontend

```bash
cd Frontend
npm ci
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL in .env.local (see Frontend/.env.example)
npm run dev
```

Frontend runs on **http://localhost:3000**.

Production build check:

```bash
npm run build
```

### ⚙️ Backend

```bash
cd Backend
npm ci
cp .env.example .env
# Fill in every value in .env (see Backend/.env.example)
# JWT_SECRET is required — the server exits without it.
npm run dev
```

For production, use `npm start` instead of `npm run dev`.
Backend runs on **http://localhost:5000** by default.

> ⚠️ Local `Backend/.env` must use `NODE_ENV=development` and
> `CLIENT_ORIGIN=http://localhost:3000` — never copy the production
> (Render) `.env` into local development, or CORS will block localhost.
> On Windows PowerShell, run the backend in production mode with
> `$env:NODE_ENV="production"; npm start`
> (the Unix form `NODE_ENV=production npm start` does not work in PowerShell).

---

## 🔧 Environment Variables

Never commit a real `.env` file. Copy the `.env.example` files and fill
in your own values.

**Frontend (`Frontend/.env.local`):**

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL (defaults to `http://localhost:5000` if unset) |
| `BACKEND_INTERNAL_URL` | Backend URL used for server-side fetches |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |
| `NEXT_PUBLIC_ADMIN_HOST` / `ADMIN_HOST` | Only set when an admin subdomain is used |

**Backend (`Backend/.env`):**

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` locally, `production` on Render |
| `PORT` | Backend port |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS |
| `FRONTEND_URL` | Frontend URL used in emailed links |
| `MONGO_URI` | MongoDB connection string (database `asan_tijarat`) |
| `JWT_SECRET` | Secret for signing auth tokens (required, long and random) |
| `JWT_EXPIRES_IN` | Token lifetime (for example `7d`) |
| `BREVO_API_KEY` | Brevo API key for emails (OTP, password reset) |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | Verified sender address and name for emails |
| `CONTACT_NOTIFY_EMAIL` | Address that receives contact-form messages |
| `USE_CLOUDINARY` | `true` in production, so uploads survive redeploys |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials |
| `ENCRYPTION_KEY` | 64-hex-character key for encrypting KYC data |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `LOGO_URL` | Public URL of the logo used in emails (Cloudinary) |
| `PLATFORM_FEE_PERCENT` | Platform fee percentage (default `0` — still undecided) |

---

## 🧪 Tested & Verified

These flows were tested live against a real backend and database:

- ✅ Sign in / sign out with the httpOnly cookie, role-based redirects
- ✅ Get Started end-to-end: details → KYC documents → email OTP →
  pending notice (no auto sign-in before admin approval)
- ✅ Forgot-password chain: link by email → reset → login with the
  new password (including the real admin email)
- ✅ Admin verifies an account; approval email is sent; unverified
  accounts cannot sign in
- ✅ Suspended-login block: suspended accounts get 403, no token issued
- ✅ KYC viewer: admin opens a supplier's documents as authenticated
  previews (thumbnails + full view, no 404)
- ✅ Add Product: empty defaults, "Select category", all 14 categories,
  price first, then pack type + pack weight, PDF-style labels
- ✅ Product card + detail page: price per pack, Min packs, 1 pack = weight,
  quantity selector with live total, role-aware Add button
- ✅ Contact form saves to the database (verified in Compass)
- ✅ Admin panel: role shows as plain text (no role-change dropdown),
  product status shows as plain text (no status-change dropdown)
- ✅ Home dual-portal cards preselect the role on Get Started
  (`/getstarted?role=supplier` / `?role=shopkeeper`)
- ✅ **Payment Test A (advance):** order paid, held in escrow, released
  after delivery photo + receipt confirm
- ✅ **Payment Test B (at delivery):** order paid at delivery, fee
  calculated, supplier paid the payout amount
- ✅ **Payment Test C (dispute):** order frozen on dispute, admin full refund
- ✅ **Partial-refund validation:** 0 and over-total amounts rejected,
  valid partial amount accepted
- ✅ **Batch 06 audit fixes:** all 6 guide tests passed (dispute freeze,
  `DISPUTE_OPEN` / `DISPUTE_TOO_LATE` guards, counterparty visibility,
  admin evidence view, reason 11 re-file)
- ✅ **WhatsApp share preview:** product link shows photo + title +
  description (verified in the Facebook Sharing Debugger)
- ✅ **CI:** GitHub Actions first run green on both the pull request
  and the merge
- ✅ Frontend production build passes (Next.js 14, 40/40 pages, 0 type errors)

---

## 🚧 Not Live Yet (Honest Scope)

These are **planned, not live** — the site never claims them until real:

- 🔐 Two-factor authentication for **suppliers and shopkeepers**
  (sub-admin TOTP 2FA is live)
- 📊 Error monitoring (Sentry) and CSRF protection
- 💰 Platform fee percentage — still undecided (`PLATFORM_FEE_PERCENT` is `0` for now)
- 🧪 Automated tests (none yet — CI runs typecheck, lint, build and syntax checks)
- 🌱 Seed products still exist in the live database (the old README said
  there are none — delete the seed data or update this note)
- 🔔 Payment Tests D (notifications bell), E (guards) and F (cancel-with-escrow)
  are still untested
- 🤖 Live AI recommendations — dashboard recommendations are real products,
  not AI-generated

---

## 🗺️ Roadmap

1. 🎨 **Page-by-page design** (homepage first), then mobile — theme is
   not touched in this phase; the floating mobile menu button is fixed here
2. ⛓️ **Blockchain proof layer** (Polygon Amoy testnet, one generic
   `ProofRegistry` contract): order/invoice proof, supplier-verification hash,
   product-batch QR authenticity, rating proof, payment record.
   **Proof only — no money moves on chain**
3. 🧪 **Final audit** at the very end

---

## 📜 Rules The Project Lives By

- 🚫 **No mock data** — every number on the site comes from real data
- 🔤 **English-only** site text (Urdu only inside product descriptions)
- 🏷️ **No false claims** — no "AI powered" or "verified" badges until the feature is real
- 💰 **Price per pack, always** — never a vague per-kg-only price
- 🛒 **Only shopkeepers buy** — the marketplace is public to browse,
  but purchasing is shopkeeper-only
- 🔒 **Escrow is real** — online payments stay held until delivery is
  confirmed; disputes freeze the money until the admin decides

---

## 👥 Team

Final-year BSc Computer Science project, FUUAST Karachi. Team of four:

- **Noushad Alam** — project lead ([@noshu12](https://github.com/noshu12))
- **Shaheem** — backend
- **Ezan** — testing
- **Laiba** — documentation

All work happens on the single working branch **`noushad-work`** — no new
branch per batch. Direct pushes to `main` are blocked; everything goes
through a pull request, and the pull request must pass CI before merging.

---

*Asan Tijarat — Wholesale Trade, Made Simple.* 🛒
