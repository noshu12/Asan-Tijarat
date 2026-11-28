"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileUrl } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { useAuth } from '@/context/AuthProvider';
import type { ChatMessage, Dispute, DisputeDecision, DisputeStatus, Order } from '@/lib/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/types';
import { capitalize, formatPKR, formatDate } from '@/lib/utils';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { ChevronRight, X } from 'lucide-react';
import { useLiveRefreshKey, useRealtime, useRealtimeEvent } from '@/hooks/useRealtime';

/**
 * Admin dispute queue (Batch 05).
 *
 * The admin decides on the evidence — order, invoice, batch, chat thread,
 * delivery photo + confirmation (the order page has them all). Decisions:
 * release the payment to the supplier, full refund, partial refund (admin
 * enters the amount), or return the goods + full refund. The payment stays
 * frozen until the decision. The decision + note are recorded (and audited)
 * so the later blockchain phase can hash them.
 */
const DECISION_LABEL: Record<DisputeDecision, string> = {
  release: 'Release payment to supplier',
  refund_full: 'Full refund to shopkeeper',
  refund_partial: 'Partial refund',
  return_goods: 'Return goods + full refund',
};

const DECISION_OPTIONS: { value: DisputeDecision; label: string }[] = [
  { value: 'release', label: 'Release payment to supplier' },
  { value: 'refund_full', label: 'Full refund to shopkeeper' },
  { value: 'refund_partial', label: 'Partial refund (enter amount)' },
  { value: 'return_goods', label: 'Return goods + full refund' },
];

// GROUP3-ADMIN-FIX 2026-11-28

export default function AdminDisputesPage() {
  const { loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | DisputeStatus>('all');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Batch 19 (Round-5 audit L4) — the queue used to fetch only the
  // first 50 disputes with no page param and no pagination UI, even
  // though the backend supports page/limit/totalPages. Page state here;
  // changing tab resets to page 1.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  // Batch 13 — live queue: dispute_opened / dispute_resolved (or a
  // reconnect sync) bumps refreshKey; the fetch effect below refetches
  // silently on a bump, so typed decision notes and open evidence stay put.
  const prevRefreshKeyRef = useRef(refreshKey);
  useLiveRefreshKey(
    ['dispute_opened', 'dispute_resolved'],
    () => setRefreshKey((k) => k + 1),
  );
  // Batch 20 (audit (c)-5) — request ids for the two live refetches
  // below (list + evidence thread): a response that resolves AFTER a
  // newer fetch started is ignored, so rapid live events can no longer
  // resolve out of order and let the stale list/thread win.
  const fetchSeqRef = useRef(0);
  const evidenceSeqRef = useRef(0);
  const [decisionById, setDecisionById] = useState<Record<string, DisputeDecision>>({});
  const [refundById, setRefundById] = useState<Record<string, string>>({});
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // GROUP3 — no decision is pre-selected: the admin must pick one
  // explicitly (see decide() guard below). decisionError is shown under
  // the dropdown; decisionPrompt re-opens it as a reminder.
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionPrompt, setDecisionPrompt] = useState(0);
  // GROUP3 — right slide-over drawer for one dispute (list rows open it).
  const [drawerDispute, setDrawerDispute] = useState<Dispute | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerTimerRef = useRef<number | null>(null);
  // GROUP3 — full-size delivery-photo viewer, opened from the drawer thumbnail.
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // Batch 06 — evidence for the selected claim (Finding 3): order, chat
  // thread and delivery photo, so the admin decides on evidence.
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [evidenceOrder, setEvidenceOrder] = useState<Order | null>(null);
  const [evidenceMessages, setEvidenceMessages] = useState<ChatMessage[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Remaining-fixes — live evidence chat thread: the thread used to load
  // once in loadEvidence() and never update, so a message sent while the
  // admin had the evidence open never appeared. Same pattern as
  // OrderDetail: on chat_message for this order, refetch the messages
  // (never hand-build a bubble — the notification payload carries only a
  // truncated "Name: text" summary with the wrong sender). A reconnect /
  // tab-visible sync refetches the same way, for messages missed while
  // away. Only the message list is replaced — the open panel, order
  // summary and typed decision notes stay put, and a failed live refetch
  // never clears the thread or shows an error.
  const evidenceOrderIdRef = useRef<string | null>(null);
  const reloadEvidenceMessages = useCallback(async (orderId: string) => {
    // Batch 20 (audit (c)-5) — see evidenceSeqRef above.
    const requestId = ++evidenceSeqRef.current;
    try {
      const msgRes = await api.messages.list(orderId);
      if (evidenceOrderIdRef.current !== orderId) return;
      if (requestId !== evidenceSeqRef.current) return;
      setEvidenceMessages(msgRes.messages ?? []);
    } catch {
      // Live refetch only — keep the thread already on screen.
    }
  }, []);
  useRealtimeEvent(['chat_message'], (event) => {
    const orderId = evidenceOrderIdRef.current;
    if (!orderId) return;
    if (event.orderId && event.orderId !== orderId) return;
    void reloadEvidenceMessages(orderId);
  });
  const { syncKey } = useRealtime();
  const lastEvidenceSyncKeyRef = useRef(syncKey);
  useEffect(() => {
    if (lastEvidenceSyncKeyRef.current === syncKey) return;
    lastEvidenceSyncKeyRef.current = syncKey;
    const orderId = evidenceOrderIdRef.current;
    if (!orderId) return;
    void reloadEvidenceMessages(orderId);
  }, [syncKey, reloadEvidenceMessages]);

  // GROUP3 — clear any pending drawer open/close timer on unmount.
  useEffect(() => () => {
    if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
  }, []);

  // GROUP3 — Escape closes the lightbox first if open, else the drawer.
  useEffect(() => {
    if (!drawerDispute && !lightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxSrc) {
        setLightboxSrc(null);
        return;
      }
      closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerDispute, lightboxSrc]);

  useEffect(() => {
    if (authLoading) return;
    // Batch 13 — silent on a live refreshKey bump (see above).
    const silent = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;
    let mounted = true;
    if (!silent) setLoading(true);
    setError(null);
    // Batch 20 (audit (c)-5) — see fetchSeqRef above.
    const requestId = ++fetchSeqRef.current;
    api.admin
      .disputes({ status: activeTab === 'all' ? undefined : activeTab, limit: 50, page })
      .then((res) => {
        if (!mounted || requestId !== fetchSeqRef.current) return;
        setDisputes(res.disputes ?? []);
        setTotalPages(res.totalPages ?? 1);
        setTotal(res.total ?? res.disputes?.length ?? 0);
      })
      .catch((err) => {
        if (mounted && requestId === fetchSeqRef.current) setError(err instanceof Error ? err.message : 'Failed to load disputes');
      })
      .finally(() => {
        if (mounted && requestId === fetchSeqRef.current) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authLoading, activeTab, page, refreshKey]);

  const decide = async (d: Dispute) => {
    // GROUP3 — no auto-select: nothing is decided until the admin picks
    // a decision. The openSignal bump re-opens the dropdown as a reminder.
    const decision = decisionById[d.id];
    if (!decision) {
      setDecisionError('Please select a decision first.');
      setDecisionPrompt((p) => p + 1);
      return;
    }
    const refundAmount = decision === 'refund_partial' ? Number(refundById[d.id] || 0) : undefined;
    const note = (noteById[d.id] || '').trim();
    setError(null);
    setBusyId(d.id);
    try {
      // The API returns the updated dispute — use it for the drawer
      // snapshot so the drawer shows the resolved decision box right away.
      const res = await api.admin.decideDispute(d.id, { decision, refundAmount, note: note || undefined });
      setDecisionError(null);
      setDrawerDispute((prev) => (prev && prev.id === d.id ? res.dispute : prev));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decide dispute.');
    } finally {
      setBusyId(null);
    }
  };

  const loadEvidence = async (d: Dispute) => {
    setEvidenceId(d.id);
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      // Opening the claim also marks it "In Review" on the backend
      // (getDispute transitions open → in_review for admins, Finding 8),
      // and the refreshed dispute updates the list row without a reload.
      const [disputeRes, orderRes, msgRes] = await Promise.all([
        api.disputes.get(d.id),
        api.order(d.orderId),
        api.messages.list(d.orderId),
      ]);
      setDisputes((prev) => prev.map((x) => (x.id === d.id ? disputeRes.dispute : x)));
      setEvidenceOrder(orderRes.order);
      evidenceOrderIdRef.current = orderRes.order.id;
      setEvidenceMessages(msgRes.messages ?? []);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Failed to load evidence.');
      setEvidenceOrder(null);
      evidenceOrderIdRef.current = null;
      setEvidenceMessages([]);
    } finally {
      setEvidenceLoading(false);
    }
  };

  // GROUP3 — drawer open/close. Opening a row loads its evidence (which
  // marks the claim In Review on the backend, as before). Closing waits
  // for the slide-out animation, then clears the drawer + evidence state.
  const openDispute = (d: Dispute) => {
    if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
    setDecisionError(null);
    setDrawerDispute(d);
    drawerTimerRef.current = window.setTimeout(() => setDrawerVisible(true), 20);
    void loadEvidence(d);
  };

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    if (drawerTimerRef.current !== null) window.clearTimeout(drawerTimerRef.current);
    drawerTimerRef.current = window.setTimeout(() => {
      setDrawerDispute(null);
      setEvidenceId(null);
      setEvidenceOrder(null);
      setEvidenceMessages([]);
      setEvidenceError(null);
      evidenceOrderIdRef.current = null;
    }, 550);
  }, []);

  return (
    <div className="space-y-4">
      {/* Batch 06 — bell (Finding 5): the disputes page renders PortalHeader
          like every other admin page instead of its own heading. */}
      <PortalHeader title="Disputes" subtitle="Admin Portal" hideSearch />

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['all', 'open', 'in_review', 'resolved'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setPage(1); setActiveTab(tab); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-asan-dark text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'in_review' ? 'In Review' : capitalize(tab)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && disputes.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-500">No disputes here.</p>
        </div>
      )}

      {/* GROUP3 — compact list in one fixed-height box (6-8 rows visible);
          a row opens the drawer, which holds the evidence + decision. */}
      {!loading && disputes.length > 0 && (
        <div className="max-h-[510px] overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {disputes.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => openDispute(d)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                    {d.orderNumber} • {d.reasonLabel}
                  </span>
                  <span className="block text-xs text-slate-400 mt-0.5">
                    Opened by {d.raisedByName || d.raisedByRole} ({d.raisedByRole}) • {formatDate(d.createdAt)}
                  </span>
                  <span className="block text-xs text-slate-600 dark:text-slate-300 break-words line-clamp-2 mt-1">
                    {d.description}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      d.status === 'resolved'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {d.status === 'resolved' ? 'Resolved' : d.status === 'in_review' ? 'In Review' : 'Open'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Batch 19 (audit L4) — page through the queue instead of only
          ever seeing the first 50 disputes. */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} • {total} dispute{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* GROUP3 — right slide-over drawer: claim + evidence + decision for
          one dispute. Rendered only while a dispute is open. */}
      {drawerDispute !== null && (
        <>
          <div
            className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-500 motion-reduce:transition-none ${drawerVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-label={`Dispute ${drawerDispute.orderNumber}`}
            className={`fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col transition-transform duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${drawerVisible ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {drawerDispute.orderNumber} • {drawerDispute.reasonLabel}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Opened by {drawerDispute.raisedByName || drawerDispute.raisedByRole} ({drawerDispute.raisedByRole}) • {formatDate(drawerDispute.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    drawerDispute.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {drawerDispute.status === 'resolved' ? 'Resolved' : drawerDispute.status === 'in_review' ? 'In Review' : 'Open'}
                </span>
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close dispute"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-5">
              {/* Claim */}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white mb-1">Claim</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 break-words">{drawerDispute.description}</p>
              </div>

              {/* Batch 06 — evidence (Finding 3): order, chat thread and
                  delivery photo for this claim, so the decision is made on
                  evidence, not on the claim text alone. */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                {evidenceId === drawerDispute.id && evidenceLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader />
                  </div>
                )}
                {evidenceError && (
                  <p className="text-xs text-red-600 dark:text-red-300">⚠️ {evidenceError}</p>
                )}
                {!evidenceLoading && !evidenceError && evidenceOrder && (
                  <>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Order {evidenceOrder.orderNumber} • {formatPKR(evidenceOrder.totalAmount)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Buyer: {evidenceOrder.buyerName} • Supplier: {evidenceOrder.supplierName} • Status: {evidenceOrder.status}
                      </p>
                      <div className="mt-2 space-y-1">
                        {evidenceOrder.items.map((item, idx) => (
                          <p key={idx} className="text-xs text-slate-600 dark:text-slate-300">
                            {item.productName} — {item.quantity} x {formatPKR(item.unitPrice)} / {item.unit}
                          </p>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2 break-words">
                        Payment: {PAYMENT_METHOD_LABEL[evidenceOrder.paymentMethod ?? 'online_advance'] ?? evidenceOrder.paymentMethod}
                        {' • '}Status: {evidenceOrder.paymentStatus ?? 'unpaid'}
                        {evidenceOrder.paymentReference ? ` • Reference: ${evidenceOrder.paymentReference}` : ''}
                        {` • Fee: ${formatPKR(evidenceOrder.platformFee ?? 0)}`}
                        {(evidenceOrder.refundAmount ?? 0) > 0 ? ` • Refunded: ${formatPKR(evidenceOrder.refundAmount ?? 0)}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white mb-1">Delivery photo</p>
                      {evidenceOrder.deliveryProof?.url ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => setLightboxSrc(fileUrl(evidenceOrder.deliveryProof!.url))}
                            title="View the delivery photo full size"
                            className="block rounded-lg"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={fileUrl(evidenceOrder.deliveryProof.url)} alt="Delivery proof" className="w-16 h-16 rounded-lg border border-slate-200 dark:border-slate-800 object-cover" />
                          </button>
                          <p className="text-xs text-slate-400 mt-1">
                            Uploaded {evidenceOrder.deliveryProof.uploadedAt ? formatDate(evidenceOrder.deliveryProof.uploadedAt) : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No delivery photo uploaded.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white mb-1">Chat thread</p>
                      {evidenceMessages.length === 0 ? (
                        <p className="text-xs text-slate-500">No messages on this order.</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {evidenceMessages.map((m) => (
                            <div key={m.id} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {m.senderName || m.senderRole} • {formatDate(m.createdAt)}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 break-words">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {drawerDispute.status === 'resolved' && drawerDispute.resolution?.decision ? (
                <div className="p-3 rounded-xl bg-asan-accent-light dark:bg-asan-dark/40 border border-asan-border dark:border-asan-mid text-xs space-y-1">
                  <p className="font-bold text-asan-dark dark:text-asan-accent-light">
                    Decision: {DECISION_LABEL[drawerDispute.resolution.decision]}
                  </p>
                  {drawerDispute.resolution.refundAmount > 0 && (
                    <p className="text-slate-600 dark:text-slate-300">Refund: {formatPKR(drawerDispute.resolution.refundAmount)}</p>
                  )}
                  {drawerDispute.resolution.note && <p className="text-slate-600 dark:text-slate-300 break-words">Note: {drawerDispute.resolution.note}</p>}
                  <p className="text-xs text-slate-400">
                    Decided by {drawerDispute.resolution.decidedByName || 'admin'}
                    {drawerDispute.resolution.decidedAt ? ` • ${formatDate(drawerDispute.resolution.decidedAt)}` : ''}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Decision</span>
                    <span className="block mt-1">
                      <Dropdown
                        options={DECISION_OPTIONS}
                        value={decisionById[drawerDispute.id] ?? ''}
                        placeholder="Select a decision"
                        openSignal={decisionPrompt}
                        ariaLabel="Decision"
                        onChange={(v) => {
                          setDecisionById((prev) => ({ ...prev, [drawerDispute.id]: v as DisputeDecision }));
                          setDecisionError(null);
                        }}
                      />
                    </span>
                  </label>
                  {decisionError && (
                    <p className="text-xs text-red-600 dark:text-red-300">{decisionError}</p>
                  )}
                  {decisionById[drawerDispute.id] === 'refund_partial' && (
                    <label className="block text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Refund amount (Rs, more than 0 and less than the order total)</span>
                      <input
                        type="number"
                        min={1}
                        value={refundById[drawerDispute.id] ?? ''}
                        onChange={(e) => setRefundById((prev) => ({ ...prev, [drawerDispute.id]: e.target.value }))}
                        placeholder="e.g. 5000"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
                      />
                    </label>
                  )}
                  <label className="block text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Note for both parties (optional)</span>
                    <textarea
                      value={noteById[drawerDispute.id] ?? ''}
                      onChange={(e) => setNoteById((prev) => ({ ...prev, [drawerDispute.id]: e.target.value }))}
                      placeholder="Why this decision — evidence seen, chat read, delivery photo checked…"
                      maxLength={2000}
                      rows={2}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
                    />
                  </label>
                  <Button type="button" disabled={busyId === drawerDispute.id} onClick={() => void decide(drawerDispute)}>
                    {busyId === drawerDispute.id ? 'Deciding…' : 'Decide Dispute'}
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* GROUP3 — full-size delivery-photo viewer (from the drawer thumbnail). */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
          role="dialog"
          aria-label="Delivery photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="Delivery proof"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            aria-label="Close photo"
            className="absolute top-4 right-4 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
