"use client";

import React, { useEffect, useRef, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/ui/loader';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { useDeviceLocation } from '@/lib/useDeviceLocation';
import { Check, MapPin, Eye, EyeOff, ChevronDown } from 'lucide-react';

/**
 * Shared account-settings screen for the shopkeeper and supplier portals.
 *
 * Previously both pages were static: they hardcoded the demo account's details
 * and "saving" only cleared a local error string. This component loads the
 * real signed-in user from GET /api/auth/me, persists edits through
 * PATCH /api/auth/me and changes passwords through PATCH /api/auth/me/password
 * (current password verified server-side). Notification switches persist per
 * account in localStorage.
 */

type NotificationKey =
  | 'newOrders'
  | 'lowStock'
  | 'announcements';

const SHOPKEEPER_NOTIFICATIONS: { key: NotificationKey; label: string }[] = [
  { key: 'newOrders', label: 'Order status updates' },
  { key: 'lowStock', label: 'Low stock alerts' },
  { key: 'announcements', label: 'System announcements' },
];

const SUPPLIER_NOTIFICATIONS: { key: NotificationKey; label: string }[] = [
  { key: 'newOrders', label: 'New wholesale purchase orders' },
  { key: 'lowStock', label: 'Low stock alerts' },
  { key: 'announcements', label: 'System announcements' },
];

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

/** Password input with a show/hide eye button (Input has no icon slot). */
function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div className="w-full space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 px-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-asan-accent focus:outline-none focus:ring-2 focus:ring-asan-accent/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          title={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Searchable multi-select dropdown for the 14 supplier categories —
 * same component as Get Started, so a supplier can add more categories later.
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
        Specialisation
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
                        ? 'bg-emerald-50 text-asan-dark dark:bg-emerald-950 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(cat)}
                      onChange={() => onToggle(cat)}
                      className="w-4 h-4 accent-emerald-600"
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

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-asan-dark border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
            >
              {cat}
              <button
                type="button"
                aria-label={`Remove ${cat}`}
                onClick={() => onToggle(cat)}
                className="hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


const DEFAULT_NOTIFICATIONS: Record<NotificationKey, boolean> = {
  newOrders: true,
  lowStock: true,
  announcements: false,
};

/** Notification switches are stored per account so they survive a sign-out. */
function notificationsKey(userId: string): string {
  return `asan_notifications_${userId}`;
}

interface SettingsViewProps {
  role: 'shopkeeper' | 'supplier';
}

export function SettingsView({ role }: SettingsViewProps) {
  const isSupplier = role === 'supplier';
  const options = isSupplier ? SUPPLIER_NOTIFICATIONS : SHOPKEEPER_NOTIFICATIONS;

  // Device GPS capture — same flow as registration: the browser permission
  // pop-up opens on the first focus of "Current House Location" or on the
  // "Use my current location" button.
  const { coords, setCoords, locating, notice, capture, autoPrompt } = useDeviceLocation();

  // useAuth() is called here, at the top of the component only — never inside
  // useEffect, and never inside another useEffect. The effects below only
  // READ `user`, they never call the hook again.
  const { user } = useAuth();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [ntn, setNtn] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [houseAddress, setHouseAddress] = useState('');
  const [currentHouseLocation, setCurrentHouseLocation] = useState('');
  const [avatar, setAvatar] = useState('');
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Notification switches
  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>(
    DEFAULT_NOTIFICATIONS
  );

  // Fill the form from the signed-in user (cached session from httpOnly cookie).
  useEffect(() => {
    if (!user) return;

    setName(user.name || '');
    setBusinessName(user.businessName || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setCity(user.city || '');
    setNtn(user.ntn || '');
    setCategories(
      Array.isArray(user.categories) && user.categories.length > 0
        ? user.categories
        : user.category
          ? [user.category]
          : []
    );
    setHouseAddress(user.houseAddress || '');
    setCurrentHouseLocation(user.currentHouseLocation || '');
    setAvatar((user as { avatar?: string }).avatar || '');
    if (user.currentLocation) {
      setCoords({ lat: user.currentLocation.lat, lng: user.currentLocation.lng });
    }
    setUserId(user.id);
  }, [user, setCoords]);

  // Load the authoritative copy from the server.
  useEffect(() => {
    let mounted = true;

    api
      .me()
      .then((res) => {
        if (!mounted) return;
        const u = res.user;
        setName(u.name || '');
        setBusinessName(u.businessName || '');
        setEmail(u.email || '');
        setPhone(u.phone || '');
        setCity(u.city || '');
        setNtn(u.ntn || '');
        setCategories(
          Array.isArray(u.categories) && u.categories.length > 0
            ? u.categories
            : u.category
              ? [u.category]
              : []
        );
        setHouseAddress(u.houseAddress || '');
        setCurrentHouseLocation(u.currentHouseLocation || '');
        setAvatar((u as { avatar?: string }).avatar || '');
        if (u.currentLocation) {
          setCoords({ lat: u.currentLocation.lat, lng: u.currentLocation.lng });
        } else {
          setCoords(null);
        }
        setUserId(u.id);
      })
      .catch(() => {
        /* keep whatever the cached session gave us */
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [setCoords]);

  // Restore this account's notification switches.
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = window.localStorage.getItem(notificationsKey(userId));
      if (raw) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...JSON.parse(raw) });
    } catch {
      /* corrupted value — fall back to defaults */
    }
  }, [userId]);

  // Once the GPS point is captured, prefill the written location — unless the
  // trader already typed an address there.
  useEffect(() => {
    if (!coords) return;
    setCurrentHouseLocation((prev) =>
      prev.trim() ? prev.trim() : `${coords.lat}, ${coords.lng}`
    );
  }, [coords]);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose an image file (JPG, PNG or WEBP).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Profile picture must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(String(reader.result));
      setProfileError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatar('');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!name.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    if (isSupplier && !businessName.trim()) {
      setProfileError('Business name cannot be empty.');
      return;
    }
    if (isSupplier && categories.length === 0) {
      setProfileError('Select at least one business category.');
      return;
    }
    if (!email.trim()) {
      setProfileError('Email address cannot be empty.');
      return;
    }
    if (!phone.trim()) {
      setProfileError('Phone number cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        ...(isSupplier ? { businessName, city, ntn, categories } : {}),
        name,
        email,
        phone,
        houseAddress,
        currentHouseLocation,
        avatar,
        // Freshly captured GPS point — omit entirely when none exists so an
        // already-stored point is never accidentally cleared.
        ...(coords ? { currentLocation: coords } : {}),
      });
      setUserId(res.user.id);
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileError(
        err instanceof ApiError ? err.message : 'Could not save your changes. Please try again.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('Enter your current password to make a change.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from the current one.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password changed successfully.');
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : 'Could not update your password. Please try again.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const toggleNotification = (key: NotificationKey, value: boolean) => {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    if (!userId) return;
    try {
      window.localStorage.setItem(notificationsKey(userId), JSON.stringify(next));
    } catch {
      /* storage unavailable — the switch still reflects the on-screen state */
    }
  };

  if (loading) {
    return <Loader />;
  }

  const avatarDisplayName = businessName || name;
  const avatarInitial = avatarDisplayName ? avatarDisplayName.charAt(0).toUpperCase() : '?';

  return (
    <div className="space-y-8 max-w-4xl">
      <PortalHeader
        title="Account Settings"
        subtitle={`${isSupplier ? 'Supplier' : 'Shopkeeper'} Portal`}
      />

      {/* Profile details — persisted via PATCH /api/auth/me */}
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {isSupplier ? 'Enterprise Information' : 'Personal Information'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isSupplier
              ? 'Business details for wholesale invoicing'
              : 'Update your contact information'}
          </p>
        </div>

        {/* Profile picture — shown on Business Profile via profile.avatar.
            Choosing a photo only changes the preview here; it is saved
            together with the rest of the profile on Save. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-slate-200 dark:border-slate-800">
          {avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatar}
              alt={avatarDisplayName}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-asan-dark text-white flex items-center justify-center text-2xl font-extrabold border-2 border-emerald-500 shrink-0">
              {avatarInitial}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Profile picture</p>
            <p className="text-xs text-slate-500">
              JPG, PNG or WEBP, up to 2 MB. Saved when you save your profile.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
              <button
                type="button"
                onClick={() => avatarFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-asan-accent hover:text-asan-accent transition"
              >
                Change photo
              </button>
              {avatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-red-600 dark:text-red-400 hover:border-red-400 transition"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={isSupplier ? 'Authorized Representative' : 'Full Name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {isSupplier && (
              <Input
                label="Business Name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          {/* Residential details — same fields collected at registration, so
              traders can keep them current without contacting support. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="House Address"
              value={houseAddress}
              onChange={(e) => setHouseAddress(e.target.value)}
              helperText="Complete residential address"
            />
            <Input
              label="Current House Location"
              value={currentHouseLocation}
              onChange={(e) => setCurrentHouseLocation(e.target.value)}
              onFocus={autoPrompt}
              helperText="Focus this field to share your device location"
            />
          </div>

          {/* GPS capture — opens the browser's location-permission pop-up.
              The captured point is saved with the profile and shown to the
              admin as a clickable Google Maps link. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={capture}
              disabled={locating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:border-asan-accent hover:text-asan-accent transition disabled:opacity-60"
            >
              <MapPin className={`w-3.5 h-3.5 ${locating ? 'animate-pulse' : ''}`} />
              {locating ? 'Detecting your location…' : 'Use my current location'}
            </button>

            {coords && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                Location captured ({coords.lat}, {coords.lng})
              </span>
            )}
          </div>

          {notice && (
            <p
              role="alert"
              className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2"
            >
              {notice}
            </p>
          )}

          {isSupplier && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="NTN Number" value={ntn} onChange={(e) => setNtn(e.target.value)} />
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
              <CategoryMultiSelect
                selected={categories}
                onToggle={(cat) =>
                  setCategories((prev) =>
                    prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                  )
                }
              />
            </div>
          )}

          {profileError && (
            <p role="alert" className="text-xs font-semibold text-red-500">
              {profileError}
            </p>
          )}
          {profileSuccess && (
            <p role="status" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {profileSuccess}
            </p>
          )}

          <Button type="submit" isLoading={savingProfile} className="text-xs font-bold">
            {isSupplier ? 'Save Enterprise Details' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* Security — verified server-side against the stored hash */}
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Security &amp; Password</h3>
          <p className="text-xs text-slate-500 mt-0.5">Ensure your account uses a strong password</p>
        </div>

        <form onSubmit={handleSavePassword} className="space-y-4">
          <PasswordField
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="••••••••"
            show={showCurrentPassword}
            onToggleShow={() => setShowCurrentPassword((v) => !v)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PasswordField
              label="New Password"
              placeholder="Min. 8 characters"
              value={newPassword}
              onChange={setNewPassword}
              show={showNewPassword}
              onToggleShow={() => setShowNewPassword((v) => !v)}
            />
            <PasswordField
              label="Confirm Password"
              placeholder="Re-type new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirmPassword}
              onToggleShow={() => setShowConfirmPassword((v) => !v)}
            />
          </div>

          {passwordError && (
            <p role="alert" className="text-xs font-semibold text-red-500">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p role="status" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {passwordSuccess}
            </p>
          )}

          <Button type="submit" isLoading={savingPassword} className="text-xs font-bold">
            Update Password
          </Button>
        </form>
      </div>

      {/* Notification channels — stored per account */}
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Notification Preferences</h3>
          <p className="text-xs text-slate-500 mt-0.5">Control your notification preferences</p>
        </div>

        <div className="space-y-3">
          {options.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
            >
              <label
                htmlFor={`notify-${item.key}`}
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {item.label}
              </label>
              <input
                id={`notify-${item.key}`}
                type="checkbox"
                checked={notifications[item.key]}
                onChange={(e) => toggleNotification(item.key, e.target.checked)}
                className="w-4 h-4 rounded text-asan-accent focus:ring-asan-accent shrink-0"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
