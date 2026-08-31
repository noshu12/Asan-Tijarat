"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/context/ProductContext';
import { UploadCloud, Video, Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function SupplierAddProductPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { createProduct } = useProducts();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Rice & Grains');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('50kg bag');
  const [moq, setMoq] = useState('10');
  const [stock, setStock] = useState('500');
  const [description, setDescription] = useState('');
  const [images] = useState([
    'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=640&h=640&fit=crop'
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!user) {
      showToast('Please sign in as a supplier before publishing a product.', 'error');
      return;
    }
    const parsedPrice = Number(price);
    const parsedMoq = Number(moq);
    const parsedStock = Number(stock);
    if (!name.trim()) {
      setFormError('Product name is required.');
      showToast('Product name is required.', 'error');
      return;
    }
    if (!description.trim()) {
      setFormError('Product description is required.');
      showToast('Product description is required.', 'error');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFormError('Wholesale price must be a positive number.');
      showToast('Wholesale price must be a positive number.', 'error');
      return;
    }
    if (!Number.isInteger(parsedMoq) || parsedMoq <= 0) {
      setFormError('MOQ must be a positive whole number.');
      showToast('MOQ must be a positive whole number.', 'error');
      return;
    }
    if (!Number.isInteger(parsedStock) || parsedStock < parsedMoq) {
      setFormError('Available stock must be a whole number equal to or above the MOQ.');
      showToast('Available stock must be a whole number equal to or above the MOQ.', 'error');
      return;
    }
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      createProduct({
        name: name.trim(),
        category,
        price: parsedPrice,
        unit: unit.trim(),
        moq: parsedMoq,
        stock: parsedStock,
        description: description.trim(),
        image: images[0],
      }, user);
      showToast('Product successfully published to the wholesale marketplace!', 'success');
      router.push('/supplier/my-products');
    }, 1000);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/supplier/my-products"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
            Add New Wholesale Listing
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            List bulk commodity lots with photos, specifications, and MOQ
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Product Images & Video
            </h3>
            <span className="text-[11px] text-slate-400">High resolution photos increase conversions</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <img src={img} alt="Product lot" className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-bold">
                  Cover Photo
                </span>
              </div>
            ))}

            <div
              onClick={() => showToast('Simulated image uploaded!', 'info')}
              className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 flex flex-col items-center justify-center text-center p-3 cursor-pointer transition"
            >
              <UploadCloud className="w-6 h-6 text-slate-400 mb-1" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">+ Add Angle</p>
              <p className="text-[10px] text-slate-400">PNG, JPG up to 5MB</p>
            </div>

            <div
              onClick={() => showToast('Simulated 30s video walkthrough attached!', 'info')}
              className="aspect-square rounded-2xl border-2 border-dashed border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-500 flex flex-col items-center justify-center text-center p-3 cursor-pointer transition"
            >
              <Video className="w-6 h-6 text-asan-accent mb-1" />
              <p className="text-xs font-bold text-asan-dark dark:text-emerald-300">Lot Video (30s)</p>
              <p className="text-[10px] text-slate-400">Factory / Mandi clip</p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">General Information</h3>

          <Input
            label="Product Title"
            placeholder="e.g. Super Kernel Basmati Rice (Grade A Export Quality)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
              >
                <option value="Rice & Grains">Rice & Grains</option>
                <option value="Textiles">Textiles & Fabric</option>
                <option value="Spices">Spices & Masala</option>
                <option value="Dairy">Dairy & Ghee</option>
                <option value="Minerals">Himalayan Salt & Minerals</option>
                <option value="Vegetables">Fresh Mandi Produce</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Unit Type</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
              >
                <option value="50kg bag">50kg bag</option>
                <option value="100kg bag">100kg bag</option>
                <option value="5kg pack">5kg pack</option>
                <option value="100m roll">100m roll</option>
                <option value="5kg tin">5kg tin</option>
                <option value="100kg crate">100kg crate</option>
                <option value="15L Can">15L Can</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Wholesale Price (PKR per unit)"
              type="number"
              placeholder="4500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="1"
              step="1"
              required
            />
            <Input
              label="Minimum Order Quantity (MOQ)"
              type="number"
              placeholder="10"
              value={moq}
              onChange={(e) => setMoq(e.target.value)}
              min="1"
              step="1"
              required
            />
            <Input
              label="Available Stock (Units)"
              type="number"
              placeholder="500"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              min={moq || '1'}
              step="1"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Product Description & Quality Standards
              </label>
              <button
                type="button"
                onClick={() => {
                  setDescription('Double polished, aged 12 months with moisture level below 12%. 100% lab certified export grade with zero foreign particles.');
                  showToast('AI description generated!', 'success');
                }}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:underline"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Auto-Generate</span>
              </button>
            </div>
            <textarea
              rows={4}
              placeholder="Mention grain length, moisture content, certifications, shelf life..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-asan-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              required
            />
          </div>
        </div>

        {formError && (
          <p className="text-xs font-semibold text-red-500">{formError}</p>
        )}
        <div className="flex justify-end gap-3">
          <Link
            href="/supplier/my-products"
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </Link>
          <Button type="submit" isLoading={isSubmitting} className="h-11 px-6 text-xs font-bold">
            Publish Product Lot
          </Button>
        </div>
      </form>
    </div>
  );
}
