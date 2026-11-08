"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell } from 'lucide-react';

interface PortalHeaderProps {
  title: string;
  subtitle?: string;
}

export function PortalHeader({ title, subtitle }: PortalHeaderProps) {
  const router = useRouter();
  // FIX (Batch 03) — search box pehle decorative tha: na state thi, na
  // onChange, na submit — type karne se kuch hota hi nahi tha. Ab ye
  // marketplace search se wired hai: Enter ya search dabane pe
  // /marketplace?search=... pe le jata hai.
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/marketplace?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const today = new Date().toLocaleDateString('en-PK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-200/80 dark:border-slate-800">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          {title}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {subtitle || today}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search products"
            className="pl-9 pr-4 py-2 w-48 sm:w-64 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </form>

        <div className="relative">
          {/* FIX (Batch 03) — bell pe pehle hardcoded badge "2" tha, jabke
              asal me koi notification system hai hi nahi (Batch 05 me aayega).
              Badge hata diya hai: ab koi fake count nahi dikhega. Button
              abhi ke liye disabled hai, taake click karke khaali lage. */}
          <button
            type="button"
            disabled
            aria-label="Notifications — not available yet"
            title="Notifications coming soon"
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-400 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed transition"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}