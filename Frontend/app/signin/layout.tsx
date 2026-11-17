import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Asan Tijarat - Supplier & Shopkeeper Portal',
  description: 'Sign in to your Asan Tijarat account to manage orders, products and payments. Separate portals for suppliers and shopkeepers across Pakistan.',
  openGraph: {
    title: 'Sign In | Asan Tijarat - Supplier & Shopkeeper Portal',
    description: 'Sign in to your Asan Tijarat account to manage orders, products and payments. Separate portals for suppliers and shopkeepers across Pakistan.',
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
    title: 'Sign In | Asan Tijarat - Supplier & Shopkeeper Portal',
    description: 'Sign in to your Asan Tijarat account to manage orders, products and payments. Separate portals for suppliers and shopkeepers across Pakistan.',
    images: ['/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
