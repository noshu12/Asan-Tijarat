"use client";

// GROUP3-ADMIN-FIX 2026-11-28
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Ban, Check, Filter, Search, ShieldCheck, Trash2, UserCheck, Users, X } from 'lucide-react';
import Link from 'next/link';
import { KycDocumentViewer } from '@/components/KycDocumentViewer';
import { MapsLink } from '@/components/MapsLink';
import { api, AdminUser } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { cn, formatDate } from '@/lib/utils';
import { ACCOUNT_EVENT_TYPES, idFromEventLink, useLiveRefreshKey, useRealtimeEvent } from '@/hooks/useRealtime';

// Admin list se aane wale user me emailVerified ho sakta hai, lekin
// AdminUser type me ye field lazmi nahi hai, isliye safe tareeqe se parha hai.
function isOtpVerified(u: AdminUser): boolean {
  return Boolean((u as unknown as { emailVerified?: boolean }).emailVerified);
}

// Backend status na aaye (purana response) to verified se andaza lagao.
function getStatus(u: AdminUser): string {
  return u.status || (u.verified ? 'active' : 'pending');
}

function statusLabel(status: string): string {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

// Identity numbers are encrypted at rest — the users list API never sends
// them. The admin reveals one user's numbers per click; every view is
// written to the audit log on the backend.
function SensitiveValue({
  userId,
  field,
}: {
  userId: string;
  field: 'cnic' | 'ntn' | 'utilityBillAccountNumber';
}) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getDecryptedIdentity(userId);
      setValue(res.identity[field] || '—');
    } catch {
      setError('Could not load.');
    } finally {
      setLoading(false);
    }
  };

  if (value !== null) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono">{value}</span>
        <button
          type="button"
          onClick={() => setValue(null)}
          className="text-xs text-slate-500 underline hover:text-slate-700"
        >
          Hide
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">••••••</span>
      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        className="text-xs text-asan-accent-hover underline hover:text-asan-dark disabled:opacity-50"
      >
        {loading ? 'Loading…' : error ?? 'View'}
      </button>
    </span>
  );
}

type FilterKey = 'active' | 'suspended' | 'verified' | 'notVerified' | 'otpVerified' | 'notOtpVerified';

const EMPTY_FILTERS: Record<FilterKey, boolean> = {
  active: false,
  suspended: false,
  verified: false,
  notVerified: false,
  otpVerified: false,
  notOtpVerified: false,
};

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'verified', label: 'Verified' },
  { key: 'notVerified', label: 'Not Verified' },
  { key: 'otpVerified', label: 'OTP Verified' },
  { key: 'notOtpVerified', label: 'Not OTP Verified' },
  { key: 'suspended', label: 'Suspended' },
];

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  // REVISED (Batch 02, 2026-11-09) — Noushad ka faisla: sub-admin ko FULL
  // access hai, jo kuch main admin kar sakta hai wohi sub-admin bhi kar
  // sakta hai. Is liye Suspend / Activate / Reject / Delete buttons
  // sub-admin ko bhi dikhte hain (pehle wali Batch 02 me chhupaye thay,
  // wo faisla badal gaya hai).
  const [users, setUsers] = useState<AdminUser[]>([]);
  // GROUP3 — one filter record, no Apply button. Within one dimension
  // (status: active/suspended; KYC: verified/notVerified; OTP:
  // otpVerified/notOtpVerified) the selected values OR together;
  // dimensions AND together; search text ANDs. The KYC dimension maps
  // to the server `verified` param; status/OTP filter client-side only.
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Batch 19 (Round-5 audit H2) — the users table paginates (50/page).
  // The Administrators / Sub-Admins boxes CANNOT page from the same
  // list (the main admin is the oldest account, so it would fall off
  // page 1): they get their own tiny complete fetch — at most 11 staff
  // accounts — while the table pages through shopkeepers/suppliers.
  const [staffUsers, setStaffUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Batch 13 — live list: account_verified / account_suspended (or a
  // reconnect sync) bumps refreshKey; the fetch effect below refetches
  // silently on a bump, so the open drawer and filters never reset.
  // Batch 24 adds the user_registered / kyc_submitted single-row
  // handlers below (no full refetch for a new registration).
  const [refreshKey, setRefreshKey] = useState(0);
  const prevRefreshKeyRef = useRef(refreshKey);
  useLiveRefreshKey(
    ACCOUNT_EVENT_TYPES,
    () => setRefreshKey((k) => k + 1),
  );

  // Filter dropdown (Box 3 heading row) — custom panel, not the shared
  // Dropdown component (that one is single-select).
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterFlipUp, setFilterFlipUp] = useState(false);
  // Cap on the filter list height (px). Default 216 shows all 6 toggles
  // without scrolling; the effect below lowers it only when the panel
  // cannot fit the viewport in either direction.
  const [filterListMaxH, setFilterListMaxH] = useState(216);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const filterListRef = useRef<HTMLDivElement | null>(null);

  // GROUP3 — slide-over drawer: the user detail + actions moved out of
  // the table row into this panel.
  const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerTimerRef = useRef<number | null>(null);
  const drawerStatus = drawerUser ? getStatus(drawerUser) : 'pending';

  const openDrawer = (u: AdminUser) => {
    if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
    setDrawerUser(u);
    drawerTimerRef.current = window.setTimeout(() => setDrawerVisible(true), 20);
  };
  const closeDrawer = () => {
    setDrawerVisible(false);
    if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = window.setTimeout(() => setDrawerUser(null), 550);
  };
  useEffect(() => {
    return () => {
      if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
    };
  }, []);
  useEffect(() => {
    if (!drawerUser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerUser]);

  // B13 (Round-4 Batch 13) — zero-warnings fix. loadUsers is called from
  // several places: the fetch effect below, the filter/search effects,
  // and runAction after a mutation. The filters are applied live — the
  // effect must NOT refetch on every keystroke — so the naive fix
  // (useCallback with [filters, search] deps, added to the effect deps)
  // would CHANGE behaviour: typing in the search box would refetch +
  // flash the loader per keystroke. Instead the current filter values
  // live in a ref that loadUsers reads at call time, and loadUsers
  // itself is referentially stable, so the effect below runs exactly
  // when it runs today: on authLoading / user / refreshKey changes
  // only. All call sites still read the latest filter values, exactly
  // as the plain closure did.
  const filtersRef = useRef({ filters, search });
  filtersRef.current = { filters, search };
  // Batch 19 — page lives in a ref too, for the same reason: loadUsers
  // is called from the effect, the filter/search effects and runAction,
  // and the effect must not refetch on every page-state change by
  // itself (the Prev/Next buttons bump refreshKey after setting the
  // page instead).
  const pageRef = useRef(page);
  pageRef.current = page;

  const loadUsers = useCallback(async () => {
    const { filters: f, search: q } = filtersRef.current;
    // KYC dimension → server `verified` param; role is always 'all'.
    const verified = f.verified && !f.notVerified ? 'true' : f.notVerified && !f.verified ? 'false' : 'all';
    setError(null);
    try {
      const [res, adminsRes, subsRes] = await Promise.all([
        api.admin.users({ role: 'all', verified, search: q.trim() || undefined, page: pageRef.current, limit: 50 }),
        api.admin.users({ role: 'admin', limit: 100 }),
        api.admin.users({ role: 'subadmin', limit: 100 }),
      ]);
      if (!res) return;
      const list = Array.isArray(res) ? res : ((res as { users?: AdminUser[] }).users || []);
      setUsers(list);
      setTotalPages((res as { totalPages?: number }).totalPages ?? 1);
      setTotal((res as { total?: number }).total ?? list.length);
      const staff = [
        ...((adminsRes as { users?: AdminUser[] }).users || []),
        ...((subsRes as { users?: AdminUser[] }).users || []),
      ];
      setStaffUsers(staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  // GROUP3 — search refetches server-side (500ms debounce) so results
  // beyond the loaded page are still found; client-side filtering in
  // filteredUsers below still applies instantly while typing.
  const prevSearchRef = useRef(search);
  useEffect(() => {
    if (prevSearchRef.current === search) return;
    prevSearchRef.current = search;
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) return;
    const t = window.setTimeout(() => {
      pageRef.current = 1;
      setPage(1);
      void loadUsers();
    }, 500);
    return () => window.clearTimeout(t);
  }, [search, user, loadUsers]);

  // GROUP3 — a KYC-dimension change refetches live (page 1), like the
  // old Apply button did. Status/OTP toggles filter client-side only,
  // so they need no refetch.
  const prevKycRef = useRef({ verified: filters.verified, notVerified: filters.notVerified });
  useEffect(() => {
    const prev = prevKycRef.current;
    if (prev.verified === filters.verified && prev.notVerified === filters.notVerified) return;
    prevKycRef.current = { verified: filters.verified, notVerified: filters.notVerified };
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) return;
    pageRef.current = 1;
    setPage(1);
    void loadUsers();
  }, [filters.verified, filters.notVerified, user, loadUsers]);

  // Filter dropdown: close on outside click and Escape.
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterPanelRef.current?.contains(e.target as Node)) return;
      if (filterBtnRef.current?.contains(e.target as Node)) return;
      setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  // Filter panel placement — ROOT CAUSE of the cut-off bug: the click
  // handler guessed the flip from a hardcoded 300px estimate BEFORE the
  // panel existed in the DOM, and nothing ever re-checked. When the
  // estimate said "fits below" but the real panel was taller (125%
  // zoom, short viewport), the panel rendered past the viewport bottom
  // with the last toggle ("Suspended") half-cut — and the fixed
  // max-h-[216px] list could not shrink to save it. This effect is the
  // authority: after the panel mounts it measures the REAL panel height
  // (getBoundingClientRect), flips up when below does not fit, and —
  // when neither side fits the full panel — caps the list height to the
  // room on the chosen side so all 6 options stay reachable by internal
  // scroll. Re-runs on flip / cap changes (one settle pass) and on
  // window resize (zoom) while open. Setting state only when the value
  // actually changes, so it converges instead of looping.
  useLayoutEffect(() => {
    if (!filterOpen) return;
    const adjust = () => {
      const btn = filterBtnRef.current?.getBoundingClientRect();
      const panel = filterPanelRef.current?.getBoundingClientRect();
      const list = filterListRef.current?.getBoundingClientRect();
      if (!btn || !panel || !list) return;
      const GAP = 8;
      const spaceBelow = window.innerHeight - btn.bottom - GAP;
      const spaceAbove = btn.top - GAP;
      const panelH = panel.height;
      const isUp = panel.bottom <= btn.top + 1;
      const fitsBelow = panelH <= spaceBelow;
      const fitsAbove = panelH <= spaceAbove;
      const shouldFlipUp = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);
      if (shouldFlipUp !== isUp) {
        setFilterFlipUp(shouldFlipUp);
        return;
      }
      // Direction settled — cap the list so the whole panel fits the
      // chosen side; header height = panel minus list, borders included.
      const available = shouldFlipUp ? spaceAbove : spaceBelow;
      const headerH = Math.max(0, panelH - list.height);
      const next = panelH > available ? Math.max(72, Math.floor(available - headerH)) : 216;
      setFilterListMaxH((prev) => (prev === next ? prev : next));
    };
    adjust();
    window.addEventListener('resize', adjust);
    return () => window.removeEventListener('resize', adjust);
  }, [filterOpen, filterFlipUp, filterListMaxH]);

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Batch 24 — live registrations + KYC (Batch 23 types
  // user_registered / kyc_submitted).
  //
  // There is NO separate admin/suppliers page and NO admin/kyc page in
  // this repo: suppliers are the role filter on THIS page and KYC is
  // this page ("Users & KYC"), so both events land here. The pending
  // count the admin watches is the dashboard's Pending Verification
  // card (wired live there) plus this table's total below.
  //
  // There is also NO single-user admin endpoint (GET /api/admin/users
  // is a list only; its search matches name/email/phone/business, not
  // id), so the one user is picked out of a limit-100 list fetch —
  // the list is sorted newest-first, so a just-registered user is in
  // it. Nothing on screen is replaced by that fetch: only the one
  // matching row is prepended / updated, and the derived filteredUsers
  // below still applies the admin's status / KYC / OTP / search
  // filters. user_registered and kyc_submitted fire for the SAME
  // registration, so a pending-set + a functional setUsers dedupe stop
  // the row (and the total) ever doubling.
  const usersRef = useRef<AdminUser[]>([]);
  usersRef.current = users;
  const pendingUserPrependRef = useRef(new Set<string>());
  const fetchOneUser = async (userId: string): Promise<AdminUser | null> => {
    const res = await api.admin.users({ limit: 100 });
    const list = Array.isArray(res) ? res : ((res as { users?: AdminUser[] }).users || []);
    return list.find((u) => u.id === userId) ?? null;
  };
  const userMatchesFilters = (u: AdminUser): boolean => {
    const { filters: f, search: q } = filtersRef.current;
    const status = getStatus(u);
    if ((f.active || f.suspended) && !((f.active && status === 'active') || (f.suspended && status === 'suspended'))) return false;
    if ((f.verified || f.notVerified) && !((f.verified && u.verified) || (f.notVerified && !u.verified))) return false;
    if ((f.otpVerified || f.notOtpVerified) && !((f.otpVerified && isOtpVerified(u)) || (f.notOtpVerified && !isOtpVerified(u)))) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${u.name} ${u.email} ${u.phone || ''} ${u.businessName || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };
  useRealtimeEvent(['user_registered', 'kyc_submitted'], (event) => {
    const userId =
      idFromEventLink(event.link, 'users') ?? idFromEventLink(event.link, 'kyc');
    if (!userId) return;
    // Already on screen (e.g. a re-submitted KYC) — refresh the row in
    // place; the total does not change and the open drawer stays open.
    if (usersRef.current.some((u) => u.id === userId)) {
      void fetchOneUser(userId).then((u) => {
        if (!u) return;
        setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
      }).catch(() => {});
      return;
    }
    if (pendingUserPrependRef.current.has(userId)) return;
    pendingUserPrependRef.current.add(userId);
    void fetchOneUser(userId)
      .then((u) => {
        if (!u) return;
        if (!userMatchesFilters(u)) return;
        setUsers((prev) => {
          if (prev.some((x) => x.id === u.id)) return prev.map((x) => (x.id === u.id ? u : x));
          return pageRef.current === 1 ? [u, ...prev] : prev;
        });
        setTotal((prev) => prev + 1);
      })
      .catch(() => {})
      .finally(() => {
        pendingUserPrependRef.current.delete(userId);
      });
  });

  useEffect(() => {
    if (authLoading) return;
    // Batch 13 — silent on a live refreshKey bump (see above).
    const silent = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;
    // Sub-admins share this page (verify/unverify + KYC view only).
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    void loadUsers();
  }, [authLoading, user, refreshKey, loadUsers]);

  // Batch 19 (audit H2) — Prev/Next sets the page ref AND state, then
  // loads directly: the fetch effect does not depend on `page` (same
  // ref pattern as the filters above), so paging never refetches twice.
  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    pageRef.current = clamped;
    setPage(clamped);
    void loadUsers();
  };

  // Returns true when the action + list refresh succeeded, so the
  // drawer can close after a successful Delete (other actions keep
  // the drawer open).
  const runAction = async (action: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setBusyId('all');
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(ok);
      await loadUsers();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const toggleVerified = (u: AdminUser) =>
    runAction(
      () => api.admin.verifyUser(u.id, !u.verified),
      u.verified
        ? `Verification revoked for ${u.name}. They can no longer sign in.`
        : `${u.name} verified — they can now sign in with their registered credentials.`
    );

  const suspendAccount = (u: AdminUser) => {
    const reason = window.prompt(`Suspend ${u.name}? Enter the reason that will be emailed to them:`);
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to suspend an account.');
      return;
    }
    void runAction(
      () => api.admin.suspendUser(u.id, reason.trim()),
      `${u.name} suspended — a suspension email with the reason was sent.`
    );
  };

  const activateAccount = (u: AdminUser) =>
    runAction(
      () => api.admin.activateUser(u.id),
      `${u.name} activated — they can sign in again.`
    );

  const rejectAccount = (u: AdminUser) => {
    const reason = window.prompt(`Reject ${u.name}'s registration? Enter the reason that will be emailed to them:`);
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to reject an account.');
      return;
    }
    void runAction(
      () => api.admin.rejectUser(u.id, reason.trim()),
      `${u.name} rejected — a rejection email with the reason was sent.`
    );
  };

  const removeUser = (u: AdminUser) =>
    runAction(
      () => api.admin.deleteUser(u.id),
      `${u.name}'s account (and their listings) was deleted.`
    );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  // Sub-admins share this page with the main admin — full access,
  // same buttons as the main admin (Noushad ka faisla, 2026-11-09).
  if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Admins only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with an admin or reviewer account to manage users and KYC.</p>
      </div>
    );
  }

  const isMainAdmin = user?.role === 'admin';
  // Three separate boxes: admins, sub-admins, and regular users.
  // Batch 19 — staff boxes read the separate staff fetch (see above),
  // not the paginated table list.
  const adminUsers = staffUsers.filter((u) => u.role === 'admin');
  const subadminUsers = staffUsers.filter((u) => u.role === 'subadmin');

  const filteredUsers = users.filter((u) => {
    if (u.role === 'admin' || u.role === 'subadmin') return false; // own boxes above
    const status = getStatus(u);
    if ((filters.active || filters.suspended) && !((filters.active && status === 'active') || (filters.suspended && status === 'suspended'))) return false;
    if ((filters.verified || filters.notVerified) && !((filters.verified && u.verified) || (filters.notVerified && !u.verified))) return false;
    if ((filters.otpVerified || filters.notOtpVerified) && !((filters.otpVerified && isOtpVerified(u)) || (filters.notOtpVerified && !isOtpVerified(u)))) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${u.name} ${u.email} ${u.phone || ''} ${u.businessName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Detail rows differ per role — shopkeepers have a shop type +
  // utility bill (no NTN, no category); suppliers have NTN +
  // categories (no shop type, no utility bill).
  const buildDetailRows = (u: AdminUser): { label: string; value: React.ReactNode }[] => {
    const shopkeeperView = u.role === 'shopkeeper';
    const status = getStatus(u);
    return [
      { label: shopkeeperView ? 'Shop Name' : 'Business / Enterprise', value: u.businessName || '—' },
      { label: 'Full Name', value: u.name },
      shopkeeperView
        ? { label: 'Shop Type', value: u.shopType || '—' }
        : { label: 'Business Category', value: u.category || '—' },
      { label: 'City / Mandi Hub', value: u.city || '—' },
      shopkeeperView
        ? { label: 'House Address', value: u.houseAddress || '—' }
        : { label: 'Warehouse Address', value: u.houseAddress || '—' },
      shopkeeperView
        ? { label: 'Shop Location', value: u.shopLocation || '—' }
        : { label: 'Warehouse Location', value: u.currentHouseLocation || '—' },
      { label: 'Live Location', value: <MapsLink key={u.id} user={u} /> },
      shopkeeperView
        ? {
            label: 'Utility Bill Account Number',
            value: (
              <SensitiveValue key={`bill-${u.id}`} userId={u.id} field="utilityBillAccountNumber" />
            ),
          }
        : {
            label: 'NTN Number',
            value: <SensitiveValue key={`ntn-${u.id}`} userId={u.id} field="ntn" />,
          },
      {
        label: 'Account Type',
        value: u.role === 'supplier' ? 'Supplier' : u.role === 'shopkeeper' ? 'Shopkeeper' : 'Admin',
      },
      { label: 'Status', value: statusLabel(status) },
      { label: 'Suspension Reason', value: u.suspensionReason || '—' },
      { label: 'Rejection Reason', value: u.rejectionReason || '—' },
      { label: 'Email', value: u.email },
      { label: 'Email OTP', value: u.role === 'admin' ? '—' : isOtpVerified(u) ? 'Verified' : 'Pending' },
      { label: 'Phone', value: u.phone },
      { label: 'Registered On', value: u.createdAt ? formatDate(u.createdAt) : '—' },
    ];
  };

  return (
    <div className="space-y-4">
      <PortalHeader
        title="Users & KYC"
        hideSearch
      />
      {message && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      {/* ── Box 1: Administrators + Box 2: Sub-Admins (main admin only) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {isMainAdmin && !loading && adminUsers.length > 0 && (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-asan-accent" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Administrators</h2>
              <span className="text-xs text-slate-500">({adminUsers.length})</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {adminUsers.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-asan-accent/15 text-asan-accent flex items-center justify-center font-bold text-sm">
                    {(a.name || a.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {a.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{a.email}</p>
                    <p className="text-xs text-slate-400">Joined {a.createdAt ? formatDate(a.createdAt) : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isMainAdmin && !loading && (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-asan-accent" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Sub-Admins</h2>
                <span className="text-xs text-slate-500">({subadminUsers.length}/10)</span>
              </div>
              <Link href="/admin/subadmins" className="text-xs font-semibold text-asan-accent hover:underline">
                Manage →
              </Link>
            </div>
            {subadminUsers.length === 0 ? (
              <p className="text-xs text-slate-500">No sub-admins yet — create them from the Sub-Admins page.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {subadminUsers.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm">
                      {(s.name || s.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* ── Box 3: regular users (shopkeepers & suppliers) ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-asan-accent" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Users</h2>
          <span className="text-xs text-slate-500">Shopkeepers & Suppliers</span>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, email, phone or business..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            ref={filterBtnRef}
            aria-expanded={filterOpen}
            onClick={() => {
              if (!filterOpen) {
                const rect = filterBtnRef.current?.getBoundingClientRect();
                setFilterFlipUp(rect ? window.innerHeight - rect.bottom < 300 : false);
              }
              setFilterOpen((o) => !o);
            }}
            className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200 hover:border-asan-accent transition"
          >
            <Filter className="w-4 h-4 text-slate-400" />
            Filter
            {activeFilterCount > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-asan-accent text-white text-[11px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {filterOpen && (
            <div
              ref={filterPanelRef}
              className={cn(
                'absolute right-0 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg',
                filterFlipUp ? 'bottom-full mb-2' : 'top-full mt-2',
              )}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-900 dark:text-white">Filter users</p>
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-xs font-semibold text-asan-accent hover:underline"
                >
                  Clear
                </button>
              </div>
              <div
                ref={filterListRef}
                className="overflow-y-auto p-1.5 space-y-0.5"
                style={{ maxHeight: filterListMaxH }}
              >
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleFilter(opt.key)}
                    aria-pressed={filters[opt.key]}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition',
                      filters[opt.key]
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                  >
                    {opt.label}
                    {filters[opt.key] && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <Loader />
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No users match the selected filters.</p>
        </div>
      ) : (
        <div className="max-h-[348px] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">KYC</th>
                <th className="px-4 py-3">OTP</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const status = getStatus(u);
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDrawer(u)}
                        title="Show the details this trader submitted at registration"
                        className="flex items-center gap-2.5 text-left"
                      >
                        {u.avatar ? (
                            // B13 (Round-4 Batch 13) — <img> → next/image.
                            // `unoptimized`: avatar URLs are user-supplied
                            // and can come from a host outside
                            // images.remotePatterns, so Next must not try
                            // to optimise them (an unlisted host would
                            // 400). Unoptimized renders the same <img>
                            // with the same src — byte-identical output,
                            // 32×32 as before.
                            <Image src={u.avatar} alt="" width={32} height={32} unoptimized className="w-8 h-8 rounded-full object-cover bg-slate-100" />
                          ) : (
                            <span className="w-8 h-8 shrink-0 rounded-full bg-asan-accent-light text-asan-accent-hover flex items-center justify-center text-xs font-bold">
                              {(u.name || '?').trim().charAt(0).toUpperCase()}
                            </span>
                          )}
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                            {u.businessName || u.name}
                          </p>
                          <p className="text-xs text-slate-400">{u.name} · {u.city || '—'}</p>
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <p className="max-w-[220px] truncate">{u.email}</p>
                      <p className="text-xs text-slate-400">{u.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {u.role === 'supplier' ? 'Supplier' : u.role === 'shopkeeper' ? 'Shopkeeper' : 'Admin'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{statusLabel(status)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{u.verified ? 'Verified' : 'Pending KYC'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{u.role === 'admin' ? '—' : isOtpVerified(u) ? 'OTP Verified' : 'OTP Pending'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {u.createdAt ? formatDate(u.createdAt) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Batch 19 (audit H2) — page through users instead of only ever
          seeing the first 50. */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} • {total} user{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              Previous
            </Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
      {/* ── Slide-over drawer: user detail + actions ── */}
      {drawerUser !== null && (
        <>
          <div
            aria-hidden
            onClick={closeDrawer}
            className={cn(
              'fixed inset-0 z-[60] bg-black/40 transition-opacity duration-500 motion-reduce:transition-none',
              drawerVisible ? 'opacity-100' : 'opacity-0',
            )}
          />
          <aside
            role="dialog"
            aria-modal="true"
            className={cn(
              'fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col transition-transform duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              drawerVisible ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 p-4">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {drawerUser.businessName || drawerUser.name}
                </h3>
                <p className="text-xs text-slate-500 truncate">{drawerUser.name} · {drawerUser.city || '—'}</p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {buildDetailRows(drawerUser).map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <KycDocumentViewer
                  userId={drawerUser.id}
                  role={drawerUser.role}
                  documents={drawerUser.documents}
                  ownerLabel={`${drawerUser.businessName || drawerUser.name} (${
                    drawerUser.role === 'supplier' ? 'Supplier' : drawerUser.role === 'shopkeeper' ? 'Shopkeeper' : 'Admin'
                  } · ${drawerUser.email})`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-4 border-t border-slate-200 dark:border-slate-700">
                {drawerUser.role !== 'admin' && drawerUser.role !== 'subadmin' && (
                  <Button
                    size="sm"
                    variant={drawerUser.verified ? 'outline' : 'primary'}
                    disabled={busyId !== null || (!drawerUser.verified && !isOtpVerified(drawerUser)) || drawerStatus === 'suspended' || drawerStatus === 'rejected'}
                    onClick={() => void toggleVerified(drawerUser)}
                    className="flex items-center gap-1.5"
                    title={
                      drawerStatus === 'suspended' || drawerStatus === 'rejected'
                        ? 'Suspended or rejected accounts cannot be verified here — use Activate for a suspended account'
                        : drawerUser.verified
                          ? 'Revoke verification'
                          : isOtpVerified(drawerUser)
                            ? 'Verify this registration'
                            : 'Email OTP not verified yet — verify OTP first'
                    }
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {drawerUser.verified ? 'Unverify' : 'Verify'}
                  </Button>
                )}
                {drawerUser.role !== 'admin' && drawerUser.role !== 'subadmin' && drawerStatus !== 'suspended' && drawerStatus !== 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId !== null}
                    onClick={() => suspendAccount(drawerUser)}
                    className="flex items-center gap-1.5"
                    title="Suspend this account and email the reason"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Suspend
                  </Button>
                )}
                {drawerUser.role !== 'admin' && drawerUser.role !== 'subadmin' && drawerStatus === 'suspended' && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busyId !== null}
                    onClick={() => void activateAccount(drawerUser)}
                    className="flex items-center gap-1.5"
                    title="Activate this suspended account again"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Activate
                  </Button>
                )}
                {drawerUser.role !== 'admin' && drawerUser.role !== 'subadmin' && drawerStatus === 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId !== null}
                    onClick={() => rejectAccount(drawerUser)}
                    className="flex items-center gap-1.5"
                    title="Reject this registration and email the reason"
                  >
                    Reject
                  </Button>
                )}
                {drawerUser.role !== 'admin' && drawerUser.role !== 'subadmin' && (
                  <button
                    type="button"
                    title="Delete account"
                    disabled={busyId !== null}
                    onClick={() => {
                      if (window.confirm(`Delete ${drawerUser.name}'s account and all their listings?`)) {
                        void removeUser(drawerUser).then((ok) => {
                          if (ok) closeDrawer();
                        });
                      }
                    }}
                    className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
