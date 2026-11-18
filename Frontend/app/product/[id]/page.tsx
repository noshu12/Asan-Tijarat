import type { Metadata } from 'next';
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
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:5000';
  }
}

/** Fetch one product for metadata only. null = not found OR backend down. */
async function fetchProductForMetadata(id: string): Promise<Product | null> {
  try {
    const res = await fetch(`${backendOrigin()}/api/products/${encodeURIComponent(id)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { product?: Product } | null;
    const product = data?.product;
    // Guard against a malformed payload — never build metadata from junk.
    if (!product || typeof product.name !== 'string' || !product.name) return null;
    return product;
  } catch {
    // Backend down / network error: metadata falls back, the client UI
    // still shows its own "Couldn't load this product" state.
    return null;
  }
}

const FALLBACK_DESCRIPTION =
  'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { id } = params;
  const product = await fetchProductForMetadata(id);

  if (!product) {
    // Unknown id → "Product not found" title; backend down → same generic
    // fallback. Either way nothing is invented about a product we do not have.
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

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return <ProductDetailClient id={params.id} />;
}
