"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';

// Same marketplace filter slugs as the marketplace page categories.
const CATEGORY_SLUG: Record<string, string> = {
  'Staples, Grains & Flours': 'staples-grains-flours',
  'Pulses, Lentils & Beans': 'pulses-lentils-beans',
  'Cooking Oils, Ghee & Fats': 'cooking-oils-ghee-fats',
  'Spices, Herbs & Baking': 'spices-herbs-baking',
  'Packaged Foods, Recipe Mixes & Sauces': 'packaged-foods-recipe-mixes-sauces',
  'Beverages & Cold Corner': 'beverages-cold-corner',
  'Tea, Coffee & Dairy': 'tea-coffee-dairy',
  'Snacks, Biscuits & Confectionery': 'snacks-biscuits-confectionery',
  'Instant & Ready-to-Cook Foods': 'instant-ready-to-cook-foods',
  'Home Cleaning & Sanitation': 'home-cleaning-sanitation',
  'Personal Care & Hygiene': 'personal-care-hygiene',
  'Mother & Baby Care': 'mother-baby-care',
  'Paper Products, Wraps & Utilities': 'paper-products-wraps-utilities',
  'Over-the-Counter Healthcare': 'over-the-counter-healthcare',
};

export function Footer() {
  // Real categories from GET /api/products. On backend failure this stays
  // empty on purpose — no hardcoded fallback, so no fake categories show.
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        // Batch 04 — the widest page (100): the category list below is
        // derived from these products, so it needs more than the default 50.
        const data = await api.products({ limit: 100 });
        setProducts(data.products);
      } catch {
        setProducts([]);
      }
    };
    void load();
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const product of products) {
      if (product.category && !seen.has(product.category)) {
        seen.add(product.category);
        list.push(product.category);
      }
    }
    return list;
  }, [products]);

  return (
    <footer className="bg-asan-accent-light text-asan-dark pt-16 pb-12 border-t border-asan-border select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="Asan Tijarat logo"
                width={40}
                height={40}
                className="w-10 h-10 rounded-xl object-contain"
              />
              <span className="font-bold text-2xl tracking-tight">Asan Tijarat</span>
            </div>
            <p className="text-xs text-asan-text-light leading-relaxed">
              A B2B wholesale marketplace connecting suppliers and shopkeepers. Separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-asan-accent">Quick Links</h4>
            <ul className="space-y-2 text-xs text-asan-text-light">
              <li><Link href="/" className="hover:text-asan-accent transition">Home</Link></li>
              <li><Link href="/marketplace" className="hover:text-asan-accent transition">Browse Marketplace</Link></li>
              <li><Link href="/about" className="hover:text-asan-accent transition">About Our Mission</Link></li>
              <li><Link href="/contact" className="hover:text-asan-accent transition">Contact & Support</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-asan-accent">Top Categories</h4>
            {categories.length === 0 ? (
              <p className="text-xs text-asan-text-light">No categories yet</p>
            ) : (
              <ul className="space-y-2 text-xs text-asan-text-light">
                {categories.map((category) => {
                  const slug = CATEGORY_SLUG[category];
                  const href = slug ? `/marketplace?cat=${slug}` : '/marketplace';
                  return (
                    <li key={category}>
                      <Link href={href} className="hover:text-asan-accent transition">
                        {category}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-asan-accent">Headquarters</h4>
            <div className="space-y-2 text-xs text-asan-text-light">
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-asan-accent shrink-0" />
                <span>FUUAST Campus, Gulshan-e-Iqbal, Karachi, Pakistan</span>
              </p>
              <p>
                <Link href="/contact" className="hover:text-asan-accent transition">
                  Contact & Support →
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-asan-border flex flex-col sm:flex-row items-center justify-between text-xs text-asan-text-light gap-4">
          <p>© 2026 Asan Tijarat. Final Year Project — Federal Urdu University (FUUAST).</p>
          <div className="flex items-center gap-5">
            <Link href="/terms" className="hover:text-asan-accent transition">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-asan-accent transition">Privacy Policy</Link>
          </div>
          <p className="text-[11px]">Cutting Out The Middle, Scaling Up The Profit</p>
        </div>
      </div>
    </footer>
  );
}
