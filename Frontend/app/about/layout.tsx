import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Asan Tijarat | B2B Wholesale Marketplace Pakistan',
  description: 'Learn how Asan Tijarat removes the middleman from Pakistani wholesale. Suppliers and shopkeepers trade direct, with clear prices, MOQ and escrow.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
