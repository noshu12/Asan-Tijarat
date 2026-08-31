"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProducts } from '@/context/ProductContext';
import { useAuth } from '@/context/AuthContext';
import { formatPKR } from '@/lib/utils';
import { deriveStockStatus } from '@/services/productService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/context/ToastContext';
import { Product } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Search, Save } from 'lucide-react';

interface EditProductFormState {
  name: string;
  price: string;
  stock: string;
  moq: string;
  status: Product['status'];
}

const EMPTY_EDIT_FORM: EditProductFormState = {
  name: '',
  price: '',
  stock: '',
  moq: '',
  status: 'Active',
};

export default function SupplierMyProductsPage() {
  const { products, updateProduct, removeProduct } = useProducts();
  const { user } = useAuth();
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useToast();

  /* ------------------------- Edit-lot dialog state ------------------------ */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditProductFormState>(EMPTY_EDIT_FORM);
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditProductFormState, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Keep the modal in sync when its product changes elsewhere (e.g. deleted).
  useEffect(() => {
    if (!editingId) return;
    if (!products.some((product) => product.id === editingId)) {
      setEditingId(null);
    }
  }, [products, editingId]);

  /** Prefills the dialog with the selected lot's current trade terms. */
  const openEditModal = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name,
      price: String(product.price),
      stock: String(product.stock),
      moq: String(product.moq),
      status: product.status,
    });
    setEditErrors({});
  };

  /**
   * Validates and persists supplier edits (MOCK OF: PATCH /api/products/:id
   * via ProductContext.updateProduct). Reopening stock flips status back to
   * Active automatically; zeroing it marks the lot Out of Stock.
   */
  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || isSaving) return;

    const name = editForm.name.trim();
    const price = Number(editForm.price);
    const stock = Number(editForm.stock);
    const moq = Number(editForm.moq);

    const errors: Partial<Record<keyof EditProductFormState, string>> = {};
    if (!name) errors.name = 'Product name is required';
    else if (name.length < 3) errors.name = 'Name must be at least 3 characters';
    if (!Number.isFinite(price) || price <= 0) errors.price = 'Enter a valid unit price';
    if (!Number.isInteger(stock) || stock < 0) errors.stock = 'Stock must be zero or more';
    if (!Number.isInteger(moq) || moq <= 0) errors.moq = 'MOQ must be at least 1';
    else if (stock > 0 && moq > stock) errors.moq = 'MOQ cannot exceed available stock';

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const nextStatus =
        editForm.status === 'Active' && stock === 0 ? 'Out of Stock' : editForm.status;

      updateProduct(editingId, {
        name,
        price,
        stock,
        moq,
        status: nextStatus,
      });

      showToast(`"${name}" updated successfully`, 'success');
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    removeProduct(id);
    setDeleteModalId(null);
    showToast('Product listing deleted successfully', 'info');
  };

  const filtered = products
    .filter((product) => product.supplierId === user?.id)
    .filter((product) => product.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
            My Product Listings
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your active inventory, wholesale rates, and lot quantities
          </p>
        </div>

        <Link
          href="/supplier/add-product"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md shadow-emerald-700/20 transition self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add New Product</span>
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Filter by product name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-5 py-3.5">Product Lot</th>
              <th className="px-5 py-3.5">Price / Unit</th>
              <th className="px-5 py-3.5">MOQ</th>
              <th className="px-5 py-3.5">Available Stock</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((prod) => (
              <tr key={prod.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <img src={prod.image} alt={prod.name} className="w-12 h-12 rounded-xl object-cover" />
                    <div>
                      <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{prod.name}</p>
                      <p className="text-[11px] text-slate-400">{prod.category} • {prod.ordersCount} total sales</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                  {formatPKR(prod.price)}
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {prod.moq} {prod.unit}
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {prod.stock} units
                </td>
                <td className="px-5 py-4">
                  <Badge variant={prod.status === 'Active' ? 'active' : 'warning'}>
                    {prod.status}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Edit Product"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteModalId(prod.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                      title="Delete Product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!deleteModalId}
        onClose={() => setDeleteModalId(null)}
        title="Delete Product Listing?"
        description="Are you sure you want to remove this product from the marketplace? This action cannot be undone."
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteModalId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteModalId && handleDelete(deleteModalId)}>Delete Listing</Button>
        </div>
      </Modal>

      {/* -------------------------- Edit lot dialog -------------------------- */}
      <Modal
        isOpen={!!editingId}
        onClose={() => setEditingId(null)}
        title="Edit Product Lot"
        description="Update trade terms for this listing. Buyers always see your latest prices."
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 pt-1" noValidate>
          <Input
            label="Product Name"
            value={editForm.name}
            error={editErrors.name}
            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Premium Basmati Rice — 10kg Bag"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Price (PKR)"
              type="number"
              min={1}
              step={0.01}
              inputMode="decimal"
              value={editForm.price}
              error={editErrors.price}
              onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
              placeholder="450"
              required
            />
            <Input
              label={`Stock Quantity (${filtered.find((p) => p.id === editingId)?.unit ?? 'units'})`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={editForm.stock}
              error={editErrors.stock}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  stock: e.target.value,
                  status: deriveStockStatus(Number(e.target.value)),
                }))
              }
              placeholder="1200"
              required
            />
          </div>

          <Input
            label="Minimum Order Quantity (MOQ)"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={editForm.moq}
            error={editErrors.moq}
            onChange={(e) => setEditForm((prev) => ({ ...prev, moq: e.target.value }))}
            placeholder="50"
            helperText="Smallest bulk quantity a shopkeeper can order at once."
            required
          />

          <div className="space-y-1.5 w-full">
            <label
              htmlFor="edit-product-status"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Status
            </label>
            <select
              id="edit-product-status"
              value={editForm.status}
              onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as Product['status'] }))}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 transition-all focus:border-asan-accent focus:outline-none focus:ring-2 focus:ring-asan-accent/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-asan-accent disabled:opacity-50"
            >
              <option value="Active">Active — visible &amp; buyable</option>
              <option value="Out of Stock">Out of Stock — hidden from buyers</option>
            </select>
            {editForm.status === 'Active' && editForm.stock !== '' && Number(editForm.stock) === 0 && (
              <p className="text-xs text-asan-warning font-medium">
                Stock is 0 — this lot will be listed as Out of Stock.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
