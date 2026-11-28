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
  Mail,
  UserCog,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';

// GROUP3-ADMIN-FIX 2026-11-28 — top label pill + bottom user card / Sign Out
// hata diye (logout + profile ab sirf navbar me hain); sidebar kabhi
// scroll nahi karta (overflow-hidden).
export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isAdmin = pathname.startsWith('/admin');
  const isSupplier = pathname.startsWith('/supplier');

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
    // Batch 05 — dispute queue + decisions.
    { name: 'Disputes', href: '/admin/disputes', icon: Scale },
    { name: 'Security', href: '/admin/security', icon: ShieldCheck },
    { name: 'Messages', href: '/admin/messages', icon: Mail },
    { name: 'Sub-Admins', href: '/admin/subadmins', icon: UserCog },
  ];

  // Sub-admins see Users & KYC + Orders + Messages + Disputes (full access
  // on these — Batch 02 decision; AdminGate allows these paths).
  const subadminNav = [
    { name: 'Users & KYC', href: '/admin/users', icon: Users },
    { name: 'Orders', href: '/admin/orders', icon: Package },
    { name: 'Messages', href: '/admin/messages', icon: Mail },
    // Batch 05 — sub-admins have full access (Batch 02 decision).
    { name: 'Disputes', href: '/admin/disputes', icon: Scale },
  ];

  const isSubadmin = user?.role === 'subadmin';
  const links = isSubadmin ? subadminNav : isAdmin ? adminNav : isSupplier ? supplierNav : shopkeeperNav;

  return (
    // className (optional) — sirf MobileSidebar ke centered popup se
    // milta hai: wahan sidebar fixed/sticky nahi, full-width + auto
    // height + rounded hoti hai. cn() twMerge hai, to override classes
    // default wali jeet jati hain. Bina className ke desktop bilkul
    // waisa hi hai jaisa tha (fixed, no scroll).
    <aside className={cn("w-64 shrink-0 h-[calc(100vh-4rem)] sticky top-16 bg-white text-asan-dark flex flex-col justify-between p-4 shadow-sm border-r border-asan-border select-none overflow-hidden", className)}>
      <div>
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
                    ? "bg-asan-accent text-white shadow-md shadow-asan-accent/30 font-semibold"
                    : "text-asan-text-light hover:bg-asan-accent-light hover:text-asan-dark"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
