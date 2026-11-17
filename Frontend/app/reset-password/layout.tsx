import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | Asan Tijarat',
  description: 'Choose a new password for your Asan Tijarat account. It must be at least 8 characters long and is stored securely, hashed, never in plain text.',
  openGraph: {
    title: 'Reset Password | Asan Tijarat',
    description: 'Choose a new password for your Asan Tijarat account. It must be at least 8 characters long and is stored securely, hashed, never in plain text.',
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
    title: 'Reset Password | Asan Tijarat',
    description: 'Choose a new password for your Asan Tijarat account. It must be at least 8 characters long and is stored securely, hashed, never in plain text.',
    images: ['/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
