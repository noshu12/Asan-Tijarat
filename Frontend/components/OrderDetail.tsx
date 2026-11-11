"use client";

import React, { useEffect, useState } from 'react';
import { api, fileUrl } from '@/lib/api';
import type { ChatMessage, Dispute, DisputeReason, Order, PaymentChannel, Rating } from '@/lib/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/types';
import { formatPKR, formatDate, orderGoogleMapsUrl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { ProductImage } from '@/components/ProductImage';

/**
 * Shared order-detail screen for the shopkeeper + supplier portals
 * (Batch 05). One place for everything that happens after checkout:
 * payment (reference / escrow release), delivery-proof photo, per-order
 * chat, disputes and the rating — all recorded in MongoDB, nothing hashed
 * on-chain here (that is the later blockchain phase).
 */

// All 15 dispute reasons, exactly as the backend defines them. Late
// delivery is deliberately NOT here — deliveries are normally late in
// Pakistan, so it never opens a dispute.
const DISPUTE_REASONS: { value: DisputeReason; label: string; by: 'shopkeeper' | 'supplier' }[] = [
  { value: 'wrong_goods', label: 'Wrong goods sent', by: 'shopkeeper' },
  { value: 'wrong_quantity', label: 'Wrong quantity', by: 'shopkeeper' },
  { value: 'defective', label: 'Defective goods', by: 'shopkeeper' },
  { value: 'expired', label: 'Expired goods', by: 'shopkeeper' },
  { value: 'fake', label: 'Fake / counterfeit goods', by: 'shopkeeper' },
  { value: 'damaged', label: 'Damaged in transit', by: 'shopkeeper' },
  { value: 'different_listing', label: 'Different from listing', by: 'shopkeeper' },
  { value: 'wrong_pack', label: 'Wrong pack / weight', by: 'shopkeeper' },
  { value: 'never_arrived', label: 'Goods never arrived', by: 'shopkeeper' },
  { value: 'partial_delivery', label: 'Partial delivery', by: 'shopkeeper' },
  { value: 'supplier_cancelled', label: 'Supplier cancelled after advance payment', by: 'shopkeeper' },
  { value: 'payment_dispute', label: 'Payment dispute — paid but supplier says not received', by: 'shopkeeper' },
  { value: 'overcharge', label: 'Overcharge', by: 'shopkeeper' },
  { value: 'refuses_delivery', label: 'Shopkeeper refuses delivery', by: 'supplier' },
  { value: 'refuses_payment', label: 'Shopkeeper refuses to pay', by: 'supplier' },
];

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: 'Unpaid',
  payment_submitted: 'Payment submitted — waiting for admin confirmation',
  held_in_escrow: 'Held in escrow',
  released: 'Released to supplier',
  frozen_dispute: 'Frozen — dispute open',
  refunded: 'Refunded to shopkeeper',
  paid: 'Paid',
};

const DISPUTE_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
};

const DECISION_LABEL: Record<string, string> = {
  release: 'Payment released to supplier',
  refund_full: 'Full refund to shopkeeper',
  refund_partial: 'Partial refund',
  return_goods: 'Goods returned + full refund',
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(file);
  });
}

export function OrderDetail({ orderId, role }: { orderId: string; role: 'shopkeeper' | 'supplier' }) {
  const isBuyer = role === 'shopkeeper';
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reference, setReference] = useState('');
  const [channel, setChannel] = useState<PaymentChannel>('bank');
  const [draft, setDraft] = useState('');
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('wrong_goods');
  const [disputeText, setDisputeText] = useState('');
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [stars, setStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  const load = async () => {
    setError(null);
    try {
      const [orderRes, msgRes, disputeRes, ratingRes] = await Promise.all([
        api.order(orderId),
        api.messages.list(orderId),
        // Batch 06 — the dispute ON this order (both parties see the same
        // one). listMyDisputes only returns disputes the caller raised, so
        // the counterparty saw nothing.
        api.disputes.forOrder(orderId),
        api.ratings.forOrder(orderId),
      ]);
      setOrder(orderRes.order);
      setMessages(msgRes.messages ?? []);
      setDispute(disputeRes.dispute ?? null);
      setRating(ratingRes.rating ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const run = async (fn: () => Promise<void>, okMessage: string) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      setNotice(okMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    await run(async () => {
      const dataUrl = await readAsDataUrl(file);
      await api.uploadDeliveryProof(orderId, { dataUrl, name: file.name });
    }, 'Delivery photo uploaded.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <p className="text-sm text-slate-500">{error || 'Order not found.'}</p>
      </div>
    );
  }

  const mapsUrl = orderGoogleMapsUrl(order);
  const disputeOpen = dispute && dispute.status !== 'resolved';
  // Batch 06 — a cancelled order can still take a dispute, but only reason
  // 11 (supplier cancelled after advance payment) and only from the
  // shopkeeper. The backend enforces the same rule.
  const canDispute = !disputeOpen && order.status !== 'pending' && (order.status !== 'cancelled' || role === 'shopkeeper');
  const myReasons = DISPUTE_REASONS.filter(
    (r) => r.by === role && (order.status !== 'cancelled' || r.value === 'supplier_cancelled'),
  );

  // Batch 06 gap fix — the "File a Dispute Claim" button + form, extracted
  // unchanged so it can render in two places: on its own when no dispute
  // exists yet, and below a resolved dispute when a new claim is allowed.
  // An open dispute still shows alone (canDispute is false while one is open).
  const fileDisputeBlock = (
    <>
      {!showDisputeForm ? (
        <div>
          <p className="text-xs text-slate-500 mb-2">Couldn&apos;t settle it in the chat? File a claim — it goes to the admin.</p>
          <Button type="button" variant="outline" onClick={() => { setShowDisputeForm(true); if (order.status === 'cancelled') setDisputeReason('supplier_cancelled'); }}>File a Dispute Claim</Button>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.disputes.create({ orderId, reason: disputeReason, description: disputeText.trim() });
              setShowDisputeForm(false);
              setDisputeText('');
            }, 'Dispute claim filed. The payment is frozen until the admin decides.');
          }}
        >
          <label className="block text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Reason</span>
            <select
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value as DisputeReason)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
            >
              {myReasons.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">What happened?</span>
            <textarea
              value={disputeText}
              onChange={(e) => setDisputeText(e.target.value)}
              placeholder="Describe the problem with this order…"
              maxLength={2000}
              rows={3}
              required
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Submit Claim</Button>
            <Button type="button" variant="outline" onClick={() => setShowDisputeForm(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          ✅ {notice}
        </div>
      )}

      {/* Summary */}
      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{order.orderNumber}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatDate(order.createdAt)} • Buyer: {order.buyerName} • Supplier: {order.supplierName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={order.status === 'delivered' ? 'delivered' : order.status === 'cancelled' ? 'outline' : 'confirmed'}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </Badge>
            {/* Batch 06 — same cancel the orders list offers (buyer only,
                pending only; the backend enforces both). */}
            {isBuyer && order.status === 'pending' && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  // Same confirm as the orders list before cancelling.
                  const ok = window.confirm(
                    `Cancel order ${order.orderNumber}?\n\nThe order will be cancelled and the supplier will not receive it.`,
                  );
                  if (!ok) return;
                  void run(async () => { await api.updateOrderStatus(orderId, 'cancelled'); }, 'Order cancelled. Any escrowed advance is refunded in full.');
                }}
              >
                Cancel Order
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <ProductImage src={item.productImage} alt={item.productName} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.productName}</p>
                  <p className="text-[11px] text-slate-400">{item.quantity} x {formatPKR(item.unitPrice)} / {item.unit}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white shrink-0">{formatPKR(item.unitPrice * item.quantity)}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>Total Amount</span>
          <span className="text-emerald-600 dark:text-emerald-400">{formatPKR(order.totalAmount)}</span>
        </div>
        <p className="text-xs text-slate-500">Shipping: {order.shippingAddress}</p>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Open shop location in Google Maps →
          </a>
        )}
      </div>

      {/* Payment */}
      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Payment</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <p className="text-slate-500">Method: <span className="font-bold text-slate-900 dark:text-white">{PAYMENT_METHOD_LABEL[order.paymentMethod ?? 'online_advance'] ?? order.paymentMethod}</span></p>
          <p className="text-slate-500">Channel: <span className="font-bold text-slate-900 dark:text-white">{order.paymentChannel ?? '—'}</span></p>
          <p className="text-slate-500">Status: <span className="font-bold text-slate-900 dark:text-white">{PAYMENT_STATUS_LABEL[order.paymentStatus ?? 'unpaid'] ?? order.paymentStatus}</span></p>
          <p className="text-slate-500">Platform fee: <span className="font-bold text-slate-900 dark:text-white">{formatPKR(order.platformFee ?? 0)}</span></p>
          {(order.amountHeld ?? 0) > 0 && (
            <p className="text-slate-500">Held in escrow: <span className="font-bold text-slate-900 dark:text-white">{formatPKR(order.amountHeld ?? 0)}</span></p>
          )}
          {(order.payoutAmount ?? 0) > 0 && (
            <p className="text-slate-500">Paid to supplier: <span className="font-bold text-slate-900 dark:text-white">{formatPKR(order.payoutAmount ?? 0)}</span></p>
          )}
          {(order.refundAmount ?? 0) > 0 && (
            <p className="text-slate-500">Refunded: <span className="font-bold text-slate-900 dark:text-white">{formatPKR(order.refundAmount ?? 0)}</span></p>
          )}
          {order.paymentReference && (
            <p className="text-slate-500">Reference: <span className="font-mono font-bold text-slate-900 dark:text-white">{order.paymentReference}</span></p>
          )}
        </div>

        {isBuyer && !disputeOpen && order.paymentStatus === 'unpaid' && order.status !== 'cancelled' && (order.paymentMethod === 'online_advance' || (order.paymentMethod === 'online_at_delivery' && order.status === 'delivered')) && (
          <form
            className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.submitPaymentReference(orderId, { reference: reference.trim(), channel });
              }, order.paymentMethod === 'online_at_delivery' ? 'Payment reference submitted. The admin will confirm it and the supplier will be paid after the fee.' : 'Payment reference submitted. The admin will confirm the receipt to hold it in escrow.');
            }}
          >
            <p className="text-xs text-slate-500">
              Pay through your own bank/JazzCash/Raast app to the platform account, then paste the transaction reference here.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                label="Transaction reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. TRX123456789"
                required
              />
              <label className="block text-xs shrink-0">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Channel</span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as PaymentChannel)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
                >
                  <option value="bank">Bank transfer</option>
                  <option value="raast">Raast</option>
                  <option value="jazzcash">JazzCash</option>
                </select>
              </label>
            </div>
            <Button type="submit" disabled={busy}>Submit Payment Reference</Button>
          </form>
        )}

        {isBuyer && order.status === 'delivered' && order.paymentMethod === 'online_advance' && order.paymentStatus === 'held_in_escrow' && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 mb-2">Goods arrived? Confirm receipt to release the escrowed payment to the supplier (fee deducted).</p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => { await api.confirmDelivery(orderId); }, 'Delivery confirmed — payment released to the supplier.')}
            >
              Confirm Delivery Received
            </Button>
          </div>
        )}

        {/* Batch 06 — the banner follows the dispute, not the stored
            payment status: an open dispute freezes the payment even when
            the order was never frozen by an old code path. */}
        {disputeOpen && (
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            Payment is frozen while the dispute is open — no release, no refund, until the admin decides.
          </p>
        )}
      </div>

      {/* Delivery proof */}
      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Delivery Proof</h3>
        {order.deliveryProof?.url ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(order.deliveryProof.url)} alt="Delivery proof" className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 object-cover" />
            <p className="text-[11px] text-slate-400 mt-1">
              Uploaded {order.deliveryProof.uploadedAt ? formatDate(order.deliveryProof.uploadedAt) : ''} — this photo + your delivery confirmation are the evidence for delivery disputes.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No delivery photo uploaded yet.</p>
        )}
        {!isBuyer && (order.status === 'shipped' || order.status === 'delivered') && (
          <label className="block text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Upload a photo taken at delivery (JPG/PNG/WEBP, max 5MB)</span>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => { void handlePhoto(e.target.files?.[0]); e.target.value = ''; }}
              className="mt-1 block w-full text-xs text-slate-500 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-asan-dark file:text-white file:text-xs file:font-bold hover:file:bg-asan-mid"
            />
          </label>
        )}
      </div>

      {/* Chat */}
      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Chat with {isBuyer ? 'Supplier' : 'Shopkeeper'}</h3>
        <p className="text-[11px] text-slate-400">Talk here first — this thread is step 1 of the dispute flow, and the admin can read it as evidence.</p>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {messages.length === 0 && <p className="text-xs text-slate-500">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`p-3 rounded-xl text-xs max-w-[85%] ${m.senderRole === role ? 'bg-emerald-50 dark:bg-emerald-950/40 ml-auto text-right' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
              <p className="font-bold text-slate-900 dark:text-white">{m.senderName || m.senderRole}</p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 break-words">{m.text}</p>
              <p className="text-[10px] text-slate-400 mt-1">{formatDate(m.createdAt)}</p>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            setDraft('');
            void run(async () => { await api.messages.send(orderId, text); }, '');
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            maxLength={2000}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent"
          />
          <Button type="submit" disabled={busy || !draft.trim()}>Send</Button>
        </form>
      </div>

      {/* Dispute */}
      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Dispute</h3>
        {dispute && (
          <div className="space-y-2 text-xs">
            <p className="text-slate-500">Reason: <span className="font-bold text-slate-900 dark:text-white">{dispute.reasonLabel}</span></p>
            <p className="text-slate-500">Status: <span className="font-bold text-slate-900 dark:text-white">{DISPUTE_STATUS_LABEL[dispute.status]}</span></p>
            <p className="text-slate-600 dark:text-slate-300 break-words">{dispute.description}</p>
            <p className="text-[11px] text-slate-400">Opened by {dispute.raisedByName || dispute.raisedByRole} • {formatDate(dispute.createdAt)}</p>
            {dispute.status === 'resolved' && dispute.resolution?.decision && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">Admin decision: {DECISION_LABEL[dispute.resolution.decision]}</p>
                {dispute.resolution.refundAmount > 0 && (
                  <p className="text-slate-600 dark:text-slate-300 mt-1">Refund: {formatPKR(dispute.resolution.refundAmount)}</p>
                )}
                {dispute.resolution.note && (
                  <p className="text-slate-600 dark:text-slate-300 mt-1 break-words">Note: {dispute.resolution.note}</p>
                )}
              </div>
            )}
          </div>
        )}
        {/* Batch 06 gap fix — a resolved dispute no longer hides the file
            button: when it is resolved and a new claim is allowed, the
            button shows below it. An open dispute still shows alone. */}
        {dispute?.status === 'resolved' && canDispute && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            {fileDisputeBlock}
          </div>
        )}
        {!dispute && canDispute && fileDisputeBlock}
        {!dispute && !canDispute && (
          <p className="text-xs text-slate-500">
            {order.status === 'pending' || order.status === 'cancelled'
              ? 'A dispute cannot be opened on this order.'
              : 'No dispute on this order.'}
          </p>
        )}
      </div>

      {/* Rating */}
      {isBuyer && order.status === 'delivered' && (
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Rate the Supplier</h3>
          {rating ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              You rated this delivery <span className="font-bold text-amber-600">{'★'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)}</span>
              {rating.comment ? ` — “${rating.comment}”` : ''} on {formatDate(rating.createdAt)}.
            </p>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api.ratings.create({ orderId, stars, comment: ratingComment.trim() });
                  setRatingComment('');
                }, 'Thanks — your rating was saved.');
              }}
            >
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    className={`text-2xl transition ${n <= stars ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Optional comment about this delivery…"
                maxLength={1000}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
              />
              <Button type="submit" disabled={busy}>Submit Rating</Button>
            </form>
          )}
        </div>
      )}
      {!isBuyer && rating && (
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Rating for this Order</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
            <span className="font-bold text-amber-600">{'★'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)}</span>
            {rating.comment ? ` — “${rating.comment}”` : ''} • {formatDate(rating.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}
