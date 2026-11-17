import Link from 'next/link';
import TermsContent from '@/components/TermsContent';
import { Footer } from '@/components/Footer';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Asan Tijarat',
  description: 'Read the terms of service for using Asan Tijarat: accounts, KYC, orders, payments, disputes, and the responsibilities of suppliers and shopkeepers.',
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-asan-accent-hover hover:text-asan-dark"
        >
          ← Back to Home
        </Link>

        <h1 className="mt-6 text-3xl font-bold text-gray-900">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-gray-600">
          Please read these terms carefully before creating an account or
          using Asan Tijarat.
        </p>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <TermsContent />
        </div>
      </main>

      <Footer />
    </div>
  );
}
