"use client";

import React from 'react';
import { CartView } from '@/components/CartView';

/** Shopkeeper-portal cart shell around the shared CartView. */
export default function ShopkeeperCartPage() {
  return <CartView subtitle="Thursday, 3 July 2026 • Shopkeeper Portal" />;
}
