"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProductImageUpload, ProductImageDraft } from '@/components/ProductImageUpload';
import { toProductImagePayload } from '@/lib/uploads';
import { Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

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

const PACK_TYPES = ['bag', 'carton', 'tin', 'box', 'drum', 'pack'];

export default function SupplierAddProductPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState('');
  const [packType, setPackType] = useState('');
  const [packWeight, setPackWeight] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  // Photos picked from the supplier's device. The first one is the cover image
  // and they are uploaded with the listing (no stock/placeholder pictures).
  const [photos, setPhotos] = useState<ProductImageDraft[]>([]);
  const [imageError, setImageError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setImageError('');

    const parsedPrice = Number(price);
    const parsedMoq = Number(moq);
    const parsedWeight = Number(packWeight);
    const parsedStock = Number(stock);
    if (!name.trim()) { setFormError('Product name is required.'); return; }
    if (!category) { setFormError('Category is required.'); return; }
    if (!packType) { setFormError('Pack type is required.'); return; }
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) { setFormError('Pack weight must be a positive number.'); return; }
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
      // pack-weight field), so pack type + weight are encoded into it, e.g.
      // "25kg bag". The ProductCard parses that same string back into
      // "Rs / bag", "Min: 5 bag" and "1 bag = 25 kg" for buyers.
      const unit = `${parsedWeight}kg ${packType}`;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/supplier/my-products" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-2xl"><Sparkles className="w-6 h-6 text-violet-600 dark:text-violet-400" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Add New Product</h1>
          <p className="text-sm text-slate-500">Publish a listing to the marketplace</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <Input label="Product Name" value={name} onChange={e => setName(e.target.value)} placeholder="Premium Basmati Rice" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block"><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Category</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20">
              <option value="" disabled>Select category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <Input label="Price per pack (PKR)" type="number" min={1} step={0.01} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="450" />
          <label className="block"><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">MOQ (minimum packs)</span>
            <input type="number" min={1} step={1} inputMode="numeric" value={moq} onChange={e => setMoq(e.target.value)} className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20" placeholder="10" />
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block"><span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Pack Type</span>
            <select value={packType} onChange={e => setPackType(e.target.value)} className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm dark:text-white focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20">
              <option value="" disabled>Select pack type</option>
              {PACK_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <Input label="Pack Weight (kg)" type="number" min={0.01} step={0.01} inputMode="decimal" value={packWeight} onChange={e => setPackWeight(e.target.value)} placeholder="25" />
          <Input label="Stock (available packs)" type="number" min={0} step={1} inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} placeholder="500" />
        </div>
        <label className="block"><span className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Product Description</span>
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
