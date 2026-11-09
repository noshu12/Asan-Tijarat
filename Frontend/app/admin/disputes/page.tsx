"use client";

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import type { Dispute, DisputeDecision, DisputeStatus } from '@/lib/types';
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

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          Disputes
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Claims from shopkeepers and suppliers — decide on the evidence. Payment stays frozen until you decide.
        </p>
      </div>

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

            {d.status === 'resolved' && d.resolution?.decision ? (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">
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
