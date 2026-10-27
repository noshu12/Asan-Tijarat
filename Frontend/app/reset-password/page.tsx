"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  // Token sirf andar hi andar rakha jayega — ye kabhi screen par
  // render nahi hoga, na kisi Input mein, na kisi text mein.
  const [token, setToken] = useState('');
  const [tokenReady, setTokenReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) setToken(urlToken);
    setTokenReady(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!token) {
      setErrorMessage('Reset link is missing or expired. Request a new reset link.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.resetPassword(token.trim(), newPassword);
      setSuccessMessage(res.message || 'Password reset. You can now sign in with the new password.');
      // Reset ho gaya to seedha Sign In par bhej do
      router.push('/signin');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unexpected error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Input component wali hi styling, sirf eye button ke liye
  // right side par jagah (pr-11) chhodi gayi hai.
  const passwordInputClassName =
    "w-full h-11 px-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-asan-accent focus:outline-none focus:ring-2 focus:ring-asan-accent/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-asan-accent disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Reset Password</h3>
        <p className="text-xs text-slate-500 mt-1">
          Set a new password (at least 8 characters).
        </p>

        {tokenReady && !token ? (
          <div className="space-y-4 mt-6">
            <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
              Reset link is missing or expired. Request a new reset link from the Forgot Password page.
            </p>
            <p className="text-center text-xs text-slate-500">
              <Link href="/forgot-password" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                Request a new reset link
              </Link>
              {'  •  '}
              <Link href="/signin" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                Back to Sign In
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="w-full space-y-1.5">
              <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className={passwordInputClassName}
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="w-full space-y-1.5">
              <label htmlFor="confirm-new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={passwordInputClassName}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {successMessage && (
              <p role="alert" className="text-xs font-semibold leading-relaxed text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
                {successMessage}
              </p>
            )}

            {errorMessage && (
              <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
                {errorMessage}
              </p>
            )}

            <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
              Reset Password
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          <Link href="/signin" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Back to Sign In
          </Link>
          {'  •  '}
          <Link href="/forgot-password" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Request a new reset link
          </Link>
        </p>
      </div>
    </div>
  );
}
