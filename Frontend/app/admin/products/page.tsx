"use client";

import React, { useEffect, useState } from 'react';
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

const STATUSES: Product['status'][] = ['Active', 'Low Stock', 'Out of Stock'];

export default function AdminProductsPage() {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The listing whose uploaded photo is open in the full-size viewer.
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    let mounted = true;

    if (!user || user.role !== 'admin') {
      if (mounted) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    api.admin
      .products({ status: statusFilter, search: search.trim() || undefined })
      .then((res) => { if (mounted) setProducts(res.products); })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed to load products.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user, statusFilter]);

  const updateStatus = (p: Product, status: Product['status']) => {
    setBusyId(p.id);
    setMessage(null);
    setError(null);
    api.admin
      .updateProductStatus(p.id, status)
      .then(() => {
        setMessage(`"${p.name}" is now ${status}.`);
        setProducts(products.map((x) => (x.id === p.id ? { ...x, status } : x)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Status update failed.'))
      .finally(() => setBusyId(null));
  };

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
        subtitle="Moderate all marketplace listings — hide, restore or delete"
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search product, category or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setStatusFilter('all');
              }
            }}
            className="pl-9 pr-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
        <Button type="button" variant="outline" onClick={() => { setStatusFilter('all'); setSearch(''); }}>
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
          <table className="w-full text-left text-sm">
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
                        <ProductImage src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                        <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/50 text-white opacity-0 group-hover/thumb:opacity-100 transition">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </span>
                      </button>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white text-xs truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
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
                    <p className="text-[11px] text-slate-400">{p.supplierCity}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white">
                    {formatPKR(p.price)} / {p.unit}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {p.stock} <span className="text-slate-400">({p.moq} MOQ)</span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.status}
                      disabled={busyId !== null}
                      onChange={(e) => updateStatus(p, e.target.value as Product['status'])}
                      className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      title="Delete listing"
                      disabled={busyId !== null}
                      onClick={() => removeProduct(p)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
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
              className="w-full max-h-[55vh] object-contain rounded-xl bg-slate-100 dark:bg-slate-800"
            />

            {(previewProduct.additionalImages?.length || 0) > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {(previewProduct.additionalImages || []).map((url, index) => (
                  <ProductImage
                    key={url}
                    src={url}
                    alt={`${previewProduct.name} — photo ${index + 2}`}
                    className="w-full h-20 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
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
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
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