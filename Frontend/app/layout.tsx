import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { AuthProvider } from '@/context/AuthProvider';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://asan-tijarat.vercel.app'),
  title: 'Asan Tijarat | B2B Wholesale Marketplace',
  description: 'Connect suppliers and shopkeepers across Pakistan. Separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown.',
  openGraph: {
    type: 'website',
    locale: 'en_PK',
    url: 'https://asan-tijarat.vercel.app',
    siteName: 'Asan Tijarat',
    title: 'Asan Tijarat | B2B Wholesale Marketplace',
    description: 'Connect suppliers and shopkeepers across Pakistan. Separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown.',
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
    title: 'Asan Tijarat | B2B Wholesale Marketplace',
    description: 'Connect suppliers and shopkeepers across Pakistan. Separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.className} min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased flex flex-col font-sans transition-colors duration-200`}>
        <AuthProvider>
          <Navbar />
          <main className="flex-1">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
