# 🏗️ Asan Tijarat — Backend Logic Specification

**Version** 1.0 · **Generated from** live frontend source (`app/`, `components/`, `context/`, `services/`) · **Audience:** backend / FYP developers

This spec converts **every interactive element** of the shipped frontend into an implementable server contract. Each entry covers: frontend trigger → client logic → service delegate → HTTP endpoint → auth/roles → server business rules → DB operations → third-party integrations → response/error schemas.

---

## 0. Global Conventions

### 0.1 Transport & Envelopes
```
Base URL       https://api.asantijarat.pk/api/v1
Auth           Authorization: Bearer <JWT>      X-User-Role: shopkeeper|supplier
Idempotency    Idempotency-Key: <uuid>          required on every POST that moves money/stock
```
```jsonc
// EVERY 2xx                                     // EVERY non-2xx
{ "success": true, "data": { }, "meta": {        { "success": false, "error": {
  "page":1, "pageSize":20, "total":143 } }         "code":"STOCK_INSUFFICIENT",
                                                   "message":"Only 40 bag available",
                                                   "details":[{"field":"quantity"}] } }
```

### 0.2 Money & Math Rules *(authoritative — mirrors `CartContext.tsx` L110-116 & `services/orderService.ts`)*
| Rule | Specification |
|---|---|
| Currency | Integer **PKR rupees** on the wire; `BIGINT` columns, no decimals |
| Line total | `unitPrice × quantity` |
| Subtotal | `Σ lineTotals` per purchase-group (**one group per supplier**) |
| **Escrow fee** | `Math.round(subtotal × 0.015)` — 1.5% platform fee, half-up rounding, charged to buyer |
| Grand total | `subtotal + platformFee` |
| Worked example | subtotal `Rs 50,000` → fee `750` → buyer pays `Rs 50,750`; supplier payout `50,000` |

### 0.3 Roles (JWT claim `role`)
| Role | Portal | Trade side |
|---|---|---|
| `shopkeeper` | `/shopkeeper/*` | Buy ✅ (primary B2B buyer) |
| `supplier` | `/supplier/*` | Sell-only ❌ Add-to-Cart hidden (`ProductCard.tsx` L86-97); server must reject cart endpoints too |

### 0.4 Database Model Dictionary
```sql
users                id PK, name, email UQ, phone UQ, password_hash NULL(oauth), role ENUM('shopkeeper','supplier'),
                     business_name, city, ntn CHAR(9) NULL, category, avatar_url, verified BOOL DEF false,
                     kyc_status ENUM('none','pending','approved','rejected'), created_at, deleted_at NULL -- soft delete
products             id PK, supplier_id FK->users, name, category ENUM(CATEGORIES_LIST), unit VARCHAR(16),
                     price BIGINT CHECK(>0), moq INT CHECK(>=1), stock INT CHECK(>=0), description TEXT,
                     image_url, additional_images JSONB, rating DECIMAL(2,1) DEF 0, review_count INT DEF 0,
                     orders_count INT DEF 0, status ENUM('Active','Low Stock','Out of Stock')  -- denormalized, guarded
                       CHECK( status!='Out of Stock' OR stock=0 ),
                     low_stock_threshold INT DEF 10, is_trending BOOL DEF false, ai_reason VARCHAR(120),
                     deleted_at NULL
orders               id PK, order_number 'AT-YYYY-###' UNIQUE, buyer_id FK->users, buyer_role, supplier_id FK->users,
                     subtotal BIGINT, platform_fee BIGINT, total_amount BIGINT,
                     status ENUM('Pending','Confirmed','Shipped','Delivered','Cancelled') DEF 'Pending',
                     shipping_address TEXT, payment_method ENUM('JazzCash','EasyPaisa','Card','Bank Transfer'),
                     payment_status ENUM('Paid','Pending','Refunded'), created_at, delivery_date NULL
order_items          id PK, order_id FK CASCADE, product_id FK RESTRICT, name_snapshot, image_snapshot,
                     unit_price_snapshot BIGINT, quantity INT, unit   -- IMMUTABLE receipt snapshot, never joined for math
escrow_transactions  id PK, order_id FK UNIQUE, gateway_txn_id UNIQUE, amount BIGINT, fee_amount BIGINT,
                     payout_amount BIGINT (= amount-fee),
                     state ENUM('HOLD_CREATED','FUNDED','RELEASED','REFUNDED','DISPUTED'), timeline JSONB
users_notification_prefs user_id PK/FK, new_orders BOOL, payment_confirmed BOOL, product_reviews BOOL,
                     low_stock BOOL, announcements BOOL
otp_codes            phone PK, code_hash, purpose ENUM('register','login'), expires_at, attempts INT DEF 0
ai_forecasts         id PK, product_id FK, horizon_days INT, series JSONB [{day,actual,forecast,lower,upper}],
                     model ENUM('ARIMA','PROPHET','GEMINI_ASSISTED'), model_params JSONB {p,d,q}, r2 DECIMAL(4,3),
                     generated_at   -- read-through cache TTL 24h
ai_recommendation_log id PK, user_id FK, context JSONB(cart/category/city), product_ids JSONB, served_at
-- Cart is CLIENT-SIDE ONLY (localStorage 'asan-cart'). Server sees it at quote/checkout (M3.1/M3.2).
-- Theme ('asan-theme'), Toasts, invoice print window = pure frontend, zero endpoints.
```

## 📇 Coverage Map — all 21 route pages → spec entries
| # | Route | Interactive elements | Covered by |
|---|---|---|---|
| 1 | `/` landing | Hero CTAs "I'm a Supplier/Shopkeeper", category cards, carousel arrows/drag/pagination | M1.1b, M2.1a; carousel = local-only state |
| 2 | `/about` | Static marketing page | none |
| 3 | `/signin` | 2 role-selection cards + Sign In submit (+ authed redirect-away) | M1.1, M1.2 |
| 4 | `/getstarted` | 3-step wizard, OTP send/verify, CNIC upload, confetti finish | M1.4, M1.5 |
| 5 | `/marketplace` | Search box, category chips, sort select, Trending AI strip, every ProductCard **Add** | M2.1, M5.1, M3.0 |
| 7 | `/shopkeeper/dashboard` | Quick actions to Cart/Marketplace, live KPI cards | M4.3 |
| 8 | `/shopkeeper/cart` | Qty steppers (MOQ nudge), remove line, Place Order (payment method + address modal), success confetti/clear. Shared `CartView` | M3.0–M3.3 |
| 9 | `/shopkeeper/orders` | Status filter tabs All/Pending/Confirmed/Shipped/Delivered, row modal, Download Invoice | M4.1a, M4.4 |
| 10 | `/shopkeeper/analytics` | Charts & Top-Supplier cards (read-only) | M4.3a |
| 11 | `/shopkeeper/settings` | Save profile form, Update Password form, notification checkboxes | M1.6, M1.7, M1.8 |
| 12 | `/supplier/dashboard` | Quick action Add Product, revenue/donut charts from live orders | M4.3b |
| 13 | `/supplier/add-product` | Full publish form (image URL pickers, category/unit/moq/stock) | M2.2 |
| 14 | `/supplier/my-products` | Edit-lot ✏️ modal (name/price/stock/MOQ/status), 🗑 delete, low-stock badges | M2.3, M2.4 |
| 15 | `/supplier/orders` | Received Orders tabs, Confirm/Ship/Deliver action buttons per status | M4.1b, M4.2 |
| 16 | `/supplier/analytics` | Revenue chart, AI demand-forecast band chart, sales-by-category donut | M4.3b, M5.2 |
| 17 | `/supplier/profile` | Public verified business card + live catalogue grid | M2.5 |
| 18 | `/supplier/settings` | Same as #11 for supplier incl. business fields (NTN/city) | M1.6–M1.8 |
| 19 | `/backend-logic` demo console | Simulated fires of checkout / forecast / ship endpoints with canned payloads & logs | payloads in §APX-C |
| 20 | Global chrome (`Navbar`, `Sidebar`, `Footer`, `PortalHeader`) | Cart badge + button **hidden for guests & suppliers**, shown for shopkeeper→#8; profile dropdown (outside-click/Esc-close, user items only); logout button; guards redirect. *(Dark-mode toggle REMOVED — app ships light-theme only)* | M1.9, M1.10 |
| 21 | Guard-triggered auth redirects | Guest taps any **Add to Cart** or opens cart/portal link → warning toast + hard redirect to `/signin?redirect=<origin>`; sign-in honors `?role=` preselect & bounces back post-auth | M1.10 |

Frontend service delegates: `services/authService.ts`, `services/productService.ts`, `services/orderService.ts`. Client-only (no endpoint): cart mirror `asan-cart`, toasts.

# 📦 MODULE 1 — Authentication, User Profiles & Role Authorization

### M1.1 — Demo Role Sign-In *(current FE behavior)*
| Facet | Value |
|---|---|
| Trigger | `/signin` page.tsx · role card onClick → `login(role)` → AuthContext.tsx L43-49 |
| Service delegate | `authService.getSeedUser(role)` + `persistUser()` |
| Endpoint | **`POST /api/v1/auth/login`** `{ role }` *(demo mode — replace with M1.2 credentials body)* |
| Auth | Public · rate-limit 10/min/IP |
| Server logic | Demo: resolve fixed seed account per role (Ahmed Khan/supplier, M. Hassan/shopkeeper); issue JWT {sub, role} 7d. Production: email+password verify bcrypt(12). |
| DB ops | `users SELECT by role/email`; audit INSERT `login_events` |
| Response | `{ user:{id,name,email,role,businessName?,verified}, accessToken, refreshToken }` — FE persists snapshot to `asan-user-profile` |
| Errors | 401 `INVALID_CREDENTIALS` · 403 `ROLE_SUSPENDED` · 429 `RATE_LIMITED` |

### M1.2 — Credential Sign-In (production)
**`POST /auth/login`** `{ email, password }` — same contract as M1.1; server ignores client-provided role and derives it from `users.role`. Client logic already redirects post-login via `getHomeRouteForRole()` → keep mapping: shopkeeper→`/shopkeeper/dashboard`, supplier→`/supplier/dashboard`.

### M1.3 — Session Restore
| Trigger | App mount → AuthContext `useEffect` → `loadPersistedUser()` |
|---|---|
| Endpoint | **`GET /api/v1/auth/me`** |
| Logic | Server validates JWT, returns fresh profile (source of truth overrides localStorage cache). 401 ⇒ client calls `clearPersistedUser()` + reroute `/signin` (mirrors `AuthGuards.RequireAuth`). |

### M1.4 — Registration Wizard (3 steps)
Triggers: `/getstarted` step transitions, `sendOtp()`, `verifyOtp()`, final submit + confetti.
```jsonc
// POST /auth/register/init     → OTP #1
{ "phone":"+923214567890", "name":"...", "role":"shopkeeper" }
→ 201 { "registrationId":"reg_01J…" }        // creates users row kyc_status='pending' + otp_codes row (6-digit, sha256, 5-min TTL, max 5 attempts)
// POST /auth/register/verify-otp              → OTP #2
{ "registrationId":"reg_…", "code":"482913" }
→ 200 { "verified":true }                    // 400 INVALID_OTP / 409 OTP_EXPIRED / 429 TOO_MANY_ATTEMPTS
// POST /auth/register/complete                → step 3
{ "registrationId":"reg_…", "businessName":"Hassan Traders", "city":"Lahore",
  "ntn":"12345678", "category":"General Store", "cnicImage":"<signed-upload-url result>" }
→ 201 { user, accessToken }                  // kyc_status stays 'pending'; admin approve flips verified=true (M1.11)
```
DB: transactional `users INSERT` rollback on any step failure after `complete`; `otp_codes DELETE`; CNIC file stored via signed pre-upload (`POST /uploads/sign` → S3/Bunny; validate JPEG/PNG ≤ 5MB).

### M1.5 — Profile Update
Trigger: settings forms (both portals) → `updateUserProfile(patch)` → `mergeProfileUpdate` → optimistic local save + toast *“Personal information updated successfully!”*.
**`PATCH /users/me`** `{ name?, email?, phone?, businessName?, city?, ntn? }`
Server rules: email/phone uniqueness (409 `CONTACT_TAKEN`), NTN regex `^\d{9}$` + optional FBR re-verification job; regenerate JWT if role-bearing claims change. Response = full updated `user`. Errors: 400 VALIDATION / 401 / 409.

### M1.6 — Password Change
Trigger: “Update Password” submit; client checks confirm-match only.
**`PUT /users/me/password`** `{ currentPassword, newPassword }`
Server: verify current hash (401 WRONG_PASSWORD), enforce ≥8 chars + zxcvbn score≥2, revoke all refresh tokens, notify SMS.

### M1.7 — Notification Preferences
Trigger: checkbox toggle → instant `showToast('Notification preference saved','info')`.
**`PUT /users/me/notification-prefs`** body = 5 booleans (see `users_notification_prefs`). Upsert idempotent; returns saved row.

### M1.8 — KYC Upload
Trigger: wizard CNIC dropzone. **`POST /uploads/sign`** `{ fileName, mime, sizeBytes } → { uploadUrl, publicUrl, expiresAt }`. Server MIME allowlist image/jpeg,png,webp; ≤5MB; virus-scan hook.

### M1.9 — Logout
Trigger: Navbar ⏻ / Sidebar logout → `logout()` → `clearPersistedUser()` → push `/`.
**`POST /auth/logout`** — revoke refresh-token family; access token left to expire (15 min). Always 204.

### M1.10 — Route Guards (server mirror of AuthGuards.tsx)
Middleware on every portal route: missing/expired JWT → 302 `/signin`; role mismatch (e.g. shopkeeper hits `/supplier/*`) → **403 ROLE_FORBIDDEN** `{ code:"ROLE_FORBIDDEN" }`. FE analog `RedirectIfAuthed` sends authed users home — replicate by honoring `redirect_to` query param after login.

**Update (latest session — role-enforced guards):** `RequireAuth` now accepts an `allowedRoles` array and the portal layouts pass it explicitly (`app/shopkeeper/layout.tsx` → shopkeeper, `app/supplier/layout.tsx` → supplier). Unauthenticated users bounce preserving their intended destination (`/signin?redirect=…`). **The server MUST mirror this exact role→portal mapping**, never trusting query-supplied identity.

### M1.11 — Admin Verification Job (internal)
`PATCH /admin/users/:id/kyc` `{ decision:'approved'|'rejected', reason }` → sets `verified`, triggers welcome SMS. Supplier catalogue badges (`ProductCard` shield) read `products.supplierVerified` join — flip cascades next GET /products response.

# 🏪 MODULE 2 — Wholesale Catalogue, Stock Management & Supplier Lot Editing

### M2.1 — Marketplace Listing
| Facet | Value |
|---|---|
| Trigger | `/marketplace` search input onChange (300 ms debounce), category chip click, sort select (`Recommended`/`Price ↑↓`/`Rating`), Trending strip render → `productService.getFallbackCatalogue()` today |
| Endpoint | **`GET /api/v1/products`** |
| Query | `?q=&category=&sort=recommended|price_asc|price_desc|rating&minPrice=&maxPrice=&trending=true&page=1&pageSize=20&city=` |
| Auth | Public (JWT optional; members get AI-personalized `sort=recommended`) |
| Server logic | Full-text name/description ILIKE; deterministic price sort tie-break `id`; `status!='Out of Stock'` always appended unless `include_oos=true`; enrich each row with live `ai_reason` when present |
| DB ops | `products SELECT … WHERE deleted_at IS NULL` + idx `(category,status,price)`; GIN trigram on name |
| Response | `data: Product[]` (shape = `lib/types.ts:Product` verbatim, including denormalized supplierName/City/Verified snapshots) |
| Errors | 400 BAD_QUERY · 500 DOWNSTREAM_AI (degrade to sort=rating, flag `"degraded":true`) |

### M2.2 — Publish New Lot (Add Product form)
| Facet | Value |
|---|---|
| Trigger | `/supplier/add-product` submit → client assembles full draft then `createProduct(draft,supplier)` → `withCreatedProduct()` prepends optimistically + toast “Listing published” |
| Endpoint | **`POST /api/v1/products`** |
| Auth | `Bearer + X-User-Role: supplier` (403 otherwise) |
| Body | `{ name, category, unit, price, moq, stock, description, image, additionalImages[] }` |
| Validation | `price>0 && ≤10_000_000`; `moq>=1`; `moq<=stock`; stock≤10^7 integers only; name 6–120 chars; category ∈ CATEGORIES_LIST enum (sync `lib/mockData.ts`); image HTTPS URL or previously signed upload; spam-check description length ≤ 2000 |
| Computations | `status = stock>0 ? 'Active':'Out of Stock'`; rating/reviewCount/ordersCount initialized 0; `ordersCount` later drives Trending heuristic |
| DB ops | `INSERT products` RETURNING \*; single statement, no TX needed |
| Response | 201 `data: Product` ← **must echo server ids/ordering; FE replaces optimistic row** |
| Errors | 400 FIELD_VALIDATION(details[]) · 401 · 403 SUPPLIERS_ONLY · 409 DUPLICATE_LOT (same supplier+name+unit active) |

### M2.3 — Edit Lot Modal
Trigger: `/supplier/my-products` ✏️ → Modal form → submit passes only changed patch → `updateProduct(id,patch)` → `withUpdatedProduct()` immutably patches state + localStorage + toast “‘{name}’ updated successfully”.
Client guards duplicated server-side:
```ts
if (!name.trim()) error;                                  // REQUIRED_NAME
price > 0;                                                // INVALID_PRICE
Number.isInteger(stock) && stock >= 0;                    // INVALID_STOCK
Number.isInteger(moq) && moq >= 1 && moq <= stock;        // MOQ_EXCEEDS_STOCK
```
Endpoint **`PATCH /api/v1/products/:id`** `{ name?, price?, stock?, moq?, status? }`
**Status state-machine (product):**
| Incoming | Condition | Resulting |
|---|---|---|
| client omits `status` | server derives | `stock===0 → 'Out of Stock'`; `0<stock≤low_stock_threshold → 'Low Stock'`; else `'Active'` |
| explicit `status:'Active'` | must satisfy `stock>threshold` | else 409 STATUS_CONFLICT |
| stock decreased to 0 | — | auto 'Out of Stock'; fans out `low_stock`/`oos` notifications to watchers table |
Ownership check → 404 `LOT_NOT_FOUND` (not 403; avoids enumeration) if id ≠ owner supplier.
Concurrent-edit safety: request header `If-Unmodified-Since: <updated_at>` → 412 STALE_WRITE on clash.
Response 200 full `Product`.

### M2.4 — Delete Lot
Trigger: my-products 🗑 → confirm dialog → `removeProduct(id)` optimistic filter + toast.
Endpoint **`DELETE /api/v1/products/:id`** → soft delete only (`deleted_at=NOW()`).
Reject with 409 `HAS_ACTIVE_ORDERS` if any `order_items → orders.status IN ('Pending','Confirmed')` references lot (item history uses snapshots so historical receipts stay intact either way — but listing must vanish from marketplace immediately).

### M2.5 — Public Supplier Profile Page
Trigger: `/supplier/profile` render → `getSupplierBusinessProfile()`.
**`GET /api/v1/suppliers/:id/public`** → `{ user:{businessName,city,ntnMasked:"12345-***",category,avatarUrl,verified,ratingAvg,positivePct}, certifications:[{title,detail}], products: Product[] (active lots) }`
DB: 3 queries joined; NTN always masked server-side (PII rule). Errors: 404 SUPPLIER_NOT_FOUND.

### M2.6 — Landing Category Cards
CTA deep-links `/marketplace?category=<slug>`; served by same M2.1 endpoint using query param — no separate route. Carousel arrows are pure UI.

# 🛒 MODULE 3 — Cart, Escrow Checkout & Payment Gateway Pipeline

### M3.0 — Client Cart Contract *(no endpoint yet — server MUST re-validate everything at quote)*
Trigger paths → `CartContext.addToCart(product, qty)` (`ProductCard` **Add**, `AIRecommendationCard` ➕). Replicate these client rules **verbatim on the server**:
```
reject  product.status === 'Out of Stock' || stock < moq          → "currently unavailable"
qty     = max(moq, floor(qty))                                    // MOQ floor
merge   same productId ⇒ quantity = min(existing + requested, stock)
if merged delta == 0                                              → "Only {stock} {unit} available"
updateQty rejects qty < moq                                       → "Minimum order quantity is {moq} {unit}"
cap     min(qty, stock)                                           → nudge toast when capped
```
**Optional persistence:** `PUT /cart` stores opaque `{items:[{productId,quantity}]}` for cross-device carts; FE keeps localStorage mirror regardless.

### M3.1 — Checkout Quote
| Facet | Value |
|---|---|
| Trigger | Render of totals panel (subtotal/fee/total live preview) — `/shopkeeper/cart` (shopkeeper), via shared `CartView` |
| Endpoint | **`POST /api/v1/checkout/quote`** `{ items:[{productId, quantity}] }` |
| Auth | shopkeeper |
| Server | Fetch current prices+stock; reject OOS (409); recompute `subtotal`, `Math.round(subtotal*0.015)` fee, total per supplier group; return expiry (prices held 15 min via `price_locks` row) |
| Response | `data:{ groups:[{supplierId,supplierName,subtotal,platformFee,total}], grandTotal, lockId }` |

### M3.2 — Create Escrow Payment Session
| Facet | Value |
|---|---|
| Trigger | “Place Order” in address+payment modal → `placeOrders(buyer,items,paymentMethod,address)` via `withPlacedOrders()` (FE optimistically splits per supplier, numbers `AT-YYYY-###` = count+idx, status `Pending`, `paymentStatus 'Paid'`, confetti + clearCart) |
| Endpoint | **`POST /api/v1/checkout/session`** |
| Auth | Idempotency-Key REQUIRED |
| Body | `{ lockId, paymentMethod:'JazzCash'|'EasyPaisa'|'Card'|'Bank Transfer', shippingAddress, groupIds }` |
| Server pipeline | ① validate lock not expired · ② **atomic** `UPDATE products SET stock=stock-? WHERE id=? AND stock>=?` per line (any failure ⇒ full rollback 409) · ③ INSERT `orders` rows (status Pending, payment_status Pending, order_number from `seq_orders_YYYY` counter — NOT client count) + `order_items` snapshots · ④ INSERT `escrow_transactions state='HOLD_CREATED'` · ⑤ gateway session create (below) → return redirect payload |
| Gateway adapters | JazzCash/EasyPaisa hosted-checkout (hash HMAC-SHA256 of sorted params + salt), Card via PCI tokenization; response `{ sessionId, redirectUrl|sdkToken, expiresAt }` |
| DB ops | ONE transaction spanning products/orders/order_items/escrow_transactions; gateway call strictly after commit using `afterCommit` outbox |
| Errors | 409 STOCK_INSUFFICIENT (details[] lists offending ids) · 409 PRICE_LOCK_EXPIRED · 400 PAYMENT_METHOD_UNSUPPORTED · 502 GATEWAY_UNAVAILABLE |

### M3.3 — Gateway Webhook (source of truth for money)
**`POST /api/v1/webhooks/payments/{provider}`** (raw body, provider signature header)
1. Verify HMAC signature constant-time compare; on fail → 401 log-intrusion.
2. Dedupe by event id (`webhook_events` PK) → replay returns 200 stored result.
3. `payment.succeeded` ⇒ TX: escrow HOLD_CREATED→**FUNDED**, orders.payment_status=**Paid**, push SSE `order:paid`.
4. `payment.failed/expired` ⇒ soft-cancel Pending orders (M4.2 matrix auto-row), release reserved notes.
5. Bank Transfer = manual variant: admin `POST /admin/payments/:id/mark-paid` feeds same pipeline.
Acknowledge `<2s`: return `200 {"received":true}` before any slow fan-out (queues).

# 🚚 MODULE 4 — Order Management, Pipeline Transitions & Receipts

### M4.1 — Order Lists (scoped)
Triggers: `/shopkeeper/orders` tabs All/Pending/Confirmed/Shipped/Delivered, `/supplier/orders` same + supplier scope.
**`GET /api/v1/orders`** `?scope=mine|received&status=&page=&pageSize=&since=`
JWT `sub` + role decide scope automatically (**never trust query-supplied userId**): shopkeeper→`buyer_id=sub`; supplier→`supplier_id=sub`. Include item snapshots so receipts render without joins.
Response row = `lib/types.ts:Order` exactly (orderNumber, buyerRole embedded, subtotal/platformFee/totalAmount). Errors: 401 only.
Today FE delegates to `orderService.readStoredOrders()/getFallbackOrders()` — swap internals, signatures stay.

### M4.2 — Status Transition
Trigger: supplier Received-Orders action buttons inside detail modal (Confirm Order / Mark as Shipped / Mark as Delivered) → `updateOrderStatus(id,newStatus)` → `orderService.withOrderStatus()` + toast “Order updated to {status}”.
**`PATCH /api/v1/orders/:id/status`** `{ status }` — supplier-of-record or admin only.
**State machine (enforce both source & target, else 409 INVALID_TRANSITION):**
```text
Pending   ──Confirm──▶ Confirmed      (notify buyer)
Pending   ──cancel───▶ Cancelled      ⟲ auto-refund
Confirmed ──dispatch─▶ Shipped        (courier ref optional)
Confirmed ──cancel───▶ Cancelled      ⟲ auto-refund
Shipped   ──POD──────▶ Delivered      set delivery_date; terminal
Delivered              [terminal]     Cancelled/reject: also terminal, never editable
```
Side-effects per edge, single SQL TX:
| Edge | Escrow (`escrow_transactions`) | Notifications | Other |
|---|---|---|---|
| →Confirmed | stays FUNDED | buyer SMS/email | lock courier slot (optional) |
| →Shipped | stays FUNDED | tracking msg | none |
| →Delivered | **RELEASED**: payout=`amount-fee_amount` credited to supplier balance ledger | both parties + review prompt | increment products.orders_count |
| →Cancelled | **REFUNDED** via original instrument (gateway reverse API; async job w/ retry) | both parties | restock `products.stock += line.qty`, recompute status |
Idempotent repeat PATCH returns current entity 200 (safe retries).

### M4.3 — Invoice / Receipt Document
Trigger: 👁 modal **Download Invoice** (all three order pages) → `printInvoice(order)` from `lib/invoice.ts` builds brand HTML (order #, buyer/supplier/payment cards, itemized table, escrow fee 1.5%, grand total, payment pill, POD address, status footer) → popup print / Save-as-PDF. **Download All** bundles every receipt separated by page-break.
Backend parity endpoints (for email/PDF archive):
* **`GET /api/v1/orders/:id/invoice.pdf`** — server-render PDF (Puppeteer/Playwright over the exact template below; CSS already print-tuned `@page margin 12mm`).
* **`GET /api/v1/orders/:id/invoice.html`** — same markup as string for emails.
Access: participant roles or admin. Pull values ONLY from `orders` + immutable `order_items` snapshots (per-item supplierName included). Number format: `Rs {#,##0}` en-PK. Errors: 404 ORDER_NOT_FOUND · 403 ROLE_FORBIDDEN(non-party).

### M4.4 — Analytics Rollups (read-only dashboards)
Triggers: shopkeeper dashboard KPIs, `/shopkeeper/analytics` bar chart `MONTHLY_SPENDING_SAVINGS {month,spent,savings}` + Top-Suppliers cards `TopSupplier{id,name,initials,rating,ordersCount,tradeVolume,verified}`, supplier revenue chart `SUPPLIER_REVENUE_CHART {month,revenue,orders}` & donut `SALES_BY_CATEGORY {name,value,color}`.
Endpoints (materialized views refreshed 15-min):
* **`GET /analytics/shopkeeper`** → KPIs(totalSpent,ordersPlaced,savingsMoM,activeSuppliers distinct) + monthlySeries + topSuppliers (rank by completed tradeVolume, verified join)
* **`GET /analytics/supplier`** → revenueSeries, salesByCategory (% share by revenue), live pipeline counts
`savings` := Σ(buyer unit price − category median price)×qty on Delivered orders. All money BIGINT. Scope enforced by JWT like M4.1. Optional `?granularity=daily`.
# 🤖 MODULE 5 — AI Recommendations & Forecasting Engine

### M5.1 — Hybrid Product Recommendations
| Facet | Value |
|---|---|
| Trigger | Marketplace “AI Picks/Trending” strip + default `sort=recommended`; card shows `product.aiReason` chip |
| Delegate today | mock flags `isTrending`/`aiReason` on `INITIAL_PRODUCTS` (`mockData.ts`) |
| Endpoint | **`GET /api/v1/ai/recommendations`** `?context=browse&category=&city=&limit=8&excludeCart=true` |
| Auth | optional JWT — anonymous falls back to popularity prior |
| Pipeline | ① signals: user's delivered order_items (CF co-purchase), city, cart contents, category dwell (content-based cosine on embeddings) · ② blend scores `0.55·cf + 0.30·content + 0.10·popularity(orders_count,z-norm) + 0.05·freshness` · ③ business filters verified supplier first, cap 2 lots/supplier |
| Gemini assist | ranker is local/embedding-based; Gemini ONLY writes the reason string |
| DB ops | read replicas; upsert `products.is_trending, ai_reason`; log serve-events into `ai_recommendation_log` (feedback loop) |
| Errors | degrade silently → top-rated active products, `"degraded":true` |

**Gemini prompt (reason-copy stage, `gemini-2.0-flash`, JSON-mode, temperature 0.2, maxOutputTokens 256):**
```jsonc
// system
You write ultra-short B2B wholesale insights for Pakistani traders. Output JSON only.
// user
{"product":{"name":"Super Kernel Basmati Rice","category":"Rice","pricePerBag":4500,
 "city":"Sheikhupura","ordersCount":260,"rating":4.9},
 "audience":{"role":"shopkeeper","city":"Karachi",
             "recentlyBought":["Sella Basmati 25kg"]},
 "trendSignal":{"categoryDemandDeltaPctLast7d":12,"stockLeftBags":140}}
// responseSchema
{"type":"OBJECT","properties":{"reason":{"type":"STRING","maxLength":90},
 "confidence":{"type":"NUMBER"}},"required":["reason"]}
// transform: reason -> Product.aiReason ("Trending among Karachi & Lahore shopkeepers");
//            confidence>0.75 OR ordersCount pctRank>0.9 -> Product.isTrending=true
```

### M5.2 — Demand Forecast (Prophet/ARIMA hybrid)
Trigger: `/supplier/analytics` forecast band chart (series `{day:'D1…D30', actual:number|null, forecast:number, lower:number, upper:number}` from `AI_DEMAND_FORECAST`); demo console button fires full payload (§APX-C).
**`POST /api/v1/ai/demand-forecast/prophet`**
```jsonc
{ "productId":"prod_23",           // or category-level rollup when omitted
  "historyDays":90, "horizonDays":30,
  "granularity":"daily", "seasonality":["weekly","monthly"],
  "regressors":{"mandiArrivals":true,"ramadanFlag":true} }
```
Server pipeline: pull daily sold-units time-series → impute gaps (median filter) → Prophet fit; ARIMA(p,d,q) grid-search residual polish (demo best-fit `p:2,d:1,q:2`, R² `0.948` — gate: **r²≥0.85 else 422 MODEL_FIT_FAILED**, chart shows actuals-only); CI bands `forecast±1.96σ`; persist `ai_forecasts` (24 h TTL keyed product+window, `Cache-Control: private,max-age=300`). Optional Gemini `"summary"` ≤240 chars under chart. Response mirrors chart array verbatim + `{model:"PROPHET", modelParams:{p:2,d:1,q:2}, r2:0.948, trend:"BULLISH +34%"}`.

### M5.3 — Trending Refresh Job (cron)
Nightly `POST /internal/jobs/trending-refresh` (service token): recompute per-category z-scores of `(orders_count 7d Δ, cart adds, view velocity)` → update `is_trending`; top 3/category receive Gemini `ai_reason` via M5.1 writer. Idempotent full overwrite.
---

# 📎 APPENDICES

## APX-A · Database Schema (PostgreSQL DDL)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(12) NOT NULL CHECK (role IN ('shopkeeper','supplier')),
  name TEXT NOT NULL, business_name TEXT, email CITEXT UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,               -- argon2id
  city VARCHAR(60), category VARCHAR(60), ntn VARCHAR(15), avatar_url TEXT,
  verified BOOLEAN DEFAULT FALSE,            -- FBR/KYC admin flag -> FE ShieldCheck badge
  created_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ);     -- soft delete

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, category VARCHAR(60) NOT NULL,
  price BIGINT NOT NULL CHECK (price > 0),   -- whole PKR, no floats
  unit VARCHAR(20) NOT NULL, moq INT NOT NULL CHECK (moq >= 1),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'Active',   -- Active | Out of Stock
  description TEXT, image_url TEXT,
  rating NUMERIC(2,1) DEFAULT 0, review_count INT DEFAULT 0, orders_count INT DEFAULT 0,
  is_trending BOOLEAN DEFAULT FALSE, ai_reason TEXT, deleted_at TIMESTAMPTZ);
CREATE INDEX idx_products_supplier ON products(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category  ON products(category)   WHERE deleted_at IS NULL;

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(16) UNIQUE NOT NULL,  -- AT-YYYY-### via counter table seq_orders(year)
  buyer_id UUID NOT NULL REFERENCES users(id),
  buyer_role VARCHAR(12) NOT NULL, buyer_name TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES users(id), supplier_name TEXT NOT NULL,
  subtotal BIGINT NOT NULL, platform_fee BIGINT NOT NULL, total_amount BIGINT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Confirmed','Shipped','Delivered','Cancelled')),
  payment_method VARCHAR(20) NOT NULL, payment_status VARCHAR(10) NOT NULL DEFAULT 'Pending',
  shipping_address TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), delivery_date TIMESTAMPTZ);

CREATE TABLE order_items (                    -- immutable receipt snapshots
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL, product_name TEXT NOT NULL, product_image_url TEXT,
  unit_price BIGINT NOT NULL, quantity INT NOT NULL,
  unit VARCHAR(20) NOT NULL, supplier_name TEXT NOT NULL,
  PRIMARY KEY (order_id, product_id));

CREATE TABLE escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE REFERENCES orders(id),
  amount BIGINT NOT NULL, fee_amount BIGINT NOT NULL,
  state VARCHAR(14) NOT NULL DEFAULT 'HOLD_CREATED'
    CHECK (state IN ('HOLD_CREATED','FUNDED','RELEASED','REFUNDED','DISPUTED')),
  gateway_ref TEXT, released_at TIMESTAMPTZ, refund_ref TEXT);

-- Support tables: price_locks(lock_id PK,buyer_id,payload JSONB,expires_at)
-- webhook_events(event_id PK,provider,payload JSONB,processed_at)
-- ai_forecasts(product_id,window_days,series JSONB,model_params JSONB,r2 NUMERIC,created_at) TTL 24h
-- ai_recommendation_log(user_id NULLABLE,product_id,reason,served_at,clicked_at)
-- audit_logs(actor_id,action,entity,before JSONB,after JSONB,at)  ← every privileged write
```

## APX-B · Response Envelope & Master Error Matrix
```jsonc
// 200 OK
{ "success": true, "data": { /* resource | list */ },
  "meta": { "page": 1, "pageSize": 25, "total": 137 } }
// Error (every failure, no exceptions)
{ "success": false,
  "error": { "code": "STOCK_INSUFFICIENT", "message": "human readable",
             "details": [{ "productId": "prod_9", "requested": 120, "available": 80 }] } }
```
| HTTP | Codes | Raised by |
|---|---|---|
| **400** | VALIDATION_FAILED · PAYMENT_METHOD_UNSUPPORTED · MOQ_VIOLATION | body/query validation (M1.2, M2.1, M3.x) |
| **401** | TOKEN_EXPIRED · SIGNATURE_INVALID | JWT filter; webhook HMAC fail |
| **403** | ROLE_FORBIDDEN · ORDER_NOT_YOURS · PROFILE_LOCKED | role guards (M1.1 matrix); non-party invoice access |
| **404** | PRODUCT_NOT_FOUND · ORDER_NOT_FOUND · USER_NOT_FOUND | any :id lookup on soft-deleted/missing rows |
| **409** | STOCK_INSUFFICIENT · PRICE_LOCK_EXPIRED · INVALID_TRANSITION · EMAIL_TAKEN | checkout race; state machine violation; duplicate signup |
| **422** | MODEL_FIT_FAILED | forecast r² < 0.85 gate |
| **429** | RATE_LIMITED (+`Retry-After`) | auth 5/min/IP · writes 30/min/user · reads 120/min · AI 10/min |
| **500/502** | INTERNAL · GATEWAY_UNAVAILABLE | unhandled; gateway adapter down (retry w/ backoff, alert) |

## APX-C · Demo Console & Coverage Notes
* `/backend-logic` (“Backend Logic” sidebar item) is a **static documentation console** — renders pipeline diagrams/code blocks only, makes **zero API calls**; its payload samples mirror M3.2 & M5.2 verbatim and must stay in sync with this file.
* Mock-only seams awaiting wiring are exactly where this spec says “Delegate today”: `services/*.ts` internals + `lib/mockData.ts` constants. No component imports mock data directly anymore.
* Client-side contract helpers the server must honor: `formatPKR()` = `Rs {#,##0}` en-PK · escrow fee constant lives ONLY server-side (FE display value 1.5% must equal `ESCROW_FEE_RATE`).
