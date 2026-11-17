import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'Asan Tijarat | B2B Wholesale Marketplace in Pakistan',
  description: 'Buy and sell bulk kiryana goods across Pakistan on Asan Tijarat. Suppliers list wholesale lots with MOQ and pack price; shopkeepers order direct, no middleman.',
};

export default function HomePage() {
  return <HomeClient />;
}
