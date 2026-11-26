"use client";

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Footer } from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { API_URL, csrfHeaders } from '@/lib/api';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/TurnstileWidget';
import {
  AlertTriangle,
  Building2,
  Eye,
  Facebook,
  ImagePlus,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package,
  Send,
  Store,
  User,
  X,
  Youtube,
} from 'lucide-react';

const SUBJECT_OPTIONS: DropdownOption[] = [
  { value: 'General Inquiry', label: 'General Inquiry', icon: <MessageCircle className="h-4 w-4" /> },
  { value: 'Order Issue', label: 'Order Issue', icon: <Package className="h-4 w-4" /> },
  { value: 'Product Issue', label: 'Product Issue', icon: <AlertTriangle className="h-4 w-4" /> },
  { value: 'Account Issue', label: 'Account Issue', icon: <User className="h-4 w-4" /> },
  { value: 'Other', label: 'Other', icon: <MoreHorizontal className="h-4 w-4" /> },
];

// No Admin option: an admin would not fill in a contact form.
const ROLE_OPTIONS: DropdownOption[] = [
  { value: 'Visitor', label: 'Visitor', icon: <Eye className="h-4 w-4" /> },
  { value: 'Shopkeeper', label: 'Shopkeeper', icon: <Store className="h-4 w-4" /> },
  { value: 'Supplier', label: 'Supplier', icon: <Building2 className="h-4 w-4" /> },
];

const MAX_ATTACHED_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface AttachedImage {
  name: string;
  dataUrl: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read picture.'));
    reader.readAsDataURL(file);
  });
}

export default function ContactPage() {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [imagesError, setImagesError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // No auto-fill: the form always starts empty, even when signed in —
  // the user types their own name, phone, email and role every time.
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

  const addPictures = async (incomingFiles: FileList | readonly File[]) => {
    const incoming = Array.from(incomingFiles);
    if (incoming.length === 0) return;
    const remaining = MAX_ATTACHED_IMAGES - attachedImages.length;
    if (remaining <= 0) {
      setImagesError('You can attach up to 3 pictures.');
      return;
    }
    let error: string | null = null;
    const valid: File[] = [];
    for (const file of incoming) {
      if (valid.length >= remaining) {
        error = 'You can attach up to 3 pictures.';
        break;
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        error = 'Only JPG, PNG or WEBP pictures are allowed.';
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = 'Each picture must be 5 MB or smaller.';
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) {
      if (error) setImagesError(error);
      return;
    }
    try {
      const dataUrls = await Promise.all(valid.map((file) => readFileAsDataUrl(file)));
      setAttachedImages((prev) => [
        ...prev,
        ...valid.map((file, index) => ({ name: file.name, dataUrl: dataUrls[index] })),
      ]);
      // A bad file in the same batch is still reported, even though the
      // good ones were added.
      setImagesError(error ?? '');
    } catch {
      setImagesError('Could not read one of the pictures. Please try again.');
    }
  };

  const removePicture = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
    setImagesError('');
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
    if (imagesError) {
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
        // FIX (New audit #20) — the one direct fetch() POST outside lib/api.ts;
        // it carries the same double-submit token as every other call.
        headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) },
        body: JSON.stringify({
          name: formData.fullName.trim(),
          email: formData.email.trim(),
          subject: formData.subject,
          message: fullMessage,
          // Pictures are sent as base64 data URLs in JSON, same as
          // product photos — no FormData. Only sent when at least one
          // picture is attached, so a no-picture submit is unchanged.
          ...(attachedImages.length > 0
            ? { images: attachedImages.map((image) => image.dataUrl) }
            : {}),
          // Honeypot: hamesha khali bhejna hai. Backend bhara hua
          // aaye to spam samajh kar bina save kiye 201 de deta hai.
          website: '',
          turnstileToken: tsToken || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = (payload as { error?: { message?: string } } | null)?.error?.message;
        throw new Error(message || 'Could not send your message. Please try again.');
      }
      setSubmitSuccess('Message sent and saved. Thank you for contacting us.');
      setTsToken(null);
      setTsKey((k) => k + 1);
      setAttachedImages([]);
      setImagesError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      // Token is single-use — reset the widget so the retry gets a fresh one.
      setTsToken(null);
      setTsKey((k) => k + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">

      <div className="bg-asan-accent-light text-asan-dark py-12 text-center border-b border-asan-border">
        <span className="text-xs font-bold uppercase tracking-wider text-asan-accent">
          Get in Touch
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">Contact Us</h1>
        <p className="text-xs sm:text-sm text-asan-text-light mt-1 max-w-md mx-auto">
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
                  <p className="text-slate-500 dark:text-slate-400">Gulshan-e-Iqbal, Karachi, Pakistan</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Messages sent from this form are saved for review.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Follow Us</h3>
              <div className="flex items-center gap-3">
                <a href="#" aria-label="Facebook" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-asan-accent hover:text-asan-accent dark:border-slate-800 dark:text-slate-300">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="#" aria-label="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-asan-accent hover:text-asan-accent dark:border-slate-800 dark:text-slate-300">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="#" aria-label="YouTube" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-asan-accent hover:text-asan-accent dark:border-slate-800 dark:text-slate-300">
                  <Youtube className="h-5 w-5" />
                </a>
              </div>
              <div className="flex items-start gap-3 text-xs">
                <Mail className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Business Email</p>
                  {/* Placeholder only — NOT a mailto link. Replace with the
                      real business email address once Noushad gives it. */}
                  <p className="text-slate-500 dark:text-slate-400">hello@asantijarat.com</p>
                </div>
              </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Subject
                  </label>
                  {/* Search stays on by the shared Dropdown's default rule
                      (5 options). */}
                  <Dropdown
                    options={SUBJECT_OPTIONS}
                    value={formData.subject}
                    onChange={handleSubjectChange}
                    ariaLabel="Subject"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    I am a
                  </label>
                  <Dropdown
                    options={ROLE_OPTIONS}
                    value={formData.role}
                    onChange={(value) => setFormData({ ...formData, role: value })}
                    ariaLabel="I am a"
                    search={false}
                  />
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
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <p className={`text-xs ${messageLength > 1000 ? 'font-semibold text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    {formData.message.length} / 1000 characters
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Minimum 20 characters</p>
                </div>
                {errors.message && <p className="text-xs font-semibold text-red-500">{errors.message}</p>}
              </div>

              {/* Picture upload — optional, never required. */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Attach a Picture (optional)
                </span>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    void addPictures(e.dataTransfer.files);
                  }}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition ${isDragging ? 'border-asan-accent bg-asan-accent-light' : 'border-slate-200 dark:border-slate-800'}`}
                >
                  <ImagePlus className="h-6 w-6 text-slate-400" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Drag &amp; drop pictures here, or browse to attach them.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    JPG, PNG or WEBP — up to 3 pictures, 5 MB each.
                  </p>
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-4 text-xs font-bold"
                  >
                    Browse
                  </Button>
                  {/* Visually hidden with the clip technique (not
                      display:none / opacity:0) so it stays keyboard-focusable. */}
                  <input
                    ref={fileInputRef}
                    id="contact-images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    aria-label="Attach pictures"
                    onChange={(e) => {
                      void addPictures(e.target.files ?? []);
                      e.target.value = '';
                    }}
                    style={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      padding: 0,
                      margin: -1,
                      overflow: 'hidden',
                      clip: 'rect(0, 0, 0, 0)',
                      whiteSpace: 'nowrap',
                      border: 0,
                    }}
                  />
                </div>
                {imagesError && <p className="text-xs font-semibold text-red-500">{imagesError}</p>}
                {attachedImages.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {attachedImages.map((image, index) => (
                      <div key={`${image.name}-${index}`} className="relative">
                        {/* unoptimized: these are local data-URL previews,
                            nothing for next/image to optimise. */}
                        <Image
                          src={image.dataUrl}
                          alt={image.name}
                          width={80}
                          height={80}
                          unoptimized
                          className="h-20 w-20 rounded-lg border border-slate-200 object-cover dark:border-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => removePicture(index)}
                          aria-label={`Remove ${image.name}`}
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-red-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

              {isTurnstileConfigured() && (
                <TurnstileWidget key={tsKey} onVerify={setTsToken} onExpire={() => setTsToken(null)} />
              )}

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
