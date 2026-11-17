import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Asan Tijarat - Supplier & Shopkeeper Portal',
  description: 'Sign in to your Asan Tijarat account to manage orders, products and payments. Separate portals for suppliers and shopkeepers across Pakistan.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
