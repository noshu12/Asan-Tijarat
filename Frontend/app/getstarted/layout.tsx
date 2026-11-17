import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Started | Join Asan Tijarat as a Supplier or Shopkeeper',
  description: 'Create your free Asan Tijarat account in 3 steps. Suppliers list wholesale lots; shopkeepers order bulk kiryana goods direct from suppliers.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
