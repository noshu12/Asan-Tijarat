"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Menu, X, LayoutDashboard, ShieldCheck, ShoppingCart, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthProvider';
import { cartCount, CART_UPDATED_EVENT } from '@/lib/cart';

/**
 * Session-aware navigation — guests see Sign In / Get Started; logged-in users
 * see a role-appropriate dashboard link (admin → Admin Panel) plus Sign Out.
 */
export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const { user, loading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
    setSearchOpen(false);
  };

  // Closes the mobile navigation panel on outside click or Escape. The
  // hamburger button is excluded so its own toggle click isn't swallowed.
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePanel = mobileMenuRef.current?.contains(target) ?? false;
      const insideButton = mobileButtonRef.current?.contains(target) ?? false;
      if (!insidePanel && !insideButton) setMobileMenuOpen(false);
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [mobileMenuOpen]);

  // FIX (Batch 03) — search modal pe "ESC to close" likha tha, lekin Escape
  // ka koi handler tha hi nahi — sirf overlay click se band hota tha. Ab
  // Escape dabane se search modal waqai band ho jata hai.
  useEffect(() => {
    if (!searchOpen) return;
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [searchOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur-md transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src="/logo.png"
              alt="Asan Tijarat logo"
              className="w-10 h-10 rounded-xl object-contain shadow-md shadow-asan-dark/20 group-hover:scale-105 transition"
            />
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-none text-asan-dark dark:text-asan-accent-light tracking-tight">
                Asan Tijarat
              </span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-400 tracking-wide uppercase">
                B2B Marketplace PK
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={cn(
                    "px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
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
            <button
              type="button"
              aria-label="Search products"
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
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
                  className="hidden sm:inline-flex px-4 py-2 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                >
                  Sign In
                </Link>

                <Link
                  href="/getstarted"
                  className="hidden sm:inline-flex px-4 py-2 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md shadow-asan-accent-hover/20 transition"
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
                    className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                    title="Shopping Cart"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    {cartItemCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-asan-accent text-[10px] font-bold text-white flex items-center justify-center">
                        {cartItemCount}
                      </span>
                    )}
                  </Link>
                )}

                <Link
                  href={userHome}
                  className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                >
                  {user.role === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
                  {user.role === 'admin' ? 'Admin' : user.role === 'supplier' ? 'Supplier Portal' : 'Dashboard'}
                </Link>

                <button
                  type="button"
                  onClick={logout}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                >
                  <LogOut className="w-4 h-4 shrink-0" /> Logout
                </button>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              ref={mobileButtonRef}
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation panel */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-[1040] md:hidden bg-black/30 backdrop-blur-sm"
            />
            <motion.nav
              ref={mobileMenuRef}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              aria-label="Mobile navigation"
              className="fixed inset-x-0 top-16 z-[1050] md:hidden border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto"
            >
              <div className="px-4 py-4 space-y-1">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
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
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/getstarted"
                        onClick={() => setMobileMenuOpen(false)}
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
                          onClick={() => setMobileMenuOpen(false)}
                          className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark hover:bg-asan-accent-light dark:text-asan-accent-light dark:hover:bg-slate-800 transition"
                        >
                          🛒 My Cart ({cartItemCount})
                        </Link>
                      )}
                      <Link
                        href={userHome}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark bg-asan-accent-light dark:bg-asan-dark/50 dark:text-asan-accent-light transition"
                      >
                        {user.role === 'admin' ? 'Admin Panel' : user.role === 'supplier' ? 'Supplier Portal' : 'My Dashboard'}
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
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Global Search Modal Overlay */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-[1100] flex items-start justify-center pt-20 px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-10"
            >
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search products, suppliers, or cities"
                  autoFocus
                  placeholder="Search products, suppliers, cities (e.g. Basmati Rice, Faisalabad)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm focus:outline-none text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-asan-accent text-white text-xs font-semibold shrink-0"
                >
                  Search
                </button>
              </form>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                <span>Popular: Super Kernel Basmati, Faisalabad Cotton, Red Chilli</span>
                <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border text-[10px]">ESC to close</kbd>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}