import React from 'react';
import { Card } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  icon: LucideIcon;
  color?: string;
}

export function StatsCard({ title, value, change, isPositive = true, icon: Icon }: StatsCardProps) {
  return (
    <Card className="flex items-start justify-between p-5 hover:border-emerald-500/40 transition">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1 tracking-tight">
          {value}
        </p>
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
            <span className="text-[11px] text-slate-400">vs last month</span>
          </div>
        )}
      </div>

      <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-asan-dark dark:text-emerald-300">
        <Icon className="w-6 h-6" />
      </div>
    </Card>
  );
}