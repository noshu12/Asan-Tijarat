# 🛒 Asan Tijarat — B2B Wholesale Marketplace

> 🇵🇰 Pakistan's B2B wholesale marketplace connecting **suppliers** and **shopkeepers**,
> with a separate **admin** portal. Bulk orders with minimum order quantity (MOQ),
> transparent **price per pack**, and clear order stages — all in one place.

Built with **Next.js, Express, and MongoDB** — a Final Year Project (FYP).

---

## ✨ What Is Asan Tijarat?

Pakistan's wholesale economy runs on trust and relationships — but finding
reliable suppliers, negotiating fair prices, and ordering in bulk has always
been a struggle. Traders lose time and money to middlemen who add cost
without value.

**Asan Tijarat fixes this.** Suppliers list their products, shopkeepers
browse the marketplace, and orders move through clear stages from pending
to delivered. No middlemen. No guesswork. Just trade — made easy.

---

## 🚀 Features

### 🏪 Marketplace

- 🛍️ Browse real products listed by suppliers — no mock or dummy products
- 🔍 Search by product, supplier, city, and category
- 🏷️ Category filters with the exact 14 wholesale categories (see below)
- 💰 Price shown clearly **per pack**, with pack type and pack weight
- 📦 Stock and MOQ shown on every product card
- 🖼️ Product detail **popup on the same page** — photo gallery, description,
  supplier + city, price, MOQ, stock, and a quantity selector with live total

### 👥 Three Portals, Three Roles

| Role | Can do |
| --- | --- |
| 🧑‍💼 **Supplier** | Add and manage products, manage orders, view own dashboard, profile and settings |
| 🛒 **Shopkeeper** | Browse marketplace, add to cart, place bulk orders, track orders, profile and settings |
| 🛡️ **Admin** | Verify accounts and KYC, moderate users, products and orders, view admin dashboard |

> ⚠️ **Admin limits (by design):** an admin **cannot change a user's role**
> and **cannot change a supplier's product status**. Role and status show as
> plain text in the admin panel. Admin can still Verify / Unverify accounts
> and delete accounts or listings.

### 📝 Registration & KYC Review

- ✅ Business name, city, and **NTN are mandatory** for both roles
- 🪪 KYC documents uploaded at registration: CNIC front, CNIC back, NTN
- 📧 **Email OTP** verification (6-digit code, 5-minute expiry)
- ⏳ New accounts stay **pending** until an admin verifies them
- 🔒 Admin accounts are provisioned directly in the database —
  there is **no admin self-registration**

### 📦 Orders

- 🛒 Browser-based cart (shopkeepers only — guests are sent to sign in,
  suppliers/admins see a listing label, not a buy button)
- 💵 Order total = subtotal only — no fake fees, no payment step yet
- 📈 Order stages, in order:

```
pending → confirmed → processing → shipped → delivered
                            ↘ cancelled
```

- 🧾 Invoice view with subtotal and total only
- 👁️ Shopkeepers see every stage in **My Orders**; suppliers manage
  orders from the **supplier portal**

### 🛡️ Admin Panel

- 👤 **Users & KYC:** approve accounts, view full registration details,
  and preview KYC documents through an authenticated viewer
- 📦 **Products:** view all marketplace listings, delete a listing
- 🧾 **Orders:** view and move orders through their stages
- 📊 **Dashboard:** real counts from the database — no hardcoded numbers

### ✉️ Contact

- 📬 Contact form saves messages to the database via the public API
- 🗂️ Messages are stored in the `contacts` collection for admin review

---

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| 🎨 Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| ⚙️ Backend | Express, MongoDB with Mongoose |
| 🔐 Auth | httpOnly cookie (`asan_token`), bcrypt passwords, email OTP |
| 📧 Email | Nodemailer (SMTP — OTP, forgot-password links, approval emails) |
| 🖼️ Uploads | Local uploads for product photos and KYC documents |
| 🚀 Deploy | Vercel-ready frontend, Node backend, MongoDB Atlas or local MongoDB |

---

## 📁 Project Structure

```
asan_tijarat/
├── Frontend/                 # Next.js app
│   ├── app/                  # App Router pages (see Pages below)
│   ├── components/           # ProductCard, KYC viewer, Sidebar, Navbar, …
│   ├── context/              # AuthProvider (httpOnly cookie session)
│   ├── lib/                  # api.ts, cart.ts, types.ts, utils.ts
│   ├── public/               # Static assets
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts
│   └── package.json
├── Backend/                  # Express API
│   ├── server.js             # Entry point, security + CORS + rate limits
│   ├── src/
│   │   ├── constants/        # The exact 14 categories
│   │   ├── controllers/      # auth, product, order, admin, public
│   │   ├── middleware/       # auth (cookie only), error handler
│   │   ├── models/           # User, Product, Order, ContactMessage, AuditLog
│   │   ├── routes/           # auth, product, order, admin, public
│   │   └── utils/            # jwt, sendEmail, serialize, storage
│   ├── uploads/
│   │   ├── products/         # Public product photos only
│   │   └── kyc/              # KYC files — NEVER public, admin route only
│   └── package.json
└── README.md
```

---

## 📄 Pages

| Page | Who can use it |
| --- | --- |
| 🏠 `/` — Home (hero, real stats, top products, categories, how it works, dual-portal cards) | Everyone |
| 🛍️ `/marketplace` — Product listing with filters and sort | Everyone (buying needs a shopkeeper login) |
| ℹ️ `/about` | Everyone |
| ✉️ `/contact` | Everyone |
| 🔑 `/signin` | Everyone |
| 📝 `/getstarted` — Registration wizard (details → documents → OTP) | Guests |
| 🔐 `/forgot-password` and `/reset-password` | Everyone |
| 🧑‍💼 `/supplier/dashboard`, `/supplier/my-products`, `/supplier/add-product`, `/supplier/orders`, `/supplier/analytics`, `/supplier/profile`, `/supplier/settings` | Suppliers |
| 🛒 `/shopkeeper/dashboard`, `/shopkeeper/orders`, `/shopkeeper/cart`, `/shopkeeper/analytics`, `/shopkeeper/profile`, `/shopkeeper/settings` | Shopkeepers |
| 🛡️ `/admin/dashboard`, `/admin/users`, `/admin/products`, `/admin/orders` | Admins |

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
  gap, 5 wrong attempts block it
- 🔗 Forgot-password tokens are 15-minute, single-use, hashed, and
  never appear in API responses
- 🛡️ Helmet headers, API rate limits (300 / 15 min) and auth rate
  limits (50 / 15 min) on the backend
- 🪪 KYC files are served **only** via the authenticated admin route
  (`GET /api/admin/users/:id/kyc/:field`) — the raw uploads folder
  is not public
- 🚫 `.env` files and `Backend/uploads/` are git-ignored and must
  **never** be committed. If a real secret was ever pushed, rotate it —
  deleting it in a later commit does not remove it from git history
- 🌱 There is **no seed script** anymore. Never re-run an old seed file
  and never delete the database to reset accounts — edit accounts
  directly in the database instead

---

## ⚙️ Setup

### ✅ Prerequisites

- Node.js and npm
- MongoDB — local or a MongoDB Atlas cluster
- An email account with an app password, for OTP and account emails
  (Gmail with 2-Step Verification + a 16-character app password works)

### 🎨 Frontend

```bash
cd Frontend
npm install
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
npm install
cp .env.example .env
# Fill in every value in .env (see Backend/.env.example)
# JWT_SECRET is required — the server exits without it.
npm run dev
```

For production, use `npm start` instead of `npm run dev`.
Backend runs on **http://localhost:5000** by default.

---

## 🔧 Environment Variables

Never commit a real `.env` file. Copy the `.env.example` files and fill
in your own values.

**Frontend (`Frontend/.env.example`):**

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL (defaults to `http://localhost:5000` if unset) |

**Backend (`Backend/.env.example`):**

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS |
| `FRONTEND_URL` | Frontend URL used in emailed links |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing auth tokens (required, long and random) |
| `JWT_EXPIRES_IN` | Token lifetime (for example `7d`) |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP app password |
| `EMAIL_FROM` | Sender address shown on account emails |

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
- ✅ Product card + popup: price per pack, Min packs, 1 pack = weight,
  quantity selector with live total, role-aware Add button
- ✅ Contact form saves to the database (verified in Compass)
- ✅ Admin panel: role shows as plain text (no role-change dropdown),
  product status shows as plain text (no status-change dropdown)
- ✅ Home dual-portal cards preselect the role on Get Started
  (`/getstarted?role=supplier` / `?role=shopkeeper`)
- ✅ Frontend production build passes (Next.js 14.2.35, 28/28 pages)

---

## 🚧 Not Live Yet (Honest Scope)

These are **planned, not live** — the site never claims them until real:

- 💳 Payment integration and live payment methods
- 🤖 Live AI recommendations, demand forecasting, and analytics API
  (analytics pages show an honest "No analytics yet" placeholder)
- 📊 Market-sale box (needs real delivered-order data first; hidden
  while order data is thin)
- 🔔 Notifications system
- 🔐 Admin two-factor authentication
- 📝 Audit logging for admin actions (model exists, writes pending)

---

## 🗺️ Roadmap

1. 🔧 **Backend phase:** contact-form admin email notification,
   real suspend/activate workflow, removing the backend role-change
   and product-status-change routes, and production CORS hardening
2. 🌱 **Real data:** new accounts with real emails, real supplier
   products fed in by suppliers themselves
3. 🧪 **End-to-end test:** register → OTP → documents → admin approve
   → login → add product → order → pending → confirmed → processing
   → shipped → delivered, with invoice totals matching
4. 🚀 **Production hardening:** HTTPS + secure cookies, admin
   Settings/Profile page, secret rotation check on git history,
   backups and a runbook

---

## 📜 Rules The Project Lives By

- 🚫 **No mock data** — every number on the site comes from real data
- 🔤 **English-only** site text (Urdu only inside product descriptions)
- 🏷️ **No false claims** — no "escrow protected", "AI powered",
  "verified" badges, or live tracking until the feature is real
- 💰 **Price per pack, always** — never a vague per-kg-only price
- 🛒 **Only shopkeepers buy** — the marketplace is public to browse,
  but purchasing is shopkeeper-only

---

*Asan Tijarat — Wholesale Trade, Made Simple.* 🛒
