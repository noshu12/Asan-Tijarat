import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wholesale Marketplace | Bulk Kiryana Goods - Asan Tijarat',
  description: 'Browse wholesale lots from verified suppliers across Pakistan. Compare price per pack, MOQ and stock, then order bulk kiryana goods direct from suppliers.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
