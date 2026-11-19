import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Asan Tijarat | B2B Wholesale Marketplace Pakistan',
  description: 'Learn how Asan Tijarat removes the middleman from Pakistani wholesale. Suppliers and shopkeepers trade direct, with clear prices, MOQ and escrow.',
  openGraph: {
    type: 'website',
    url: 'https://asan-tijarat.vercel.app/about',
    title: 'About Asan Tijarat | B2B Wholesale Marketplace Pakistan',
    description: 'Learn how Asan Tijarat removes the middleman from Pakistani wholesale. Suppliers and shopkeepers trade direct, with clear prices, MOQ and escrow.',
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
    title: 'About Asan Tijarat | B2B Wholesale Marketplace Pakistan',
    description: 'Learn how Asan Tijarat removes the middleman from Pakistani wholesale. Suppliers and shopkeepers trade direct, with clear prices, MOQ and escrow.',
    images: ['/og-image.png'],
  },

  alternates: {
    canonical: 'https://asan-tijarat.vercel.app/about',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
