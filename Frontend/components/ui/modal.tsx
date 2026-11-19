"use client";

import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

// FIX (New audit #19, Batch 7 Item 1) — the enter/exit animation was the
// LAST framer-motion usage in the app (AnimatePresence + motion.div).
// Same motion in plain CSS now, following the `rendered` / `closing`
// pattern from MobileSidebar.tsx and Navbar.tsx (Batch 6):
// - Entrance is a keyframe (animate-asan-modal-in, globals.css): opacity
//   0 -> 1, translateY(20px) -> 0, scale(0.95) -> 1, 0.3s — the exact
//   values the old motion.div used (initial opacity 0 / scale 0.95 /
//   y 20, spring duration 0.3). The backdrop fades with the existing
//   animate-asan-fade-in, same as the drawer/menu backdrops.
// - Exit is a `closing` state that flips transition classes to the
//   hidden state (opacity-0 / scale-95 / translate-y-5); the modal stays
//   mounted for CLOSE_MS (300 ms, the old exit duration) so the exit
//   can play, exactly like AnimatePresence's exit did.
// `isOpen` is owned by the parent, so an effect mirrors it into the
// local `rendered` state: opening mounts immediately, closing starts
// the exit and unmounts after CLOSE_MS. Re-opening inside the exit
// window cancels the pending unmount.
// The focus-trap / focus-restore + scroll-lock effect is keyed on
// `rendered`, so it runs for the whole visible lifetime (including the
// exit) and restores focus + scroll only once the modal is truly gone.
// FIX (Batch 8) — `dialogRef` + the ARIA attributes used to sit on the
// BACKDROP div, but the panel is the backdrop's sibling, not its child,
// so `dialogRef.current.querySelectorAll(...)` found zero focusable
// elements and the Tab-trap was a no-op. The ref + ARIA now live on the
// panel itself, so Tab cycles inside the dialog. Nothing else changed.
// API unchanged: same props, same `isOpen`, same 9 call sites untouched.
const CLOSE_MS = 300;

export function Modal({ isOpen, onClose, title, description, children, maxWidth = "max-w-lg" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // `rendered` keeps the modal mounted while the exit transition plays;
  // `closing` flips the transition classes to the hidden state.
  const [rendered, setRendered] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  // Tracks whether the modal was ever opened, so a modal that mounts
  // closed does not schedule a pointless exit timer on first render.
  const wasOpenRef = useRef(isOpen);

  // Mirror the parent-owned `isOpen` into the local mount lifecycle.
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      // Re-opened (possibly inside the exit window): cancel the
      // pending unmount and show the modal again.
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setClosing(false);
      setRendered(true);
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    // Parent closed it: play the exit, then unmount.
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
      closeTimer.current = null;
    }, CLOSE_MS);
    // The timer is cleared by the open branch above and by the
    // unmount cleanup below; no other re-run should cancel it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Never leave a pending close timer behind on unmount.
  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  // onClose ko ref mein rakha hai taake effect ki dependencies mein
  // onClose shamil kiye baghair bhi Escape hamesha taaza onClose chalaye.
  // Warna har render par nayi onClose function effect ko dobara chalati
  // hai aur close button par focus le jati hai — yehi wajah thi ke
  // Modal ke andar input mein aik letter type karte hi focus X par
  // chala jata tha.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!rendered) return;

    previouslyFocusedElement.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElement.current?.focus();
    };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-4">
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out animate-asan-fade-in",
          closing ? "opacity-0" : "opacity-100"
        )}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "relative max-h-[85dvh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 z-10 transition-all duration-300 ease-out animate-asan-modal-in",
          closing ? "opacity-0 scale-95 translate-y-5" : "opacity-100 scale-100 translate-y-0",
          maxWidth
        )}
      >
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            {title && <h3 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>}
            {description && <p id={descriptionId} className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
          </div>
            <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
