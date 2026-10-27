# ⚙️ Asan Tijarat — Backend (Node.js + Express + MongoDB)

Pakistan's AI-Powered B2B Wholesale Marketplace — **backend API**.

Built by reading the frontend's contracts (`Frontend/lib/types.ts`, `Frontend/lib/mockData.ts`,
`FRONTEND_DOCUMENTATION.md`) so every endpoint returns exactly the shape the UI expects
(`id`, `productId`, `orderNumber`, `platformFee`, …).

## 🚀 Quick start

```bash
# 1) install dependencies
npm install

# 2) make sure MongoDB is running on localhost:27017 (or change MONGO_URI in .env)

# 3) seed demo data (frontend's mock products/users/orders)
npm run seed

# 4) start the API
npm start          # or: npm run dev  (nodemon auto-reload)
```

Server → **http://localhost:5000** · Health → `GET /api/health`

> ✅ **Already verified live:** 27/27 smoke tests pass (`node smoke.test.js`).

## 🔑 Demo logins (password: `password123`)

| Role        | Email / Identifier        | Notes                          |
|-------------|---------------------------|--------------------------------|
| Admin       | `admin@asantijarat.pk` / `03001112222` | Admin Panel → `/admin/dashboard` |
| Shopkeeper  | `hassan.traders@gmail.com` or `03214567890` | matches the `/signin` prefill |
| Supplier    | `ahmed@akenterprises.pk` or `+92 300 1234567` | supplier portal (My Products, Orders) |

## 📁 Folder structure

```
Backend/
├── .env                    # PORT / MONGO_URI / JWT_SECRET  (never commit)
├── server.js               # Express app + boot (+ static /uploads)
├── smoke.test.js           # 27 end-to-end API tests
├── uploads/kyc/            # CNIC front/back + NTN files uploaded at registration
└── src/
    ├── config/db.js        # Mongoose connection
    ├── data/seed.js        # Seeds users/products/orders (frontend mock data)
    ├── middleware/
    │   ├── auth.js         # checkDb, JWT protect, requireRole guards
    │   └── errorHandler.js # 404 + central error envelope
    ├── models/             # User (+ documents: cnicFront/cnicBack/ntn), Product, Order
    ├── controllers/        # auth, product, order business logic
    ├── routes/             # /api/auth, /api/products, /api/orders, /api/admin
    └── utils/
        ├── serialize.js    # _id → id conversion for lean responses
        └── kycStorage.js   # validates + writes the uploaded KYC documents
```

## 🔌 API reference

All responses use the same envelope: success `{ ...data }` · error `{ "error": { "code", "message" } }`.

### Auth
| Method | Endpoint             | Auth | Description |
|--------|----------------------|------|-------------|
| POST   | `/api/auth/register` | —    | `{ name, email, phone, password, role, businessName?, city?, ntn?, category?, houseAddress?, currentHouseLocation?, currentLocation?, documents? }` → `{ user, verified: false, message }` — creates a **PENDING** account: the token is intentionally withheld and `verified` is forced to `false`, so the trader cannot sign in until an admin approves them. `currentLocation` is the browser-captured GPS point `{ lat, lng }` (server-validated, rendered as a Google Maps link for admins); `documents` carries the Step-3 KYC uploads (see below) |
| POST   | `/api/auth/login`    | —    | `{ identifier(email\|phone), password }` → `{ token, user }` · **403 `ACCOUNT_PENDING_VERIFICATION`** while the account is unverified |
| GET    | `/api/auth/me`       | JWT  | current `{ user }` |
| PATCH  | `/api/auth/me`       | JWT  | self-service profile update — `{ name?, businessName?, email?, phone?, city?, ntn?, category?, avatar?, houseAddress?, currentHouseLocation?, currentLocation? }` (`currentLocation` is `{ lat, lng }`, or `null` to clear; unique email/phone enforced; `role`/`verified` are admin-only) → `{ user }` |
| PATCH  | `/api/auth/me/password` | JWT | `{ currentPassword, newPassword (≥8 chars) }` — verifies the current password before replacing it → `{ updated: true }` |

> **Registration → verification flow (shopkeeper *and* supplier)**
> 1. `POST /api/auth/register` stores the account with `verified: false` and returns **no token**.
> 2. The UI shows *"Your account will be verified within 24 hours…"* and sends the trader to `/`.
> 3. The submission appears on the **Admin Dashboard → Pending Verifications** (and `/admin/users` → *Pending KYC* filter) with every field they entered **plus their uploaded CNIC/NTN documents**.
> 4. The admin presses **Verify** → `PATCH /api/admin/users/:id/verify { verified: true }`.
> 5. From then on `POST /api/auth/login` succeeds. Until then it returns `403 ACCOUNT_PENDING_VERIFICATION`, and `protect` rejects any token belonging to an unverified account.

### KYC document uploads (Step 3 of `/getstarted`)

Both **shopkeepers and suppliers** submit three compliance documents with their
registration: `cnicFront`, `cnicBack` and `ntn`.

* **Request shape** — each document is a base64 `data:` URL, so no multipart
  parser is needed:
  ```jsonc
  POST /api/auth/register
  {
    "name": "Ahmed Khan", "email": "…", "phone": "…", "password": "…", "role": "supplier",
    "documents": {
      "cnicFront": { "dataUrl": "data:image/jpeg;base64,…", "name": "cnic-front.jpg" },
      "cnicBack":  { "dataUrl": "data:image/jpeg;base64,…", "name": "cnic-back.jpg"  },
      "ntn":       { "dataUrl": "data:application/pdf;base64,…", "name": "ntn.pdf" }
    }
  }
  ```
* **Validation** (`src/utils/kycStorage.js`) — JPG / PNG / WEBP / PDF only, max
  **5MB** each, file names sanitised. A bad document returns
  `400 { error: { code: "KYC_UPLOAD_INVALID" } }` and the account is **not**
  created. `documents` itself is optional, so older clients (and `smoke.test.js`)
  keep working.
* **Storage** — files are written to `Backend/uploads/kyc/<field>-<ts>-<rand>.<ext>`
  and served statically at **`GET /uploads/kyc/<file>`**. The account stores
  `documents: { cnicFront|cnicBack|ntn: { url, originalName, mimeType, size, uploadedAt } }`.
* **Admin** — `/api/admin/users` returns the `documents` object with each user,
  so the dashboard previews the real uploaded images (full-size lightbox) next to
  the registration details before approving the KYC.
* **Body limit** — `express.json({ limit: '25mb' })` in `server.js` covers three
  5MB documents in base64 form.

### Products  (`/api/products`)
| Method | Endpoint | Auth     | Notes |
|--------|----------|----------|-------|
| GET    | `/`      | public   | `?search=&category=&sort=price_asc\|price_desc\|rating\|popular&supplierId=` |
| GET    | `/:id`   | public   | single product |
| POST   | `/`      | supplier | create listing (auto status from stock/MOQ) |
| PATCH  | `/:id`   | supplier | owner-guarded; zero stock → `Out of Stock` |
| DELETE | `/:id`   | supplier | owner-guarded |

### Orders  (`/api/orders`)
| Method | Endpoint      | Auth       | Notes |
|--------|---------------|------------|-------|
| POST   | `/`           | shopkeeper | `{ items:[{productId,quantity}], shippingAddress, paymentMethod?, currentLocation? }` — validates MOQ + stock, groups per supplier, adds 1.5% escrow fee, creates one order per supplier, decrements stock. `currentLocation` is the shopkeeper's checkout GPS `{ lat, lng }` (falls back to the point saved on their profile); it is stored on each order as `buyerLocation` plus a ready-made `buyerLocationLink` Google Maps URL so the supplier can tap it and navigate to the shop |
| GET    | `/`           | JWT        | role-aware: supplier→their orders, shopkeeper→their orders (`?status=`) |
| GET    | `/:id`        | JWT        | owner/supplier only |
| PATCH  | `/:id/status` | JWT        | supplier: Pending→Confirmed→Shipped→Delivered · buyer: →Cancelled (early stages) |

### Escrow math (matches frontend mock)
```
platformFee = round(0.015 × subtotal)
totalAmount = subtotal + platformFee
```

### Admin  (`/api/admin/*` — **admin JWT required on every route**)
| Method | Endpoint                  | Notes |
|--------|---------------------------|-------|
| GET    | `/api/admin/stats`        | platform KPIs: user/product/order counts, revenue, pending KYC, recent orders |
| GET    | `/api/admin/users`        | `?role=&verified=&search=` user directory |
| PATCH  | `/api/admin/users/:id/verify` | `{ verified: bool }` KYC approve/revoke |
| PATCH  | `/api/admin/users/:id/role`   | `{ role: 'shopkeeper'\|'supplier' }` |
| DELETE | `/api/admin/users/:id`         | removes account + owned listings |
| GET    | `/api/admin/products`      | `?search=&status=` full catalogue |
| PATCH  | `/api/admin/products/:id/status` | `{ status }` hide/restore listing |
| DELETE | `/api/admin/products/:id`  | remove listing |
| GET    | `/api/admin/orders`        | `?status=&search=` all orders |
| PATCH  | `/api/admin/orders/:id/status`  | `{ status }` admin status override |

> Admin accounts cannot delete/edit themselves, and cannot be created via
> public registration — they are provisioned by `npm run seed`.

## ✅ Done vs ❗ Remaining

**Done (this session):** full Express + Mongoose backend · MongoDB connection (`.env`) ·
JWT auth with bcrypt · role + ownership guards · product CRUD + search/sort ·
order pipeline (MOQ, stock, escrow, supplier grouping, status machine) ·
seed script with frontend mock data · 27/27 smoke tests green.

**Remaining (next step):**
1. **Frontend → API swap** — pages currently read `lib/mockData.ts` directly; point them at
   `http://localhost:5000/api/...` (JWT stored on login, sent as `Authorization: Bearer`).
   Add `NEXT_PUBLIC_API_URL` + optional Next.js `/api` rewrite to avoid CORS.
2. **Payments** — JazzCash/EasyPaisa sandbox webhooks (currently `paymentStatus: Paid` at checkout).
3. **AI forecasting** — real model/Gemini call for `aiReason` + demand forecast (currently seeded text).
4. **Analytics rollups** — dashboard KPIs (revenue/orders per month) via `$group` aggregations.
5. **Production hardening** — refresh-token rotation, rate limiting, helmet, express-validator.

## 🧪 Run the tests

```bash
npm start            # terminal 1
node smoke.test.js   # terminal 2  →  27 passed | 0 failed
```
├── server.js               # Express app + boot
├── smoke.test.js           # 27 end-to-end API tests
└── src/
    ├── config/db.js        # Mongoose connection
    ├── data/seed.js        # Seeds users/products/orders (frontend mock data)
    ├── middleware/
    │   ├── auth.js         # checkDb, JWT protect, requireRole guards
    │   └── errorHandler.js # 404 + central error envelope
    ├── models/             # User, Product, Order (match lib/types.ts)
    ├── controllers/        # auth, product, order business logic
    ├── routes/             # /api/auth, /api/products, /api/orders
    └── utils/serialize.js  # _id → id conversion for lean responses
```