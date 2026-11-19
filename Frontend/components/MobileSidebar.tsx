"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';

// FIX (New audit #19) — the slide-in drawer + backdrop fade were
// framer-motion (AnimatePresence + motion.div/aside). Same motion in plain
// CSS now: the entrance is a keyframe (animate-asan-drawer-in /
// animate-asan-fade-in, globals.css) and the exit is a `closing` state
// that flips transition classes to the hidden state; the drawer stays
// mounted for CLOSE_MS so the slide-out can play, exactly like
// AnimatePresence's exit did. Timing kept: 250 ms slide, ease-out.
// The drawer state is local to this component, so the exit lifecycle is
// fully contained here — nothing else in the app depends on it.
const CLOSE_MS = 250;

/**
 * 📱 MOBILE SIDEBAR — slide-in navigation drawer for portal pages (< md).
 *
 * The static <Sidebar /> is hidden below the md breakpoint, which would leave
 * dashboard users with no navigation at all on phones. This renders a
 * floating trigger button (bottom-left) that opens a light slide-in drawer
 * containing the same <Sidebar />. The drawer closes on: overlay tap,
 * navigating to a link, or pressing Escape. Hidden entirely on md+ where
 * the static sidebar is visible.
 */
export function MobileSidebar() {
  // `rendered` keeps the drawer mounted while the slide-out transition
  // plays; `closing` flips the transition classes to the hidden state.
  const [rendered, setRendered] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const openDrawer = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setClosing(false);
    setRendered(true);
  };

  const closeDrawer = () => {
    if (!rendered || closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
      closeTimer.current = null;
    }, CLOSE_MS);
  };

  // Never leave a pending close timer behind on unmount.
  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  // Close on Escape + lock background scroll while the drawer is open
  // (including the slide-out, so the page never scrolls under it).
  useEffect(() => {
    if (!rendered) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', handleEscapeKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = previousOverflow;
    };
    // closeDrawer only reads refs + stable setters, so depending on it
    // would re-subscribe on every render for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

  return (
    <>
      {/* Floating trigger — mobile only */}
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={openDrawer}
        className="fixed bottom-5 left-5 z-[900] md:hidden w-14 h-14 rounded-full bg-asan-accent text-white shadow-xl shadow-asan-dark/40 flex items-center justify-center active:scale-95 transition"
      >
        <Menu className="w-6 h-6" />
      </button>

      {rendered && (
        <div className="fixed inset-0 z-[1000] md:hidden">
          {/* Dimmed backdrop — tap to dismiss */}
          <div
            onClick={closeDrawer}
            className={cn(
              'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-asan-fade-in',
              closing ? 'opacity-0' : 'opacity-100'
            )}
          />

          {/* Slide-in panel (starts below the sticky navbar) */}
          <aside
            className={cn(
              'absolute top-16 bottom-0 left-0 w-72 max-w-[82vw] shadow-2xl transition-transform duration-[250ms] ease-out animate-asan-drawer-in',
              closing ? '-translate-x-full' : 'translate-x-0'
            )}
          >
            <Sidebar onNavigate={closeDrawer} />
          </aside>
        </div>
      )}
    </>
  );
}
