# 📘 Asan Tijarat — Frontend Project Structure & Implementation

> **Generated:** 2026-08-26 · **Build Tool:** Cline (VS Code) · **Project Path:** `D:\NOUSHAD ALAM\FYP THINGS\asan-tijarat`

---

## 1. PROJECT OVERVIEW

| Field | Value |
|---|---|
| **Project Name** | Asan Tijarat |
| **Tagline** | Pakistan's AI-Powered B2B Wholesale Marketplace |
| **Framework** | Next.js 14 (App Router) |
| **React** | React 18.3.1 |
| **Language** | TypeScript 5.7.3 |
| **Styling** | Tailwind CSS 3.4.17 |
| **Animations** | Framer Motion 12.4.7 |
| **Icons** | Lucide React 0.475.0 |
| **Charts** | Recharts 2.15.1 |
| **Current Phase** | **Frontend only** (no live backend logic yet — mock data + client-side state) |
| **UI Library** | shadcn/ui conventions (custom components in `components/ui/`) |

**Key architecture notes:**
- Uses **App Router** with a mix of Server Components (static pages) and Client Components (`"use client"` for anything interactive).
- **All data is mock** — persistence happens via `localStorage` through React Context providers (no API calls to a real backend yet).
- 2-role system: **Shopkeeper** (Wholesaler/Buyer), **Supplier** (Seller).

---

## 2. FOLDER STRUCTURE

### 2.1 Complete Hierarchy

```
Frontend/
├── .vscode/
│   └── settings.json              # Editor/TS config (uses workspace TypeScript)
├── app/                           # Next.js App Router (routes = folders)
│   ├── layout.tsx                 # Root layout — wraps all providers + Navbar
│   ├── page.tsx                   # Landing / Home page (hero, coverflow, categories)
│   ├── globals.css                # Tailwind directives + CSS variables + scrollbar styles
│   ├── about/page.tsx             # About (platform capabilities)
│   ├── backend-logic/page.tsx     # Developer API simulator playground
│   ├── contact/page.tsx           # Contact & support form
│   ├── getstarted/page.tsx        # 3-step onboarding wizard + confetti
│   ├── marketplace/page.tsx       # Public wholesale marketplace (filters/sort/search)
│   ├── signin/page.tsx            # 2-role split-screen sign in
│   ├── shopkeeper/
│   │   ├── layout.tsx             # Shopkeeper portal layout (RequireAuth + Sidebar)
│   │   ├── dashboard/page.tsx     # Shopkeeper dashboard
│   │   ├── cart/page.tsx          # Cart with MOQ + escrow + checkout
│   │   ├── orders/page.tsx        # Shopkeeper order management (tabs)
│   │   ├── analytics/page.tsx     # Spending vs savings charts, top suppliers
│   │   └── settings/page.tsx      # Account settings, security, notifications
│   └── supplier/
│       ├── layout.tsx            # Supplier portal layout (RequireAuth + Sidebar)
│       ├── dashboard/page.tsx     # Supplier dashboard (revenue + charts)
│       ├── add-product/page.tsx   # Add new wholesale listing form
│       ├── my-products/page.tsx   # Manage own product listings (table)
│       ├── orders/page.tsx        # Received orders + status pipeline
│       ├── analytics/page.tsx     # AI demand forecasting (line chart)
│       ├── profile/page.tsx       # Business profile + verified credentials
│       └── settings/page.tsx      # Enterprise info + notification channels
├── components/                    # Reusable UI + feature components
│   ├── AIRecommendationCard.tsx   # "AI pick" product card
│   ├── AuthGuards.tsx             # RequireAuth / RedirectIfAuthed route guards
│   ├── Footer.tsx                 # Public site footer
│   ├── Navbar.tsx                 # Global top nav (role-aware, search modal)
│   ├── OrderTable.tsx             # Orders table + detail modal + status updates
│   ├── PortalHeader.tsx           # Portal page header (title, search, theme, bell)
│   ├── ProductCard.tsx            # Marketplace product card
│   ├── Sidebar.tsx                # Sticky portal sidebar (role-aware)
│   ├── StatsCard.tsx              # KPI stat card
│   └── ui/                        # shadcn-style primitives
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── coverflow-carousel.tsx # 3D coverflow (homepage)
│       ├── input.tsx
│       └── modal.tsx
├── context/                       # React Context providers (state + localStorage)
│   ├── AuthContext.tsx            # Role auth, session restore, profile update
│   ├── CartContext.tsx            # Cart items, MOQ, escrow fee
│   ├── OrderContext.tsx           # Orders, place orders, status updates
│   ├── ProductContext.tsx         # Products, create/remove listings
│   └── ToastContext.tsx           # Toast notifications (animated)
├── lib/                           # Utilities, types, mock data
│   ├── types.ts                   # All TypeScript interfaces
│   ├── mockData.ts                # All mock users/products/orders/charts
│   └── utils.ts                   # cn(), formatPKR(), formatDate()
├── public/                        # Static assets (logo.png, etc.)
├── .eslintrc.json
├── components.json                # shadcn/ui config
├── global.d.ts                    # Ambient module declarations
├── next.config.mjs                # Next.js config (remote image patterns)
├── tsconfig.json                  # TS config (ES2017, bundler resolution, @/* alias)
├── tailwind.config.ts             # Tailwind theme (colors, fonts)
├── postcss.config.mjs
└── package.json
```

### 2.2 Purpose of Each Major Folder

| Folder | Purpose |
|---|---|
| `app/` | **Routes & pages.** Each subfolder = a URL route. Also holds the root layout that mounts all providers + the global Navbar. |
| `app/shopkeeper/` | The **Shopkeeper portal** — protected by `RequireAuth`; shares the sticky Sidebar via its layout. |
| `app/supplier/` | The **Supplier portal** — same protection + Sidebar pattern. |
| `components/` | **Reusable React components.** Feature components (`ProductCard`, `OrderTable`, `Navbar`, `Sidebar`) plus `ui/` primitives. |
| `components/ui/` | **Low-level building blocks** (Button, Input, Badge, Card, Modal, CoverflowCarousel). |
| `context/` | **Global state providers.** Each handles a slice of app state and syncs to `localStorage`. |
| `lib/` | **Non-UI logic**: TypeScript interfaces (`types.ts`), mock dataset (`mockData.ts`), helpers (`utils.ts`). |
| `public/` | Static files served at root (`/logo.png`). |
| `.vscode/` | Editor settings — pins TS to the project's installed TypeScript. |

### 2.3 File Counts per Section

| Section | Files | Notes |
|---|---|---|
| `app/` pages (`page.tsx`) | **21** | Functional routes |
| `app/` layouts (`layout.tsx`) | **3** | Root, Shopkeeper, Supplier |
| `components/` (feature) | **9** | AIRecommendationCard, AuthGuards, Footer, Navbar, OrderTable, PortalHeader, ProductCard, Sidebar, StatsCard |
| `components/ui/` (primitives) | **6** | badge, button, card, coverflow-carousel, input, modal |
| `context/` providers | **6** | Auth, Cart, Order, Product, Theme, Toast |
| `lib/` | **3** | types, mockData, utils |
| Config / root files | **9** | package.json, tsconfig, tailwind, next.config, etc. |

---

## 3. COMPONENT ARCHITECTURE

Feature components and context hooks are named exports. UI primitives accept a `className` prop (merged via `cn()` helper) and use variants/sizes.

### 3.1 UI Primitives (`components/ui/`)

| Component | Path | Purpose | Key Props / API |
|---|---|---|---|
| **Button** | `ui/button.tsx` | Animated button, variants, loading | `variant` (`primary`\|`secondary`\|`outline`\|`danger`\|`ghost`), `size` (`sm`\|`md`\|`lg`), `isLoading` |
| **Input** | `ui/input.tsx` | Form input with label/error/helper | `label`, `error`, `helperText` |
| **Badge** | `ui/badge.tsx` | Status/verification pill | `variant` (`active`,`pending`,`confirmed`,`shipped`,`delivered`,`warning`,`error`,`outline`,`verified`) |
| **Card** | `ui/card.tsx` | Rounded container | `className`, children |
| **Modal** | `ui/modal.tsx` | Accessible dialog | `isOpen`, `onClose`, `title`, `description`, `maxWidth`, children |
| **CoverflowCarousel** | `ui/coverflow-carousel.tsx` | 3D coverflow | `slides`, `rotate`, `depth`, `showCaption`, `showPagination`, `showNavigation` |

### 3.2 Feature Components (`components/`)

| Component | Purpose | Depends on |
|---|---|---|
| **Navbar** | Global nav; role-aware links, role-gated cart button (hidden for guests/suppliers, routed per role), search modal, profile dropdown (outside-click/Esc close, user items only) | useAuth, useCart, useToast, Motion, Lucide |
| **Sidebar** | Sticky portal sidebar; switches nav per role | useAuth, usePathname, Lucide |
| **Footer** | Public footer with links + contact | Link, Lucide |
| **ProductCard** | Product card with verified badge, rating, MOQ, add-to-cart | useCart, useAuth, Badge, Motion |
| **OrderTable** | Orders table + detail modal + status pipeline | useOrders, useToast, Badge, Button, Modal |
| **StatsCard** | KPI stat block with delta badge | Card, LucideIcon, cn |
| **AIRecommendationCard** | "AI pick" product card | useCart, formatPKR, Lucide |
| **PortalHeader** | Portal header (search, notifications) | useAuth, Lucide |
| **AuthGuards** | `RequireAuth` (protect portals) + `RedirectIfAuthed` (protect sign-in) | useAuth, useRouter |

### 3.3 Cleanup Note
- `components/ProductRotator.tsx` removed (unused); home hero uses `CoverflowCarousel`. Redundant `motion` package removed.

---

## 4. PAGE / ROUTE STRUCTURE

### 4.1 Routes Built (19 total)

**Public (7):** `/` (Home), `/marketplace`, `/about`, `/contact`, `/signin`, `/getstarted`, `/backend-logic`

**Shopkeeper Portal (5):** `/shopkeeper/dashboard`, `/shopkeeper/cart`, `/shopkeeper/orders`, `/shopkeeper/analytics`, `/shopkeeper/settings`

**Supplier Portal (7):** `/supplier/dashboard`, `/supplier/add-product`, `/supplier/my-products`, `/supplier/orders`, `/supplier/analytics`, `/supplier/profile`, `/supplier/settings`

### 4.2 PRD Gap — RESOLVED by design decision
- **Shopkeeper Marketplace** (`/shopkeeper/marketplace`) — referenced in the PRD, but **intentionally NOT built** per client decision: the global **Navbar already has the Marketplace link**, so a separate marketplace page inside the shopkeeper portal is redundant. Shopkeepers use the public `/marketplace` via the navbar. Do not flag this as missing — it is not a gap.

### 4.3 Completion Status by Page
- ✅ **100% built:** All 19 existing pages.
- ⏳ **Partial / needs polish:**
  - "Edit lot" (supplier my-products) → toast only, no editor UI yet.
  - Several hardcoded dates & mock numbers across dashboards.

---

## 5. CURRENT IMPLEMENTATION STATUS

| Area | Status | Notes |
|---|---|---|
| **Landing page** (`/`) | ✅ 100% built | Hero, coverflow carousel, categories, stats, testimonials, CTA |
| **Public pages** (7/7) | ✅ 100% built | Marketplace, About, Contact, Sign-in, Get Started, Backend-Logic demo |
| **Shopkeeper portal** (5/5) | ✅ 100% built | Dashboard, Cart (MOQ + escrow checkout), Orders, Analytics, Settings. Marketplace intentionally omitted — navbar link covers it (§4.2) |
| **Supplier portal** (7/7) | ✅ 100% built | Dashboard, Add Product, My Products, Orders, Analytics, Profile, Settings |
| **Overall completion** | **≈ 98%** | All 19 planned routes built (PRD complete — see §4.2); auth guards shipped; polish items in Section 5.2 remain |

### 5.1 Fully complete (no work left)
`/`, `/marketplace`, `/about`, `/contact`, `/signin`, `/getstarted`, `/backend-logic`, all 5 built shopkeeper pages, all 7 supplier pages.

### 5.2 Partially built (functional but stubbed interactions)
| Location | Stub behaviour |
|---|---|
| Supplier → My Products → "Edit lot" button | Shows a toast only; no inline edit UI yet |
| Dashboards (both roles) | Some hardcoded dates / static mock numbers |

### 5.3 Not started
- None. `/shopkeeper/marketplace` was the only outstanding route and was intentionally dropped per client decision (navbar Marketplace link covers it — see §4.2).

---

## 6. STYLING & DESIGN

- ✅ **Tailwind CSS 3.4.17** is the only styling system (utility classes everywhere; no CSS modules).
- **Single custom stylesheet:** `app/globals.css` — Tailwind directives + design tokens + custom scrollbar.
- **Color tokens:** shadcn-style HSL CSS variables defined for `light` (`:root`) and `dark` (`.dark`) themes:

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--primary` | `158 64% 42%` (emerald green — brand) | same hue | Buttons, links, active states |
| `--background` / `--foreground` | white / near-black slate | deep navy slate / light | Page canvas & text |
| `--card`, `--muted`, `--border`, `--ring`, `--destructive`, `--radius: 0.75rem` | ✔ defined | ✔ defined | Surfaces, dividers, focus rings, danger, corner rounding |

- **Dark mode:** ❌ removed per client request — app ships **light theme only**. `context/ThemeContext.tsx` was deleted along with the Navbar/PortalHeader toggle buttons; `globals.css` retains the `.dark` HSL tokens harmlessly.
- **Responsive:** ✅ mobile-first — breakpoints used throughout (`sm/md/lg/xl`); Navbar collapses into hamburger menu, Sidebar becomes overlay drawer on mobile, grids stack down to single column. Responsive but only manually spot-checked (see §15).
- Fonts/icons via **Lucide React** (icon set) — no icon font, no extra CSS libs.

---

## 7. STATE MANAGEMENT

Everything is **client-side React Context** — no Redux/Zustand, no server state library.

### 7.1 Context Providers (all mounted in `app/layout.tsx`)
| Context | File | Responsibility | Persistence |
|---|---|---|---|
| `AuthProvider` | `context/AuthContext.tsx` | Current user + role (`login(role, redirectTo?)`, `logout`), session restore via `authService`; sign-in hydrates `?role=` / `?redirect=` params | `localStorage` session |
| `CartProvider` | `context/CartContext.tsx` | Add/remove lines, MOQ validation, totals | `localStorage` cart |
| `OrderProvider` | `context/OrderContext.tsx` | Place orders from cart checkout, status pipeline updates | `localStorage` orders |
| `ProductProvider` | `context/ProductContext.tsx` | Product catalogue (marketplace listings), add-product from supplier form | seeded from `lib/mockData.ts` |
| `ToastProvider` | `context/ToastContext.tsx` | Global toast notifications (success/error/info) | in-memory |

Custom hooks exported by each provider: `useAuth()`, `useCart()`, `useOrders()`, `useProducts()`, `useToast()`. *(Former `useTheme()` retired with dark-mode removal.)*

### 7.2 Auth context status
✅ Working: role-aware login/logout, user object shared app-wide, guards consume it.

### 7.3 User context status
✅ The "user context" **is** `AuthContext` (single combined auth+user store). No separate user profile context was needed — profile data rides on the auth `User` object (name, business name, role, verified flags from `lib/types.ts`).

---

## 8. API INTEGRATION POINTS

> **There are zero real API calls today.** The app is 100% mock-data + localStorage. Integration points below are where backend wiring will happen.

### 8.1 Endpoints the frontend will need (proposed contract)
| Feature | Future endpoint | Current source |
|---|---|---|
| Auth | `POST /api/auth/login`, `/api/auth/register`, `GET /api/auth/me` | `AuthContext.login(role)` (instant local login) |
| Marketplace catalogue | `GET /api/products?search=&category=&sort=` | `ProductProvider` ← `INITIAL_PRODUCTS` in `lib/mockData.ts` |
| Product detail / listings | `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` | supplier Add-Product & My Products write to context only |
| Cart | client-only (stays local) | `CartContext` |
| Orders | `POST /api/orders`, `GET /api/orders?role=`, `PATCH /api/orders/:id/status` | `OrderProvider` ↔ `OrderTable` status pipeline |
| Analytics | `GET /api/analytics/spending`, `/api/analytics/demand` | hard-coded numbers fed into Recharts charts |
| Profile/Settings | `PATCH /api/users/me` | forms update toast-success but don't persist beyond session |

### 8.2 Mock data location
All fake data lives centrally in **`lib/mockData.ts`** — products (`INITIAL_PRODUCTS`), users (`INITIAL_USERS`), and is imported by the context providers. Swap this file's consumers for fetch calls later; components won't need changes if interfaces in `lib/types.ts` are kept.

### 8.3 Where API calls will live
Recommended pattern already used by the codebase: keep fetch logic inside each **context provider** (`context/*.tsx`) so pages/components stay presentational.

### 8.4 Error handling implemented
- ✅ Toast-based feedback for all user actions (`useToast`) — success & error variants.
- ✅ Form validation on Add Product / Sign In / Settings (required fields, MOQ rules via `Input` `error` prop).
- ⛔ No global error boundary, no HTTP-layer retry/interceptor (nothing to intercept yet).

---

## 9. DEPENDENCIES INSTALLED

### 9.1 Runtime (`dependencies`)
| Package | Version | Purpose |
|---|---|---|
| `next` | 14.2.35 | Framework (App Router, routing, build) |
| `react` / `react-dom` | 18.3.1 | UI runtime |
| `framer-motion` | 12.4.7 | Animations (hero, carousel, page transitions, modals) |
| `lucide-react` | 0.475.0 | Icon set |
| `recharts` | 2.15.1 | Dashboard charts (area/line/bar) |
| `canvas-confetti` | (latest) | Confetti on Get Started completion |
| `clsx` | (latest) | Conditional classnames (half of `cn()` helper) |
| `tailwind-merge` | (latest) | Class conflict resolution (other half of `cn()`) |

### 9.2 DevDependencies
| Package | Purpose |
|---|---|
| `typescript` 5.7.3 (+ `@types/react`, `@types/react-dom`, `@types/node`, `@types/canvas-confetti`) | Type-checking; workspace TS pinned via `.vscode/settings.json → typescript.tsdk` |
| `tailwindcss` 3.4.17 + `postcss` + `autoprefixer` | Styling pipeline (`postcss.config.mjs`) |
| `eslint` + `eslint-config-next` | Linting (`npm run lint`) |

### 9.3 Cleanup note
The redundant **`motion` package was removed** (same library as `framer-motion`; it was only used by the deleted dead component). Everything remaining is actually used.

---

## 10. BUILD & DEPLOYMENT

| Item | Value |
|---|---|
| Dev command | `npm run dev` → `next dev` (port 3000) |
| Build command | `npm run build` → `next build` |
| Production start | `npm run start` |
| Lint | `npm run lint` |

- **Environment variables:** ⛔ none — no `.env` / `.env.local` exists yet (nothing external to configure while fully mocked). When the backend lands, expected keys: `NEXT_PUBLIC_API_URL`, plus any auth secret config.
- **Deployment target:** ⛔ Not configured yet — no `vercel.json`, no deploy hooks. Next.js 14 App Router default means it will deploy to **Vercel with zero config** when ready.
- **Image hosting:** remote image domains whitelisted in `next.config.mjs`: `images.unsplash.com`, `plus.unsplash.com`, `via.placeholder.com`, one Cloudflare R2 bucket.
- **Current build health:** ✅ `tsc --noEmit` passes with **0 errors**; `npm run lint` passes with **warnings only** (pre-existing `<img>` vs `next/image` advisory warnings).

---

## 11. KNOWN ISSUES & TODOs

### 11.1 Bugs / issues
| # | Issue | Severity |
|---|---|---|
| 1 | `<img>` tags used in some components → ESLint `next/image` optimization **warnings** (performance, not breakage) | Low |
| 2 | Dashboards contain hardcoded mock dates/figures — will look stale if demoed long-term | Low |
| 3 | "Edit lot" and "Download Invoice" actions are toast-only stubs (see §5.2) | Medium |
| 4 | No global Error Boundary component — an unexpected render error shows Next's default overlay | Medium |

### 11.2 Pending tasks
- Replace toast stubs with real Edit-product UI and invoice export.
- Create `.env` structure once backend URLs are known.
- Wire localStorage-backed state to real API (swap inside context providers).
- Decide: migrate `<img>` → `next/image` (needs remote loader sizing care).

### 11.3 Code review notes
- Context providers cleanly separate data from UI ✅.
- All shared types centralized in `lib/types.ts` ✅.
- Some page files are long (>400 lines with inline sub-components) — acceptable, could extract later.

### 11.4 Performance optimizations needed
- Chart pages import Recharts eagerly (large bundle on dashboard routes only) — fine for now; code-split later if needed.
- Fonts/images unoptimized (`<img>`) — see issue #1.
- No prefetch tuning needed yet at current size.

---

## 12. AUTHENTICATION FLOW

| Feature | Status | How it works today |
|---|---|---|
| Sign In page (`/signin`) | ✅ **Yes** | Split-screen: 2 role cards (Shopkeeper / Supplier). Demo sign-in per card, honors `?role=` preselect + `?redirect=` bounce-back |
| 2-role system | ✅ **Yes** | `UserRole = 'shopkeeper' \| 'supplier'` in `lib/types.ts`; drives nav, guards, dashboards |
| Redirect after login | ✅ **Yes** | Shopkeeper → `/shopkeeper/dashboard`, Supplier → `/supplier/dashboard`; explicit `?redirect=` destination always wins |
| Protected routes | ✅ **Yes** | `components/AuthGuards.tsx`: `RequireAuth` wraps both portal layouts AND checks roles (`allowedRoles`) — unauthenticated users go to `/signin` preserving their attempted URL; wrong-role deep links are blocked too; `RedirectIfAuthed` sends logged-in users home |
| Logout | ✅ Yes | Clears session (Navbar profile dropdown + sidebar) |
| Real credential verification | ⛔ **No** | Mock-only; must be replaced by API auth |

---

## 13. NAVBAR IMPLEMENTATION

| Requirement | Status | Details |
|---|---|---|
| Navbar component | ✅ **Yes** | `components/Navbar.tsx`, rendered in root layout on public pages |
| Dynamic per role | ✅ **Yes** | Reads `useAuth()`; shows different links/CTAs per role & hides itself conceptually inside portals (portals use Sidebar+PortalHeader chrome instead) |
| Mobile responsive | ✅ **Yes** | Hamburger menu below breakpoint with animated drawer |
| Dark mode toggle | ❌ **Removed** | App is light-only now (client decision); toggle button deleted from Navbar & PortalHeader |
| Extras built-in | — | Role-gated cart (guests see NO cart button; shopkeeper→`/shopkeeper/cart`, supplier hidden), guest Add-to-Cart guard with toast + `/signin?redirect=/marketplace`, search modal, notifications dropdown, profile dropdown (outside-click/Esc close, user-related items only — switch-role buttons removed), toast integration |

---

## 14. KEY COMPONENTS STATUS

| Component | File | Status | Notes |
|---|---|---|---|
| **Sidebar** (Shopkeeper/Supplier) | `components/Sidebar.tsx` | ✅ Complete | Role-switching nav links, active-route highlight via `usePathname`, mobile overlay drawer |
| **ProductCard** | `components/ProductCard.tsx` | ✅ Complete | Verified badge, rating stars, MOQ display, price + formatPKR, add-to-cart with MOQ validation & toast, framer-motion hover |
| **OrderTable** | `components/OrderTable.tsx` | ✅ Complete | Status pipeline (pending→confirmed→shipped→delivered), row detail Modal, uses Badge variants per status |
| **StatsCard** | `components/StatsCard.tsx` | ✅ Complete | KPI block w/ icon, delta indicator; used on both dashboards |
| **Button / Input** | `components/ui/button.tsx`, `ui/input.tsx` | ✅ Complete | Button: 5 variants × 3 sizes × loading state. Input: label, error, helper text — full form-ready API |
| **Badge** | `components/ui/badge.tsx` | ✅ Complete | 9 status/verification variants shared across orders & products |
| **Modal** | `components/ui/modal.tsx` | ✅ Complete | Accessible dialog (title/description), animated, used for order details & search |
| **CartView** | `components/CartView.tsx` | ✅ Complete | Shared cart UI (items, MOQ-aware steppers, escrow totals, payment-method modal); powers `/shopkeeper/cart` |
| **CoverflowCarousel** | `components/ui/coverflow-carousel.tsx` | ✅ Complete | 3D coverflow on homepage hero; props for rotate/depth/captions/nav |
| **PortalHeader** | `components/PortalHeader.tsx` | ✅ Complete | Portal top bar: search, notifications *(theme toggle removed)* |
| **AuthGuards** | `components/AuthGuards.tsx` | ✅ Complete | `RequireAuth` + `RedirectIfAuthed` route protection |
| **Footer** | `components/Footer.tsx` | ✅ Complete | Public pages only |
| **AIRecommendationCard** | `components/AIRecommendationCard.tsx` | ✅ Complete | "AI pick" product card on marketplace/dashboard |

---

## 15. TESTING STATUS

| Check | Result | Details |
|---|---|---|
| **TypeScript errors** | ✅ **0 errors** | `npx tsc --noEmit` exit code 0 (verified after cleanup) |
| **ESLint** | ✅ Passes | Warnings only (`<img>` → `next/image` advisories); no errors |
| **Console errors at runtime** | ✅ None observed | Home page loads clean (HTTP 200); earlier `AuthContext.tsx` syntax error was fixed 2026-08-26 |
| **Unit tests** | ⛔ None | No test framework installed yet (no Jest/Vitest) |
| **Responsive design tested** | ⚠️ Manual spot-checks only | Breakpoints coded but no formal pass across devices |
| **Cross-browser tested** | ⛔ Not tested | Chrome primary; untested Safari/Firefox/Edge |
| **Lighthouse score** | ⛔ Not run | Recommended before FYP submission (expect strong scores on landing page) |
| **Build verification** | ⚠️ Type+lint verified | Full `next build` not executed this session |

---

## 16. NEXT STEPS & BLOCKERS

### 16.1 Immediate next steps (frontend)
1. Implement real **Edit-product** flow in supplier My Products.
2. Add a global **error boundary** (`app/error.tsx`) and `not-found.tsx`.
3. Migrate `<img>` → `next/image` to silence lint warnings.
4. Run one formal responsive + cross-browser pass.

### 16.2 Before backend integration
- Freeze data shapes in `lib/types.ts` as the API contract source of truth.
- Add `.env` template (`NEXT_PUBLIC_API_URL`) when server endpoints exist.
- Swap mock logic inside context providers for fetch calls — components stay untouched.

### 16.3 Blockers
- **No backend exists yet** → auth is mock, all persistence is localStorage, analytics numbers are hardcoded.
- No credential verification possible until API auth lands.
- Deployment postponed until backend URLs are known (though Vercel needs zero config).

### 16.4 Dependencies on backend
Auth/user store · product CRUD · order pipeline events · analytics aggregation · invoice generation · image upload destination (R2 bucket already whitelisted in `next.config.mjs`).

---

*End of document — regenerated after Session 5 cleanup (dead-code removal, `motion` package removal). Source of truth for progress log: `MEMORY.md`.*
