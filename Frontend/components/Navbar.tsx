"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Menu, X, LayoutDashboard, ChevronDown, ShoppingCart, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
// FIX (New audit #19) — the mobile menu + search modal were framer-motion
// (AnimatePresence + motion.div/nav). Same motion in plain CSS now: the
// entrance is a keyframe (animate-asan-menu-in / animate-asan-pop-in /
// animate-asan-fade-in, globals.css) and the exit is a `closing` state
// that flips transition classes; the panel stays mounted for the close
// duration so the exit can play, exactly like AnimatePresence's exit did.
// Timings kept: menu 180 ms, search modal 200 ms. Both panels' state is
// local to this component, so the exit lifecycle is fully contained here.
import { useAuth } from '@/context/AuthProvider';
import { cartCount, CART_UPDATED_EVENT } from '@/lib/cart';

/**
 * Session-aware navigation — guests see Sign In / Get Started; logged-in users
 * see a profile dropdown (My Dashboard + Logout) in the navbar.
 */
export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const { user, loading, logout } = useAuth();
  // FIX (New audit #19) — `rendered` keeps a panel mounted while its
  // exit transition plays; `closing` flips the transition classes to the
  // hidden state. (Replaces AnimatePresence; same timings as before.)
  const [menuRendered, setMenuRendered] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuCloseTimer = useRef<number | null>(null);
  const [searchRendered, setSearchRendered] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const searchCloseTimer = useRef<number | null>(null);

  const openMenu = () => {
    if (menuCloseTimer.current) {
      window.clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
    setMenuClosing(false);
    setMenuRendered(true);
  };
  const closeMenu = () => {
    if (!menuRendered || menuClosing) return;
    setMenuClosing(true);
    menuCloseTimer.current = window.setTimeout(() => {
      setMenuRendered(false);
      setMenuClosing(false);
      menuCloseTimer.current = null;
    }, 180);
  };
  const toggleMenu = () => {
    if (menuRendered && !menuClosing) closeMenu();
    else openMenu();
  };
  const openSearch = () => {
    if (searchCloseTimer.current) {
      window.clearTimeout(searchCloseTimer.current);
      searchCloseTimer.current = null;
    }
    setSearchClosing(false);
    setSearchRendered(true);
  };
  const closeSearch = () => {
    if (!searchRendered || searchClosing) return;
    setSearchClosing(true);
    searchCloseTimer.current = window.setTimeout(() => {
      setSearchRendered(false);
      setSearchClosing(false);
      searchCloseTimer.current = null;
    }, 200);
  };

  // Never leave a pending close timer behind on unmount.
  useEffect(() => {
    return () => {
      if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
      if (searchCloseTimer.current) window.clearTimeout(searchCloseTimer.current);
    };
  }, []);

  // GROUP3-ADMIN-FIX 2026-11-28 — profile dropdown (My Dashboard + Logout):
  // "Admin" sirf yahin ek dafa role line me aata hai; alag dashboard link
  // aur alag Logout button hata diye gaye hain.
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileRoleLabel =
    user?.role === 'admin'
      ? 'Administrator'
      : user?.role === 'subadmin'
        ? 'Sub Admin'
        : user?.role === 'supplier'
          ? 'Supplier'
          : 'Shopkeeper';
  const profileName = user?.businessName || user?.name || profileRoleLabel;
  const profileAvatar = (user as { avatar?: string } | null)?.avatar || '';

  // Close the profile dropdown on outside click or Escape.
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [profileOpen]);
  const [searchQuery, setSearchQuery] = useState('');
  // FIX (Batch 03) — cart badge reactive nahi tha: cartCount() render ke
  // waqt localStorage parhta tha, is liye cart add karne pe badge tab tak
  // update nahi hota tha jab tak Navbar kisi aur wajah se re-render na ho.
  // Ab count state me hai aur cart.ts ke 'asan-cart-updated' event + dusre
  // tab ke 'storage' event pe update hota hai. SSR-safe hai: pehle render
  // pe 0, mount ke baad asal count.
  const [cartItemCount, setCartItemCount] = useState(0);

  useEffect(() => {
    const updateCount = () => setCartItemCount(cartCount());
    updateCount();
    window.addEventListener(CART_UPDATED_EVENT, updateCount);
    window.addEventListener('storage', updateCount);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, []);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);

  // FIX (Batch 03) — sub-admin ka Dashboard link /shopkeeper/dashboard pe
  // jata tha aur wahan AuthGuard usko bounce kar deta tha. Sub-admin ka
  // dashboard /admin/users hai.
  const userHome =
    user?.role === 'admin'
      ? '/admin/dashboard'
      : user?.role === 'supplier'
        ? '/supplier/dashboard'
        : user?.role === 'subadmin'
          ? '/admin/users'
          : '/shopkeeper/dashboard';

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Marketplace', href: '/marketplace' },
    { name: 'About Us', href: '/about' },
    { name: 'Contact Us', href: '/contact' },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/marketplace?search=${encodeURIComponent(searchQuery.trim())}`);
    closeSearch();
  };

  // Closes the mobile navigation panel on outside click or Escape. The
  // hamburger button is excluded so its own toggle click isn't swallowed.
  useEffect(() => {
    if (!menuRendered) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePanel = mobileMenuRef.current?.contains(target) ?? false;
      const insideButton = mobileButtonRef.current?.contains(target) ?? false;
      if (!insidePanel && !insideButton) closeMenu();
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
    // closeMenu only reads refs + stable setters, so depending on it
    // would re-subscribe on every render for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuRendered]);

  // FIX (Batch 03) — search modal pe "ESC to close" likha tha, lekin Escape
  // ka koi handler tha hi nahi — sirf overlay click se band hota tha. Ab
  // Escape dabane se search modal waqai band ho jata hai.
  useEffect(() => {
    if (!searchRendered) return;
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
    // closeSearch only reads refs + stable setters, so depending on it
    // would re-subscribe on every render for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRendered]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur-md transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <Image
              src="/logo.png"
              alt="Asan Tijarat logo"
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl object-contain shadow-md shadow-asan-dark/20 group-hover:scale-105 transition"
            />
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-none text-asan-dark dark:text-asan-accent-light tracking-tight">
                Asan Tijarat
              </span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-400 tracking-wide uppercase">
                B2B Marketplace PK
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={cn(
                    // FIX (Round-4 Batch 11, M6) — nav links were 36px tall
                    // (py-2 + text-sm). py-3 makes each link a full 44px
                    // tap target; the h-16 header has room, look unchanged.
                    "px-3.5 py-3 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "text-asan-dark font-semibold bg-asan-accent-light dark:bg-asan-dark/50 dark:text-asan-accent-light"
                      : "text-slate-600 hover:text-asan-dark hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                  )}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* FIX (audit #11) — icon buttons were 36x36 px (p-2 + 20px icon),
                below the 44x44 px touch minimum. min-h/min-w 44px + flex
                centring keeps the icon centred; look unchanged. */}
            <button
              type="button"
              aria-label="Search products"
              onClick={openSearch}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
              title="Search products"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* FIX (Batch 03) — guest Sign In / Get Started pehle `loading`
                khatam hone ka wait karte thay (loading tab tak rehta hai jab
                tak Render backend se session check na ho jaye, aur cold start
                pe usme der lagti hai). Ab ye foran dikhte hain jab user nahi
                hai — bilkul mobile menu ki tarah. Logged-in branch waisa hi
                hai jaisa tha. */}
            {!user && (
              <>
                <Link
                  href="/signin"
                  className="hidden sm:inline-flex px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                >
                  Sign In
                </Link>

                <Link
                  href="/getstarted"
                  className="hidden sm:inline-flex px-4 py-3 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md shadow-asan-accent-hover/20 transition"
                >
                  Get Started
                </Link>
              </>
            )}

            {loading ? null : user && (
              <>
                {user.role === 'shopkeeper' && (
                  <Link
                    href="/shopkeeper/cart"
                    className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                    title="Shopping Cart"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    {cartItemCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-asan-accent text-xs font-bold text-white flex items-center justify-center">
                        {cartItemCount}
                      </span>
                    )}
                  </Link>
                )}

                <div ref={profileRef} className="hidden sm:block relative">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    onClick={() => setProfileOpen((o) => !o)}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    {profileAvatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={profileAvatar}
                        alt={profileName}
                        className="w-9 h-9 rounded-full object-cover border border-asan-accent shrink-0"
                      />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-asan-accent flex items-center justify-center font-bold text-sm text-white shrink-0">
                        {profileName[0]}
                      </span>
                    )}
                    <span className="flex flex-col items-start leading-tight min-w-0">
                      <span className="text-sm font-semibold text-asan-dark dark:text-white truncate max-w-32">
                        {profileName}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {profileRoleLabel}
                      </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-50">
                      <Link
                        href={userHome}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-asan-accent-light dark:hover:bg-slate-800 transition"
                      >
                        <LayoutDashboard className="w-4 h-4 shrink-0 text-asan-accent" />
                        My Dashboard
                      </Link>
                      <button
                        type="button"
                        onClick={() => { setProfileOpen(false); logout(); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              ref={mobileButtonRef}
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={menuRendered}
              onClick={toggleMenu}
              className="lg:hidden flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              {menuRendered ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation — CENTERED POPUP (mobile fix 2026-11-28).
          Pehle ye top se full-width sheet thi (inset-x-0 top-16); ab
          screen ke centre me ~320px ka popup hai, rounded corners +
          shadow + dimmed backdrop ke saath — search modal wali pattern.
          Band hota hai: backdrop click, Escape (effect upar), ya kisi
          link pe click. Links wahi hain jo pehle thay. */}
      {menuRendered && (
        <div className="fixed inset-0 z-[1050] lg:hidden flex items-center justify-center p-4">
          <div
            onClick={closeMenu}
            className={cn(
              'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-[180ms] animate-asan-fade-in',
              menuClosing ? 'opacity-0' : 'opacity-100'
            )}
          />
          <nav
            ref={mobileMenuRef}
            aria-label="Mobile navigation"
            className={cn(
              'relative w-full max-w-[320px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl transition-all duration-[180ms] animate-asan-pop-in',
              menuClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            )}
          >
              <div className="px-4 py-4 space-y-1">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      onClick={closeMenu}
                      className={cn(
                        'block px-4 py-3 rounded-xl text-sm font-semibold transition-all',
                        isActive
                          ? 'text-asan-dark font-bold bg-asan-accent-light dark:bg-asan-dark/50 dark:text-asan-accent-light'
                          : 'text-slate-600 hover:text-asan-dark hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                      )}
                    >
                      {link.name}
                    </Link>
                  );
                })}

                <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  {!user && (
                    <>
                      <Link
                        href="/signin"
                        onClick={closeMenu}
                        className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/getstarted"
                        onClick={closeMenu}
                        className="block px-4 py-3 rounded-xl text-sm font-bold text-center bg-asan-accent hover:bg-asan-accent-hover text-white shadow-sm transition"
                      >
                        Get Started
                      </Link>
                    </>
                  )}

                  {loading ? null : user && (
                    <>
                      {user.role === 'shopkeeper' && (
                        <Link
                          href="/shopkeeper/cart"
                          onClick={closeMenu}
                          className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                        >
                          🛒 My Cart ({cartItemCount})
                        </Link>
                      )}
                      <Link
                        href={userHome}
                        onClick={closeMenu}
                        className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark bg-asan-accent-light dark:bg-asan-dark/50 dark:text-asan-accent-light transition"
                      >
                        My Dashboard
                      </Link>
                      <button
                        type="button"
                        onClick={logout}
                        className="w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50"
                      >
                        Logout
                      </button>
                    </>
                  )}
                </div>
              </div>
          </nav>
        </div>
      )}

      {/* Global Search Modal Overlay */}
      {searchRendered && (
        <div className="fixed inset-0 z-[1100] flex items-start justify-center pt-20 px-4">
          <div
            onClick={closeSearch}
            className={cn(
              'fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-asan-fade-in',
              searchClosing ? 'opacity-0' : 'opacity-100'
            )}
          />

          <div
            className={cn(
              'relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-10 transition-all duration-300 animate-asan-pop-in',
              searchClosing ? 'opacity-0 -translate-y-5 scale-95' : 'opacity-100 translate-y-0 scale-100'
            )}
          >
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
                <Search className="w-5 h-5 text-slate-400" />
                {/* SEARCH-NAME-ONLY 2026-11-28 — search sirf product name se. */}
                <input
                  type="text"
                  aria-label="Search product name"
                  autoFocus
                  placeholder="Search product name (e.g. Basmati Rice)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm focus:outline-none text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg bg-asan-accent text-white text-sm font-semibold shrink-0"
                >
                  Search
                </button>
              </form>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                <span>Popular: Super Kernel Basmati, Faisalabad Cotton, Red Chilli</span>
                <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border text-xs">ESC to close</kbd>
              </div>
          </div>
        </div>
      )}
    </>
  );
}