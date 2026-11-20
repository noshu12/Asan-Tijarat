import type { MetadataRoute } from 'next';

const baseUrl = 'https://asan-tijarat.vercel.app';

/**
 * Backend origin — same pattern as Frontend/app/product/[id]/page.tsx
 * (backendOrigin) and next.config.mjs rewrites(): BACKEND_INTERNAL_URL
 * first (server-only internal URL), then NEXT_PUBLIC_API_URL, then
 * localhost for dev. The sitemap is a server component, so it cannot use
 * the client-side /backend-api rewrite (that only exists for browser
 * calls) or lib/api.ts (its request() is built for client components:
 * window, CSRF, credentials) — it fetches the backend directly, like
 * the product page does for its metadata.
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

/**
 * Only the fields the sitemap needs from a list row. The list endpoint
 * returns the full product, but id + updatedAt are all we map.
 * (updatedAt is on the wire: the Product model has timestamps: true and
 * Backend/src/utils/serialize.js toClient() passes every field through
 * except _id/__v. It is optional here because the frontend Product
 * interface in lib/types.ts does not declare it.)
 */
interface SitemapProduct {
  id: string;
  updatedAt?: string;
}

interface ProductsListResponse {
  products?: SitemapProduct[];
  totalPages?: number;
}

/**
 * One page of the public list (GET /api/products — the same endpoint the
 * marketplace uses via api.products() in lib/api.ts). 5 s timeout so a
 * slow/hung backend can never hang the build.
 */
async function fetchProductsPage(page: number): Promise<ProductsListResponse> {
  const res = await fetch(`${backendOrigin()}/api/products?page=${page}&limit=100`, {
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`GET /api/products?page=${page} -> HTTP ${res.status}`);
  }
  return (await res.json()) as ProductsListResponse;
}

/**
 * N2 (Round-4 Batch 11): every product id in the catalogue.
 *
 * The backend paginates the list (default 50, max 100 — see
 * Backend/src/controllers/product.controller.js), so the ~350-product
 * catalogue is walked page by page using the totalPages from page 1.
 * The loop is bounded (max 50 pages) so a misbehaving backend cannot
 * loop forever.
 *
 * NEVER throws: any failure — backend down, timeout, bad status,
 * unparseable body, malformed rows — returns [] and the sitemap falls
 * back to the 10 static URLs below, so the build can never fail on this.
 */
async function fetchAllProductIds(): Promise<SitemapProduct[]> {
  try {
    const first = await fetchProductsPage(1);
    const products = Array.isArray(first.products) ? [...first.products] : [];
    const totalPages =
      typeof first.totalPages === 'number' && first.totalPages > 1
        ? Math.min(first.totalPages, 50)
        : 1;
    for (let page = 2; page <= totalPages; page += 1) {
      const data = await fetchProductsPage(page);
      if (Array.isArray(data.products)) products.push(...data.products);
    }
    return products;
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // lastModified matches the last git change to each public page (2026-11-17).
  const lastModified = new Date('2026-11-17');
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/marketplace`, lastModified, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/getstarted`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/signin`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/forgot-password`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/reset-password`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Product URLs — empty when the backend could not be reached, so the
  // sitemap is then exactly the 10 static URLs above (the old behaviour).
  const products = await fetchAllProductIds();
  const productEntries: MetadataRoute.Sitemap = products
    .filter((p) => p && typeof p.id === 'string' && p.id.length > 0)
    .map((p): MetadataRoute.Sitemap[number] => {
      const updated = p.updatedAt ? new Date(p.updatedAt) : null;
      return {
        url: `${baseUrl}/product/${encodeURIComponent(p.id)}`,
        lastModified:
          updated && !Number.isNaN(updated.getTime()) ? updated : lastModified,
        changeFrequency: 'weekly',
        priority: 0.7,
      };
    });

  return [...staticEntries, ...productEntries];
}
