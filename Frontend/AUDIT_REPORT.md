# 🔍 Frontend Audit Report — Asan Tijarat

**Date:** September 1, 2026
**Project:** Asan Tijarat — Next.js 14 (App Router) + TypeScript + Tailwind CSS
**Audit type:** ✅ READ-ONLY — no files were modified, renamed, moved, or deleted. The only file created is this report. Only check-mode commands were run (`tsc --noEmit`, `next lint`, file listings, content reads).
> ### 🔔 POST-AUDIT UPDATE (same day — role removal follow-up)
> After this audit was delivered, a follow-up task **completely removed the "Normal Person" (`'normal'`) buyer role** at the owner's request:
> - `app/my-orders/` and `app/my-cart/` were **deleted** → **C-2 is resolved by removal** (the unguarded route no longer exists), not by adding a guard.
> - All `'normal'` branches were stripped from `lib/types.ts`, `services/authService.ts`, `app/signin/page.tsx`, `components/Navbar.tsx`, `components/AuthGuards.tsx`, `components/CartView.tsx`, `app/backend-logic/page.tsx`, and mock data. Only `'shopkeeper' | 'supplier'` remain.
> - Sweep result: **zero** `'normal'` / `my-orders` / `my-cart` references remain in `app/`, `components/`, `context/`, `lib/`, `services/`. Docs updated to **19 routes**.
> - The **first-ever `npm run build`** (run during this follow-up) exposed a **pre-existing** blocker unrelated to roles: `/marketplace` read `useSearchParams()` without a Suspense boundary (Next.js 14 prerender CSR-bailout). **Fixed** via a `<Suspense>` wrapper in `app/marketplace/page.tsx`.
> - **Final verification:** `tsc --noEmit` → 0 errors · `next lint` → 0 errors (13 pre-existing `<img>` warnings — audit item W-4 — still open by design) · `npm run build` → **exit 0** (19 pages, all static).
> - Sections below are preserved verbatim as the point-in-time audit record; role references describe the codebase **before** the removal.
>


---

## Summary

| Severity | Count |
|---|---|
| 🔴 Critical (must fix before backend integration) | **4** |
| 🟡 Warning (should fix soon) | **15** |
| 🔵 Suggestion (nice to have) | **14** |
| **Total** | **33** |

**Automated check results**

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ **0 errors** (exit code 0) — type-safety is excellent |
| `npx next lint` | ✅ Exit 0 — **0 errors**, 4+ warnings (all `@next/next/no-img-element`) |
| `any` type usage in source | ✅ **Zero** occurrences in app/, components/, context/, lib/, services/ |
| `console.log` in app code | ✅ Only 1 intentional `console.error` in the error boundary (`app/error.tsx:21`); 2 others live in leftover root scripts (see W-10) |
| TODO/FIXME/HACK markers | ✅ None in source code |
| Internal dead links / 404 hrefs | ✅ None found — every internal `href` resolves to a real route |
| Empty `onClick` handlers | ✅ None found — every button does something |

---

## 1. 🔴 Critical Issues (must fix before backend integration)

### C-1. No `.gitignore` file exists at all
- **Path:** `D:\NOUSHAD ALAM\ASAN TIJARAT\Frontend\` (verified: `Test-Path .gitignore` → `False`)
- **Impact:** No git repo is initialized yet (`Test-Path .git` → `False` in both Frontend and parent). The moment `git init` + first commit happens, `node_modules/` (~300–500 MB), `.next/`, and `tsconfig.tsbuildinfo` will be committed. There is also no protection for future `.env.local` secrets when the backend lands.
- **Fix:** Create a standard Next.js `.gitignore` (`node_modules/`, `.next/`, `.env*`, `tsconfig.tsbuildinfo`, `*.log`, `.vercel`) **before** the first commit.

### C-2. `/my-orders` (buyer orders page) has NO auth guard
- **Path:** `app/my-orders/page.tsx` (entire file — no `RequireAuth` import or wrapper)
- **Impact:**
  - A **guest** opening `/my-orders` directly sees an empty "My Orders" portal instead of the specified `warning toast + redirect to /signin?redirect=/my-orders` (violates documented behavior #22 in `BACKEND_LOGIC_SPECIFICATION.md`).
  - A **supplier** or **shopkeeper** can also open it (no `allowedRoles` check). Every other protected area is guarded via layouts or page-level `RequireAuth` (`app/shopkeeper/layout.tsx`, `app/supplier/layout.tsx`, `app/my-cart/page.tsx` all correct).
- **Fix:** Wrap in `<RequireAuth allowedRoles={['normal']}>` (or `['normal','shopkeeper']` per business rule) exactly like `app/my-cart/page.tsx:21` does.

### C-3. Password-change forms accept an empty new password and never verify the current one
- **Paths:**
  - `app/shopkeeper/settings/page.tsx:43-52` (`handleSavePassword`)
  - `app/supplier/settings/page.tsx` (same pattern)
- **Impact:** `if (newPassword && newPassword !== confirmPassword)` — when `newPassword` is **empty**, the check short-circuits and the form still shows *"Password changed successfully!"* with nothing changed. The current password value is never validated either. Mock-tolerable today, but the UI contract is wrong and will mislead during the viva demo.
- **Fix:** Require `newPassword.length >= 8` and show an error toast otherwise; (post-backend) send current password for server verification.

### C-4. Navbar mobile hamburger menu is dead — toggles state that renders nothing
- **Path:** `components/Navbar.tsx:32` (state), `:266-274` (button)
- **Evidence:** `mobileMenuOpen` is declared and flipped by the `< md` hamburger button, but **no JSX anywhere renders based on it** — the state is only used for the button icon/`aria-expanded`. There is no slide-down panel for the public nav links on mobile.
- **Impact:** On phones/tablets (< md), visitors cannot reach Marketplace/About/Contact/Sign In/Get Started from the header (only Footer links + logo work). The portal pages are fine (they have `MobileSidebar`), but all public pages have a broken primary nav on mobile.
- **Fix:** Render an `AnimatePresence` dropdown panel under the header (mirroring the profile dropdown) listing `navLinks` + auth buttons when `mobileMenuOpen` is true.

---

## 2. 🟡 Warnings (should fix soon)

### W-1. `<img>` elements that should migrate to `next/image` (known pending task)
- `components/Navbar.tsx:79` (logo) and `:184` (user avatar)
- `components/ProductCard.tsx:42` (product photo)
- `components/OrderTable.tsx:116` (order item thumbnail)
- `components/Footer.tsx:13` (logo)
- `app/getstarted/page.tsx:108` (logo)
- `components/ui/coverflow-carousel.tsx` — uses `<img>` intentionally with an `eslint-disable-next-line @next/next/no-img-element` comment (dynamic 3D transforms; acceptable)
- ESLint flagged 4 of these; all share the same fix. Remote domains (`images.unsplash.com`, R2 bucket, `plus.unsplash.com`, `via.placeholder.com`) are already whitelisted in `next.config.mjs`, so `next/image` will work immediately.

### W-2. `globals.css` body color/background uses `rgb()` with HSL channel values — declaration is invalid
- **Path:** `app/globals.css:52-56` — `color: rgb(var(--foreground))` / `background: rgb(var(--background))`, but `--foreground`/`--background` are defined as HSL triplets (e.g. `222.2 84% 4.9%`) at `:6-27`.
- **Impact:** The generated value (`rgb(222.2 84% 4.9%)`) is invalid CSS → both declarations are dropped by the browser. The body silently falls back to UA defaults, which is masked because every page sets its own `bg-*` classes.
- **Fix:** Use `hsl(var(--foreground))` / `hsl(var(--background))` (as `tailwind.config.ts` already does), or delete the body rule.

### W-3. User-visible mojibake ("â€¢") on the homepage carousel
- **Path:** `app/page.tsx:27, 38, 49, 60, 71, 82` — `COMMODITY_SLIDES` subtitles contain `â€¢` (UTF-8 "•" mis-decoded as Windows-1252), e.g. *"Punjab Agri Exports â€¢ Sheikhupura"*. These render **directly to users** in the carousel caption.
- Also present (comments only, user-invisible): `services/authService.ts:1-13`, `services/orderService.ts` header, `services/productService.ts` header, `lib/invoice.ts:1-2`, `app/backend-logic/page.tsx:24`, plus a stray UTF-8 BOM at the start of `app/page.tsx:1` and `app/shopkeeper/cart/page.tsx:1`.
- **Fix:** Re-encode those literals as `•` (and strip the BOMs).

### W-4. Cart is NOT cleared on logout — leaks between accounts on a shared browser
- **Path:** `context/AuthContext.tsx:53-57` — `logout()` only nulls the user and calls `clearPersistedUser()`. `localStorage['asan-cart']` survives, so the next person who signs in on the same browser inherits the previous user's cart.
- **Fix:** On logout either call `clearCart()` or namespace carts per user id (also better for backend parity).

### W-5. No "Cancelled" filter tab on orders pages — cancelled orders are hard to find
- **Path:** `app/shopkeeper/orders/page.tsx:29` — tabs are `All | Pending | Confirmed | Shipped | Delivered`. `OrderTable` supports status `Cancelled` (and renders its badge), but a user must know to use "All" to find cancelled orders. `app/supplier/orders/page.tsx` has the same tab set.
- **Fix:** Add `Cancelled` to the tab list (or show it only when cancelled orders exist).

### W-6. `localStorage.setItem` writes are not try/catch-wrapped
- **Path:** `context/CartContext.tsx:45` (`saveCart`), plus `services/authService.ts:84-85`, `services/orderService.ts:56-57`, `services/productService.ts:68-69` (`persist*` functions).
- **Impact:** Safari Private Mode / blocked storage / quota-exceeded makes `setItem` throw → uncaught exception inside click handlers (e.g. add-to-cart dies mid-action). All **read** paths are properly guarded (`typeof window` + try/catch) — only the writes are exposed.
- **Fix:** Wrap writes in try/catch (fail silently or toast "storage unavailable").

### W-7. Registration upload zones are decorative — no `<input type="file">`
- **Path:** `app/getstarted/page.tsx:385-396` — the "Upload CNIC Front/Back" and "Upload Business Certificate/NTN" dashed boxes are plain `<div>`s with `cursor-pointer`; there is no file input, and `cnicUploaded`/`ntnUploaded` state (lines 48-49) are initialized `true` and never changed by user action.
- **Impact:** Clicking gives zero feedback. The "(Simulated)" wording saves it for the demo, but it is the least honest interaction in the flow. (`BACKEND_LOGIC_SPECIFICATION.md` M1.4 already specifies `POST /uploads/sign` for the real thing.)
- **Fix (frontend-only):** Wire a hidden `<input type="file" accept="image/*,.pdf">` + show the chosen filename; keep the upload itself mocked.

### W-8. OTP inputs: no auto-advance, no paste handling, no a11y labels, any value accepted
- **Path:** `app/getstarted/page.tsx:366-381` — six 1-char boxes; the user must tab/click between them, there is no `aria-label` per digit, no `inputMode="numeric"`, no `autoComplete="one-time-code"`, and step-3 submit never validates the code (mock-acceptable, flagged for backend parity).
- **Fix:** Auto-focus-next on input, backspace-prev, paste-split across digits, `aria-label={"OTP digit " + (i+1)}`.

### W-9. `useSearchParams()` without a Suspense boundary — `next build` may fail
- **Path:** `app/marketplace/page.tsx:23`
- **Impact:** In Next.js 14 App Router, `useSearchParams` in a statically-rendered client page triggers the CSR-bailout error (`useSearchParams() should be wrapped in a suspense boundary`) during production build. Dev mode works, so this stays invisible until `next build`. (The other query-param readers — `signin`, `getstarted` — correctly read `window.location.search` inside `useEffect`, avoiding the issue.)
- **Fix:** Wrap the page body in `<Suspense>` (export a wrapper component rendering the inner one), or switch to the same `window.location.search` pattern the auth pages use.
- **Note:** Read-only audit — `next build` was intentionally **not** run (it writes `.next/`), so this is flagged from framework rules, not an observed failure.

### W-10. Leftover one-off repair scripts in project root
- **Paths:** `fix-sidebar.js`, `fix-sidebar2.js` (project root)
- **Impact:** Both call `fs.writeFileSync` + `console.log` and exist solely to overwrite `components/Sidebar.tsx` with an old snapshot — the 2 non-app console statements in the repo come from here, and accidental execution would clobber the current, since-evolved Sidebar. Not imported anywhere.
- **Fix:** Delete both scripts (audit could not delete them — read-only).

### W-11. Hardcoded fake date duplicated across portal headers
- **Paths:** `app/shopkeeper/dashboard/page.tsx:26`, `app/shopkeeper/orders/page.tsx:24`, `app/shopkeeper/analytics/page.tsx:25`, `app/shopkeeper/settings/page.tsx:58`, `app/shopkeeper/cart/page.tsx:8` (`subtitle="Thursday, 3 July 2026 • …"`), plus the equivalent supplier portal headers.
- **Impact:** ~12 call sites carry the same frozen literal; a viva examiner will notice "Thursday, 3 July 2026" regardless of the real date, and it must be edited in a dozen files to change.
- **Fix:** Compute inside `PortalHeader` (`new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())`) or drop the date segment.

### W-12. Dashboard KPI cards are hardcoded strings, not derived from context
- **Paths:** `app/shopkeeper/dashboard/page.tsx:53-66` ("89" orders / "Rs 2.1M" spent), `app/shopkeeper/analytics/page.tsx:30-57` (same 4 cards), `app/supplier/dashboard/page.tsx` + `app/supplier/analytics/page.tsx` (revenue/listing counts).
- **Impact:** The "Recent Orders" table *below* the KPIs is live `useOrders()` data, so "Total Wholesale Orders: 89" visibly contradicts the real order count rendered directly underneath it.
- **Fix:** Derive counts/sums from `useOrders()` / `useProducts()`; keep only the "+x%" trend deltas mocked.

### W-13. `updateOrderStatus` has no ownership/role guard on the client side of the contract
- **Path:** `context/OrderContext.tsx:49-51` → `services/orderService.ts` (`withOrderStatus`)
- **Impact:** The mock mimics `PATCH /api/orders/:id/status` but performs no party/role check — any signed-in user holding an order id could advance it. The backend spec mandates `403 ORDER_NOT_YOURS` / `ROLE_FORBIDDEN`; today only the *UI placement* (supplier portal buttons) prevents misuse, not the function.
- **Fix:** Before backend integration, gate supplier transitions to `user.role === 'supplier' && order.supplierId === user.id` and buyer confirmations to the owning buyer — cheap to add now, and it documents the server rule.

### W-14. Dead `dark:` variants everywhere although dark mode was removed by decision
- **Scope:** Nearly every class string in all 56 source files (`dark:bg-slate-900`, `dark:text-emerald-300`, …), `app/globals.css:29-49` (`.dark` variable block), and the dark scrollbar rule at `globals.css:69-71`.
- **Impact:** The dark-mode toggle was deliberately removed (light-theme-only decision recorded in `MEMORY.md`), and nothing ever sets `.dark` on `<html>` — so hundreds of shipped CSS rules are unreachable dead weight and every future edit must maintain two palettes for one theme.
- **Fix:** Make the decision once, explicitly: either strip `dark:` variants + the `.dark` block (mechanical, safe, smaller CSS), or keep them as free future-proofing — but record it so reviewers stop flagging the inconsistency.

### W-15. Forms have no inline validation errors — browser bubbles + toasts only
- **Paths:** `app/signin/page.tsx`, `app/getstarted/page.tsx` (steps 1–3), `app/contact/page.tsx`, `app/shopkeeper/settings/page.tsx:68-88`, `app/supplier/settings/page.tsx` (profile forms), `app/supplier/add-product/page.tsx`.
- **Impact:** HTML `required` covers empty fields on signin/contact/getstarted, but: new-password fields never enforce the "Min. 8 characters" their placeholder promises, the profile forms have **no** `required` at all (an empty name saves with a success toast), and there is no inline field-level error text anywhere. Loading states ✅ and toast feedback ✅ exist on every form.
- **Fix:** Add minimal pre-submit validators (name non-empty, password ≥ 8, OTP length 6) and render red helper text under the offending input — better than toasts for a11y and for the demo.

## 3. 🔵 Suggestions (nice to have)

### S-1. Split `app/page.tsx` (460 lines)
- Move `COMMODITY_SLIDES` (lines 22-89) into `lib/mockData.ts` — it is page data, not logic — and consider extracting the hero/features/role-CTA sections into `components/home/*`.

### S-2. Split `app/getstarted/page.tsx` (378 lines)
- Three `RegistrationStep` components would remove the `step`-conditional pyramid and ~15 co-located `useState` calls from one component.

### S-3. Split `app/supplier/my-products/page.tsx` (305 lines)
- Extract the inline Edit-product modal into `components/EditProductModal.tsx` (also reusable for future flows).

### S-4. Split `app/backend-logic/page.tsx` (300 lines)
- Extract the JSON inspector + action-log list into `components/backend-simulator/*`; this demo tool will keep growing.

### S-5. `components/ui/coverflow-carousel.tsx` (318 lines)
- Works correctly (its window listeners **are** cleaned up ✅), but the `CoverflowSlide` type and easing helpers could live in `lib/` so pages import data, not component internals.

### S-6. Sidebar nav config is duplicated
- `components/Sidebar.tsx` and `components/MobileSidebar.tsx` each hardcode the same role-link arrays; extract a shared `PORTAL_NAV: Record<UserRole, NavItem[]>` into `lib/` before the two sets drift apart.

### S-7. Footer category links skip the `?cat=` deep link
- `components/Footer.tsx:43-47` links "Faisalabad Textiles" etc. to bare `/marketplace`, while the marketplace already parses `?cat=` (`app/marketplace/page.tsx:32`). Append `?cat=textiles`, `?cat=spices`, … for free deep-linking.

### S-8. Accessibility polish on icon-only controls & modal focus
- Missing `aria-label`s: password eye toggle (`app/signin/page.tsx:210-216`), toast dismiss ✕ (`context/ToastContext.tsx:56-61`), and the six OTP inputs (`app/getstarted/page.tsx:368-379` — add `aria-label={"OTP digit " + (i + 1)}`). `components/ui/modal.tsx` closes on Escape/backdrop ✅ but has no focus trap or initial focus — add `role="dialog"` + focus management when time permits.

### S-9. Toast timers are never cleared
- `context/ToastContext.tsx:28-30` — the 4s `setTimeout` isn't cancelled when a toast is dismissed early or on unmount. Store timer ids and clear them in `removeToast`; also consider capping the visible stack (e.g. last 4) so a burst of actions can't stack 10 toasts.

### S-10. Cart mutations close over stale `items`
- `context/CartContext.tsx:48-104` — `addToCart`/`updateQuantity` read `items` from the render closure; two rapid clicks can drop one. Convert to functional updates (`setItems(prev => …)`) and compute `addedQuantity` from the previous state.

### S-11. Memoize hot list renders
- `components/ProductCard.tsx` re-renders on every keystroke of the marketplace search box — `React.memo(ProductCard)` makes typing smooth (the filter itself already sits in `useMemo`, `app/marketplace/page.tsx:35` ✅). Dashboard derivations `trendingProducts`/`recommendedProducts` (`app/shopkeeper/dashboard/page.tsx:18-19`) recompute every render.

### S-12. Chart colors are hardcoded hex
- `app/shopkeeper/analytics/page.tsx:71,76-77` (`#e2e8f0`, `#0B3D2E`, `#27AE7A`) and the supplier analytics equivalents — centralize a `chartPalette` in `lib/utils.ts` (or CSS variables) so a rebrand is one edit.

### S-13. WCAG AA contrast misses on small meta text
- `text-slate-400` on white at 10–11px appears throughout the dashboards/marketplace/cart (≈ 2.8:1 contrast) — bump the smallest annotations to `text-slate-500` (≈ 4.6:1) to pass AA.

### S-14. Nav a11y niceties
- Add `aria-current="page"` to active nav links (`components/Navbar.tsx`, `components/Sidebar.tsx`) and a skip-to-content link in `app/layout.tsx`.

---

## 4. Missing Features (per documentation)

| Feature | Source | Status |
|---|---|---|
| Shopkeeper registration upgrade — shop NTN, real shop name, storefront photo of owner, shop address | User requirement (tracked in `MEMORY.md`) | ⛔ Not started — agreed next feature |
| `/shopkeeper/marketplace` page | PRD | ✅ **Intentionally not built** — the Navbar Marketplace button covers it (decision recorded in docs; **not** counted as missing) |
| Admin KYC approval UI | `BACKEND_LOGIC_SPECIFICATION.md` M1.11 | ⛔ No admin portal (backend-scope feature) |
| `next/image` migration | Lint warnings | ⛔ 4 `<img>` remain (see W-1) |
| Backend / API integration | `BACKEND_LOGIC_SPECIFICATION.md` | ⛔ By design — service layer is the ready-made swap point |
| `.env.example` | Audit checklist §13 | ⛔ Not needed yet — the app has **zero** env vars today; create it together with `NEXT_PUBLIC_API_URL` when the backend lands |
| `app/global-error.tsx` | Next.js convention | ⛔ Absent — a crash inside the root layout falls back to the default Next overlay instead of the branded screen (`app/error.tsx` covers all route segments, which is sufficient for now) |

## 5. Findings by Audit Category (checklist §1–§14)

**§1 Code quality** — `tsc --noEmit` ✅ 0 errors · zero `any` · zero TODO/FIXME · 1 intentional `console.error` (error boundary) · naming consistent (PascalCase components, camelCase fns/hooks, kebab-case routes) · good reuse of OrderTable/StatsCard/CartView/PortalHeader; remaining duplication: sidebar nav config (S-6), KPI blocks (W-12), the two settings pages mirror each other structurally.

**§2 Broken links & navigation** — every internal `href` cross-checked against the `app/` tree: **no dead links / 404 paths**; all external links are `https://` (WhatsApp, mailto, Unsplash) ✅; no empty `onClick` handlers found; guest-only buttons correctly hidden (`/backend-logic` pill is an internal demo page, linked from navbar — acceptable for FYP, remove before "production" claim).

**§3 Forms validation** — inventory: Sign-In · GetStarted steps 1–3 · Contact · Shopkeeper Settings (profile + password) · Supplier Settings (profile + password) · Supplier Add-Product · Supplier Profile (display). Loading state on **every** submit ✅ (`Button isLoading`); success/error feedback via toasts ✅; gaps → C-3 (password logic) and W-15 (inline validation).

**§4 Images & assets** — 4 `<img>` elements flagged by lint → W-1 (all render `/logo.png`-style local assets + Unsplash CDN with explicit `w=`/`h=` params); **all have `alt` text** ✅; no references to non-existent local assets found via path cross-check; remote domains whitelisted in `next.config.mjs` ✅.

**§5 Responsive design** — portal sidebar: `hidden md:block` + `MobileSidebar` slide-in drawer ✅; `OrderTable` wrapped in `overflow-x-auto` ✅; `sm:`/`md:`/`lg:` breakpoints present on all pages; grids collapse 4→2→1 correctly; category pills + order tabs use `overflow-x-auto` scroll rows ✅.

**§6 Authentication & route protection** — `app/shopkeeper/layout.tsx` + `app/supplier/layout.tsx` guard their subtrees with module-level role arrays (stable deps ✅); `app/my-cart/page.tsx` guards ✅; `RedirectIfAuthed` on signin/getstarted ✅; role-home redirects verified in `services/authService.ts` (`getHomeRouteForRole`: normal→`/my-orders`, shopkeeper→`/shopkeeper/dashboard`, supplier→`/supplier/dashboard`) ✅; cross-role blocking via `allowedRoles` ✅ (supplier cannot open shopkeeper routes and vice-versa); **gap: `/my-orders` unguarded → C-2**; logout clears session but not cart → W-4.

**§7 State management** — 5 contexts, **no duplicated state** across them; every localStorage **read** is SSR-safe (`typeof window === 'undefined'` guard in services; CartContext reads inside `useEffect`) and type-guard sanitized ✅; **writes** unguarded → W-6; effect cleanups present (Navbar outside-click/Escape ✅, carousel listeners ✅) except toast timers → S-9; every hook throws a helpful error outside its provider ✅.

**§8 Styling consistency** — brand palette via Tailwind config tokens (`asan-accent`, `asan-dark`, `asan-error`…) ✅; hardcoded hex confined to recharts (S-12) + scrollbar CSS; spacing/pattern conventions consistent (`p-6`/`p-8` cards, `rounded-2xl`/`3xl`, `text-xs` meta); inline styles: **none found** ✅; dead `dark:` payload → W-14; `globals.css` body rule broken → W-2.

**§9 Component structure** — **every component has a TypeScript props interface** ✅; 5 files ≥300 lines → S-1–S-5; prop drilling minimal (contexts cover cross-cutting state) ✅; `components/ui/*` primitives mirror shadcn conventions ✅.

**§10 Error handling** — route-level boundary `app/error.tsx` ✅ + branded `not-found.tsx` ✅ (global-error gap noted in §4 table); storage **reads** try/catch'd everywhere ✅; `confetti()` wrapped in try/catch ✅; invoice printing handles popup-block with an error toast ✅; empty states present: marketplace (no products found + reset), CartView (empty cart), OrderTable (no orders), My-Products (no listings) ✅; loading skeletons absent (buttons spin instead — acceptable).

**§11 Performance** — no `React.memo` anywhere → S-11; `useMemo` used where it matters (marketplace filter) ✅; **all** `package.json` dependencies are exercised in code (no unused deps found); recharts only imported inside the two analytics pages ✅; Unsplash images sized via URL params ✅ (but still `<img>` → W-1).

**§12 Accessibility** — `Input` primitive renders associated `<label>` ✅; textarea labeled ✅; gaps → S-8 (aria-labels), S-13 (contrast), W-8 (OTP a11y); keyboard: dropdowns Escape/outside-click close ✅, tab order natural (no positive tabindex found ✅).

**§13 Environment & config** — no `.env` / `.env.local` / `.env.example` exists (nothing to configure today — consistent with docs ✅); `next.config.mjs` image whitelist verified: `images.unsplash.com`, `plus.unsplash.com`, `via.placeholder.com`, one Cloudflare R2 bucket ✅; **zero hardcoded API URLs** (zero API calls) ✅; **`.gitignore` missing → C-1**; no git repo initialized yet (informational).

**§14 Project-specific (Asan Tijarat)** — **21/21 documented route pages exist** and compile (plus `error.tsx`, `not-found.tsx`, 2 portal layouts); navbar role behavior verified: guest → Sign In / Get Started only; buyer → cart→`/my-cart`; shopkeeper → cart→`/shopkeeper/cart`; supplier → **cart button hidden** ✅; status badges: Pending=slate, Confirmed=blue, Shipped=amber, Delivered=green, Cancelled=red ✅; **MOQ enforced** at add (`CartContext.tsx:54` — `Math.max(moq, floor(q))`) and at update (`:91` — rejects below MOQ with toast) ✅; marketplace fully public ✅; guest Add-to-Cart → warning toast + `/signin?redirect=<origin>` bounce, honored post-login ✅ (`ProductCard.tsx`, `signin/page.tsx:58-61,90`); cart persists via `asan-cart` and survives reload/navigation ✅; `/shopkeeper/marketplace` — **absent by documented design decision** (not a defect); dark-mode toggle — removed by design, leftover CSS → W-14.

## 6. Files Reviewed — 65 total (56 source files @ 100% + 6 root/config + 3 docs)

- **app/ (27):** `page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`, `globals.css`, `about/`, `backend-logic/`, `contact/`, `getstarted/`, `marketplace/`, `my-cart/`, `my-orders/`, `signin/`, `shopkeeper/{layout, dashboard, cart, orders, analytics, settings}`, `supplier/{layout, dashboard, add-product, my-products, orders, analytics, profile, settings}`
- **components/ (17):** `AIRecommendationCard`, `AuthGuards`, `CartView`, `Footer`, `MobileSidebar`, `Navbar`, `OrderTable`, `PortalHeader`, `ProductCard`, `Sidebar`, `StatsCard` + `ui/{badge, button, card, coverflow-carousel, input, modal}`
- **context/ (5):** `AuthContext`, `CartContext`, `OrderContext`, `ProductContext`, `ToastContext`
- **lib/ (4):** `types.ts`, `mockData.ts`, `utils.ts`, `invoice.ts`
- **services/ (3):** `authService.ts`, `productService.ts`, `orderService.ts`
- **root/config (6):** `package.json`, `next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `fix-sidebar.js`, `fix-sidebar2.js`
- **docs (3):** `FRONTEND_DOCUMENTATION.md`, `BACKEND_LOGIC_SPECIFICATION.md`, `MEMORY.md`

*No file was skipped. Every check in audit sections 1–14 was executed or explicitly marked "not run" with its reason (only write-producing commands were avoided, per the read-only safety rule).*

---

## 7. What's already excellent ✅

- **Type discipline:** zero `any`, zero tsc errors, every component & context fully typed.
- **Architecture:** the `services/` layer with `MOCK OF: POST /api/...` comments makes the backend swap almost mechanical — exactly as the docs promise.
- **Defensive reads:** every localStorage read path is SSR-guarded + type-guard sanitized (`isOrder`, `isProduct`, `isCartItem`).
- **Guard engineering:** module-level role arrays keep `RequireAuth` effect deps stable; role-aware navbar cart routing.
- **UX care:** branded error/404 pages, popup-block fallback in invoice printing, route prefetch warm-ups on auth pages, empty states everywhere, `MobileSidebar` drawer.

---

## 8. Recommended fix order (before backend integration)

1. **C-1** `.gitignore` — one file, 2 minutes, protects everything else.
2. **C-2** Guard `/my-orders` — copy the `my-cart` pattern.
3. **C-4** Navbar mobile menu — restore a working panel.
4. **C-3 + W-15** Form validators — viva-critical honesty.
5. **W-2, W-3, W-9** — broken CSS rule, mojibake, Suspense wrap (all tiny).
6. **W-4, W-6, W-13** — logout cart clear, try/catch writes, status-ownership gate.
7. **W-10..W-12, W-14** — cleanup batch (scripts, dates, KPIs, dark: decision).
8. Suggestions — as time permits before the demo.

---

*End of report — READ-ONLY audit by Cline, 2026-09-01. Only `AUDIT_REPORT.md` was created; no project file was modified, deleted, renamed, or moved.*

