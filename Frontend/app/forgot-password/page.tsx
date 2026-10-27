"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await api.forgotPassword(email.trim());
      setSuccessMessage(res.message || 'If an account exists for this email, a password reset link has been sent.');
      // Email wale flow mein reset page par NAHI jana — user email se link
      // kholega. Pehle "email check karo" message dikhao, phir Sign In par
      // wapas bhej do, taake wahan se reset ke baad login kar sake.
      window.setTimeout(() => {
        router.push('/signin');
      }, 2500);
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

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Forgot Password</h3>
        <p className="text-xs text-slate-500 mt-1">
          Enter your account email. If an account exists, you will receive reset instructions.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

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
            Send Reset Instructions
          </Button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          <Link href="/signin" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
