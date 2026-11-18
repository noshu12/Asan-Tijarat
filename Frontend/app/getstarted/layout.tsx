import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Started | Join Asan Tijarat as a Supplier or Shopkeeper',
  description: 'Create your free Asan Tijarat account in 3 steps. Suppliers list wholesale lots; shopkeepers order bulk kiryana goods direct from suppliers.',
  openGraph: {
    type: 'website',
    url: 'https://asan-tijarat.vercel.app/getstarted',
    title: 'Get Started | Join Asan Tijarat as a Supplier or Shopkeeper',
    description: 'Create your free Asan Tijarat account in 3 steps. Suppliers list wholesale lots; shopkeepers order bulk kiryana goods direct from suppliers.',
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
    title: 'Get Started | Join Asan Tijarat as a Supplier or Shopkeeper',
    description: 'Create your free Asan Tijarat account in 3 steps. Suppliers list wholesale lots; shopkeepers order bulk kiryana goods direct from suppliers.',
    images: ['/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
