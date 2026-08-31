"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

const NOTIFICATION_OPTIONS = [
  { key: 'newOrders', label: 'SMS alert on new wholesale purchase order' },
  { key: 'escrowRelease', label: 'Email notification on Escrow funds release to bank' },
  { key: 'lowStock', label: 'Low inventory lot warning threshold' },
  { key: 'aiForecasts', label: 'Weekly AI demand spike alerts' },
] as const;

export default function SupplierSettingsPage() {
  const { user, updateUserProfile } = useAuth();
  const { showToast } = useToast();

  const [businessName, setBusinessName] = useState(user?.businessName || 'Ahmed Khan Enterprises');
  const [ownerName, setOwnerName] = useState(user?.name || 'Ahmed Khan');
  const [email, setEmail] = useState(user?.email || 'ahmed@akenterprises.pk');
  const [phone, setPhone] = useState(user?.phone || '+92 300 1234567');
  const [ntn, setNtn] = useState(user?.ntn || '1234567-8');
  const [city, setCity] = useState(user?.city || 'Lahore');
  const [formError, setFormError] = useState('');

  const [notifications, setNotifications] = useState({
    newOrders: true,
    escrowRelease: true,
    lowStock: true,
    aiForecasts: true
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !ownerName.trim()) {
      setFormError('Business name and representative name cannot be empty.');
      showToast('Business name and representative name cannot be empty', 'error');
      return;
    }
    setFormError('');
    updateUserProfile({ businessName: businessName.trim(), name: ownerName.trim(), email, phone, ntn, city });
    showToast('Supplier business profile updated successfully!', 'success');
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          Supplier Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Account security, notification channels, and tax details
        </p>
      </div>

      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Enterprise Information</h3>
          <p className="text-xs text-slate-500 mt-0.5">Verified NTN details for wholesale invoicing</p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Business Name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
            <Input
              label="Authorized Representative"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="NTN Number"
              value={ntn}
              onChange={(e) => setNtn(e.target.value)}
            />
            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          {formError && (
            <p className="text-xs font-semibold text-red-500">{formError}</p>
          )}
          <Button type="submit" className="text-xs font-bold">
            Save Enterprise Details
          </Button>
        </form>
      </div>

      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notification Channels</h3>
        <div className="space-y-3">
          {NOTIFICATION_OPTIONS.map((n) => (
            <div key={n.key} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{n.label}</span>
              <input
                type="checkbox"
                checked={notifications[n.key]}
                onChange={(e) => {
                  setNotifications({ ...notifications, [n.key]: e.target.checked });
                  showToast('Preference updated', 'info');
                }}
                className="w-4 h-4 rounded text-asan-accent focus:ring-asan-accent"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
