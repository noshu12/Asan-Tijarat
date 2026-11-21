"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL, isAdminHost } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import {
  ALL_REALTIME_EVENT_TYPES,
  RealtimeContext,
} from '@/hooks/useRealtime';
import type {
  RealtimeEvent,
  RealtimeEventType,
  RealtimeHandler,
  RealtimeStatus,
} from '@/hooks/useRealtime';
import { RealtimeToasts } from './RealtimeToasts';
import type { ToastItem } from './RealtimeToasts';

/**
 * Batch 13 — the one SSE connection per tab.
 *
 * Mounted exactly once in app/layout.tsx, inside AuthProvider (it needs
 * the session to decide whether to connect). It:
 * - opens EventSource on the realtime stream only while a user is signed
 *   in, and closes it on sign-out;
 * - re-creates the EventSource with exponential backoff on error
 *   (1s, 2s, 4s, 8s, capped at 30s). Note: the browser ALSO auto-reconnects
 *   an EventSource natively — we close it ourselves on error so the
 *   backoff (and the visible Reconnecting state) is ours, not the
 *   browser's immediate retry loop;
 * - reconnects immediately on window 'online', closes on 'offline';
 * - closes while the tab is hidden (document.hidden) and reconnects +
 *   bumps `syncKey` when it becomes visible again, so pages refetch
 *   whatever they missed;
 * - bumps `syncKey` after any reconnect, for the same reason;
 * - fans every parsed event out to subscribed components and shows one
 *   toast per event id (deduped — a replayed event never toasts twice).
 *
 * The stream URL follows the same rule as lib/api.ts: on the admin host
 * the call goes through the same-origin /backend-api/* rewrite (so the
 * host-only admin cookie is sent); everywhere else the backend is called
 * directly at NEXT_PUBLIC_API_URL. There is NO /api/* rewrite in
 * next.config.mjs, so a same-origin '/api/realtime/stream' URL would 404
 * on the Next.js server — that is why this is not a plain '/api/...' URL.
 * CSP connect-src already allows the backend origin (next.config.mjs).
 */
const BACKOFF_BASE_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const TOAST_MS = 3000;
const MAX_TOASTS = 3;

function streamUrl(): string {
  return isAdminHost() ? '/backend-api/realtime/stream' : `${API_URL}/api/realtime/stream`;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>('offline');
  const [syncKey, setSyncKey] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const everConnectedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const handlersRef = useRef(
    new Set<{ types: Set<RealtimeEventType>; fn: RealtimeHandler }>(),
  );
  const seenToastIdsRef = useRef(new Set<string>());
  const toastTimersRef = useRef(new Map<string, number>());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTimer();
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, [clearTimer]);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dispatch = useCallback((event: RealtimeEvent) => {
    handlersRef.current.forEach((entry) => {
      if (!entry.types.has(event.type)) return;
      try {
        entry.fn(event);
      } catch {
        // One bad subscriber must not break the rest.
      }
    });

    // One event = one toast max, even if the backend replays it.
    if (seenToastIdsRef.current.has(event.id)) return;
    seenToastIdsRef.current.add(event.id);
    // The dedupe set only needs recent ids — clear it before it can grow
    // without bound on a long-lived tab.
    if (seenToastIdsRef.current.size > 500) seenToastIdsRef.current.clear();
    const toast: ToastItem = {
      id: event.id,
      title: event.title,
      message: event.message,
      link: event.link,
    };
    setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_MS);
    toastTimersRef.current.set(toast.id, timer);
  }, [dismissToast]);

  const subscribe = useCallback((types: RealtimeEventType[], handler: RealtimeHandler) => {
    const entry = { types: new Set(types), fn: handler };
    handlersRef.current.add(entry);
    return () => {
      handlersRef.current.delete(entry);
    };
  }, []);

  // connectRef breaks the connect <-> scheduleReconnect cycle: connect
  // calls scheduleReconnect on error, scheduleReconnect calls connect.
  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    // Logged out (or never logged in) — never reconnect on our own.
    if (!userIdRef.current) return;
    setStatus((s) => (s === 'live' ? 'reconnecting' : s));
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** attemptRef.current, MAX_BACKOFF_MS);
    attemptRef.current += 1;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      connectRef.current();
    }, delay);
  }, [clearTimer]);

  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !userIdRef.current) return;
    disconnect();
    setStatus((s) => (s === 'live' ? s : everConnectedRef.current ? 'reconnecting' : 'connecting'));
    let es: EventSource;
    try {
      es = new EventSource(streamUrl(), { withCredentials: true });
    } catch {
      scheduleReconnect();
      return;
    }
    esRef.current = es;
    es.onopen = () => {
      attemptRef.current = 0;
      const wasReconnect = everConnectedRef.current;
      everConnectedRef.current = true;
      setStatus('live');
      // Reconnected after a drop — pages refetch what they may have missed.
      if (wasReconnect) setSyncKey((k) => k + 1);
    };
    // FIX — named SSE events (the backend sends `event: <type>`) do NOT
    // fire `onmessage` — that only fires for unnamed frames. Every live
    // event was silently dropped because no listener existed for its
    // name. Each of the 17 types gets its own listener here.
    const onEvent = (e: Event) => {
      let data: RealtimeEvent | null = null;
      try {
        data = JSON.parse((e as MessageEvent).data) as RealtimeEvent;
      } catch {
        return; // Malformed frame — ignore it, never crash the stream.
      }
      if (!data || typeof data.id !== 'string' || typeof data.type !== 'string') return;
      dispatch(data);
    };
    for (const type of ALL_REALTIME_EVENT_TYPES) {
      es.addEventListener(type, onEvent);
    }
    es.onerror = () => {
      // Close + re-create with our own backoff (see header comment: the
      // browser would otherwise retry immediately, forever).
      es.close();
      if (esRef.current === es) esRef.current = null;
      scheduleReconnect();
    };
  }, [disconnect, dispatch, scheduleReconnect]);
  connectRef.current = connect;

  // Connect while signed in, disconnect on sign-out. The cleanup also runs
  // on unmount: EventSource.close() + every timer cleared.
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
    if (user) {
      attemptRef.current = 0;
      connectRef.current();
    } else {
      disconnect();
      everConnectedRef.current = false;
      setStatus('offline');
    }
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, disconnect]);

  // Wifi + tab visibility: 'online' reconnects immediately, 'offline'
  // closes, hiding the tab closes, showing it again reconnects (onopen
  // bumps syncKey, so pages refetch what was missed while hidden).
  useEffect(() => {
    const onOnline = () => {
      if (!userIdRef.current) return;
      attemptRef.current = 0;
      connectRef.current();
    };
    const onOffline = () => {
      disconnect();
      setStatus('offline');
    };
    const onVisibility = () => {
      if (document.hidden) {
        disconnect();
      } else if (userIdRef.current) {
        connectRef.current();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [disconnect]);

  // Toast timers must not outlive the provider.
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ status, syncKey, subscribe }),
    [status, syncKey, subscribe],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <RealtimeToasts toasts={toasts} onDismiss={dismissToast} />
    </RealtimeContext.Provider>
  );
}
