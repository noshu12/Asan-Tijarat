import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Asan Tijarat | Support for Suppliers & Shopkeepers',
  description: 'Questions about buying or selling wholesale on Asan Tijarat? Send us a message through the contact form and our team will get back to you soon.',
  openGraph: {
    type: 'website',
    url: 'https://asan-tijarat.vercel.app/contact',
    title: 'Contact Asan Tijarat | Support for Suppliers & Shopkeepers',
    description: 'Questions about buying or selling wholesale on Asan Tijarat? Send us a message through the contact form and our team will get back to you soon.',
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
    title: 'Contact Asan Tijarat | Support for Suppliers & Shopkeepers',
    description: 'Questions about buying or selling wholesale on Asan Tijarat? Send us a message through the contact form and our team will get back to you soon.',
    images: ['/og-image.png'],
  },

  alternates: {
    canonical: 'https://asan-tijarat.vercel.app/contact',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
