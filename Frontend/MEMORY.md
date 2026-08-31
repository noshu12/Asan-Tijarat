# 📝 MEMORY.md — Asan Tijarat FYP Project Log
> **Project:** Asan Tijarat — Pakistan's B2B Wholesale Marketplace  
> **Developer:** Noushad Alam  
> **Stack:** Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion  
> **Project Path:** `D:\NOUSHAD ALAM\FYP THINGS\asan-tijarat`  
> **Docs Path:** `D:\NOUSHAD ALAM\FYP THINGS\FOR DOCUMENT AND PROGRESS\updated docs`  
> **Last Updated:** 2026-08-26

---

## 🎯 Project Goal

Build a complete **B2B Wholesale Marketplace** for Pakistan called **"Asan Tijarat"** as a Final Year Project (FYP). The platform connects:
- **Suppliers / Sellers** (Mills, Farms, Manufacturers)
- **Shopkeepers / Wholesalers** (Bulk buyers)

Key features: Verified profiles (CNIC/NTN/FBR), AI-powered demand forecasting, Digital Escrow payments, Real-time order tracking, and Mandi-direct sourcing.

---

## 🛠️ Tech Stack Decided

| Category | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| Animations | Framer Motion |
| Icons | Lucide React |
| Charts | Recharts |
| Linting | ESLint |

---

## 📁 Project Structure

```
asan-tijarat/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── error.tsx                   # Global error boundary ("Try Again" fallback)
│   ├── not-found.tsx               # Custom branded 404
│   ├── page.tsx                    # Landing/Home page
│   ├── marketplace/page.tsx        # Filters/search guest-safe; buys go through guarded cards
│   ├── about/page.tsx              # Platform capabilities (NOT personal info)
│   ├── contact/page.tsx
│   ├── signin/page.tsx             # 2-role sign-in (?role= & ?redirect= hydration)
│   ├── getstarted/page.tsx         # 3-step onboarding wizard + Confetti
│   ├── backend-logic/page.tsx      # Developer API simulator playground
│   ├── shopkeeper/
│   │   ├── layout.tsx              # Shopkeeper portal layout (role-enforced guard)
│   │   ├── dashboard/page.tsx
│   │   ├── marketplace/page.tsx
│   │   ├── cart/page.tsx           # Thin wrapper around shared CartView
│   │   ├── orders/page.tsx
│   │   ├── analytics/page.tsx
│   │   └── settings/page.tsx
│   └── supplier/
│       ├── layout.tsx              # Supplier portal layout (role-enforced guard)
│       ├── dashboard/page.tsx
│       ├── add-product/page.tsx
│       ├── my-products/page.tsx    # Includes functional Edit Lot modal
│       ├── orders/page.tsx
│       ├── analytics/page.tsx
│       ├── profile/page.tsx
│       └── settings/page.tsx
├── components/
│   ├── Navbar.tsx                  # Role-aware nav; cart icon ONLY for shopkeeper;
│   │                               # user dropdown = user items only, outside-click/Esc close
│   ├── CartView.tsx                # Shared cart UI (used by /shopkeeper/cart)
│   ├── AuthGuards.tsx              # RequireAuth (auth + allowedRoles) / RedirectIfAuthed
│   ├── OrderTable.tsx              # Detail modal w/ Download Invoice (printable PDF)
│   ├── AIRecommendationCard.tsx    # AI pick card w/ auth-guarded add-to-cart
│   ├── PortalHeader.tsx            # Portal topbar (no theme toggle anymore)
│   ├── ProductCard.tsx             # Auth-guarded Add button → /signin?redirect=
│   ├── StatsCard.tsx
│   ├── Footer.tsx
│   ├── Sidebar.tsx
│   └── ui/                         # button, badge, card, input, modal,
│                                   # coverflow-carousel …
├── context/
│   ├── AuthContext.tsx             # Session state → delegates to services/authService
│   ├── CartContext.tsx             # MOQ floor / stock-cap merge rules
│   ├── ProductContext.tsx          # Catalogue incl. updateProduct() for Edit Lot
│   ├── OrderContext.tsx            # Orders state → delegates to orderService
│   └── ToastContext.tsx            # (ThemeContext DELETED — light theme only now)
├── services/                       # Backend integration layer — swap mock internals for API calls
│   ├── authService.ts
│   ├── productService.ts
│   └── orderService.ts
├── lib/
│   ├── mockData.ts
│   ├── types.ts
│   ├── utils.ts
│   └── invoice.ts                  # Branded printable/PDF receipt generator
├── .backup_v1/                     # ⚠️ FULL BACKUP of original design
├── tailwind.config.ts
└── tsconfig.json                   # Fixed: ES2017 + bundler
```

---

## 🎨 Design System (Active)

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `asan-dark` | `#0B3D2E` | Hero, sidebar, section backgrounds |
| `asan-mid` | `#1A6B4A` | Hover states |
| `asan-accent` | `#27AE7A` | Buttons, badges, active links |
| `asan-accent-hover` | `#219668` | Hover for accent |
| `asan-warning` | `#E09B2D` | Warning badges |
| `asan-error` | `#E74C3C` | Error states |
| `asan-success` | `#27AE60` | Success states |

---

## 📄 Pages Built (19 Live — PRD scope complete)

### Public Pages (6)
| Page | Route |
|---|---|
| Landing/Home | `/` |
| Marketplace | `/marketplace` |
| About | `/about` |
| Contact | `/contact` |
| Sign In | `/signin` |
| Get Started | `/getstarted` |

### Shopkeeper Portal (5)
| Page | Route |
|---|---|
| Dashboard | `/shopkeeper/dashboard` |
| Cart | `/shopkeeper/cart` |
| Orders | `/shopkeeper/orders` |
| Analytics | `/shopkeeper/analytics` |
| Settings | `/shopkeeper/settings` |

> ℹ️ **No `/shopkeeper/marketplace`** — intentional per client decision: the Navbar's Marketplace link already covers shopkeepers (they use the public `/marketplace`). Do not add or suggest a portal marketplace page.

### Supplier Portal (7)
| Page | Route |
|---|---|
| Dashboard | `/supplier/dashboard` |
| Add Product | `/supplier/add-product` |
| My Products | `/supplier/my-products` |
| Orders | `/supplier/orders` |
| Analytics | `/supplier/analytics` |
| Profile | `/supplier/profile` |
| Settings | `/supplier/settings` |

### Special (2)
| Page | Route |
|---|---|
| Backend Simulator | `/backend-logic` |
| 404 | automatic |

---

## ✅ Features Implemented

- [x] 2-role auth system (shopkeeper / supplier)
- [x] Role-based Navbar with cart badge, search modal, profile dropdown
- [x] STICKY Sidebar — stays pinned when scrolling (sticky top-16)
- [x] Dark/Light mode toggle
- [x] Mobile responsive hamburger menu
- [x] ProductCard with Verified badge, ratings, MOQ, Add to Cart
- [x] CoverFlow 3D carousel on homepage
- [x] Category grid with hover effects
- [x] Marketplace filters (category, price, city, verified)
- [x] Cart with MOQ enforcement and escrow fee breakdown
- [x] Order status pipeline (Pending → Confirmed → Shipped → Delivered)
- [x] Recharts: Revenue growth, sales donut, spending/savings, AI forecast
- [x] Get Started 3-step wizard with OTP + CNIC upload + Confetti
- [x] Backend Logic API simulator playground

---

## 🔧 Changes & Fixes Log

| Date | What | Details |
|---|---|---|
| Session 1 | Sidebar sticky | Fixed: `sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto` |
| Session 1 | About page | Changed to platform capabilities — removed personal info |
| Session 2 | Dark theme tried | "Emerald Luxe & Aurora Glass" (#030D08 obsidian + neon green) |
| Session 2 | Rolled back | Dark theme not suitable for local Pakistani traders |
| Session 2 | Original restored | Back to #0B3D2E clean green design |
| Session 3 | Urdu ticker removed | MandiTicker.tsx deleted — Urdu text not suitable |
| Session 3 | tsconfig fix | `target: es5` → `ES2017` (incompatible with bundler resolution) |
| Session 3 | baseUrl removed | `baseUrl: "."` removed — conflicts with moduleResolution: bundler |
| Session 4 | Route guards added | `components/AuthGuards.tsx` — `RequireAuth` on portal layouts, `RedirectIfAuthed` on /signin & /getstarted; `isHydrating` flag in AuthContext |
| Session 4 | Role naming unified | "Wholesaler" → "Shopkeeper", "Supplier / Company" → "Supplier", "Supplier Dashboard" → "Supplier Portal", "Wholesale Portal" → "Shopkeeper Portal" across UI |
| Session 4 | Shopkeeper reg. requirement noted | See Next Steps #9 — NTN-based shopkeeper registration (for later) |
| Session 5 | `.vscode/settings.json` TypeScript config | Confirmed/explained: `typescript.tsdk: "node_modules/typescript/lib"` (editor uses the project's installed TypeScript instead of VS Code's bundled one), `typescript.enablePromptUseWorkspaceTsdk: true`, `typescript.tsserver.experimental.enableProjectDiagnostics: false` |
| Session 5 | **AuthContext.tsx syntax error FIXED** | Browser crashed with "Expected ';', '}' or <eof>" — line 1 had stray text `lwhere nin"use client";`. Fixed → `"use client";`. Verified no other files corrupted (searched whole repo). |
| Session 5 | **Code cleanup — dead code removed** | Deleted `components/ProductRotator.tsx` (was imported nowhere — homepage uses CoverflowCarousel instead); removed redundant `motion` npm package (same lib as framer-motion; only dead file used it); deleted empty artifact `tsc-final.txt` & build cache `tsconfig.tsbuildinfo`. **Kept** `/backend-logic` page (user wants it for FYP demo). Verified: `tsc --noEmit` ✅ exit 0, `next lint` ✅ exit 0 (only pre-existing `<img>`/next-image optimization warnings). |
| Session 5 | **Frontend polish — Edit Product modal** | `app/supplier/my-products/page.tsx`: replaced toast-only "Edit lot" stub with full Modal form (Name / Price PKR / Stock / MOQ / Status). Validation (MOQ ≤ stock, positive price), auto status flip at 0 stock, success toast via `ProductContext.updateProduct` → `productService.withUpdatedProduct`. |
| Session 5 | **Frontend polish — Invoice download** | Created `lib/invoice.ts` (branded printable HTML receipt → popup print dialog / Save-as-PDF; itemized table, escrow fee, totals, payment pill, popup-blocker fallback). Wired into shared `OrderTable.tsx` detail modal (+ Payment Status badge) = covers `/shopkeeper/orders` & `/supplier/orders`; per-order invoice + "Download All" prints a real invoice bundle instead of a toast. |
| Session 5 | **Frontend polish — Error & 404 boundaries** | `app/error.tsx` (branded recovery screen, Try Again + Back Home, digest ref, logs to console) & `app/not-found.tsx` (gradient 404, Back to Home + Browse Marketplace CTAs). Live-verified: unknown URL returns 404 with custom UI ✅. |
| Session 5 | **Services layer** | New `services/`: `authService.ts` (session rehydrate/persist, role→route map, seed users), `productService.ts` (catalogue CRUD, localStorage cache, sanitizers, stock-status derivation), `orderService.ts` (order placement math — supplier grouping/escrow 1.5%/order numbers — status updates, cache). Refactored AuthContext/ProductContext/OrderContext to delegate fully; fixed `supplier/profile` to use service instead of importing `INITIAL_USERS`. Backend devs swap mock internals for fetch calls per the endpoint comments in each file. Verified: `tsc --noEmit` exit 0; all touched routes return 200 live. |
| Session 5 | **BACKEND_LOGIC_SPECIFICATION.md created** | 446-line production-grade server spec: global conventions (money BIGINT/integer PKR, JWT role matrix, model dictionary) → coverage map of all 20 pages → **Module 1** auth/profiles/guards/KYC (M1.1–M1.11), **Module 2** catalogue & lot editing (M2.1–M2.6), **Module 3** cart/escrow checkout/JazzCash-EasyPaisa-webhook pipeline (M3.0–M3.3), **Module 4** order state machine Pending→Confirmed→Shipped→Delivered/Cancelled + invoice PDF endpoints + analytics rollups (M4.1–M4.4), **Module 5** AI recommendations blend formula + Gemini prompt template + Prophet forecast contract w/ r²≥0.85 gate (M5.1–M5.3) → Appendices: full PostgreSQL DDL (users/products/orders/order_items/escrow_transactions + support tables), error envelope & master 400→502 matrix, rate-limit classes. Every entry: FE trigger → client logic → service delegate → endpoint+verb → roles → server rules → DB ops → integrations → response schemas. |
| Session 5 | **Role-aware cart routing** | Bug: Navbar cart button sent EVERYONE to `/shopkeeper/cart`, and `RequireAuth` only checked auth (not role). Fix: extracted shared `components/CartView.tsx` (items list, qty steppers, order summary w/ escrow fee, checkout modal w/ JazzCash/EasyPaisa/Card radios); thin `app/shopkeeper/cart/page.tsx` for shopkeepers; Navbar click routes by role; `RequireAuth` upgraded to accept `allowedRoles` so deep-linking another portal's URL bounces unauthorized roles; both portal layouts enforce their single role. Also repaired a stray-brace/missing-modal issue in CartView during extraction. Verified: `tsc --noEmit` exit 0, lint clean (pre-existing `<img>` warnings only). |
| Session 5 | **Auth guards on public UI** | Guest clicking Add-to-Cart (`ProductCard`, `AIRecommendationCard`) is blocked from CartContext/localStorage, warned "Please sign in as a Shopkeeper…", redirected to `/signin?redirect=/marketplace`; Navbar cart icon gated the same way (`?redirect=%2Fshopkeeper%2Fcart`); `RequireAuth` preserves attempted URL; `AuthContext.login(role, redirectTo?)` honors bounce-back; sign-in page hydrates `?role=` (preselects tab + demo credentials) and `?redirect=`; getstarted hydrates `?role=`; landing CTAs now deep-link — Start as Supplier → `/signin?role=supplier`, Start as Shopkeeper → `/signin?role=shopkeeper`. Marketplace filters/search stay guest-safe (pure local state). Verified: `tsc --noEmit` exit 0, `next lint` exit 0 (only pre-existing `<img>` warnings). |
| Session 5 | **Cart button visibility + single theme** | Navbar cart icon now renders ONLY when `isAuthenticated && role !== 'supplier'` (previously `role !== 'supplier'` showed it to guests too); removed guest redirect from cart click since it's no longer clickable when logged out. Dark-mode toggle REMOVED project-wide: Navbar desktop toggle + PortalHeader toggle deleted, `<ThemeProvider>` unwrapped in `app/layout.tsx`, `context/ThemeContext.tsx` deleted — light theme only now (all Tailwind `dark:` classes remain harmless but unused). Verified: add-to-cart guard intact in both cards (`!isAuthenticated \|\| !user` → toast + `/signin?redirect=%2Fmarketplace`); repo-wide grep = zero theme refs; `tsc --noEmit` exit 0. |



---

## 💾 Backup

> ⚠️ Full backup at: `D:\NOUSHAD ALAM\FYP THINGS\asan-tijarat\.backup_v1\`
> To restore: Copy contents of `.backup_v1` back to project root.

---

## 🚀 Dev Server

```bash
cd "D:\NOUSHAD ALAM\FYP THINGS\asan-tijarat"
npm run dev
# http://localhost:3000
```

---

## 📌 Next Steps (Pending)

- [ ] Backend integration (API routes / external backend)
- [ ] Real authentication (NextAuth.js or custom JWT)
- [ ] Database (MongoDB / PostgreSQL)
- [ ] Real payment gateway (JazzCash / EasyPaisa API)
- [ ] AI recommendation engine (actual ML model)
- [ ] FBR/NTN verification API
- [ ] SMS/Email OTP
- [ ] Production deployment (Vercel)
- [ ] FYP documentation write-up
- [ ] **Shopkeeper registration upgrade** (user requirement — NEW): allow small shopkeepers to register using their **shop's NTN number** + require their **real shop name**, a **photo of the owner in front of the shop** (storefront selfie), and **shop address**. Only those with a shop NTN can register as shopkeeper. → Update Get Started wizard (add shop-name, shop-address, storefront-photo upload; make NTN-shop the shopkeeper path), type fields in `lib/types.ts` / `lib/mockData.ts`, and show shop photo + name + address on the shopkeeper dashboard/profile.

---

## 👤 User Preferences (IMPORTANT)

1. **Audience:** Local Pakistani traders — simple, clean, readable UI
2. **Language:** English UI only (no Urdu text in components)
3. **Design:** Clean green (#0B3D2E) — NOT dark/black themes
4. **Rollback:** Always keep .backup_v1 ready before major design changes
5. **Buttons:** Every button must be functional or link to a real page
6. **Sidebar:** Must always be sticky — never scroll with page content
7. **Profile dropdown (Navbar):** closes on outside click & Escape; contains ONLY user-related items (name/email/role badge, portal link for active role, Sign Out) — no role-switch/demo buttons at all
8. **NO `/shopkeeper/marketplace` page:** deliberately not built — the Navbar already has the Marketplace button for all users, so a duplicate inside the Shopkeeper portal is redundant. Shopkeepers browse the public `/marketplace`. Never suggest building it.

---

## 🔧 Post-Session Fix — 2026-08-26 (compile error cleanup)

User hit a compiler error block on the app (`the name 'getHomeRouteForRole' is defined multiple times` in `components/AuthGuards.tsx`). Two fixes applied to make `tsc` pass with 0 errors:
1. **`components/AuthGuards.tsx`** — removed DUPLICATE import lines: `getHomeRouteForRole` (line 8) and `UserRole` (line 9) were imported twice. Single import of `{ getHomeRouteForRole, POST_LOGIN_REDIRECT_KEY }` + `import type { UserRole }` now only.
2. **`app/backend-simulator/page.tsx`** — added the missing **`simulateAIForecast`** function (TS2304: Cannot find name). The "Simulate AI ARIMA Forecast" button (→ POST /api/ai/forecast) referenced it but it was never defined, while `simulateOrderCreation` / `simulateEscrowPayout` existed. Added a matching `addLog()` + toast implementation (predictions array, rmse, confidence) after `simulateEscrowPayout` (line 126).

Verified: `npx tsc --noEmit` → **0 errors, EXIT=0**. Search confirms each simulator trigger is defined + referenced exactly once.

## ↩️ Rollback — 2026-08-26 (reverted routing/auth-flow changes)

User did NOT want the routing/auth-flow changes (static /backend-logic page, hidden nav link, forced redirect to /backend-logic on sign-in/registration, separate /backend-simulator, empty-OTP requirement). Reverted everything to the "before" state:
- **`app/backend-logic/page.tsx`** → restored as the FULL "Backend Logic Simulator & API Playground" page (role switchers + 3 trigger cards + live logs + JSON inspector). Deleted the today-created `app/backend-simulator/` route.
- **`components/Navbar.tsx`** → re-added the amber "Backend Simulator" link → `/backend-logic` (inside nav), re-imported `Terminal`.
- **`components/Footer.tsx`** → re-added the "Backend Simulator" link.
- **`components/AuthGuards.tsx`** → `RedirectIfAuthed` restored to simple role→dashboard redirect (removed POST_LOGIN_REDIRECT_KEY/sessionStorage logic).
- **`services/authService.ts`** → removed `POST_LOGIN_REDIRECT_KEY` constant.
- **`context/AuthContext.tsx`** → `login(role, redirectTo?)` restores direct `router.push(redirectTo || getHomeRouteForRole(role))`.
- **`app/signin/page.tsx`** → restored `?role=`/`?redirect=` hydration + `login(role, redirectTo ?? undefined)`; no forced /backend-logic.
- **`app/getstarted/page.tsx`** → OTP prefilled again `['5','8','2','4','9','1']`, removed the manual-OTP gate & auto-focus refs, registration → `login(role)` (role dashboard).

Verified: `npx tsc --noEmit` → 0 errors. Grep confirms zero `POST_LOGIN_REDIRECT_KEY`, zero `'/backend-logic'` forced redirects, `backend-simulator/` removed.

*Memory file created: 2026-08-23 at 02:03 PKT*

---

## 🗂️ Documentation Sync — 2026-08-26

All three project docs refreshed together after the auth-guard, cart and theme-removal work:
- **FRONTEND_DOCUMENTATION.md** → 19 routes, new `CartView` component, `ThemeContext`/dark-mode entries removed (light-only), Navbar cart-role gating + dropdown close behavior documented, sign-in `?role=` / `?redirect=` hydration recorded, status % bumped.
- **BACKEND_LOGIC_SPECIFICATION.md** → coverage map covers guard redirects (#21); roles/global-chrome row updated; M1.10 gains the role-enforced `allowedRoles` server-mirror rule.
- **MEMORY.md** → preference #7 codifies the user-dropdown rules (user-related items only, outside-click/Esc close).
