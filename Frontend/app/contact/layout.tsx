import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Asan Tijarat | Support for Suppliers & Shopkeepers',
  description: 'Questions about buying or selling wholesale on Asan Tijarat? Send us a message through the contact form and our team will get back to you soon.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
