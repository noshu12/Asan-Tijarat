# Asan Tijarat

**Wholesale Trade, Made Simple**

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=flat&logo=tailwind-css)
![License](https://img.shields.io/badge/License-Academic-green?style=flat)
![Status](https://img.shields.io/badge/Status-Frontend_Complete_✓-emerald?style=flat)

---

## 📖 About

**Asan Tijarat** is a B2B wholesale marketplace connecting suppliers and shopkeepers across Pakistan. The platform enables verified businesses to trade commodities — from Basmati rice and cotton textiles to Himalayan salt and spices — with transparent pricing, AI-powered recommendations, and escrow-backed payment protection.

Built as a Final Year Project (FYP) for the Federal Urdu University of Arts, Science & Technology (FUUAST), Asan Tijarat eliminates the traditional middleman (arhti) commission model that adds 15-30% to wholesale costs. Suppliers list verified commodity lots with lab certificates and video walkthroughs, while shopkeepers browse factory-gate rates, compare across mills, and track shipments with live logistics milestones.

The application ships with a complete **mock-data + service-layer architecture**, making backend integration mechanical — swap the service files for real API calls and the UI is production-ready.

---

## ✨ Key Features

### For Suppliers
- **Product Management** — Create, edit, and remove listings with photos, MOQ, stock tracking, and lab certificates
- **Order Pipeline** — View and advance orders through Pending → Confirmed → Shipped → Delivered
- **Analytics Dashboard** — Monthly spending vs savings charts, top suppliers, and KPI stats
- **Profile Page** — Public-facing supplier profile with ratings, trade volume, and verification badges
- **Invoice Generation** — Auto-generated NTN-compliant wholesale invoices for every order

### For Shopkeepers
- **Public Marketplace** — Browse 89,000+ verified commodities with category filters, search, and sorting
- **Smart Cart** — MOQ-enforced adding, quantity controls with stock caps, and 1.5% platform fee
- **Order Tracking** — Full order history with status filters and timeline views
- **AI Recommendations** — Personalized product picks based on inventory preferences and trending mandi searches
- **Analytics** — Spending analytics, savings tracking, and top supplier rankings

### Platform-Wide
- **Role-Based Authentication** — Mock auth with Shopkeeper and Supplier sessions (persisted via localStorage)
- **Public Marketplace** — No login required to browse; guest add-to-cart redirects to Sign In with deep-link return
- **Verified Trader Badges** — CNIC, NTN, and Chamber of Commerce verification indicators
- **Real-Time Notifications** — Toast system for cart actions, order updates, and auth events
- **Search & Filter** — Global search with category pills, verified-only filter, and sort options
- **Responsive Design** — Mobile-first with slide-in sidebar drawer for portal navigation
- **Dark Mode** — Fully implemented with `dark:` Tailwind classes across all components
- **Backend Simulator** — `/backend-logic` playground for testing API payloads and role switching

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS Variables |
| State Management | Context API (Auth, Cart, Order, Product, Toast) |
| Animations | Framer Motion |
| Icons | Lucide React |
| Charts | Recharts |
| Data Layer | localStorage + Service Layer (designed for backend swap) |
| Planned Backend | Node.js / Express / PostgreSQL |

---

## 📁 Project Structure

```
Asan-Tijarat/
├── Frontend/                    # Next.js 14 application
│   ├── app/                     # App Router routes
│   │   ├── (root pages)         # Homepage, About, Contact, Marketplace, Sign In, Get Started
│   │   ├── shopkeeper/          # Shopkeeper portal (Dashboard, Cart, Orders, Analytics, Settings)
│   │   ├── supplier/            # Supplier portal (Dashboard, Add/Manage Products, Orders, Analytics, Profile, Settings)
│   │   ├── backend-logic/       # Backend simulator playground
│   │   ├── layout.tsx           # Root layout with Auth, Cart, Order, Product, Toast providers
│   │   ├── error.tsx            # Global error boundary
│   │   └── not-found.tsx        # Custom 404 page
│   ├── components/              # Shared UI components
│   │   ├── ui/                  # Primitives (Badge, Button, Card, Input, Modal, Carousel)
│   │   ├── Navbar.tsx           # Global navigation with role-aware routing
│   │   ├── Sidebar.tsx          # Desktop portal sidebar
│   │   ├── MobileSidebar.tsx    # Mobile slide-in drawer
│   │   ├── CartView.tsx         # Shared cart component (buyer + shopkeeper)
│   │   ├── OrderTable.tsx       # Reusable order data table
│   │   ├── ProductCard.tsx      # Marketplace product card
│   │   ├── StatsCard.tsx        # KPI stat card
│   │   ├── PortalHeader.tsx     # Portal page header
│   │   ├── Footer.tsx           # Global footer
│   │   ├── AuthGuards.tsx       # Role-based route guards
│   │   └── AIRecommendationCard.tsx
│   ├── context/                 # React Context providers
│   │   ├── AuthContext.tsx      # Session, login, logout, profile updates
│   │   ├── CartContext.tsx      # Cart CRUD, MOQ enforcement, fee calculation
│   │   ├── OrderContext.tsx     # Order placement, status updates
│   │   ├── ProductContext.tsx   # Product catalogue CRUD
│   │   └── ToastContext.tsx     # Toast notification system
│   ├── lib/                     # Utilities and types
│   │   ├── types.ts             # TypeScript interfaces (User, Product, Order, CartItem, etc.)
│   │   ├── mockData.ts          # Seed data for products, orders, users, suppliers
│   │   ├── invoice.ts           # PDF invoice generation
│   │   └── utils.ts             # Helper functions (formatPKR, etc.)
│   └── services/                # Service layer (mock API — swap for real backend)
│       ├── authService.ts       # Session persistence, role-based routing
│       ├── orderService.ts      # Order CRUD, status transitions, localStorage sync
│       └── productService.ts    # Product CRUD, catalogue sync
├── Backend/                     # Planned backend (currently empty — under development)
├── .gitignore
├── AUDIT_REPORT.md              # Comprehensive frontend audit (2026-09-01)
├── FRONTEND_DOCUMENTATION.md    # Detailed frontend documentation
├── MEMORY.md                    # Session memory and decisions log
├── BACKEND_LOGIC_SPECIFICATION.md # Full backend API contract specification
└── README.md                    # This file
```

---

## 👥 User Roles

Asan Tijarat currently supports **two roles** (the Buyer/Normal Person role was intentionally removed):

### Shopkeeper
- Browses the public marketplace for wholesale commodities
- Manages a personal cart with MOQ-enforced ordering
- Tracks orders and views analytics
- Lands at `/shopkeeper/dashboard` after login

### Supplier
- Lists and manages product catalogue
- Processes and advances customer orders
- Views analytics and public profile
- Lands at `/supplier/dashboard` after login

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm or yarn

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/noshu12/Asan-Tijarat.git

# 2. Navigate to the frontend
cd Asan-Tijarat/Frontend

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev

# 5. Open in browser
# http://localhost:3000
```

---

## 📝 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts the Next.js development server with hot reload |
| `npm run build` | Creates an optimized production build |
| `npm run start` | Runs the production build locally |
| `npm run lint` | Runs ESLint to check for code issues |

---

## 🔐 Environment Variables

**Currently, no environment variables are required.** The application runs entirely on mock data and `localStorage`. This section will be updated once backend integration begins.

When the backend is connected, expected variables will include:
- `NEXT_PUBLIC_API_URL` — Backend API base URL

---

## 👥 Team / Contributors

| Name | Role | Branch |
|------|------|--------|
| Noushad Alam | Frontend Development | `frontend-work` |
| TBD | Backend Development | `backend-work` |

This project is developed collaboratively via Git branches. Features are built on `frontend-work` and `backend-work`, then merged into `main` via Pull Requests.

---

## 🗺️ Project Status / Roadmap

- [x] Frontend UI (Shopkeeper + Supplier portals)
- [x] Mock data & service-layer architecture
- [x] Role-based authentication (Shopkeeper + Supplier)
- [x] Public marketplace with search, filters, and sorting
- [x] Cart system with MOQ enforcement
- [x] Order management pipeline
- [x] AI Recommendation cards (UI — backend integration pending)
- [x] Dark mode support
- [x] Responsive design (mobile + desktop)
- [x] Global error boundary and 404 page
- [ ] Backend API (Node.js / Express / PostgreSQL)
- [ ] Real payment integration (JazzCash / EasyPaisa / Bank Transfer)
- [ ] AI Recommendation System (backend-powered)
- [ ] Production deployment
- [ ] Live logistics tracking

---

## 🤝 Contributing / Branch Workflow

We follow a feature-branch workflow:

1. **Main branch** — stable, deployable code
2. **`frontend-work`** — all frontend feature development
3. **`backend-work`** — all backend feature development

**Workflow:**
```bash
# Start a new feature
git checkout frontend-work
git pull origin frontend-work
git checkout -b feature/your-feature-name

# Push and create Pull Request
git push origin feature/your-feature-name
# → Open PR targeting frontend-work (or main for complete features)
```

---

## 📄 License

This project is developed as a **Final Year Project (FYP)** for academic purposes at the Federal Urdu University of Arts, Science & Technology (FUUAST). All rights reserved.
