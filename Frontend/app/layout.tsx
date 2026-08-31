import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { ProductProvider } from '@/context/ProductContext';
import { OrderProvider } from '@/context/OrderContext';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Asan Tijarat | Pakistan\'s AI-Powered B2B Wholesale Marketplace',
  description: 'Connect verified suppliers and shopkeepers across Pakistan. AI recommendations, real-time demand forecasting, and secure trade escrow.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased flex flex-col font-sans transition-colors duration-200">
        <ToastProvider>
          <CartProvider>
            <AuthProvider>
              <OrderProvider>
                <ProductProvider>
                  <Navbar />
                  <main className="flex-1">
                    {children}
                  </main>
                </ProductProvider>
              </OrderProvider>
            </AuthProvider>
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
