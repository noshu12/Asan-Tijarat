import type { Metadata } from 'next';
import { AdminClient } from './AdminClient';

/**
 * Real noindex for the whole admin section (Batch 12, item 6): the
 * robots.txt disallow alone does not stop a page being indexed if it is
 * linked elsewhere, so the admin layout also emits robots noindex,
 * nofollow — same pattern as the Terms/Privacy pages.
 *
 * This layout must stay a SERVER component so it can export metadata
 * (a "use client" file cannot export metadata). The interactive shell —
 * auth gate, sidebar, sub-admin gate — lives in AdminClient.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminClient>{children}</AdminClient>;
}
