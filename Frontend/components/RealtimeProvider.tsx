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
 * - STOPS retrying after 5 consecutive failed connects (Batch 20,
 *   audit (c)-7) and shows a "close another tab" banner instead of
 *   looping forever: the 6th tab gets a 429 the EventSource can never
 *   see, so without this the tab retried with backoff indefinitely
 *   and only ever showed `reconnecting`;
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
// Batch 20 (audit (c)-7) — give up after this many consecutive failed
// connects with no successful open in between. Five failures at the
// 1s → 2s → 4s → 8s → 16s backoff is ~31 s of trying before the banner
// appears — long enough that a brief network blip recovers on its own,
// short enough that a 6th tab is not left retrying forever.
//
// Why a failure COUNT, not a probe fetch: EventSource never exposes the
// HTTP status, so the "precise" fix would be a fetch() probe of the
// stream URL — but the backend counts EVERY stream connect against its
// 10-connects-per-minute throttle (realtime.routes.js: isThrottled runs
// before the tab-cap check), so each probe would itself consume one of
// those 10 and could trip TOO_MANY_STREAMS on its own; a 200 probe
// would also briefly hold one of the 5 connection slots. The count
// cannot tell a 429 apart from a dead network, so the banner says both
// ("too many tabs open, or reconnected too often") and offers Retry.
const MAX_CONSECUTIVE_FAILURES = 5;

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
  // Batch 20 (audit (c)-7) — consecutive failed connects since the last
  // successful open; at MAX_CONSECUTIVE_FAILURES the provider gives up
  // (status 'too_many_tabs') instead of scheduling another retry.
  // gaveUpRef is the plain-boolean mirror the visibility handler reads
  // (it cannot read the state value without re-subscribing).
  const consecutiveFailuresRef = useRef(0);
  const gaveUpRef = useRef(false);
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
    // Batch 20 (audit (c)-7) — give up instead of retrying forever.
    // A 6th tab's EventSource errors immediately on every attempt (the
    // 429 is invisible to it), so without this the tab loops with
    // backoff for as long as it stays open. After the give-up only an
    // explicit Retry (banner button) or a fresh 'online' event starts
    // connecting again — merely showing a hidden tab does not.
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
      gaveUpRef.current = true;
      clearTimer();
      setStatus('too_many_tabs');
      return;
    }
    setStatus((s) => (s === 'live' ? 'reconnecting' : s));
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** attemptRef.current, MAX_BACKOFF_MS);
    attemptRef.current += 1;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      connectRef.current();
    }, delay);
  }, [clearTimer]);

  // Batch 20 (audit (c)-7) — the give-up banner's Retry button (and the
  // 'online' handler below): a deliberate fresh attempt, so the failure
  // count and the gave-up flag both reset first.
  const retryConnection = useCallback(() => {
    if (!userIdRef.current) return;
    gaveUpRef.current = false;
    consecutiveFailuresRef.current = 0;
    attemptRef.current = 0;
    connectRef.current();
  }, []);

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
      consecutiveFailuresRef.current = 0;
      gaveUpRef.current = false;
      const wasReconnect = everConnectedRef.current;
      everConnectedRef.current = true;
      setStatus('live');
      // Reconnected after a drop — pages refetch what they may have missed.
      if (wasReconnect) setSyncKey((k) => k + 1);
    };
    // FIX — named SSE events (the backend sends `event: <type>`) do NOT
    // fire `onmessage` — that only fires for unnamed frames. Every live
    // event was silently dropped because no listener existed for its
    // name. Each of the 26 types (Batch 24: 17 + 9 new) gets its own
    // listener here, driven by ALL_REALTIME_EVENT_TYPES so a future
    // type is wired the moment it is added to the list.
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
      // Batch 20 (audit (c)-7) — a fresh sign-in is a fresh situation,
      // not a continuation of the old tab's failure streak.
      consecutiveFailuresRef.current = 0;
      gaveUpRef.current = false;
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
      // Batch 20 (audit (c)-7) — the network coming back is a new
      // situation, so it revives a gave-up connection too.
      retryConnection();
    };
    const onOffline = () => {
      disconnect();
      setStatus('offline');
    };
    const onVisibility = () => {
      if (document.hidden) {
        disconnect();
      } else if (userIdRef.current) {
        // Batch 20 (audit (c)-7) — do NOT revive a gave-up connection
        // just because the tab was shown again: that would restart the
        // retry loop the give-up stopped. The user retries from the
        // banner (or by coming back online).
        if (gaveUpRef.current) return;
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
  }, [disconnect, retryConnection]);

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
      {/* Batch 20 (audit (c)-7) — give-up state. Shown only after 5
          consecutive failed connects: live updates are paused in this
          tab, and the banner says why + what to do. Bottom-LEFT so it
          never covers the bottom-right toast stack. The lists below
          still work — they just stop updating live until Retry. */}
      {status === 'too_many_tabs' && (
        <div
          className="fixed bottom-4 left-4 z-[100] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-amber-200 bg-amber-50 shadow-xl p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-xs font-bold text-amber-900">Live updates paused</p>
          <p className="text-xs text-amber-800 mt-1">
            This account already has 5 live tabs open, or the connection was retried too many times.
            Close another Asan Tijarat tab, then tap Retry — your orders and notifications below are still up to date as of the last load.
          </p>
          <button
            type="button"
            onClick={retryConnection}
            className="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
          >
            Retry connection
          </button>
        </div>
      )}
    </RealtimeContext.Provider>
  );
}
