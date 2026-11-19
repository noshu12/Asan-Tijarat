import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'Asan Tijarat | B2B Wholesale Marketplace in Pakistan',
  description: 'Buy and sell bulk kiryana goods across Pakistan on Asan Tijarat. Suppliers list wholesale lots with MOQ and pack price; shopkeepers order direct, no middleman.',
  openGraph: {
    type: 'website',
    url: 'https://asan-tijarat.vercel.app',
    title: 'Asan Tijarat | B2B Wholesale Marketplace in Pakistan',
    description: 'Buy and sell bulk kiryana goods across Pakistan on Asan Tijarat. Suppliers list wholesale lots with MOQ and pack price; shopkeepers order direct, no middleman.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Asan Tijarat — B2B Wholesale Marketplace Pakistan',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Asan Tijarat | B2B Wholesale Marketplace in Pakistan',
    description: 'Buy and sell bulk kiryana goods across Pakistan on Asan Tijarat. Suppliers list wholesale lots with MOQ and pack price; shopkeepers order direct, no middleman.',
    images: ['/og-image.png'],
  },

  alternates: {
    canonical: 'https://asan-tijarat.vercel.app/',
  },
};

export default function HomePage() {
  return <HomeClient />;
}
