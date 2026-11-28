import React from 'react';
import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  icon?: LucideIcon;
  color?: string;
  // GROUP3-ADMIN-FIX 2026-11-28 — icon optional hai; changeSuffix '' ho to
  // "vs last month" chhup jata hai; size 'lg' bara card deta hai.
  changeSuffix?: string;
  size?: 'md' | 'lg';
  className?: string;
  // Optional content rendered below the title/value row (e.g. the
  // Trade Volume chart on the admin dashboard). Cards without it
  // render exactly as before.
  children?: React.ReactNode;
  // Optional plain sub-line under the number (e.g. the Total Users
  // breakdown or "Latest on <date>") — neutral muted text, not a pill.
  // Additive only: existing callers pass nothing and render as before.
  subline?: string;
}

export function StatsCard({ title, value, change, isPositive = true, icon: Icon, changeSuffix = 'vs last month', size = 'md', className, children, subline }: StatsCardProps) {
  return (
    <Card className={cn("hover:border-asan-accent/40 transition", size === 'lg' ? 'p-6' : 'p-5', className)}>
      <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className={cn("font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight break-words", size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>
          {value}
        </p>
        {subline && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate" title={subline}>
            {subline}
          </p>
        )}
        {change && (
          <div className="mt-2 flex items-center gap-1">
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-md",
                isPositive
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              )}
            >
              {change}
            </span>
            {changeSuffix ? <span className="text-xs text-slate-400">{changeSuffix}</span> : null}
          </div>
        )}
      </div>

      {Icon && (
        <div className="p-3 rounded-2xl bg-asan-accent-light dark:bg-asan-dark/60 text-asan-dark dark:text-asan-accent-light shrink-0">
          <Icon className="w-6 h-6" />
        </div>
      )}
      </div>

      {children}
    </Card>
  );
}