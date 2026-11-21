'use client';

import { Suspense, useEffect } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_MEASUREMENT_ID, isAnalyticsEnabled, trackPageview } from '@/lib/analytics';

/**
 * Batch 16 — B8 GA4 loader (Next.js 14 App Router way).
 *
 * - Renders NOTHING when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset — no
 *   script tag, no request, no error. The site behaves exactly as if
 *   analytics did not exist.
 * - The ID is read from the env var only (lib/analytics.ts) — it is
 *   never hardcoded in any component.
 * - `send_page_view: false` in the config: GA4's automatic page_view
 *   would otherwise fire on every history change AND our manual
 *   PageviewTracker would fire again — one page_view per navigation,
 *   from the tracker only.
 * - PageviewTracker uses useSearchParams, so it sits behind a Suspense
 *   boundary (Next.js build fails on this route without one).
 */
export function GoogleAnalytics() {
  if (!isAnalyticsEnabled()) return null;
  const id = GA_MEASUREMENT_ID as string;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}', { send_page_view: false });
        `}
      </Script>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
    </>
  );
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const query = searchParams?.toString();
    trackPageview(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);
  return null;
}
