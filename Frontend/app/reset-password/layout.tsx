import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | Asan Tijarat',
  description: 'Choose a new password for your Asan Tijarat account. It must be at least 8 characters long and is stored securely, hashed, never in plain text.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
