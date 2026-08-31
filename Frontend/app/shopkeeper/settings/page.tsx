"use client";

import React, { useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

const NOTIFICATION_OPTIONS = [
  { key: 'newOrders', label: 'New orders received' },
  { key: 'paymentConfirmed', label: 'Payment confirmed & escrow releases' },
  { key: 'productReviews', label: 'Product reviews & ratings' },
  { key: 'lowStock', label: 'Low stock alerts' },
  { key: 'announcements', label: 'System announcements & mandi policy updates' },
] as const;

export default function ShopkeeperSettingsPage() {
  const { user, updateUserProfile } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(user?.name || 'M. Hassan');
  const [email, setEmail] = useState(user?.email || 'hassan.traders@gmail.com');
  const [phone, setPhone] = useState(user?.phone || '+92 321 4567890');
  const [currentPassword, setCurrentPassword] = useState('••••••••');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [notifications, setNotifications] = useState({
    newOrders: true,
    paymentConfirmed: true,
    productReviews: true,
    lowStock: true,
    announcements: false,
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setProfileError('Full name cannot be empty.');
      showToast('Full name cannot be empty', 'error');
      return;
    }
    setProfileError('');
    updateUserProfile({ name: fullName.trim(), email, phone });
    showToast('Personal information updated successfully!', 'success');
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword.trim()) {
      setPasswordError('Enter your current password to make a change.');
      showToast('Enter your current password', 'error');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      showToast('New passwords do not match', 'error');
      return;
    }
    setPasswordError('');
    showToast('Password changed successfully!', 'success');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <PortalHeader
        title="Account Settings"
        subtitle="Thursday, 3 July 2026 • Shopkeeper Portal"
      />

      {/* Personal Information */}
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Personal Information</h3>
          <p className="text-xs text-slate-500 mt-0.5">Update your contact information</p>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          {profileError && (
            <p className="text-xs font-semibold text-red-500">{profileError}</p>
          )}
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Phone Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" className="text-xs font-bold">
            Save Changes
          </Button>
        </form>
      </div>

      {/* Security */}
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Security & Password</h3>
          <p className="text-xs text-slate-500 mt-0.5">Ensure your account uses a strong password</p>
        </div>

        <form onSubmit={handleSavePassword} className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="New Password"
            type="password"
            placeholder="Min. 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Re-type new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordError && (
            <p className="text-xs font-semibold text-red-500">{passwordError}</p>
          )}
          <Button type="submit" className="text-xs font-bold">
            Update Password
          </Button>
        </form>
      </div>

      {/* Notification Preferences matching Figma s11.png */}
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notification Preferences</h3>
          <p className="text-xs text-slate-500 mt-0.5">Control SMS and Email trade alerts</p>
        </div>

        <div className="space-y-4">
          {NOTIFICATION_OPTIONS.map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
              <input
                type="checkbox"
                checked={notifications[item.key]}
                onChange={(e) => {
                  setNotifications({ ...notifications, [item.key]: e.target.checked });
                  showToast('Notification preference saved', 'info');
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
