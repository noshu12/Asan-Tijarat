"use client";

import React, { useEffect, useState } from 'react';
import { api, fileUrl } from '@/lib/api';
import { PortalHeader } from '@/components/PortalHeader';
import { useAuth } from '@/context/AuthProvider';
import type { ChatMessage, Dispute, DisputeDecision, DisputeStatus, Order } from '@/lib/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/types';
import { formatPKR, formatDate } from '@/lib/utils';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';

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

export default function AdminDisputesPage() {
  const { loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | DisputeStatus>('all');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [decisionById, setDecisionById] = useState<Record<string, DisputeDecision>>({});
  const [refundById, setRefundById] = useState<Record<string, string>>({});
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // Batch 06 — evidence for the selected claim (Finding 3): order, chat
  // thread and delivery photo, so the admin decides on evidence.
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [evidenceOrder, setEvidenceOrder] = useState<Order | null>(null);
  const [evidenceMessages, setEvidenceMessages] = useState<ChatMessage[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    api.admin
      .disputes({ status: activeTab === 'all' ? undefined : activeTab, limit: 50 })
      .then((res) => {
        if (mounted) setDisputes(res.disputes ?? []);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load disputes');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authLoading, activeTab, refreshKey]);

  const decide = async (d: Dispute) => {
    const decision = decisionById[d.id] ?? 'release';
    const refundAmount = decision === 'refund_partial' ? Number(refundById[d.id] || 0) : undefined;
    const note = (noteById[d.id] || '').trim();
    setError(null);
    setBusyId(d.id);
    try {
      await api.admin.decideDispute(d.id, { decision, refundAmount, note: note || undefined });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decide dispute.');
    } finally {
      setBusyId(null);
    }
  };

  const loadEvidence = async (d: Dispute) => {
    // Toggle closed.
    if (evidenceId === d.id) {
      setEvidenceId(null);
      setEvidenceOrder(null);
      setEvidenceMessages([]);
      setEvidenceError(null);
      return;
    }
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
      setEvidenceMessages(msgRes.messages ?? []);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Failed to load evidence.');
      setEvidenceOrder(null);
      setEvidenceMessages([]);
    } finally {
      setEvidenceLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Batch 06 — bell (Finding 5): the disputes page renders PortalHeader
          like every other admin page instead of its own heading. */}
      <PortalHeader title="Disputes" subtitle="Admin Portal" />

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['all', 'open', 'in_review', 'resolved'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-asan-dark text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'in_review' ? 'In Review' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

      <div className="space-y-4">
        {disputes.map((d) => (
          <div key={d.id} className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {d.orderNumber} • {d.reasonLabel}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Opened by {d.raisedByName || d.raisedByRole} ({d.raisedByRole}) • {formatDate(d.createdAt)}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  d.status === 'resolved'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {d.status === 'resolved' ? 'Resolved' : d.status === 'in_review' ? 'In Review' : 'Open'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 break-words">{d.description}</p>

            {/* Batch 06 — evidence (Finding 3): order, chat thread and
                delivery photo for this claim, so the decision is made on
                evidence, not on the claim text alone. */}
            <Button type="button" variant="outline" onClick={() => void loadEvidence(d)}>
              {evidenceId === d.id ? 'Hide evidence' : 'View evidence'}
            </Button>
            {evidenceId === d.id && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                {evidenceLoading && (
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
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Buyer: {evidenceOrder.buyerName} • Supplier: {evidenceOrder.supplierName} • Status: {evidenceOrder.status}
                      </p>
                      <div className="mt-2 space-y-1">
                        {evidenceOrder.items.map((item, idx) => (
                          <p key={idx} className="text-[11px] text-slate-600 dark:text-slate-300">
                            {item.productName} — {item.quantity} x {formatPKR(item.unitPrice)} / {item.unit}
                          </p>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2">
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileUrl(evidenceOrder.deliveryProof.url)} alt="Delivery proof" className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 object-cover" />
                          <p className="text-[11px] text-slate-400 mt-1">
                            Uploaded {evidenceOrder.deliveryProof.uploadedAt ? formatDate(evidenceOrder.deliveryProof.uploadedAt) : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">No delivery photo uploaded.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white mb-1">Chat thread</p>
                      {evidenceMessages.length === 0 ? (
                        <p className="text-[11px] text-slate-500">No messages on this order.</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {evidenceMessages.map((m) => (
                            <div key={m.id} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <p className="text-[11px] font-bold text-slate-900 dark:text-white">
                                {m.senderName || m.senderRole} • {formatDate(m.createdAt)}
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 break-words">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {d.status === 'resolved' && d.resolution?.decision ? (
              <div className="p-3 rounded-xl bg-asan-accent-light dark:bg-asan-dark/40 border border-asan-border dark:border-asan-mid text-xs space-y-1">
                <p className="font-bold text-asan-dark dark:text-asan-accent-light">
                  Decision: {DECISION_LABEL[d.resolution.decision]}
                </p>
                {d.resolution.refundAmount > 0 && (
                  <p className="text-slate-600 dark:text-slate-300">Refund: {formatPKR(d.resolution.refundAmount)}</p>
                )}
                {d.resolution.note && <p className="text-slate-600 dark:text-slate-300 break-words">Note: {d.resolution.note}</p>}
                <p className="text-[11px] text-slate-400">
                  Decided by {d.resolution.decidedByName || 'admin'}
                  {d.resolution.decidedAt ? ` • ${formatDate(d.resolution.decidedAt)}` : ''}
                </p>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Decision</span>
                  <select
                    value={decisionById[d.id] ?? 'release'}
                    onChange={(e) => setDecisionById((prev) => ({ ...prev, [d.id]: e.target.value as DisputeDecision }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
                  >
                    {DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                {(decisionById[d.id] ?? 'release') === 'refund_partial' && (
                  <label className="block text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Refund amount (Rs, more than 0 and less than the order total)</span>
                    <input
                      type="number"
                      min={1}
                      value={refundById[d.id] ?? ''}
                      onChange={(e) => setRefundById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      placeholder="e.g. 5000"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
                    />
                  </label>
                )}
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Note for both parties (optional)</span>
                  <textarea
                    value={noteById[d.id] ?? ''}
                    onChange={(e) => setNoteById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    placeholder="Why this decision — evidence seen, chat read, delivery photo checked…"
                    maxLength={2000}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
                  />
                </label>
                <Button type="button" disabled={busyId === d.id} onClick={() => void decide(d)}>
                  {busyId === d.id ? 'Deciding…' : 'Decide Dispute'}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
