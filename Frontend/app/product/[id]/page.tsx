import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';
import type { Product } from '@/lib/types';
import { fileUrl } from '@/lib/api';
import { formatPKR } from '@/lib/utils';

/**
 * Product detail page — SERVER half (audit fix #13 split).
 *
 * Fix #6 built this route as one client component ("use client"), so it
 * could not export metadata — every product shared the root title/OG tags
 * and products could not be shared or indexed properly. This file is now
 * a server component: it exports generateMetadata (one title, description
 * and OG set per product) and renders the client UI from
 * ProductDetailClient.tsx, which is unchanged from fix #6 apart from
 * taking `id` as a prop instead of `params`.
 *
 * The client still fetches the product itself (api.product(id)) and keeps
 * its loading / "Product not found" / "Couldn't load this product" states
 * — the server fetch below is ONLY for metadata, so a metadata failure
 * can never break the page itself.
 *
 * M2 (Round-4 Batch 10): an invalid id used to return HTTP 200 with a
 * "Product not found" body (a soft-404). Now, when the metadata fetch
 * DEFINITIVELY finds no product — the API answers 404, or answers 400
 * (malformed id: Mongoose CastError → the error handler's 400; a GET
 * /api/products/:id has no request body, so its only 400 is an invalid
 * id format, and an invalid id can never be a real product), or answers
 * 200 with a null/empty/malformed product — the page component below
 * calls notFound(), so Next serves the styled app/not-found.tsx page
 * with a real HTTP 404. The distinction is deliberate: if the fetch
 * THROWS (backend down / cold Render) or the API answers any other
 * error status, the result is 'unknown' and the page keeps its old
 * behaviour (fallback metadata + the client's own states, HTTP 200) —
 * a real product is NEVER 404'd just because the backend was
 * unreachable. ProductDetailClient.tsx is unchanged.
 *
 * Implementation note (verified by testing, do not "simplify"): the
 * notFound() call lives in the PAGE component, NOT in generateMetadata().
 * Calling notFound() inside generateMetadata() does set HTTP 404, but
 * Next 14.2.35 then serves only a bare `__next_error__` shell with no
 * page content in the HTML — the styled 404 page would only appear
 * after client-side JS runs, so crawlers and no-JS users get a blank
 * page. notFound() in the page component renders the full styled 404
 * page server-side, exactly like a 404 for an unknown route.
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
  // Batch 19 (Round-5 audit L5) — loud in production when neither var
  // is set: the localhost fallback would make JSON-LD / OG images point
  // at localhost:5000 on the live site. Dev keeps the quiet localhost
  // fallback. This logs (never throws): a hard build failure would
  // break local `npm run build` checks, which run with NODE_ENV =
  // production but no backend URL — and the live site already proves
  // the var IS set there (the live sitemap serves 350 product URLs).
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.BACKEND_INTERNAL_URL &&
    !process.env.NEXT_PUBLIC_API_URL
  ) {
    console.error('[product-page] NEXT_PUBLIC_API_URL / BACKEND_INTERNAL_URL is not set in production — JSON-LD and OG images fall back to http://localhost:5000.');
  }
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:5000';
  }
}

/**
 * Result of the metadata-only product fetch.
 *
 * - 'found': the API returned a real product — build its metadata.
 * - 'not-found': the API DEFINITIVELY says no such product exists
 *   (HTTP 404, HTTP 400 for a malformed id, or HTTP 200 with a
 *   null/empty/malformed product). Only this case may 404 the page.
 * - 'unknown': the fetch threw (backend down / network error) or the API
 *   answered an unexpected error status (500, 502, ...). We do NOT know
 *   whether the product exists, so the page must keep its old fallback
 *   behaviour (fallback metadata, HTTP 200) — never 404 a real product
 *   just because the backend was unreachable.
 */
type MetadataFetchResult =
  | { status: 'found'; product: Product }
  | { status: 'not-found' }
  | { status: 'unknown' };

/** Fetch one product for metadata only. Cached per request: generateMetadata
 * and the page component below share this one call, so the backend is hit
 * only once per request. */
const fetchProductForMetadata = cache(async (id: string): Promise<MetadataFetchResult> => {
  let res: Response;
  try {
    res = await fetch(`${backendOrigin()}/api/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
  } catch {
    // Backend down / network error: we know nothing about this product.
    return { status: 'unknown' };
  }

  // A 404 from the API is a definitive "no such product" answer.
  // So is a 400: this endpoint has no request body, so its only 400 is
  // an invalid id format (Mongoose CastError), and a malformed id can
  // never belong to a real product (all ids are 24-hex ObjectIds).
  if (res.status === 404 || res.status === 400) return { status: 'not-found' };
  // Any other error status (500, 502, ...) is NOT definitive — the
  // product may well exist and the backend is just having trouble.
  if (!res.ok) return { status: 'unknown' };

  let data: { product?: Product } | null;
  try {
    data = (await res.json()) as { product?: Product } | null;
  } catch {
    // Unparseable body: cannot confirm anything about the product.
    return { status: 'unknown' };
  }
  const product = data?.product;
  // HTTP 200 but no usable product in the body: the API answered, and
  // the answer is "there is no product here" — definitive.
  if (!product || typeof product.name !== 'string' || !product.name) {
    return { status: 'not-found' };
  }
  return { status: 'found', product };
});

const FALLBACK_DESCRIPTION =
  'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  const result = await fetchProductForMetadata(id);

  if (result.status !== 'found') {
    // 'not-found' → the page component below calls notFound(), so this
    // fallback metadata is discarded and the styled 404 page is served
    // instead (see the note at the top of this file for why notFound()
    // must NOT be called here). 'unknown' (backend down / unexpected
    // error) → we do NOT know whether the product exists, so keep the
    // old fallback (generic metadata, HTTP 200) and let the client show
    // its own "Couldn't load this product" state. Nothing is invented
    // about a product we do not have.
    return {
      title: 'Product not found | Asan Tijarat',
      description: FALLBACK_DESCRIPTION,
      openGraph: {
        type: 'website',
        url: `${SITE_URL}/product/${id}`,
        title: 'Product not found | Asan Tijarat',
        description: FALLBACK_DESCRIPTION,
        images: [
          {
            url: '/og-image.png',
            width: 1200,
            height: 630,
            alt: 'Asan Tijarat — B2B Wholesale Marketplace Pakistan',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Product not found | Asan Tijarat',
        description: FALLBACK_DESCRIPTION,
        images: ['/og-image.png'],
      },
      alternates: { canonical: `${SITE_URL}/product/${id}` },
    };
  }

  const product = result.product;

  const title = `${product.name} | Asan Tijarat`;
  // Real fields only: the product's own description when it has one,
  // otherwise a sentence composed from its real category/supplier/price.
  const description = product.description?.trim()
    ? product.description.trim().slice(0, 160)
    : `${product.name} — wholesale ${product.category} from ${product.supplierName}, ${product.supplierCity}. ${formatPKR(product.price)} per pack, minimum order ${product.moq}.`;
  // fileUrl() makes /uploads paths absolute and passes Cloudinary URLs
  // through; empty image falls back to the site OG image.
  const ogImage = product.image ? fileUrl(product.image) : '/og-image.png';

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      url: `${SITE_URL}/product/${id}`,
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: product.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: `${SITE_URL}/product/${id}` },
  };
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const result = await fetchProductForMetadata(params.id);

  if (result.status === 'not-found') {
    // Definitive "no such product" (API 404, or 200 with no product):
    // serve the real 404 page + HTTP 404 (app/not-found.tsx) instead of
    // a 200 "Product not found" page. notFound() throws, so the client
    // below never mounts for this case. 'unknown' (backend down /
    // unexpected error) deliberately falls through to the client, which
    // shows its own "Couldn't load this product" state with HTTP 200 —
    // a real product is never 404'd because the backend was unreachable.
    notFound();
  }

  // B9 (Round-4 Batch 13) — Product JSON-LD, reusing the metadata fetch
  // above (no new data fetch). Only the fields the API already returns:
  // name / image / description / price / category / supplierName /
  // stock / status. Deliberately OMITTED: `sku` (no SKU field exists on
  // the Product model — inventing one from the id would be fake data)
  // and `aggregateRating` (there are no product-level ratings; ratings
  // live per-supplier on delivered orders, not on the product). The
  // `<` escape stops a `</script>` inside a description from breaking
  // out of the script tag. 'unknown' renders no schema — a product we
  // could not confirm must not get structured data.
  const productJsonLd =
    result.status === 'found'
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: result.product.name,
          image: result.product.image ? fileUrl(result.product.image) : `${SITE_URL}/og-image.png`,
          description: result.product.description?.trim()
            ? result.product.description.trim().slice(0, 160)
            : `${result.product.name} — wholesale ${result.product.category} from ${result.product.supplierName}, ${result.product.supplierCity}. ${formatPKR(result.product.price)} per pack, minimum order ${result.product.moq}.`,
          category: result.product.category,
          // Batch 19 (Round-5 audit L5) — `brand` is DROPPED, deliberately:
          // the old value was the SELLER (supplierName), not the
          // manufacturer brand — schema-valid but semantically wrong, it
          // told Google the supplier made the goods. A Product without a
          // brand is valid schema; the seller is already named in the
          // description. Re-add brand only if a real manufacturer-brand
          // field ever lands on the Product model.
          offers: {
            '@type': 'Offer',
            url: `${SITE_URL}/product/${params.id}`,
            priceCurrency: 'PKR',
            price: result.product.price,
            availability:
              result.product.stock > 0 && result.product.status !== 'Out of Stock'
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
          },
        }).replace(/</g, '\\u003c')
      : null;

  return (
    <>
      {productJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd }} />
      )}
      <ProductDetailClient id={params.id} />
    </>
  );
}
