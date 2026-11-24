"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProductImageUpload, ProductImageDraft } from '@/components/ProductImageUpload';
import { toProductImagePayload } from '@/lib/uploads';
import { Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';

const CATEGORIES = [
  'Staples, Grains & Flours',
  'Pulses, Lentils & Beans',
  'Cooking Oils, Ghee & Fats',
  'Spices, Herbs & Baking',
  'Packaged Foods, Recipe Mixes & Sauces',
  'Beverages & Cold Corner',
  'Tea, Coffee & Dairy',
  'Snacks, Biscuits & Confectionery',
  'Instant & Ready-to-Cook Foods',
  'Home Cleaning & Sanitation',
  'Personal Care & Hygiene',
  'Mother & Baby Care',
  'Paper Products, Wraps & Utilities',
  'Over-the-Counter Healthcare',
];

const PACK_TYPES = ['bag', 'carton', 'tin', 'box', 'drum', 'pack', 'bottle', 'jar', 'can'];

// How the product is measured — the supplier picks one on the form. kg and
// liter describe ONE pack (its weight / volume); dozen means one pack IS a
// dozen, so no weight or volume is asked for it.
type Measure = 'kg' | 'liter' | 'dozen';
const MEASURES: { id: Measure; label: string }[] = [
  { id: 'kg', label: 'Kilogram (kg)' },
  { id: 'liter', label: 'Liter (L)' },
  { id: 'dozen', label: 'Dozen' },
];

// Plural for the MOQ/stock labels — "dozen" stays "dozen", "box" -> "boxes".
function pluralPack(noun: string): string {
  if (noun === 'dozen') return 'dozen';
  if (noun.endsWith('x')) return `${noun}es`;
  return `${noun}s`;
}

export default function SupplierAddProductPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState('');
  const [packType, setPackType] = useState('');
  const [measure, setMeasure] = useState<Measure>('kg');
  const [measureValue, setMeasureValue] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  // Photos picked from the supplier's device. The first one is the cover image
  // and they are uploaded with the listing (no stock/placeholder pictures).
  const [photos, setPhotos] = useState<ProductImageDraft[]>([]);
  const [imageError, setImageError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Category ownership — a supplier may only publish in their OWN categories
  // (the ones on their profile, editable in Settings → Specialisation).
  // Falls back to the legacy single `category` field. Changing categories in
  // Settings automatically changes this dropdown, because both read the same
  // `user.categories`.
  const allowedCategories = React.useMemo(() => {
    const raw: string[] =
      Array.isArray(user?.categories) && user.categories.length > 0
        ? user.categories
        : user?.category
          ? [user.category]
          : [];
    return CATEGORIES.filter((c) => raw.includes(c));
  }, [user]);

  // If the selected category is no longer one of the supplier's own (e.g. it
  // was removed in Settings), clear it so the form cannot submit it.
  useEffect(() => {
    if (category && !allowedCategories.includes(category)) setCategory('');
  }, [allowedCategories, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setImageError('');

    const parsedPrice = Number(price);
    const parsedMoq = Number(moq);
    const parsedMeasure = Number(measureValue);
    const parsedStock = Number(stock);
    if (!name.trim()) { setFormError('Product name is required.'); return; }
    if (!category) { setFormError('Category is required.'); return; }
    if (!allowedCategories.includes(category)) {
      setFormError('Please choose one of your own categories (Settings → Specialisation).');
      return;
    }
    if (measure !== 'dozen' && !packType) { setFormError('Pack type is required.'); return; }
    if (measure === 'kg' && (!Number.isFinite(parsedMeasure) || parsedMeasure <= 0)) { setFormError('Pack weight must be a positive number.'); return; }
    if (measure === 'liter' && (!Number.isFinite(parsedMeasure) || parsedMeasure <= 0)) { setFormError('Pack volume must be a positive number.'); return; }
    if (!description.trim()) { setFormError('Product description is required.'); return; }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) { setFormError('Wholesale price must be a positive number.'); return; }
    if (!Number.isFinite(parsedMoq) || parsedMoq <= 0) { setFormError('MOQ must be a positive whole number.'); return; }
    if (!Number.isFinite(parsedStock) || parsedStock < parsedMoq) { setFormError('Available stock must be a whole number equal to or above the MOQ.'); return; }
    if (photos.length === 0) {
      setImageError('Upload at least one photo of the product — buyers see this picture on the marketplace.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      // Down-scale/re-encode each photo and send it as a base64 data URL; the
      // API stores the files and links them to this listing.
      const uploaded = await Promise.all(photos.map((photo) => toProductImagePayload(photo.file)));

      // The backend Product has a single free-text `unit` field (no separate
      // pack-weight field), so the measure + pack type are encoded into it:
      // "25kg bag" (kg), "5L bottle" (liter), "dozen" (dozen). The ProductCard
      // parses that same string back into "Rs / bag", "Min: 5 bag" and
      // "1 bag = 25 kg" for buyers.
      const unit = measure === 'dozen'
        ? 'dozen'
        : measure === 'liter'
          ? `${parsedMeasure}L ${packType}`
          : `${parsedMeasure}kg ${packType}`;

      await api.createProduct({
        name: name.trim(), category, unit, price: parsedPrice,
        moq: parsedMoq, stock: parsedStock,
        description: description.trim(),
        images: uploaded,
      });
      router.push('/supplier/my-products');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to publish product.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // The pack noun for the price/MOQ/stock labels — follows the chosen
  // measure and pack type, so a liter product reads "per bottle" and a
  // dozen product reads "per dozen", never "per pack".
  const packNoun = measure === 'dozen' ? 'dozen' : packType || 'pack';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/supplier/my-products" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </Link>
      </div>
      {/* Bell fix — heading block replaced by the header (same title). */}
      <PortalHeader title="Add New Product" subtitle="Supplier Portal" />
      {!authLoading && allowedCategories.length === 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 max-w-2xl">
          You haven&apos;t selected your product categories yet.{' '}
          <Link href="/supplier/settings" className="font-semibold underline">Choose them in Settings</Link>{' '}
          before publishing a product — you can only list in your own categories.
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <Input label="Product Name" value={name} onChange={e => setName(e.target.value)} placeholder="Premium Basmati Rice" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block"><span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Category</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={authLoading || allowedCategories.length === 0}
              className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
            >
              <option value="" disabled>{authLoading ? 'Loading…' : 'Select category'}</option>
              {allowedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <Input label={`Price per ${packNoun} (PKR)`} type="number" min={1} step={0.01} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="450" />
          <label className="block"><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">MOQ (minimum {pluralPack(packNoun)})</span>
            <input type="number" min={1} step={1} inputMode="numeric" value={moq} onChange={e => setMoq(e.target.value)} className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20" placeholder="10" />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Unit</span>
            <select
              value={measure}
              onChange={e => {
                const next = e.target.value as Measure;
                setMeasure(next);
                // A dozen IS the pack — no container or weight to pick.
                if (next === 'dozen') setPackType('dozen');
                else if (packType === 'dozen') setPackType('');
              }}
              className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              {MEASURES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Pack Type</span>
            <select
              value={packType}
              onChange={e => setPackType(e.target.value)}
              disabled={measure === 'dozen'}
              className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
            >
              <option value="" disabled>Select pack type</option>
              {measure === 'dozen'
                ? <option value="dozen">dozen</option>
                : PACK_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {measure !== 'dozen' && (
            <Input
              label={measure === 'liter' ? 'Pack Volume (liters)' : 'Pack Weight (kg)'}
              type="number" min={0.01} step={0.01} inputMode="decimal"
              value={measureValue} onChange={e => setMeasureValue(e.target.value)}
              placeholder={measure === 'liter' ? '5' : '25'}
            />
          )}
          <Input label={`Stock (available ${pluralPack(packNoun)})`} type="number" min={0} step={1} inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} placeholder="500" />
        </div>
        <label className="block"><span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Product Description</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="Describe quality, origin, packaging..." className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none" />
        </label>
        <div className="space-y-2">
          <ProductImageUpload
            images={photos}
            onChange={(next) => { setPhotos(next); if (next.length) setImageError(''); }}
            error={imageError}
          />
        </div>
        {formError && <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">{formError}</div>}
        <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Link href="/supplier/my-products" className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</Link>
          <Button type="submit" isLoading={isSubmitting}><Sparkles className="w-4 h-4 mr-2" />Publish Product</Button>
        </div>
      </form>
    </div>
  );
}
