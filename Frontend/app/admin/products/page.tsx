"use client";

import React, { useEffect, useRef, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { ProductImage } from '@/components/ProductImage';
import { Images, Search, ShieldCheck, Trash2, Boxes, ZoomIn } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Product } from '@/lib/types';
import { formatDate, formatFileSize, formatPKR } from '@/lib/utils';
import { idFromEventLink, PRODUCT_UPDATE_EVENT_TYPES, useLiveRefreshKey, useRealtimeEvent } from '@/hooks/useRealtime';

export default function AdminProductsPage() {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  // Batch 19 (Round-5 audit H2) — the table paginates (50/page) instead
  // of only ever showing the first 500 listings.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // FIX (Batch 03) — search typing refetch nahi karta tha: fetch effect ki
  // deps me `search` tha hi nahi. Ab search 400ms debounce hoke
  // `debouncedSearch` me jata hai, aur fetch effect usi pe chalta hai.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The listing whose uploaded photo is open in the full-size viewer.
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  // Batch 13 — before Batch 24 no product event type existed in the
  // agreed SSE list, so this page only refetched on a reconnect /
  // tab-visible sync (bump below); the fetch effect refetches silently
  // on a bump, so an open photo preview and the search text never
  // reset. Batch 24 keeps that sync AND adds the live product events
  // (Batch 23) below.
  const [refreshKey, setRefreshKey] = useState(0);
  const prevRefreshKeyRef = useRef(refreshKey);
  useLiveRefreshKey([], () => setRefreshKey((k) => k + 1));
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;
  // Batch 24 hardening — in-flight prepend guard (same race as the
  // marketplace page: Batch 23 sends product_created twice to admins,
  // targeted + public). The second frame returns before fetching.
  const pendingProductPrependRef = useRef(new Set<string>());
  const totalRef = useRef(total);
  totalRef.current = total;

  // Batch 24 — live product events. product_created: GET that ONE
  // product and prepend the row (page 1 only, and only when it matches
  // the status filter / search the admin has set). product_updated /
  // stock_updated / price_updated: GET the one product and replace its
  // row in place, if it is on screen. No full refetch, no spinner, an
  // open photo preview never closes. Single fetch uses the existing
  // public GET /api/products/:id — the admin API has no single-product
  // GET (list + delete only) and the shape is identical.
  // A failed single fetch is live-only noise — the table stays as-is.
  useRealtimeEvent(
    ['product_created', ...PRODUCT_UPDATE_EVENT_TYPES],
    (event) => {
      const productId = idFromEventLink(event.link, 'product');
      if (!productId) return;
      if (event.type === 'product_created') {
        if (productsRef.current.some((p) => p.id === productId)) return;
        if (pendingProductPrependRef.current.has(productId)) return;
        pendingProductPrependRef.current.add(productId);
        void api.product(productId).then((data) => {
          const p = data.product;
          if (!p) return;
          if (productsRef.current.some((x) => x.id === p.id)) return;
          const newTotal = totalRef.current + 1;
          setTotal(newTotal);
          setTotalPages((prev) => Math.max(prev, Math.ceil(newTotal / 50)));
          if (page !== 1) return;
          if (statusFilter !== 'all' && p.status !== statusFilter) return;
          const q = debouncedSearch.trim().toLowerCase();
          if (q) {
            const hay = `${p.name} ${p.category} ${p.supplierName}`.toLowerCase();
            if (!hay.includes(q)) return;
          }
          setProducts((prev) => [p, ...prev]);
        }).catch(() => {}).finally(() => {
          pendingProductPrependRef.current.delete(productId);
        });
        return;
      }
      if (!productsRef.current.some((p) => p.id === productId)) return;
      void api.product(productId).then((data) => {
        const p = data.product;
        if (!p) return;
        setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        // The updated row may no longer match the status filter — the
        // silent sync refetch (reconnect / tab visible) corrects the
        // list then; the row itself is never blanked live.
        if (previewProduct && previewProduct.id === p.id) setPreviewProduct(p);
      }).catch(() => {});
    },
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    // Batch 13 — silent on a live refreshKey bump (see above).
    const silent = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;

    let mounted = true;

    if (!user || user.role !== 'admin') {
      if (mounted) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);
    api.admin
      .products({ status: statusFilter, search: debouncedSearch || undefined, page, limit: 50 })
      .then((res) => {
        if (!mounted) return;
        setProducts(res.products);
        setTotalPages(res.totalPages ?? 1);
        setTotal(res.total ?? res.products?.length ?? 0);
        // The backend clamps out-of-range pages (safePage): sync the UI
        // to the page it actually served (e.g. after a filter narrows
        // the list below the current page).
        if (res.page !== undefined && res.page !== page) setPage(res.page);
      })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed to load products.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
    // FIX (Batch 03) — deps me debouncedSearch add kiya, taake typing se
    // refetch ho. Pehle deps sirf [user, statusFilter] thay.
    // Batch 19 — `page` bhi dep hai (Prev/Next refetch karta hai).
  }, [user, statusFilter, debouncedSearch, refreshKey, authLoading, page]);

  const removeProduct = (p: Product) => {
    if (!window.confirm(`Delete "${p.name}" from the marketplace?`)) return;
    setBusyId(p.id);
    setMessage(null);
    setError(null);
    api.admin
      .deleteProduct(p.id)
      .then(() => {
        setMessage(`"${p.name}" was removed from the marketplace.`);
        setProducts(products.filter((x) => x.id !== p.id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Delete failed.'))
      .finally(() => setBusyId(null));
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Admins only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with an admin account to moderate product listings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalHeader
        title="Products"
        subtitle="Moderate all marketplace listings — view or delete"
      />

      {message && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* FIX (Batch 03 #16) — tablet: same wrap guard as the users filter
          row; the search + select + Reset row is close to the ≈448px
          content width at 768px, so it wraps instead of clipping. Desktop
          unchanged (one row when it fits). */}
      <div className="flex flex-col flex-wrap sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search product, category or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // FIX (Batch 03) — Enter dabane se pehle statusFilter 'all' pe
              // reset ho jata tha, is liye search + status filter ek saath
              // kabhi nahi chalte thay. Ab Enter sirf debounce ko foran flush
              // karta hai (turant search), filter waisa hi rehta hai jaisa
              // user ne lagaya tha.
              if (e.key === 'Enter') {
                setDebouncedSearch(search.trim());
              }
            }}
            className="pl-9 pr-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
        <Button type="button" variant="outline" onClick={() => { setPage(1); setStatusFilter('all'); setSearch(''); }}>
          Reset
        </Button>
      </div>

      {loading ? (
        <Loader />
      ) : products.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Boxes className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No products match the selected filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {/* Click the thumbnail to inspect the actual photo the
                          supplier uploaded (full size + file metadata). */}
                      <button
                        type="button"
                        onClick={() => setPreviewProduct(p)}
                        title="View the uploaded product photo"
                        className="relative group/thumb shrink-0 rounded-lg"
                      >
                        <ProductImage src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover" width={40} height={40} />
                        <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/50 text-white opacity-0 group-hover/thumb:opacity-100 transition">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </span>
                      </button>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white text-xs truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          {p.category}
                          {(p.additionalImages?.length || 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              • <Images className="w-3 h-3" /> {(p.additionalImages?.length || 0) + 1}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {p.supplierName}
                    <p className="text-xs text-slate-400">{p.supplierCity}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white">
                    {formatPKR(p.price)} / {p.unit}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {p.stock} <span className="text-slate-400">({p.moq} MOQ)</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {p.status}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Delete listing"
                      disabled={busyId !== null}
                      onClick={() => removeProduct(p)}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Batch 19 (audit H2) — page through products instead of only
          ever seeing the first 500 listings. */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} • {total} product{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ── Full-size product photo viewer ─────────────────────────────────
          Shows the cover photo the supplier uploaded, the rest of their
          gallery and the stored file details. */}
      <Modal
        isOpen={previewProduct !== null}
        onClose={() => setPreviewProduct(null)}
        maxWidth="max-w-2xl"
        title={previewProduct ? previewProduct.name : ''}
        description={
          previewProduct
            ? `Product photo uploaded by ${previewProduct.supplierName}${
                previewProduct.supplierCity ? ` • ${previewProduct.supplierCity}` : ''
              }`
            : undefined
        }
      >
        {previewProduct && (
          <div className="space-y-4">
            <ProductImage
              src={previewProduct.image}
              alt={`${previewProduct.name} — uploaded photo`}
              className="w-full max-h-[40vh] object-contain rounded-xl bg-slate-100 dark:bg-slate-800"
              natural
            />

            {(previewProduct.additionalImages?.length || 0) > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {(previewProduct.additionalImages || []).map((url, index) => (
                  <ProductImage
                    key={url}
                    src={url}
                    alt={`${previewProduct.name} — photo ${index + 2}`}
                    className="w-full h-20 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
                    fill
                    sizes="(max-width: 640px) 33vw, 25vw"
                  />
                ))}
              </div>
            )}

            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              {([
                ['Price', `${formatPKR(previewProduct.price)} / ${previewProduct.unit}`],
                ['Stock', `${previewProduct.stock} (MOQ ${previewProduct.moq})`],
                ['Status', previewProduct.status],
                ['Uploaded file', previewProduct.imageUploads?.[0]?.originalName || '—'],
                ['File size', formatFileSize(previewProduct.imageUploads?.[0]?.size)],
                [
                  'Uploaded on',
                  previewProduct.imageUploads?.[0]?.uploadedAt
                    ? formatDate(previewProduct.imageUploads[0].uploadedAt as string)
                    : '—',
                ],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                  <dd className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
