"use client";

import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';

/**
 * 📱 MOBILE SIDEBAR — slide-in navigation drawer for portal pages (< md).
 *
 * The static <Sidebar /> is hidden below the md breakpoint, which would leave
 * dashboard users with no navigation at all on phones. This renders a
 * floating trigger button (bottom-left) that opens a dark slide-in drawer
 * containing the same <Sidebar />. The drawer closes on: overlay tap,
 * navigating to a link, or pressing Escape. Hidden entirely on md+ where
 * the static sidebar is visible.
 */
export function MobileSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  // Close on Escape + lock background scroll while the drawer is open.
  useEffect(() => {
    if (!isOpen) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscapeKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      {/* Floating trigger — mobile only */}
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 left-5 z-[900] md:hidden w-14 h-14 rounded-full bg-asan-accent text-white shadow-xl shadow-emerald-950/40 flex items-center justify-center active:scale-95 transition"
      >
        <Menu className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[1000] md:hidden">
            {/* Dimmed backdrop — tap to dismiss */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Slide-in panel (starts below the sticky navbar) */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="absolute top-16 bottom-0 left-0 w-72 max-w-[82vw] shadow-2xl"
            >
              <Sidebar onNavigate={() => setIsOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}