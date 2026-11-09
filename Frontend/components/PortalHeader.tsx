"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import type { NotificationItem } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface PortalHeaderProps {
  title: string;
  subtitle?: string;
}

export function PortalHeader({ title, subtitle }: PortalHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();
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

  // Batch 05 — real notifications. The bell used to show a hardcoded badge
  // "2" and was disabled as a placeholder; now it reads the unread count +
  // list from /api/notifications and marks items read on open.
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    try {
      const res = await api.notifications.list({ limit: 20 });
      setNotifications(res.notifications ?? []);
      setUnreadCount(res.unreadCount ?? 0);
    } catch {
      /* offline or expired token — the bell just stays empty */
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openNotification = async (n: NotificationItem) => {
    setBellOpen(false);
    if (!n.read) {
      try {
        await api.notifications.markRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* marking read is best-effort — the link still opens */
      }
    }
    if (n.link) router.push(n.link);
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnreadCount(0);
    } catch {
      /* best-effort */
    }
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
          <button
            type="button"
            onClick={() => { setBellOpen((o) => !o); if (!bellOpen) void loadNotifications(); }}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            title="Notifications"
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Notifications</p>
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-xs text-slate-500 text-center">No notifications yet.</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openNotification(n)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition ${n.read ? '' : 'bg-emerald-50/60 dark:bg-emerald-950/30'}`}
                      >
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{n.title}</p>
                        {n.message && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">{formatDate(n.createdAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
