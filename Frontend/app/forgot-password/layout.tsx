import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password | Reset Your Asan Tijarat Account',
  description: 'Locked out of your Asan Tijarat supplier or shopkeeper account? Enter your registered email address and we will send a secure password reset link.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
