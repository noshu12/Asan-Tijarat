import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import SupplierProfileClient from './SupplierProfileClient';
import type { PublicSupplierProfile } from '@/lib/api';

/**
 * Public supplier profile page — SERVER half (/suppliers/[id], Group 1).
 *
 * Same pattern as app/product/[id]/page.tsx: a server component that
 * exports generateMetadata (one title / description / canonical per
 * supplier) and renders the client UI from SupplierProfileClient.tsx.
 *
 * The client still fetches the supplier itself (api.publicSupplier(id))
 * and keeps its loading / "Supplier not found" / "Couldn't load this
 * supplier" states — the server fetch below is ONLY for metadata, so a
 * metadata failure can never break the page itself.
 *
 * found / not-found / unknown handling mirrors the product page: only a
 * DEFINITIVE "no such supplier" (API 404, or 200 with a null/empty/
 * malformed supplier) calls notFound(). If the fetch THROWS (backend down
 * / cold Render) or the API answers any other error status, the result
 * is 'unknown' and the page keeps its fallback behaviour (fallback
 * metadata + the client's own states, HTTP 200) — a real supplier is
 * NEVER 404'd just because the backend was unreachable.
 *
 * No JSON-LD: the product page's Product schema does not apply here, and
 * no supplier schema is invented.
 *
 * Implementation note (same as the product page, do not "simplify"): the
 * notFound() call lives in the PAGE component, NOT in generateMetadata().
 * Calling notFound() inside generateMetadata() serves only a bare
 * `__next_error__` shell with no page content in the HTML — the styled
 * 404 page would only appear after client-side JS runs. notFound() in
 * the page component renders the full styled 404 page server-side.
 * generateMetadata() and the page share one fetch via React cache(),
 * so the backend is still hit only once per request.
 */

const SITE_URL = 'https://asan-tijarat.vercel.app';

/**
 * Backend origin — same pattern as next.config.mjs rewrites():
 * BACKEND_INTERNAL_URL first (server-only internal URL), then
 * NEXT_PUBLIC_API_URL, then localhost for dev. The client cannot use the
 * /backend-api rewrite here — that rewrite only exists for browser calls.
 */
function backendOrigin(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000';
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.BACKEND_INTERNAL_URL &&
    !process.env.NEXT_PUBLIC_API_URL
  ) {
    console.error('[supplier-page] NEXT_PUBLIC_API_URL / BACKEND_INTERNAL_URL is not set in production — metadata falls back to http://localhost:5000.');
  }
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:5000';
  }
}

/**
 * Result of the metadata-only supplier fetch.
 *
 * - 'found': the API returned a real supplier — build its metadata.
 * - 'not-found': the API DEFINITIVELY says no such supplier exists
 *   (HTTP 404, or HTTP 200 with a null/empty/malformed supplier).
 *   Only this case may 404 the page.
 * - 'unknown': the fetch threw (backend down / network error) or the API
 *   answered an unexpected error status (400, 500, 502, ...). We do NOT
 *   know whether the supplier exists, so the page must keep its old
 *   fallback behaviour (fallback metadata, HTTP 200) — never 404 a real
 *   supplier just because the backend was unreachable. (Unlike the
 *   product endpoint, a 400 here is NOT treated as definitive: the
 *   supplier endpoint's 400 cases are not a documented invalid-id-only
 *   signal, so only a 404 or a malformed body counts.)
 */
type MetadataFetchResult =
  | { status: 'found'; supplier: PublicSupplierProfile }
  | { status: 'not-found' }
  | { status: 'unknown' };

/** Fetch one supplier for metadata only. Cached per request: generateMetadata
 * and the page component below share this one call, so the backend is hit
 * only once per request. */
const fetchSupplierForMetadata = cache(async (id: string): Promise<MetadataFetchResult> => {
  let res: Response;
  try {
    res = await fetch(`${backendOrigin()}/api/public/suppliers/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
  } catch {
    // Backend down / network error: we know nothing about this supplier.
    return { status: 'unknown' };
  }

  // A 404 from the API is a definitive "no such supplier" answer.
  if (res.status === 404) return { status: 'not-found' };
  // Any other error status (400, 500, 502, ...) is NOT definitive — the
  // supplier may well exist and the backend is just having trouble.
  if (!res.ok) return { status: 'unknown' };

  let data: { supplier?: PublicSupplierProfile } | null;
  try {
    data = (await res.json()) as { supplier?: PublicSupplierProfile } | null;
  } catch {
    // Unparseable body: cannot confirm anything about the supplier.
    return { status: 'unknown' };
  }
  const supplier = data?.supplier;
  // HTTP 200 but no usable supplier in the body: the API answered, and
  // the answer is "there is no supplier here" — definitive.
  if (!supplier || typeof supplier.businessName !== 'string' || !supplier.businessName) {
    return { status: 'not-found' };
  }
  return { status: 'found', supplier };
});

const FALLBACK_DESCRIPTION =
  'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  const result = await fetchSupplierForMetadata(id);

  if (result.status !== 'found') {
    // 'not-found' → the page component below calls notFound(), so this
    // fallback metadata is discarded and the styled 404 page is served
    // instead (see the note at the top of this file for why notFound()
    // must NOT be called here). 'unknown' (backend down / unexpected
    // error) → we do NOT know whether the supplier exists, so keep the
    // generic metadata with HTTP 200 and let the client show its own
    // "Couldn't load this supplier" state. Nothing is invented about a
    // supplier we do not have.
    return {
      title: 'Supplier not found | Asan Tijarat',
      description: FALLBACK_DESCRIPTION,
      alternates: { canonical: `${SITE_URL}/suppliers/${id}` },
    };
  }

  const supplier = result.supplier;

  const title = `${supplier.businessName} | Asan Tijarat`;
  // Real fields only: business name, city, categories and products sold.
  const description =
    supplier.categories.length > 0
      ? `${supplier.businessName} — wholesale supplier in ${supplier.city}, selling ${supplier.categories.join(', ')}. ${supplier.productsSold} products sold on Asan Tijarat.`
      : `${supplier.businessName} — wholesale supplier in ${supplier.city}. ${supplier.productsSold} products sold on Asan Tijarat.`;

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      url: `${SITE_URL}/suppliers/${id}`,
      title,
      description,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: { canonical: `${SITE_URL}/suppliers/${id}` },
  };
}

export default async function SupplierProfilePage({ params }: { params: { id: string } }) {
  const result = await fetchSupplierForMetadata(params.id);

  if (result.status === 'not-found') {
    // Definitive "no such supplier" (API 404, or 200 with no supplier):
    // serve the real 404 page + HTTP 404 (app/not-found.tsx) instead of
    // a 200 "Supplier not found" page. notFound() throws, so the client
    // below never mounts for this case. 'unknown' (backend down /
    // unexpected error) deliberately falls through to the client, which
    // shows its own "Couldn't load this supplier" state with HTTP 200 —
    // a real supplier is never 404'd because the backend was unreachable.
    notFound();
  }

  return <SupplierProfileClient id={params.id} />;
}
