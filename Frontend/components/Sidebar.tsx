"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  PlusCircle,
  FolderOpen,
  User,
  Users,
  Boxes,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';
import { SignOutButton } from './SignOutButton';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  const isAdmin = pathname.startsWith('/admin');
  const isSupplier = pathname.startsWith('/supplier');
  const fallbackName = isAdmin ? 'Platform Admin' : isSupplier ? 'Ahmed Khan' : 'M. Hassan';
  const displayName = authLoading
    ? 'Loading…'
    : (user?.businessName || user?.name || fallbackName);
  const displayRole = authLoading
    ? '…'
    : (user?.role || (isAdmin ? 'admin' : isSupplier ? 'supplier' : 'shopkeeper'));
  const avatar = (user as { avatar?: string } | null)?.avatar || '';

  const shopkeeperNav = [
    { name: 'Dashboard', href: '/shopkeeper/dashboard', icon: LayoutDashboard },
    { name: 'Cart', href: '/shopkeeper/cart', icon: ShoppingCart },
    { name: 'My Orders', href: '/shopkeeper/orders', icon: Package },
    { name: 'Analytics', href: '/shopkeeper/analytics', icon: BarChart3 },
    { name: 'Profile', href: '/shopkeeper/profile', icon: User },
    { name: 'Settings', href: '/shopkeeper/settings', icon: Settings },
  ];

  const supplierNav = [
    { name: 'Dashboard', href: '/supplier/dashboard', icon: LayoutDashboard },
    { name: 'Add Product', href: '/supplier/add-product', icon: PlusCircle },
    { name: 'My Products', href: '/supplier/my-products', icon: FolderOpen },
    { name: 'Orders', href: '/supplier/orders', icon: Package },
    { name: 'Analytics', href: '/supplier/analytics', icon: BarChart3 },
    { name: 'Profile', href: '/supplier/profile', icon: User },
    { name: 'Settings', href: '/supplier/settings', icon: Settings },
  ];

  const adminNav = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Users & KYC', href: '/admin/users', icon: Users },
    { name: 'Products', href: '/admin/products', icon: Boxes },
    { name: 'Orders', href: '/admin/orders', icon: Package },
  ];

  const links = isAdmin ? adminNav : isSupplier ? supplierNav : shopkeeperNav;

  return (
    <aside className="w-64 shrink-0 h-[calc(100vh-4rem)] sticky top-16 bg-asan-dark text-white flex flex-col justify-between p-4 shadow-xl select-none overflow-y-auto">
      <div>
        <div className="px-3 py-2 mb-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-asan-accent animate-pulse" />
            <span className="text-xs font-semibold tracking-wide uppercase text-emerald-300">
              {isAdmin ? 'Admin Panel' : isSupplier ? 'Supplier Portal' : 'Shopkeeper Portal'}
            </span>
          </div>
        </div>

        <nav className="space-y-1.5">
          {links.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-asan-accent text-white shadow-md shadow-emerald-900/30 font-semibold"
                    : "text-emerald-100/80 hover:bg-asan-mid hover:text-white"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="pt-4 mt-6 border-t border-white/10 shrink-0">
        <div className="flex items-center px-2 py-2 rounded-xl bg-black/20">
          <div className="flex items-center gap-2.5 min-w-0">
            {avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatar}
                alt={displayName}
                className="w-9 h-9 rounded-full object-cover border border-emerald-400 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-700/60 border border-emerald-400 flex items-center justify-center font-bold text-sm text-white shrink-0">
                {displayName[0]}
              </div>
            )}
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              <p className="text-[11px] text-emerald-300/80 truncate capitalize">
                {displayRole === 'admin' ? 'Administrator' : displayRole === 'supplier' ? 'Supplier' : 'Shopkeeper'}
              </p>
            </div>
          </div>
        </div>

        {/* Secure sign-out — available from every portal page (Admin, Supplier
            and Shopkeeper dashboards) and inside the mobile drawer. */}
        <SignOutButton
          onSignOut={onNavigate}
          className="w-full mt-3 px-3 py-2.5 bg-white/5 hover:bg-red-500/20 border border-white/10 text-red-200 hover:text-white"
        />
      </div>
    </aside>
  );
}
