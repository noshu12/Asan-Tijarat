const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const { DISPUTE_REASONS, SHOPKEEPER_REASONS, SUPPLIER_REASONS } = require('../models/Dispute');
const AuditLog = require('../models/AuditLog');
const { toClient } = require('../utils/serialize');
const { calcPlatformFee } = require('../utils/payment');
const { notifyUser, notifyOrderParties, notifyAdmins } = require('../utils/notify');

/**
 * Dispute / refund flow (Batch 05) — Noushad's finalised rules.
 *
 * Stages: (1) shopkeeper talks to the supplier directly (order chat);
 * (2) if the supplier has a return policy and accepts, it is resolved with
 * NO dispute; (3) otherwise a claim is filed here; (4) the admin decides.
 *
 * Rules: reasons 1-8 = supplier's fault, supplier takes the goods back.
 * Reasons 9-11 = escrow protects the shopkeeper (no payment until the
 * shopkeeper confirms delivery — delivery photo + confirmation). Reasons
 * 12-13 = admin decides on the evidence; the decision is recorded here
 * (hashed on-chain in the later blockchain phase — NOT in this batch).
 * Reasons 14-15 = if goods match the order the shopkeeper must accept
 * them; if not, they go back; if the shopkeeper does not pay, he gets no
 * goods. Late delivery is NOT a reason (see Dispute.js).
 *
 * While a dispute is open the payment is frozen_dispute — no release and
 * no refund until the admin decides.
 */

/** Loads an order the caller is a party to, or null (error already sent). */
async function loadOwnOrder(req, res, orderId) {
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' } });
    return null;
  }
  const isBuyer = String(order.buyerId) === String(req.user._id);
  const isSupplier = String(order.supplierId) === String(req.user._id);
  if (!isBuyer && !isSupplier) {
    res.status(403).json({ error: { code: 'ORDER_NOT_YOURS', message: 'You can only act on your own orders.' } });
    return null;
  }
  return { order, isBuyer, isSupplier };
}

/**
 * POST /api/disputes  (party to the order)
 * Body: { orderId, reason, description }.
 * Reasons 1-13 are raised by the shopkeeper, 14-15 by the supplier.
 * One open dispute per order at a time.
 */
async function openDispute(req, res, next) {
  try {
    const { orderId, reason, description } = req.body;
    const reasonKey = reason ? String(reason).trim() : '';
    if (!orderId || !reasonKey || !description || !String(description).trim()) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'orderId, reason and description are required.' },
      });
    }
    if (!DISPUTE_REASONS[reasonKey]) {
      return res.status(400).json({
        error: { code: 'INVALID_REASON', message: `"${reasonKey}" is not a valid dispute reason.` },
      });
    }
    if (String(description).trim().length > 2000) {
      return res.status(400).json({ error: { code: 'INVALID_REASON', message: 'Description must be 2000 characters or less.' } });
    }

    const found = await loadOwnOrder(req, res, orderId);
    if (!found) return;
    const { order, isBuyer, isSupplier } = found;

    // Who may raise which reason: 1-13 shopkeeper, 14-15 supplier.
    if (isBuyer && !SHOPKEEPER_REASONS.includes(reasonKey)) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'This reason can only be raised by the supplier.' } });
    }
    if (isSupplier && !SUPPLIER_REASONS.includes(reasonKey)) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'This reason can only be raised by the shopkeeper.' } });
    }

    // A dispute needs a live order: pending orders have not shipped yet,
    // and cancelled orders are already closed — except reason 11 (supplier
    // cancelled after advance payment), which is filed on a cancelled order.
    if (order.status === 'pending') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'A dispute cannot be opened on a pending order — talk to the supplier first.' } });
    }
    if (order.status === 'cancelled' && reasonKey !== 'supplier_cancelled') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'This order is already cancelled.' } });
    }

    const existing = await Dispute.findOne({
      orderId: order._id,
      status: { $in: ['open', 'in_review'] },
    });
    if (existing) {
      return res.status(400).json({
        error: { code: 'DISPUTE_ALREADY_OPEN', message: 'A dispute is already open on this order.' },
      });
    }

    const dispute = await Dispute.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      reason: reasonKey,
      reasonLabel: DISPUTE_REASONS[reasonKey].label,
      description: String(description).trim(),
      raisedBy: req.user._id,
      raisedByRole: isBuyer ? 'shopkeeper' : 'supplier',
      raisedByName: req.user.businessName || req.user.name || '',
    });

    // Freeze the money while the dispute is open. The previous status is
    // kept on the order so the decision can restore or settle it.
    if (order.paymentStatus === 'held_in_escrow' || order.paymentStatus === 'payment_submitted') {
      order.prevPaymentStatus = order.paymentStatus;
      order.paymentStatus = 'frozen_dispute';
    }
    order.disputeId = dispute._id;
    await order.save();

    await notifyOrderParties(order, {
      type: 'dispute_opened',
      title: `Dispute opened — ${order.orderNumber}`,
      message: `${dispute.raisedByName || 'A party'} filed a claim: ${dispute.reasonLabel}. The payment is frozen until the admin decides.`,
      excludeUserId: req.user._id,
    });
    await notifyAdmins({
      type: 'dispute_opened',
      title: `New dispute — ${order.orderNumber}`,
      message: `${dispute.reasonLabel}. Opened by ${dispute.raisedByName || 'a party'}.`,
      link: '/admin/disputes',
      orderId: order._id,
    });

    res.status(201).json({ dispute: toClient(dispute.toObject()) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/disputes?status=&limit=&page=  (party to the orders)
 * The signed-in user's disputes, newest first.
 */
async function listMyDisputes(req, res, next) {
  try {
    const query = { raisedBy: req.user._id };
    if (req.query.status && req.query.status !== 'all') {
      if (!['open', 'in_review', 'resolved'].includes(String(req.query.status))) {
        return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid dispute status.' } });
      }
      query.status = req.query.status;
    }
    const total = await Dispute.countDocuments(query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const disputes = await Dispute.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ disputes: toClient(disputes), count: disputes.length, total, page: safePage, limit, totalPages });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/disputes/:id  (party to the order, or admin/sub-admin)
 */
async function getDispute(req, res, next) {
  try {
    const dispute = await Dispute.findById(req.params.id).lean();
    if (!dispute) {
      return res.status(404).json({ error: { code: 'DISPUTE_NOT_FOUND', message: 'No dispute matches that id.' } });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'subadmin';
    const isParty = String(dispute.raisedBy) === String(req.user._id);
    if (!isAdmin && !isParty) {
      // The other party to the order may also read it (they share the order).
      const order = await Order.findById(dispute.orderId, { buyerId: 1, supplierId: 1 }).lean();
      const isOtherParty = order && (
        String(order.buyerId) === String(req.user._id) ||
        String(order.supplierId) === String(req.user._id)
      );
      if (!isOtherParty) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only view your own disputes.' } });
      }
    }
    res.json({ dispute: toClient(dispute) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/disputes?status=&limit=&page=  (admin / sub-admin)
 * Every dispute, newest first — the admin's queue.
 */
async function listDisputesAdmin(req, res, next) {
  try {
    const query = {};
    if (req.query.status && req.query.status !== 'all') {
      if (!['open', 'in_review', 'resolved'].includes(String(req.query.status))) {
        return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Invalid dispute status.' } });
      }
      query.status = req.query.status;
    }
    const total = await Dispute.countDocuments(query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const disputes = await Dispute.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ disputes: toClient(disputes), count: disputes.length, total, page: safePage, limit, totalPages });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/disputes/:id/decide  (admin / sub-admin)
 * Body: { decision, refundAmount?, note? }.
 * Decisions:
 *   release       money goes to the supplier (escrow released, fee deducted)
 *   refund_full   whole order total back to the shopkeeper, no platform fee
 *   refund_partial admin enters refundAmount (0 < amount < total); the rest
 *                 goes to the supplier after the fee on the kept part
 *   return_goods  goods go back to the supplier + full refund to the
 *                 shopkeeper (the physical return is arranged off-platform)
 * The decision + note are recorded on the dispute (and in the audit log) —
 * that record is what the later blockchain phase hashes.
 */
async function decideDispute(req, res, next) {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) {
      return res.status(404).json({ error: { code: 'DISPUTE_NOT_FOUND', message: 'No dispute matches that id.' } });
    }
    if (dispute.status === 'resolved') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'This dispute is already resolved.' } });
    }

    const decision = req.body.decision ? String(req.body.decision).trim() : '';
    if (!['release', 'refund_full', 'refund_partial', 'return_goods'].includes(decision)) {
      return res.status(400).json({
        error: { code: 'INVALID_DECISION', message: 'Decision must be release, refund_full, refund_partial or return_goods.' },
      });
    }
    const note = req.body.note ? String(req.body.note).trim() : '';
    if (note.length > 2000) {
      return res.status(400).json({ error: { code: 'INVALID_NOTE', message: 'Note must be 2000 characters or less.' } });
    }

    const order = await Order.findById(dispute.orderId);
    if (!order) {
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'The disputed order no longer exists.' } });
    }

    const total = order.totalAmount || 0;
    let refundAmount = 0;

    if (decision === 'refund_partial') {
      refundAmount = Number(req.body.refundAmount);
      if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount >= total) {
        return res.status(400).json({
          error: { code: 'INVALID_REFUND', message: 'A partial refund must be more than 0 and less than the order total.' },
        });
      }
      refundAmount = Math.round(refundAmount);
    } else if (decision === 'refund_full' || decision === 'return_goods') {
      refundAmount = total;
    }

    // Settle the frozen money.
    if (order.paymentStatus === 'frozen_dispute') {
      const wasHeld = order.prevPaymentStatus === 'held_in_escrow';
      const wasSubmitted = order.prevPaymentStatus === 'payment_submitted';
      if (decision === 'release') {
        if (wasHeld) {
          // Escrow was holding the money: release it, fee deducted.
          const fee = calcPlatformFee(total);
          order.platformFee = fee;
          order.payoutAmount = Math.max(0, total - fee);
          order.amountHeld = 0;
          order.paymentStatus = 'released';
        } else if (wasSubmitted) {
          // Money was submitted but never confirmed into escrow: hand it
          // back to the submitted state so the admin confirms it normally.
          order.paymentStatus = 'payment_submitted';
        } else {
          // Nothing was ever paid (e.g. online_at_delivery not yet paid):
          // there is nothing to release.
          order.paymentStatus = 'unpaid';
        }
      } else {
        // refund_full / refund_partial / return_goods.
        order.refundAmount = refundAmount;
        if (decision === 'refund_full' || decision === 'return_goods') {
          // A full refund takes no platform fee.
          order.platformFee = 0;
          order.payoutAmount = 0;
        } else {
          // Partial: the supplier keeps total - refund; the fee applies to
          // the kept part only.
          const kept = total - refundAmount;
          const fee = calcPlatformFee(kept);
          order.platformFee = fee;
          order.payoutAmount = Math.max(0, kept - fee);
        }
        order.amountHeld = 0;
        order.paymentStatus = 'refunded';
      }
      order.prevPaymentStatus = '';
      await order.save();
    }

    dispute.status = 'resolved';
    dispute.resolution = {
      decision,
      refundAmount,
      note,
      decidedBy: req.user._id,
      decidedByName: req.user.name || req.user.email || '',
      decidedAt: new Date(),
    };
    await dispute.save();

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name || req.user.email || '',
      action: 'DISPUTE_DECIDED',
      entityType: 'Dispute',
      entityId: String(dispute._id),
      details: {
        orderNumber: dispute.orderNumber,
        reason: dispute.reason,
        decision,
        refundAmount,
        note,
      },
    }).catch((err) => console.log('[audit] failed to write log:', err.message));

    const decisionText = {
      release: 'released the payment to the supplier',
      refund_full: 'refunded the full order amount to the shopkeeper',
      refund_partial: `refunded Rs ${refundAmount} to the shopkeeper and released the rest to the supplier`,
      return_goods: 'ordered the goods returned and refunded the full order amount to the shopkeeper',
    }[decision];
    await notifyOrderParties(order, {
      type: 'dispute_resolved',
      title: `Dispute decided — ${order.orderNumber}`,
      message: `The admin ${decisionText}. ${note ? `Note: ${note}` : ''}`,
      excludeUserId: req.user._id,
    });

    res.json({ dispute: toClient(dispute.toObject()), order: toClient(order.toObject()) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  openDispute,
  listMyDisputes,
  getDispute,
  listDisputesAdmin,
  decideDispute,
};
