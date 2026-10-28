"use client";

import React, { useEffect, useState } from 'react';
import { Footer } from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { MapPin, Send } from 'lucide-react';

const SUBJECTS = [
  'General Inquiry',
  'Order Issue',
  'Product Issue',
  'Account Issue',
  'Other',
] as const;

const ROLES = ['Visitor', 'Shopkeeper', 'Supplier', 'Admin'] as const;

function roleLabelFromAuth(role: string | undefined): string {
  if (role === 'shopkeeper') return 'Shopkeeper';
  if (role === 'supplier') return 'Supplier';
  if (role === 'admin') return 'Admin';
  return 'Visitor';
}

export default function ContactPage() {
  const { user, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    subject: 'General Inquiry',
    role: 'Visitor',
    orderId: '',
    message: '',
    website: '',
  });
  const [autoFilled, setAutoFilled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Logged-in user ka naam/email/phone auto-fill karo, lekin jo user
  // khud type kar chuka ho usko overwrite mat karo.
  useEffect(() => {
    if (authLoading || autoFilled || !user) return;
    setFormData((prev) => ({
      ...prev,
      fullName: prev.fullName || user.name || '',
      phone: prev.phone || (user as { phone?: string }).phone || '',
      email: prev.email || user.email || '',
      role: prev.role === 'Visitor' ? roleLabelFromAuth(user.role) : prev.role,
    }));
    setAutoFilled(true);
  }, [authLoading, autoFilled, user]);

  const isOrderIssue = formData.subject === 'Order Issue';
  const messageLength = formData.message.trim().length;

  const handleSubjectChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      subject: value,
      // Order Issue se hatne par purana order ID sath na jaye.
      orderId: value === 'Order Issue' ? prev.orderId : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!formData.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!formData.phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (!formData.email.trim()) nextErrors.email = 'Email address is required.';
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!formData.message.trim()) {
      nextErrors.message = 'Message cannot be empty.';
    } else if (messageLength < 20 || messageLength > 1000) {
      nextErrors.message = 'Message must be between 20 and 1000 characters.';
    }
    setErrors(nextErrors);
    setSubmitError('');
    setSubmitSuccess('');
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    // Backend ke paas role/orderId ka alag field nahi hai, isliye ye
    // details message ke andar bhejni hain, warna admin ko nahi dikhengi.
    // Phone bhi isi tarah message me jata hai, jaise pehle jata tha.
    const detailLines = [
      `Role: ${formData.role}`,
      ...(isOrderIssue && formData.orderId.trim() ? [`Order ID: ${formData.orderId.trim()}`] : []),
      `Phone: ${formData.phone.trim()}`,
    ];
    const fullMessage = `${formData.message.trim()}\n${detailLines.join('\n')}`;

    // Message + details mila kar 1000 se zyada ho to backend reject
    // karega, isliye pehle yahin rok do aur saaf error dikhao.
    if (fullMessage.length > 1000) {
      setErrors({
        message: `Message is too long once role/phone/order details are added — please shorten it by ${fullMessage.length - 1000} characters.`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.fullName.trim(),
          email: formData.email.trim(),
          subject: formData.subject,
          message: fullMessage,
          // Honeypot: hamesha khali bhejna hai. Backend bhara hua
          // aaye to spam samajh kar bina save kiye 201 de deta hai.
          website: '',
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = (payload as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(message || 'Could not send your message. Please try again.');
      }
      setSubmitSuccess('Message sent and saved. Thank you for contacting us.');
      // Naam/email/phone/role rakho taake logged-in user dobara
      // message bhej sake, sirf message wala hissa reset karo.
      setFormData((prev) => ({
        ...prev,
        subject: 'General Inquiry',
        orderId: '',
        message: '',
        website: '',
      }));
      setErrors({});
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not send your message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">

      <div className="bg-asan-dark text-white py-12 text-center border-b border-emerald-900">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Get in Touch
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">Contact Us</h1>
        <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 max-w-md mx-auto">
          Send us a message using the form below.
        </p>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-12 flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Info Cards */}
          <div className="space-y-4 md:col-span-1">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Trade Support Desk</h3>

              <div className="flex items-start gap-3 text-xs">
                <MapPin className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Karachi Head Office</p>
                  <p className="text-slate-500 dark:text-slate-400">FUUAST Campus, Gulshan-e-Iqbal, Karachi, Pakistan</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Messages sent from this form are saved for review.
              </p>
            </div>
          </div>

          {/* Contact Form matching Figma 8.png */}
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm md:col-span-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Send Us a Message</h3>
            <p className="text-xs text-slate-500 mt-1 mb-6">Fill in the details below.</p>

            {user && !authLoading && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Signed in — your name and email have been filled from your account. You can edit them if needed.
              </p>
            )}

            {submitSuccess && (
              <p role="status" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-4">
                {submitSuccess}
              </p>
            )}
            {submitError && (
              <p role="alert" className="text-xs font-semibold text-red-500 mb-4">
                {submitError}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Input
                    label="Full Name"
                    placeholder="Your full name"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                  {errors.fullName && <p className="text-xs font-semibold text-red-500">{errors.fullName}</p>}
                </div>
                <div className="space-y-1">
                  <Input
                    label="Phone Number"
                    placeholder="Your phone number"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                  {errors.phone && <p className="text-xs font-semibold text-red-500">{errors.phone}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Input
                  label="Business Email"
                  type="email"
                  placeholder="Your business email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
                {errors.email && <p className="text-xs font-semibold text-red-500">{errors.email}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Subject
                  </label>
                  <select
                    value={formData.subject}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 transition focus:border-asan-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  >
                    {SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    I am a
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 transition focus:border-asan-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
              </div>

              {isOrderIssue && (
                <div className="space-y-1">
                  <Input
                    label="Order ID"
                    placeholder="Your order ID, if you have it"
                    value={formData.orderId}
                    onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Optional — only needed for order issues.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Message
                </label>
                <textarea
                  rows={4}
                  placeholder="Tell us how we can help your wholesale business..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-asan-accent focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  required
                />
                <div className="flex items-center justify-between">
                  <p className={`text-xs ${messageLength > 1000 ? 'font-semibold text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    {formData.message.length} / 1000 characters
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Minimum 20 characters</p>
                </div>
                {errors.message && <p className="text-xs font-semibold text-red-500">{errors.message}</p>}
              </div>

              {/* Honeypot: insaan isko kabhi nahi bharega, sirf bot bharta hai. */}
              <input
                type="text"
                name="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ display: 'none' }}
              />

              <Button type="submit" isLoading={isSubmitting} className="w-full h-12 text-sm font-bold">
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </Button>
            </form>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
