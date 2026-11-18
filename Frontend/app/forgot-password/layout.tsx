import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password | Reset Your Asan Tijarat Account',
  description: 'Locked out of your Asan Tijarat supplier or shopkeeper account? Enter your registered email address and we will send a secure password reset link.',
  openGraph: {
    type: 'website',
    url: 'https://asan-tijarat.vercel.app/forgot-password',
    title: 'Forgot Password | Reset Your Asan Tijarat Account',
    description: 'Locked out of your Asan Tijarat supplier or shopkeeper account? Enter your registered email address and we will send a secure password reset link.',
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
    title: 'Forgot Password | Reset Your Asan Tijarat Account',
    description: 'Locked out of your Asan Tijarat supplier or shopkeeper account? Enter your registered email address and we will send a secure password reset link.',
    images: ['/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
