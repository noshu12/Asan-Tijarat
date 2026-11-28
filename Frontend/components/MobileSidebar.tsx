"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';

// FIX (New audit #19) — the centered popup + backdrop fade were
// framer-motion (AnimatePresence + motion.div/aside). Same motion in plain
// CSS now: the entrance is a keyframe (animate-asan-pop-in /
// animate-asan-fade-in, globals.css) and the exit is a `closing` state
// that flips transition classes to the hidden state; the popup stays
// mounted for CLOSE_MS so the scale-out can play, exactly like
// AnimatePresence's exit did. Timing kept: 250 ms, ease-out.
// The popup state is local to this component, so the exit lifecycle is
// fully contained here — nothing else in the app depends on it.
// GROUP3-ADMIN-FIX 2026-11-28 — floating button ab LEFT drawer nahi,
// CENTERED popup kholta hai (Navbar mobile menu jaisa): screen ke
// centre me ~320px, rounded corners + shadow + dimmed backdrop.
const CLOSE_MS = 250;

/**
 * 📱 MOBILE SIDEBAR — centered popup navigation for portal pages (< md).
 *
 * The static <Sidebar /> is hidden below the md breakpoint, which would leave
 * dashboard users with no navigation at all on phones. This renders a
 * floating trigger button (bottom-right) that opens a CENTERED popup
 * containing the same <Sidebar /> (max ~320px, rounded corners, shadow,
 * dimmed/blurred backdrop). The popup closes on: backdrop tap, tapping a
 * nav item, or pressing Escape. Hidden entirely on md+ where the static
 * sidebar is visible. Desktop sidebar is untouched (fixed, no scroll).
 *
 * Mobile fix 2026-11-28 — the button used to sit bottom-LEFT, so every
 * left-aligned heading/label ("Suppliers", "Latest Listings") scrolled
 * underneath it while scrolling. It now sits bottom-RIGHT (the standard
 * FAB corner, away from the left-aligned headings) and is smaller
 * (w-12/h-12), and the admin content wrapper carries extra bottom
 * padding (AdminClient pb-28) so the end of the page clears it too.
 * A fixed button always floats over *something* mid-scroll — the point
 * is that nothing important (headings, labels) sits under it.
 */
export function MobileSidebar() {
  // `rendered` keeps the popup mounted while the scale-out transition
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

  // Close on Escape + lock background scroll while the popup is open
  // (including the scale-out, so the page never scrolls under it).
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
        className="fixed bottom-4 right-4 z-[900] md:hidden w-12 h-12 rounded-full bg-asan-accent text-white shadow-xl shadow-asan-dark/40 flex items-center justify-center active:scale-95 transition"
      >
        <Menu className="w-6 h-6" />
      </button>

      {rendered && (
        <div className="fixed inset-0 z-[1000] md:hidden flex items-center justify-center p-4">
          {/* Dimmed backdrop — tap to dismiss */}
          <div
            onClick={closeDrawer}
            className={cn(
              'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-asan-fade-in',
              closing ? 'opacity-0' : 'opacity-100'
            )}
          />

          {/* Centered popup panel — same styling as the Navbar mobile menu:
              ~320px, rounded corners, shadow, pop-in/scale exit */}
          <div
            className={cn(
              'relative w-full max-w-[320px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white shadow-2xl transition-all duration-[250ms] ease-out animate-asan-pop-in',
              closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
            )}
          >
            <Sidebar
              onNavigate={closeDrawer}
              className="w-full h-auto static shadow-none border-0 rounded-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
