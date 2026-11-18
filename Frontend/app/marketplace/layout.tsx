import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wholesale Marketplace | Bulk Kiryana Goods - Asan Tijarat',
  description: 'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.',
  openGraph: {
    type: 'website',
    url: 'https://asan-tijarat.vercel.app/marketplace',
    title: 'Wholesale Marketplace | Bulk Kiryana Goods - Asan Tijarat',
    description: 'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.',
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
    title: 'Wholesale Marketplace | Bulk Kiryana Goods - Asan Tijarat',
    description: 'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.',
    images: ['/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
