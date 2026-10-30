import Link from 'next/link';
import PrivacyContent from '@/components/PrivacyContent';
import { Footer } from '@/components/Footer';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          ← Back to Home
        </Link>

        <h1 className="mt-6 text-3xl font-bold text-gray-900">
          Privacy Policy
        </h1>
        <p className="mt-2 text-gray-600">
          How Asan Tijarat collects, uses, and protects your information.
        </p>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <PrivacyContent />
        </div>
      </main>

      <Footer />
    </div>
  );
}
