"use client";

import React, { useState } from 'react';
import { Footer } from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { API_URL } from '@/lib/api';
import { MapPin, Send } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!formData.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!formData.phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (!formData.email.trim()) nextErrors.email = 'Email address is required.';
    if (!formData.message.trim()) nextErrors.message = 'Message cannot be empty.';
    setErrors(nextErrors);
    setSubmitError('');
    setSubmitSuccess('');
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setIsSubmitting(true);

    try {
      // POST /api/public/contact validates name/email/message and stores
      // the message. ContactMessage has no phone field, so the phone number
      // is kept inside the message text instead of being dropped.
      const response = await fetch(`${API_URL}/api/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.fullName.trim(),
          email: formData.email.trim(),
          message: `${formData.message.trim()}\nPhone: ${formData.phone.trim()}`,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = (payload as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(message || 'Could not send your message. Please try again.');
      }
      setSubmitSuccess('Message sent and saved. Thank you for contacting us.');
      setFormData({ fullName: '', phone: '', email: '', message: '' });
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
                {errors.message && <p className="text-xs font-semibold text-red-500">{errors.message}</p>}
              </div>

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
