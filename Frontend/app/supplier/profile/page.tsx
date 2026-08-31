"use client";

import React from 'react';
import { getSupplierBusinessProfile } from '@/services/authService';
import { useProducts } from '@/context/ProductContext';
import { ProductCard } from '@/components/ProductCard';
import { ShieldCheck, MapPin, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SupplierProfilePage() {
  const { products } = useProducts();
  // Public business record resolved through the auth service layer.
  const supplier = getSupplierBusinessProfile();
  const supplierProducts = supplier
    ? products.filter((product) => product.supplierId === supplier.id)
    : [];

  if (!supplier) {
    return (
      <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400">
        Business profile is unavailable right now. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          Business Profile
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Public verified credentials, certifications, and active catalog
        </p>
      </div>

      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <img
              src={supplier.avatar}
              alt={supplier.name}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {supplier.businessName}
                </h2>
                <Badge variant="verified">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Owner: {supplier.name} • {supplier.category}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {supplier.city}, Pakistan
                </span>
                <span>•</span>
                <span className="font-mono text-emerald-600 font-bold">NTN: {supplier.ntn}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-center sm:text-right">
            <p className="text-2xl font-extrabold text-asan-dark dark:text-emerald-300">4.9 ★</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">98% positive buyer feedback</p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-asan-accent shrink-0" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white">FBR Active Taxpayer</p>
              <p className="text-[10px] text-slate-400">Verified NTN 1234567-8</p>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-asan-accent shrink-0" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white">Chamber of Commerce</p>
              <p className="text-[10px] text-slate-400">LCCI Member #4982</p>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-asan-accent shrink-0" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white">Escrow Guaranteed</p>
              <p className="text-[10px] text-slate-400">0 dispute defaults</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Active Wholesale Products from this Supplier
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {supplierProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
