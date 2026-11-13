"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/TurnstileWidget';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await api.forgotPassword(email.trim(), tsToken || undefined);
      setSuccessMessage(res.message || 'If an account exists for this email, a password reset link has been sent.');
      // FIX (Batch 03) — pehle success message dikhate hi 2.5 second me
      // /signin pe redirect ho jata tha, is liye user message parh hi nahi
      // pata tha. Ab koi auto-redirect nahi hai: message screen pe rehta
      // hai aur neeche "Go to Sign In" button hai — user jab chahe jaye.
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unexpected error. Please try again.');
      }
      // Token is single-use — reset the widget so the retry gets a fresh one.
      setTsToken(null);
      setTsKey((k) => k + 1);
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

        {successMessage ? (
          <div className="space-y-4 mt-6">
            <p role="alert" className="text-xs font-semibold leading-relaxed text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
              {successMessage}
            </p>
            <p className="text-xs text-slate-500">
              Apna email inbox check karo — reset link wahan aayega. Link se naya password set karne ke baad yahin se sign in kar sakte ho.
            </p>
            <Link
              href="/signin"
              className="flex items-center justify-center w-full h-12 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold transition"
            >
              Go to Sign In
            </Link>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {errorMessage && (
            <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
              {errorMessage}
            </p>
          )}

          {isTurnstileConfigured() && (
            <TurnstileWidget key={tsKey} onVerify={setTsToken} onExpire={() => setTsToken(null)} />
          )}

          <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
            Send Reset Instructions
          </Button>
        </form>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          <Link href="/signin" className="font-bold text-asan-accent dark:text-asan-accent-light hover:underline">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
