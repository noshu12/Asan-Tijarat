"use client";

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Search, Bell } from 'lucide-react';

interface PortalHeaderProps {
  title: string;
  subtitle?: string;
}

export function PortalHeader({ title, subtitle }: PortalHeaderProps) {
  const { user } = useAuth();

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
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search here..."
            className="pl-9 pr-4 py-2 w-48 sm:w-64 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>

        <div className="relative">
          <button className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 transition">
            <Bell className="w-4 h-4" />
          </button>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-asan-error text-[10px] font-bold text-white flex items-center justify-center">
            2
          </span>
        </div>
      </div>
    </div>
  );
}