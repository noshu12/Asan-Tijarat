"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RedirectIfAuthed } from '@/components/AuthGuards';
import { useToast } from '@/context/ToastContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Store,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Truck,
  Check,
  UploadCloud,
  FileCheck,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function GetStartedPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<'shopkeeper' | 'supplier'>('supplier');

  // Step 1: Personal Info
  const [firstName, setFirstName] = useState('Ahmed');
  const [lastName, setLastName] = useState('Khan');
  const [phone, setPhone] = useState('0300 1234567');
  const [email, setEmail] = useState('ahmed@akenterprises.pk');
  const [password, setPassword] = useState('password123');

  // Step 2: Business Info
  const [businessName, setBusinessName] = useState('Ahmed Khan Enterprises');
  const [category, setCategory] = useState('Rice & Grains');
  const [city, setCity] = useState('Lahore');
  const [ntn, setNtn] = useState('1234567-8');

  // Step 3: Verification
  const [otp, setOtp] = useState(['5', '8', '2', '4', '9', '1']);
  const [cnicUploaded, setCnicUploaded] = useState(true);
  const [ntnUploaded, setNtnUploaded] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preselect account type from CTAs like /getstarted?role=shopkeeper
  useEffect(() => {
    const roleParam = new URLSearchParams(window.location.search).get('role');
    if (roleParam === 'shopkeeper' || roleParam === 'supplier') {
      setRole(roleParam);
    }
  }, []);

  // Warm up the role dashboards in the background so the post-registration
  // router.push() feels instant (Next.js compiles routes lazily in dev).
  useEffect(() => {
    router.prefetch('/supplier/dashboard');
    router.prefetch('/shopkeeper/dashboard');
  }, [router]);

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCompleteRegistration = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (err) {}

      showToast('Registration complete! Account verified successfully.', 'success');
      login(role);
    }, 500);
  };

  return (
    <RedirectIfAuthed>
    <div className="min-h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
      
      {/* Left Brand Panel */}
      <div className="w-full md:w-1/2 bg-asan-dark text-white p-8 sm:p-14 lg:p-20 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Asan Tijarat logo"
              className="w-10 h-10 rounded-xl object-contain"
            />
            <span className="font-bold text-2xl tracking-tight">Asan Tijarat</span>
          </Link>

          <div className="mt-16 sm:mt-24">
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Pakistan&apos;s leading <br />
              <span className="text-emerald-400">B2B trade platform</span>
            </h2>

            <div className="mt-10 space-y-4 text-sm sm:text-base text-emerald-100/90">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Verified supplier badges & NTN verification</span>
              </div>
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-asan-accent shrink-0" />
                <span>AI-powered recommendations & demand predictions</span>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-asan-accent shrink-0" />
                <span>JazzCash, EasyPaisa, and Escrow protection</span>
              </div>
              <div className="flex items-center gap-3">
                <Truck className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Real-time nationwide logistics tracking</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-xs text-emerald-200/50">
          © 2026 Asan Tijarat. Final Year Project — FUUAST. All rights reserved.
        </div>
      </div>

      {/* Right Form Wizard */}
      <div className="w-full md:w-1/2 p-6 sm:p-12 lg:p-16 flex items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
          
          {/* Multi-Step Progress Indicator (Matching sl1, sl2, sl3) */}
          <div className="flex items-center justify-between mb-8 px-4">
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                step > 1 ? 'bg-asan-accent text-white' : step === 1 ? 'bg-asan-accent text-white ring-4 ring-emerald-100 dark:ring-emerald-950' : 'bg-slate-200 text-slate-600'
              }`}>
                {step > 1 ? <Check className="w-4 h-4" /> : '1'}
              </div>
            </div>

            <div className={`flex-1 h-1 mx-2 rounded ${step >= 2 ? 'bg-asan-accent' : 'bg-slate-200 dark:bg-slate-800'}`} />

            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                step > 2 ? 'bg-asan-accent text-white' : step === 2 ? 'bg-asan-accent text-white ring-4 ring-emerald-100 dark:ring-emerald-950' : 'bg-slate-200 text-slate-600'
              }`}>
                {step > 2 ? <Check className="w-4 h-4" /> : '2'}
              </div>
            </div>

            <div className={`flex-1 h-1 mx-2 rounded ${step >= 3 ? 'bg-asan-accent' : 'bg-slate-200 dark:bg-slate-800'}`} />

            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                step === 3 ? 'bg-asan-accent text-white ring-4 ring-emerald-100 dark:ring-emerald-950' : 'bg-slate-200 text-slate-600'
              }`}>
                3
              </div>
            </div>
          </div>

          {/* STEP 1: CREATE ACCOUNT */}
          {step === 1 && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Create Account</h3>
                <p className="text-xs text-slate-500 mt-1">Register as a wholesale trader or supplier</p>

                {/* Role Switcher */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setRole('supplier')}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      role === 'supplier'
                        ? 'bg-emerald-50 border-asan-accent text-asan-dark dark:bg-emerald-950 dark:text-emerald-300'
                        : 'border-slate-200 text-slate-500 dark:border-slate-800'
                    }`}
                  >
                    🏭 Supplier
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('shopkeeper')}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      role === 'shopkeeper'
                        ? 'bg-emerald-50 border-asan-accent text-asan-dark dark:bg-emerald-950 dark:text-emerald-300'
                        : 'border-slate-200 text-slate-500 dark:border-slate-800'
                    }`}
                  >
                    🏪 Shopkeeper
                  </button>
                </div>
              </div>

              <form onSubmit={handleStep1} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="First Name"
                    placeholder="Ahmed"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                  <Input
                    label="Last Name"
                    placeholder="Khan"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>

                <Input
                  label="Phone Number"
                  placeholder="+92 300 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />

                <Input
                  label="Email"
                  type="email"
                  placeholder="ahmed@company.pk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <Button type="submit" className="w-full h-12 text-sm font-bold mt-2">
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </form>
            </div>
          )}

          {/* STEP 2: BUSINESS DETAILS */}
          {step === 2 && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Business Details</h3>
                <p className="text-xs text-slate-500 mt-1">Tell us about your trading enterprise</p>
              </div>

              <form onSubmit={handleStep2} className="space-y-4">
                <Input
                  label="Business / Enterprise Name"
                  placeholder="Khan Enterprises Ltd."
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Business Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
                  >
                    <option value="Rice & Grains">Rice & Grains</option>
                    <option value="Textiles & Fabric">Textiles & Fabric</option>
                    <option value="Spices & Seasoning">Spices & Seasoning</option>
                    <option value="Dairy & Edible Oils">Dairy & Edible Oils</option>
                    <option value="Minerals & Salt">Minerals & Salt</option>
                    <option value="Fresh Produce">Fresh Mandi Produce</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    City / Mandi Hub
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
                  >
                    <option value="Karachi">Karachi (Sindh)</option>
                    <option value="Lahore">Lahore (Punjab)</option>
                    <option value="Faisalabad">Faisalabad (Textile Hub)</option>
                    <option value="Multan">Multan (Spice & Cotton Hub)</option>
                    <option value="Rawalpindi">Rawalpindi / Islamabad</option>
                    <option value="Hyderabad">Hyderabad</option>
                    <option value="Peshawar">Peshawar (KPK)</option>
                    <option value="Quetta">Quetta (Balochistan)</option>
                  </select>
                </div>

                <Input
                  label="NTN Number (National Tax Number)"
                  placeholder="1234567-8"
                  value={ntn}
                  onChange={(e) => setNtn(e.target.value)}
                  helperText="Required for verified trader badge"
                  required
                />

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="w-1/3">
                    Back
                  </Button>
                  <Button type="submit" className="w-2/3">
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: VERIFICATION & DOCUMENTS */}
          {step === 3 && (
            <div>
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Verification</h3>
                <p className="text-xs text-slate-500 mt-1">Upload required compliance documents</p>
              </div>

              {/* OTP alert banner */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>OTP sent to +92 300 ****567. Enter below to verify.</span>
              </div>

              <form onSubmit={handleCompleteRegistration} className="space-y-4">
                {/* OTP Digits */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">
                    OTP Code
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          const next = [...otp];
                          next[i] = e.target.value;
                          setOtp(next);
                        }}
                        className="h-11 text-center font-bold text-base rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
                      />
                    ))}
                  </div>
                </div>

                {/* CNIC Upload */}
                <div className="p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center hover:border-emerald-500/50 transition cursor-pointer">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Upload CNIC Front / Back</p>
                  <p className="text-[10px] text-slate-400">PNG, JPG or PDF • max 5MB (Simulated cnic_front.jpg)</p>
                </div>

                {/* Business Certificate Upload */}
                <div className="p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center hover:border-emerald-500/50 transition cursor-pointer">
                  <FileCheck className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Upload Business Certificate / NTN</p>
                  <p className="text-[10px] text-slate-400">PNG, JPG or PDF • max 5MB (Simulated ntn_cert.pdf)</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="w-1/3">
                    Back
                  </Button>
                  <Button type="submit" isLoading={isSubmitting} className="w-2/3 h-12 text-xs font-bold">
                    Complete Registration
                  </Button>
                </div>
              </form>
            </div>
          )}

          <p className="text-center text-xs text-slate-500 mt-6">
            Already have an account?{' '}
            <Link href="/signin" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
              Sign In
            </Link>
          </p>

        </div>
      </div>

    </div>
    </RedirectIfAuthed>
  );
}