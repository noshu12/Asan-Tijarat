// GROUP2-AUTH-FIX 2026-11-27
"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import TermsContent from '@/components/TermsContent';
import { KycDocumentUpload, KycFileDraft } from '@/components/KycDocumentUpload';
import { toKycPayload } from '@/lib/uploads';
import {
  ShieldCheck,
  Check,
  ArrowRight,
  AlertCircle,
  MapPin,
  Eye,
  EyeOff,
  ChevronDown,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { api, ApiError, RegisterPayload, KycDocumentPayload } from '@/lib/api';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/TurnstileWidget';
import { useDeviceLocation } from '@/lib/useDeviceLocation';
import { Dropdown } from '@/components/ui/dropdown';

/**
 * Shown after a successful submission — mirrors the server's
 * PENDING_VERIFICATION_MESSAGE so the trader always sees the same policy.
 */
const PENDING_VERIFICATION_NOTICE =
  'Your account will be verified within 24 hours. Once your account has been verified, you can sign in using your registered credentials.';

/** How long the confirmation stays on screen before the Home-page redirect. */
const HOME_REDIRECT_DELAY_MS = 6000;

/** The 14 backend master categories — must match Backend/src/constants/categories.js exactly. */
const CATEGORIES = [
  'Staples, Grains & Flours',
  'Pulses, Lentils & Beans',
  'Cooking Oils, Ghee & Fats',
  'Spices, Herbs & Baking',
  'Packaged Foods, Recipe Mixes & Sauces',
  'Beverages & Cold Corner',
  'Tea, Coffee & Dairy',
  'Snacks, Biscuits & Confectionery',
  'Instant & Ready-to-Cook Foods',
  'Home Cleaning & Sanitation',
  'Personal Care & Hygiene',
  'Mother & Baby Care',
  'Paper Products, Wraps & Utilities',
  'Over-the-Counter Healthcare',
];

/** City / Mandi Hub options — same values + labels as the old native
 * select (the value sent to the backend is the plain city name). */
const CITY_OPTIONS = [
  { value: '', label: 'Select city' },
  { value: 'Karachi', label: 'Karachi (Sindh)' },
  { value: 'Lahore', label: 'Lahore (Punjab)' },
  { value: 'Faisalabad', label: 'Faisalabad (Textile Hub)' },
  { value: 'Multan', label: 'Multan (Spice & Cotton Hub)' },
  { value: 'Rawalpindi', label: 'Rawalpindi / Islamabad' },
  { value: 'Hyderabad', label: 'Hyderabad' },
  { value: 'Peshawar', label: 'Peshawar (KPK)' },
  { value: 'Quetta', label: 'Quetta (Balochistan)' },
];

/** Shop types for the shopkeeper form — a shopkeeper NEVER picks a product category. */
const SHOP_TYPES = [
  'Kiryana Store',
  'General Store',
  'Provision Store',
  'Super Store',
  'Mart',
  'Departmental Store',
  'Shopping Centre',
  'Cash & Carry',
  'Traders',
  'Simple Store',
];

/**
 * Searchable multi-select dropdown for the 14 supplier categories.
 * Replaces the long checkbox list — same payload (string[]), only the look changed.
 */
function CategoryMultiSelect({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (category: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = CATEGORIES.filter((c) =>
    c.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        Business Categories (select at least one)
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent flex items-center justify-between gap-2"
        >
          <span className={selected.length === 0 ? 'text-slate-400' : 'font-semibold'}>
            {selected.length === 0
              ? 'Search & select categories'
              : `${selected.length} categor${selected.length === 1 ? 'y' : 'ies'} selected`}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <>
            {/* Outside-click catcher */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
              <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1">
                {filtered.map((cat) => (
                  <label
                    key={cat}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      selected.includes(cat)
                        ? 'bg-asan-accent-light text-asan-dark dark:bg-asan-dark dark:text-asan-accent-light'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(cat)}
                      onChange={() => onToggle(cat)}
                      className="w-4 h-4 accent-asan-accent"
                    />
                    {cat}
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-xs text-slate-400 text-center">
                    No categories found
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Selected chips — removable without reopening the dropdown */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-asan-accent-light text-asan-dark border border-asan-border dark:bg-asan-dark dark:text-asan-accent-light dark:border-asan-mid"
            >
              {cat}
              <button
                type="button"
                aria-label={`Remove ${cat}`}
                onClick={() => onToggle(cat)}
                className="hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GetStartedPage() {
  const router = useRouter();

  // Device GPS capture — the browser permission pop-up opens when the trader
  // focuses the location field (or presses the detect button).
  const deviceLocation = useDeviceLocation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<'shopkeeper' | 'supplier'>('supplier');

  // Step 1: Personal Info — intentionally empty, no demo prefill.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Step 1: location details — labels differ per role, payload keys stay the
  // same so the current backend keeps working for suppliers.
  // Supplier → Warehouse Address + Warehouse Location.
  // Shopkeeper → House Address + Shop Location.
  const [houseAddress, setHouseAddress] = useState('');
  const [currentHouseLocation, setCurrentHouseLocation] = useState('');
  const [shopLocation, setShopLocation] = useState('');

  // Step 2: Business Info — intentionally empty.
  // Supplier → categories (multi-select dropdown). Shopkeeper → shop type (dropdown, never a category).
  const [businessName, setBusinessName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [shopType, setShopType] = useState('');
  const [city, setCity] = useState('');
  const [ntn, setNtn] = useState('');

  // Step 3: Documents only — the real KYC documents.
  // Supplier → CNIC front/back + NTN. Shopkeeper → CNIC front/back + Utility Bill.
  // No OTP here: OTP is verified AFTER registration, on an existing account.
  const [cnicFrontDraft, setCnicFrontDraft] = useState<KycFileDraft | null>(null);
  const [cnicBackDraft, setCnicBackDraft] = useState<KycFileDraft | null>(null);
  const [ntnDraft, setNtnDraft] = useState<KycFileDraft | null>(null);
  const [utilityBillDraft, setUtilityBillDraft] = useState<KycFileDraft | null>(null);
  // Shopkeeper only — must match the account number on the uploaded bill (admin verifies visually).
  const [utilityBillAccountNumber, setUtilityBillAccountNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Terms & Conditions — must be accepted before registration completes.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Post-registration OTP step — shown after register succeeds, before the pending notice.
  const [otpStep, setOtpStep] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [otpError, setOtpError] = useState('');
  // Batch 17 (M3) — the OTP step has its OWN Turnstile widget:
  // /verify-otp is Turnstile-guarded now, and the register token above
  // is single-use and already spent. Without a site key the widget
  // renders nothing and no token is sent (dev behaviour).
  const [otpTsToken, setOtpTsToken] = useState<string | null>(null);
  const [otpTsKey, setOtpTsKey] = useState(0);

  // OTP box refs — aik digit likhte hi agle box par focus, Backspace par
  // peeche wale box par focus, aur paste par 6 boxes aik saath bharne ke liye.
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = [...otp];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  };

  // Set once OTP is verified — swaps the wizard for the pending-KYC
  // confirmation and starts the Home-page redirect (no auto sign-in).
  const [submitted, setSubmitted] = useState(false);
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  const [notice, setNotice] = useState(PENDING_VERIFICATION_NOTICE);

  // Preselect account type from CTAs like /getstarted?role=shopkeeper
  useEffect(() => {
    const roleParam = new URLSearchParams(window.location.search).get('role');
    if (roleParam === 'shopkeeper' || roleParam === 'supplier') {
      setRole(roleParam);
    }
  }, []);

  // Registration never opens a portal: after the confirmation is shown, send
  // the trader to the public Home page — they sign in once KYC is approved.
  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => router.push('/'), HOME_REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [submitted, router]);

  // Once the GPS point is captured, prefill the written location with the
  // coordinates — unless the trader already typed an address there.
  // Supplier → Warehouse Location, Shopkeeper → Shop Location.
  useEffect(() => {
    const point = deviceLocation.coords;
    if (!point) return;
    const text = `${point.lat}, ${point.lng}`;
    if (role === 'shopkeeper') {
      setShopLocation((prev) => (prev.trim() ? prev.trim() : text));
    } else {
      setCurrentHouseLocation((prev) => (prev.trim() ? prev.trim() : text));
    }
  }, [deviceLocation.coords, role]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // The native select required guards are gone (the Group 1 Dropdown
  // has no required prop) — validate here instead, so Step 2 still cannot
  // advance with an empty shop type / city / category choice. City was
  // never re-checked at submit, so this guard matters: without it an
  // account could register with city ''.
  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (role === 'shopkeeper') {
      if (!shopType) {
        setErrorMessage('Please select your shop type.');
        return;
      }
    } else if (selectedCategories.length === 0) {
      setErrorMessage('Please select at least one business category.');
      return;
    }
    if (!city) {
      setErrorMessage('Please select your city.');
      return;
    }
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // POST /api/auth/register → creates a PENDING account (no session) and moves
  // to the OTP step. The documents picked in Step 3 travel with the request as
  // base64 data URLs and are stored against this exact account, so the Admin
  // Dashboard can preview the files the trader actually uploaded.
  // Supplier → CNIC front/back + NTN. Shopkeeper → CNIC front/back + Utility Bill.
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (role === 'supplier') {
      if (selectedCategories.length === 0) {
        setErrorMessage('Please select at least one business category.');
        return;
      }
    } else {
      if (!shopType) {
        setErrorMessage('Please select your shop type.');
        return;
      }
    }

    if (!cnicFrontDraft || !cnicBackDraft) {
      setErrorMessage('Please upload your CNIC front and back images before completing registration.');
      return;
    }

    const thirdDraft = role === 'supplier' ? ntnDraft : utilityBillDraft;
    if (!thirdDraft) {
      setErrorMessage(
        role === 'supplier'
          ? 'Please upload your NTN certificate before completing registration.'
          : 'Please upload your shop utility bill before completing registration.'
      );
      return;
    }

    if (role === 'shopkeeper' && !utilityBillAccountNumber.trim()) {
      setErrorMessage('Please enter your utility bill account number.');
      return;
    }

    if (!termsAccepted) {
      setErrorMessage('Please read and accept the Terms & Conditions to complete registration.');
      return;
    }

    setIsSubmitting(true);

    try {
      const [cnicFront, cnicBack, thirdDocument] = await Promise.all([
        toKycPayload(cnicFrontDraft.file),
        toKycPayload(cnicBackDraft.file),
        toKycPayload(thirdDraft.file),
      ]);

      // 'utilityBill' is not in RegisterPayload['documents'] yet — the backend
      // phase (User model → auth.controller → kycStorage) adds it there. The
      // local DocMap keeps the build green until then.
      type DocMap = Partial<
        Record<'cnicFront' | 'cnicBack' | 'ntn' | 'utilityBill', KycDocumentPayload>
      >;
      const documents: DocMap = { cnicFront, cnicBack };
      if (role === 'supplier') {
        documents.ntn = thirdDocument;
      } else {
        documents.utilityBill = thirdDocument;
      }

      const payload: RegisterPayload & {
        categories?: string[];
        shopType?: string;
        shopLocation?: string;
        utilityBillAccountNumber?: string;
      } = {
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
        businessName: businessName.trim(),
        city: city.trim(),
        houseAddress: houseAddress.trim(),
        // GPS point (when captured) — the Admin Dashboard renders it as a link.
        ...(deviceLocation.coords ? { currentLocation: deviceLocation.coords } : {}),
        documents,
        ...(role === 'supplier'
          ? {
              categories: selectedCategories,
              category: selectedCategories[0] || '',
              ntn: ntn.trim(),
              currentHouseLocation: currentHouseLocation.trim(),
            }
          : {
              shopType,
              shopLocation: shopLocation.trim(),
              utilityBillAccountNumber: utilityBillAccountNumber.trim(),
            }),
      };

      await api.register({ ...payload, turnstileToken: tsToken || undefined });

      // No session is created here — an unverified account must not be signed in.
      // Move to the OTP step; the pending notice shows only after OTP is verified.
      setRegisteredEmail(email.trim());
      setOtpStep(true);
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unexpected error while creating your account. Please try again.');
      }
      setIsSubmitting(false);
      setTsToken(null);
      setTsKey((k) => k + 1);
    }
  };

  const handleSendOtp = async () => {
    setOtpMessage('');
    setOtpError('');
    setIsSendingOtp(true);
    try {
      const res = await api.sendOtp(registeredEmail);
      setOtpSent(true);
      setOtpMessage(res.message || 'If an account exists for this email, an OTP has been sent.');
    } catch (err) {
      if (err instanceof ApiError) {
        setOtpError(err.message);
      } else {
        setOtpError('Unexpected error while sending OTP. Please try again.');
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpMessage('');
    setOtpError('');

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setOtpError('Please enter the complete 6-digit OTP.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const res = await api.verifyOtp(registeredEmail, otpCode, otpTsToken || undefined);
      // OTP verification sets emailVerified only — admin approval is still required.
      setNotice(res.message || PENDING_VERIFICATION_NOTICE);
      setSubmitted(true);
      setOtpStep(false);
      setIsVerifyingOtp(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (err) {}
    } catch (err) {
      if (err instanceof ApiError) {
        setOtpError(err.message);
      } else {
        setOtpError('Unexpected error while verifying OTP. Please try again.');
      }
      setIsVerifyingOtp(false);
      // The Turnstile token is single-use — a failed attempt spent it.
      setOtpTsToken(null);
      setOtpTsKey((k) => k + 1);
    }
  };

  const isShopkeeper = role === 'shopkeeper';
  const attachedCount = [cnicFrontDraft, cnicBackDraft, isShopkeeper ? utilityBillDraft : ntnDraft].filter(
    Boolean
  ).length;

  return (
    <>
      {submitted ? (
            /* ── Confirmation: account created, OTP verified, awaiting admin verification ── */
            <div className="text-center py-2">
              <div className="w-16 h-16 rounded-full bg-asan-accent-light dark:bg-asan-dark flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-asan-accent" />
              </div>

              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                Registration Submitted
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Your {role === 'supplier' ? 'supplier' : 'shopkeeper'} account is now pending admin verification.
              </p>

              <div
                role="status"
                className="mt-5 p-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-left"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                    {notice}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-400 mt-4">
                Taking you to the Home page — you can sign in once your account is verified.
              </p>

              <Button
                type="button"
                onClick={() => router.push('/')}
                className="w-full h-12 text-sm font-bold mt-4"
              >
                Go to Home Page
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          ) : otpStep ? (
            /* ── Post-registration OTP step: email OTP only, terminal for now, email later ── */
            <div>
              <div className="mb-4">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Verify Your Email</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Your account has been created. Enter the 6-digit OTP sent to {registeredEmail} to verify your email.
                </p>
              </div>

              {!otpSent ? (
                <Button type="button" onClick={handleSendOtp} isLoading={isSendingOtp} className="w-full h-12 text-sm font-bold">
                  Send OTP
                </Button>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">
                      OTP Code
                    </label>
                    <div className="grid grid-cols-6 gap-2" onPaste={handleOtpPaste}>
                      {otp.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            otpRefs.current[i] = el;
                          }}
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          className="h-11 text-center font-bold text-base rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
                        />
                      ))}
                    </div>
                  </div>

                  <Button type="submit" isLoading={isVerifyingOtp} className="w-full h-12 text-sm font-bold">
                    Verify OTP
                  </Button>

                  {isTurnstileConfigured() && (
                    <TurnstileWidget key={otpTsKey} onVerify={setOtpTsToken} onExpire={() => setOtpTsToken(null)} />
                  )}

                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isSendingOtp}
                    className="w-full text-center text-xs font-bold text-asan-accent dark:text-asan-accent-light hover:underline disabled:opacity-60"
                  >
                    Resend OTP
                  </button>
                </form>
              )}

              {otpMessage && (
                <p role="alert" className="text-xs font-semibold leading-relaxed text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5 mt-4">
                  {otpMessage}
                </p>
              )}

              {otpError && (
                <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 mt-4">
                  {otpError}
                </p>
              )}

              <p className="text-center text-xs text-slate-500 mt-4">
                Already have an account?{' '}
                <Link href="/signin" className="font-bold text-asan-accent dark:text-asan-accent-light hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          ) : (
            <>
          {/* STEP 1: CREATE ACCOUNT */}
          {step === 1 && (
            <div>
              <div className="mb-4">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Create Account</h3>

                {/* Role Switcher */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setRole('supplier')}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      role === 'supplier'
                        ? 'bg-asan-accent-light border-asan-accent text-asan-dark dark:bg-asan-dark dark:text-asan-accent-light'
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
                        ? 'bg-asan-accent-light border-asan-accent text-asan-dark dark:bg-asan-dark dark:text-asan-accent-light'
                        : 'border-slate-200 text-slate-500 dark:border-slate-800'
                    }`}
                  >
                    🏪 Shopkeeper
                  </button>
                </div>
              </div>

              <form onSubmit={handleStep1} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                <div className="w-full space-y-1.5">
                  <label htmlFor="getstarted-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="getstarted-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full h-11 px-4 pr-14 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-asan-accent focus:outline-none focus:ring-2 focus:ring-asan-accent/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-asan-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {/* FIX (Round-4 Batch 11, M6) — toggle was a bare 18px
                        icon. Now a full 44x44 tap target centred on the
                        h-11 input; pr-14 keeps typed text clear of it.
                        Look unchanged (transparent button). */}
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {/* Location fields differ per role:
                    Supplier → Warehouse Address + Warehouse Location.
                    Shopkeeper → House Address + Shop Location. */}
                {isShopkeeper ? (
                  <>
                    <Input
                      label="House Address"
                      placeholder="House 123, Street 4, Block B, Model Town"
                      value={houseAddress}
                      onChange={(e) => setHouseAddress(e.target.value)}
                      helperText="Complete residential address"
                      required
                    />
                    <Input
                      label="Shop Location"
                      placeholder="Shop 12, Jodia Bazar, Karachi"
                      value={shopLocation}
                      onChange={(e) => setShopLocation(e.target.value)}
                      onFocus={deviceLocation.autoPrompt}
                      helperText="Your shop's address / market — focus to share your device location"
                      required
                    />
                  </>
                ) : (
                  <>
                    <Input
                      label="Warehouse Address"
                      placeholder="Plot 12, Sindh Industrial Trading Estate, Karachi"
                      value={houseAddress}
                      onChange={(e) => setHouseAddress(e.target.value)}
                      helperText="Complete warehouse address"
                      required
                    />
                    <Input
                      label="Warehouse Location"
                      placeholder="Area / City, e.g. SITE, Karachi"
                      value={currentHouseLocation}
                      onChange={(e) => setCurrentHouseLocation(e.target.value)}
                      onFocus={deviceLocation.autoPrompt}
                      helperText="Focus this field to share your device location"
                      required
                    />
                  </>
                )}

                {/* GPS capture — opens the browser's location-permission pop-up.
                    The captured point is saved with the account and shown to the
                    admin as a clickable Google Maps link. */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={deviceLocation.capture}
                    disabled={deviceLocation.locating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-asan-accent hover:text-asan-accent transition disabled:opacity-60"
                  >
                    <MapPin className={`w-3.5 h-3.5 ${deviceLocation.locating ? 'animate-pulse' : ''}`} />
                    {deviceLocation.locating ? 'Detecting your location…' : 'Use my current location'}
                  </button>

                  {deviceLocation.coords && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      Location captured ({deviceLocation.coords.lat}, {deviceLocation.coords.lng})
                    </span>
                  )}
                </div>

                {deviceLocation.notice && (
                  <p
                    role="alert"
                    className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2"
                  >
                    {deviceLocation.notice}
                  </p>
                )}

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
              <div className="mb-4">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Business Details</h3>
                <p className="text-xs text-slate-500 mt-1">Tell us about your trading enterprise</p>
              </div>

              <form onSubmit={handleStep2} className="space-y-3">
                <Input
                  label={isShopkeeper ? 'Shop Name' : 'Business / Enterprise Name'}
                  placeholder={isShopkeeper ? 'Ahmed Kiryana Store' : 'Khan Enterprises Ltd.'}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />

                {isShopkeeper ? (
                  /* Shopkeeper NEVER picks a product category — shop type instead. */
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Shop Type
                    </label>
                    <Dropdown
                      options={[{ value: '', label: 'Select shop type' }, ...SHOP_TYPES.map((t) => ({ value: t, label: t }))]}
                      value={shopType}
                      onChange={setShopType}
                      ariaLabel="Shop Type"
                      search={false}
                      align="left"
                      panelClassName="w-full"
                      listMaxH={116}
                      buttonClassName="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent flex items-center justify-between gap-2"
                    />
                  </div>
                ) : (
                  /* Supplier picks from the 14 master categories via a searchable dropdown. */
                  <CategoryMultiSelect selected={selectedCategories} onToggle={toggleCategory} />
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    City / Mandi Hub
                  </label>
                  <Dropdown
                    options={CITY_OPTIONS}
                    value={city}
                    onChange={setCity}
                    ariaLabel="City / Mandi Hub"
                    search={false}
                    align="left"
                    panelClassName="w-full"
                    listMaxH={116}
                    buttonClassName="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent flex items-center justify-between gap-2"
                  />
                </div>

                {/* NTN is supplier-only now — shopkeepers upload a utility bill instead. */}
                {!isShopkeeper && (
                  <Input
                    label="NTN Number (National Tax Number)"
                    placeholder="1234567-8"
                    value={ntn}
                    onChange={(e) => setNtn(e.target.value)}
                    helperText="Required for supplier accounts"
                    required
                  />
                )}

                {errorMessage && (
                  <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
                    {errorMessage}
                  </p>
                )}

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

          {/* STEP 3: DOCUMENTS ONLY */}
          {step === 3 && (
            <div>
              <div className="mb-4">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Verification</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isShopkeeper
                    ? 'Upload your CNIC (front & back) and shop utility bill — they are reviewed by our compliance team and shown to the admin for approval'
                    : 'Upload your CNIC (front & back) and NTN document — they are reviewed by our compliance team and shown to the admin for approval'}
                </p>
              </div>

              <form onSubmit={handleCompleteRegistration} className="space-y-3">
                {/* KYC documents — the real files attached to this account */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Compliance Documents
                    </p>
                    <span className="text-xs font-semibold text-slate-400">
                      {attachedCount}/3 attached
                    </span>
                  </div>

                  {/* CNIC front/back — compact side-by-side boxes, like the preview. */}
                  <div className="grid grid-cols-2 gap-3">
                    <KycDocumentUpload
                      label="CNIC Front Image"
                      compactLabel="CNIC FRONT"
                      variant="compact"
                      hint="Front side of your National Identity Card"
                      value={cnicFrontDraft}
                      onChange={setCnicFrontDraft}
                    />

                    <KycDocumentUpload
                      label="CNIC Back Image"
                      compactLabel="CNIC BACK"
                      variant="compact"
                      hint="Back side of your National Identity Card"
                      value={cnicBackDraft}
                      onChange={setCnicBackDraft}
                    />
                  </div>

                  {isShopkeeper ? (
                    <KycDocumentUpload
                      label="Shop Utility Bill"
                      hint="Electricity, gas or water bill of your shop — must clearly show the account number"
                      value={utilityBillDraft}
                      onChange={setUtilityBillDraft}
                    />
                  ) : (
                    <KycDocumentUpload
                      label="NTN Certificate / Image"
                      compactLabel="NTN CERTIFICATE"
                      variant="compact"
                      hint="FBR National Tax Number certificate or scanned copy"
                      value={ntnDraft}
                      onChange={setNtnDraft}
                    />
                  )}
                </div>

                {/* Shopkeeper only — the bill account number, matched against the
                    uploaded bill by the admin during verification (no OCR). */}
                {isShopkeeper && (
                  <Input
                    label="Utility Bill Account Number"
                    placeholder="e.g. 0412345678901"
                    value={utilityBillAccountNumber}
                    onChange={(e) => setUtilityBillAccountNumber(e.target.value)}
                    helperText="Must match the account number on the uploaded bill — verified by admin"
                    required
                  />
                )}

                {/* Terms & Conditions — must be accepted before registration completes */}
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5">
                  <input
                    id="terms-checkbox"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 shrink-0 accent-asan-accent"
                  />
                  <p className="text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="font-bold text-asan-accent dark:text-asan-accent-light hover:underline"
                    >
                      Terms &amp; Conditions
                    </button>
                  </p>
                </div>

                {isTurnstileConfigured() && (
                  <TurnstileWidget key={tsKey} onVerify={setTsToken} onExpire={() => setTsToken(null)} />
                )}

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} className="w-1/3">
                    Back
                  </Button>
                  <Button type="submit" isLoading={isSubmitting} className="w-2/3 h-12 text-xs font-bold">
                    Complete Registration
                  </Button>
                </div>

                {errorMessage && (
                  <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 mt-3">
                    {errorMessage}
                  </p>
                )}
              </form>

              <Modal
                isOpen={showTerms}
                onClose={() => setShowTerms(false)}
                maxWidth="max-w-3xl"
                title="Terms & Conditions"
                description="Please read these terms before completing your registration."
              >
                <div className="max-h-[70vh] overflow-y-auto pr-1">
                  <TermsContent />
                </div>
              </Modal>
            </div>
          )}

              <p className="text-center text-xs text-slate-500 mt-4">
                Already have an account?{' '}
                <Link href="/signin" className="font-bold text-asan-accent dark:text-asan-accent-light hover:underline">
                  Sign In
                </Link>
              </p>
            </>
          )}
    </>
  );
}
