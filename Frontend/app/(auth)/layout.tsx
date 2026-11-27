// GROUP2-AUTH-FIX 2026-11-27
"use client";

// Shared auth shell — /signin, /getstarted, /forgot-password, /reset-password.
// The shop photo (Frontend/public/hero-bg.jpg) is the background for all
// four pages; the two-cell grid slides between the two layouts with a
// 0.7s cubic-bezier transform, exactly like the approved preview:
//   /signin     → form card LEFT,  brand/text panel RIGHT
//   /getstarted → brand/text panel LEFT, form card RIGHT
//   /forgot-password, /reset-password → centred card only, no text panel
// Mobile stacks (text above card) with no slide animation.
// The "New to Asan Tijarat? Create account" / "Already have an account?
// Sign In" links inside the pages are the toggle triggers — plain Links to
// the other route; this layout's slide animates on that navigation.
// Route-group layouts do not change URLs: these pages still live at
// /signin, /getstarted, /forgot-password and /reset-password.

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Store, Building2, Lock } from 'lucide-react';

// Same brand + trust points as the old sign-in / get-started left panels —
// wording unchanged, only the mint panel is gone (photo + light veil now).
function BrandPanel() {
  return (
    <div className="w-full max-w-lg">
      <Link href="/" className="inline-flex items-center gap-2.5">
        <Image
          src="/logo.png"
          alt="Asan Tijarat logo"
          width={40}
          height={40}
          className="w-10 h-10 rounded-xl object-contain"
        />
        <span className="leading-none">
          <span className="block font-bold text-2xl tracking-tight text-slate-900">
            Asan Tijarat
          </span>
          <span className="mt-1 block text-[10px] font-bold tracking-[0.3em] text-slate-500">
            B2B MARKETPLACE
          </span>
        </span>
      </Link>

      <h2 className="mt-10 text-3xl font-extrabold tracking-tight leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
        Pakistan&apos;s leading <br />
        <span className="text-asan-accent">B2B trade platform</span>
      </h2>

      {/* Trust points — hidden on mobile so the form stays near the top. */}
      <div className="mt-8 hidden flex-col gap-4 text-sm font-medium text-slate-600 md:flex">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 shrink-0 text-asan-accent" />
          <span>Accounts verified before trading</span>
        </div>
        <div className="flex items-center gap-3">
          <Store className="w-5 h-5 shrink-0 text-asan-accent" />
          <span>Separate shopkeeper and supplier portals</span>
        </div>
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 shrink-0 text-asan-accent" />
          <span>Bulk orders with minimum order quantity</span>
        </div>
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 shrink-0 text-asan-accent" />
          <span>Price per pack, clearly shown</span>
        </div>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const centered = pathname === '/forgot-password' || pathname === '/reset-password';
  // /signin → card LEFT (text slides right). Every other split page
  // (/getstarted) → text LEFT (card slides right).
  const cardLeft = pathname === '/signin';

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Shop-photo background — same file + same next/image pattern as the homepage hero. */}
      <Image
        src="/hero-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover"
      />

      {/* Light veils over the photo — the text side gets the stronger wash
          so the dark text stays readable. They cross-fade with the slide
          (mirrored pair, same 0.7s as the cells). */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r from-white/90 via-white/65 to-white/20 transition-opacity duration-700 ${
          centered || cardLeft ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-l from-white/90 via-white/65 to-white/20 transition-opacity duration-700 ${
          centered || !cardLeft ? 'opacity-0' : 'opacity-100'
        }`}
      />
      {centered && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/55" />
      )}

      <div className="relative grid min-h-[calc(100vh-4rem)] md:grid-cols-2">
        {/* Brand / text panel — centred on /signin; top-aligned + sticky on
            /getstarted so the text sits UP on landing instead of sinking to
            the middle of the tall form (follow-up 2026-11-27). */}
        <div
          className={`relative flex-col px-6 py-8 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-10 lg:px-16 ${
            centered ? 'hidden md:hidden' : 'flex'
          } ${!centered && cardLeft ? 'md:translate-x-full' : ''} ${
            !centered && !cardLeft
              ? 'justify-start md:self-start md:sticky md:top-24'
              : 'justify-center'
          }`}
        >
          <BrandPanel />
        </div>

        {/* Form card — the pages render ONLY their form content; this cell
            provides the white card (same max-w-md width as before). */}
        <div
          className={`relative flex items-center justify-center p-4 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:p-6 ${
            centered ? 'md:col-span-2' : ''
          } ${!centered && cardLeft ? 'md:-translate-x-full' : ''}`}
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
