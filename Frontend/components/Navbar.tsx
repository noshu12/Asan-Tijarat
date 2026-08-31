"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import {
  Store,
  Search,
  ShoppingCart,
  Menu,
  X,
  User,
  LayoutDashboard,
  LogOut,
  ChevronDown,
  Terminal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isAuthenticated, logout } = useAuth();
  const { totalItemCount } = useCart();
  const { showToast } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);

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

  // Closes the profile dropdown on any outside click or Escape key press.
  useEffect(() => {
    if (!profileDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileDropdownOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [profileDropdownOpen]);

  // Closes the mobile navigation panel on outside click or Escape (same
  // interaction pattern as the profile dropdown above). The hamburger button
  // is excluded so its own toggle click isn't swallowed by mousedown.
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

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur-md transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src="/logo.png"
              alt="Asan Tijarat logo"
              className="w-10 h-10 rounded-xl object-contain shadow-md shadow-emerald-950/20 group-hover:scale-105 transition"
            />
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-none text-asan-dark dark:text-emerald-400 tracking-tight">
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
                      ? "text-asan-dark font-semibold bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "text-slate-600 hover:text-asan-dark hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
                  )}
                >
                  {link.name}
                </Link>
              );
            })}

            <Link
              href="/backend-logic"
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ml-2 border",
                pathname === '/backend-logic'
                  ? "bg-amber-500 text-white border-amber-600 shadow"
                  : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              )}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Backend Simulator</span>
            </Link>
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

            {/* Cart lives only for signed-in shopkeepers. */}
            {isAuthenticated && role !== 'supplier' && (
              <button
                type="button"
                aria-label="Shopkeeper Wholesale Cart"
                title="Shopkeeper Wholesale Cart"
                onClick={() => {
                  router.push('/shopkeeper/cart');
                }}
                className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-asan-accent text-[11px] font-bold text-white shadow-sm">
                    {totalItemCount}
                  </span>
                )}
              </button>
            )}

            {!isAuthenticated ? (
              <div className="hidden sm:flex items-center gap-2 ml-1">
                <Link
                  href="/signin"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-asan-dark hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-800 transition"
                >
                  Sign In
                </Link>
                <Link
                  href="/getstarted"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-asan-accent hover:bg-asan-accent-hover text-white shadow-sm shadow-emerald-700/20 transition"
                >
                  Get Started
                </Link>
              </div>
            ) : (
              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  aria-expanded={profileDropdownOpen}
                  aria-haspopup="menu"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <img
                    src={user?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}
                    alt={user?.name || 'User'}
                    className="w-7 h-7 rounded-full object-cover border border-emerald-500"
                  />
                  <div className="hidden md:flex flex-col text-left">
                    <span className="text-xs font-bold text-slate-800 dark:text-white leading-tight">
                      {user?.name.split(' ')[0]}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 capitalize">
                      {role}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                <AnimatePresence>
                  {profileDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50"
                    >
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                        <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 uppercase">
                          {role} account
                        </span>
                      </div>

                      <div className="py-1">
                        {role === 'shopkeeper' && (
                          <Link
                            href="/shopkeeper/dashboard"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                          >
                            <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                            Shopkeeper Portal
                          </Link>
                        )}

                        {role === 'supplier' && (
                          <Link
                            href="/supplier/dashboard"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                          >
                            <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                            Supplier Portal
                          </Link>
                        )}
                      </div>

                      <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                        <button
                          onClick={() => { logout(); setProfileDropdownOpen(false); showToast('Logged out successfully'); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800 transition"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation panel — mirrors the desktop nav for the current
          auth state; rendered only below the md breakpoint. */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 top-16 z-[1040] bg-black/40 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
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
                          ? 'text-asan-dark font-bold bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'text-slate-600 hover:text-asan-dark hover:bg-slate-50 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                      )}
                    >
                      {link.name}
                    </Link>
                  );
                })}

                <Link
                  href="/backend-logic"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'mt-2 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold border transition',
                    pathname === '/backend-logic'
                      ? 'bg-amber-500 text-white border-amber-600 shadow'
                      : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                  )}
                >
                  <Terminal className="w-4 h-4" />
                  <span>Backend Simulator</span>
                </Link>

                <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  {!isAuthenticated ? (
                    <>
                      <Link
                        href="/signin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="block px-4 py-3 rounded-xl text-sm font-semibold text-asan-dark hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-800 transition"
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
                  ) : (
                    <>
                      {role === 'shopkeeper' && (
                        <Link
                          href="/shopkeeper/dashboard"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                        >
                          <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                          Shopkeeper Portal
                        </Link>
                      )}
                      {role === 'supplier' && (
                        <Link
                          href="/supplier/dashboard"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                        >
                          <LayoutDashboard className="w-4 h-4 text-emerald-600" />
                          Supplier Portal
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => { logout(); setMobileMenuOpen(false); showToast('Logged out successfully'); }}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
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
