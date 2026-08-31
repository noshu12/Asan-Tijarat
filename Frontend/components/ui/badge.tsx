import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'active' | 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'warning' | 'error' | 'outline' | 'verified';
}

export function Badge({ className, variant = 'active', children, ...props }: BadgeProps) {
  const variants = {
    active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    shipped: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800",
    outline: "border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300",
    verified: "bg-emerald-600 text-white font-semibold"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
        variants[variant],
        className
      )}
      {...props}
    >
      {variant === 'verified' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      {children}
    </span>
  );
}