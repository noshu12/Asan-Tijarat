"use client";

import React, { useState } from 'react';
import { Footer } from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { Mail, Phone, MapPin, Send, MessageSquare, Clock } from 'lucide-react';

export default function ContactPage() {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!formData.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!formData.phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (!formData.email.trim()) nextErrors.email = 'Email address is required.';
    if (!formData.message.trim()) nextErrors.message = 'Message cannot be empty.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showToast('Please fix the highlighted fields before sending.', 'error');
      return;
    }
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      showToast('Thank you! Your message has been sent to our trade support desk.', 'success');
      setFormData({ fullName: '', phone: '', email: '', message: '' });
      setErrors({});
    }, 1000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      
      <div className="bg-asan-dark text-white py-12 text-center border-b border-emerald-900">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
          Get in Touch
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">Contact Us</h1>
        <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 max-w-md mx-auto">
          Have a question or want to partner with us? We reply within 24 hours.
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

              <div className="flex items-start gap-3 text-xs">
                <Phone className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Helpline</p>
                  <p className="text-slate-500 dark:text-slate-400">+92 300 000 0000</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <Mail className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Support Email</p>
                  <p className="text-slate-500 dark:text-slate-400">hello@asantijarat.pk</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <Clock className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Working Hours</p>
                  <p className="text-slate-500 dark:text-slate-400">Mon - Sat: 9:00 AM - 7:00 PM</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form matching Figma 8.png */}
          <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm md:col-span-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Send Us a Message</h3>
            <p className="text-xs text-slate-500 mt-1 mb-6">Fill in the details below and our team will get back to you.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Input
                    label="Full Name"
                    placeholder="Ahmed Khan"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                  {errors.fullName && <p className="text-xs font-semibold text-red-500">{errors.fullName}</p>}
                </div>
                <div className="space-y-1">
                  <Input
                    label="Phone Number"
                    placeholder="+92 300 1234567"
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
                  placeholder="ahmed@business.pk"
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