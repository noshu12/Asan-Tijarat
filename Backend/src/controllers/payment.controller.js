const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');
const { toClient } = require('../utils/serialize');
const { calcPlatformFee } = require('../utils/payment');
const { notifyUser, notifyOrderParties, notifyAdmins } = require('../utils/notify');
const { saveDeliveryPhoto, DeliveryProofError } = require('../utils/deliveryProof');

/**
 * Payment flow (Batch 05) — records + status only.
 *
 * There is NO payment-gateway integration here: no JazzCash/Stripe SDK, no
 * live money movement through an API. The shopkeeper pays through their OWN
 * bank/JazzCash/Raast app to the platform account and submits the
 * transaction reference in the app; the admin confirms the receipt. The
 * platform only tracks the record + escrow status. That is the whole flow.
 *
 * Two methods only (COD was dropped — see the FIX-GUIDE):
 *   online_advance     pay at order time → admin confirms → held_in_escrow
 *                      → shopkeeper confirms delivery → fee deducted, rest
 *                      released to the supplier.
 *   online_at_delivery no advance payment → pay online at delivery, submit
 *                      the reference → admin confirms → fee deducted, rest
 *                      goes to the supplier (status 'paid').
 *
 * While a dispute is open the payment is frozen_dispute — no release and no
 * refund until the admin decides (see dispute.controller.js).
 */

const PAYMENT_CHANNELS = ['bank', 'raast', 'jazzcash'];

/** Loads an order the caller is a party to, or null (with the error sent). */
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
 * POST /api/orders/:id/payment-reference  (buyer only)
 * Body: { reference, channel } — channel: bank | raast | jazzcash.
 * The shopkeeper has paid through their own app and submits the transaction
 * reference. The order moves unpaid → payment_submitted; the admin then
 * confirms the receipt (see confirmPayment below).
 */
async function submitPaymentReference(req, res, next) {
  try {
    const found = await loadOwnOrder(req, res, req.params.id);
    if (!found) return;
    const { order, isBuyer } = found;
    if (!isBuyer) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Only the shopkeeper can submit a payment reference.' } });
    }
    if (order.paymentStatus !== 'unpaid') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: `Payment is already "${order.paymentStatus}" — a reference cannot be submitted now.` },
      });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'This order is cancelled.' } });
    }
    const reference = req.body.reference ? String(req.body.reference).trim() : '';
    if (!reference || reference.length > 200) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'A transaction reference is required (max 200 characters).' } });
    }
    const channel = req.body.channel ? String(req.body.channel).trim().toLowerCase() : '';
    if (!PAYMENT_CHANNELS.includes(channel)) {
      return res.status(400).json({
        error: { code: 'INVALID_CHANNEL', message: 'Payment channel must be bank, raast or jazzcash.' },
      });
    }

    order.paymentReference = reference;
    order.paymentChannel = channel;
    order.paymentStatus = 'payment_submitted';
    await order.save();

    await notifyUser(order.supplierId, {
      type: 'payment_submitted',
      title: `Payment submitted for ${order.orderNumber}`,
      message: `The shopkeeper submitted a ${channel} payment reference. Confirm it once the money reaches the platform account.`,
      link: `/supplier/orders/${order._id}`,
      orderId: order._id,
    });
    await notifyAdmins({
      type: 'payment_submitted',
      title: `Payment reference submitted — ${order.orderNumber}`,
      message: `Shopkeeper ${order.buyerName} submitted a ${channel} reference (${reference}). ${order.paymentMethod === 'online_at_delivery' ? 'Confirm the receipt to pay the supplier after the fee.' : 'Confirm the receipt to hold it in escrow.'}`,
      link: `/admin/orders`,
      orderId: order._id,
    });

    res.json({ order: toClient(order.toObject()) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/orders/:id/confirm-payment  (admin / sub-admin)
 * The admin confirms the money reached the platform account.
 *   online_advance     → held_in_escrow (amountHeld = order total).
 *   online_at_delivery → fee deducted, remainder to the supplier
 *                         (status 'paid', payoutAmount recorded).
 * A frozen payment (open dispute) can never be confirmed.
 */
async function confirmPayment(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' } });
    }
    if (order.paymentStatus === 'frozen_dispute') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Payment is frozen by an open dispute — decide the dispute first.' },
      });
    }
    if (order.paymentStatus !== 'payment_submitted') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: `No submitted payment to confirm (status is "${order.paymentStatus}").` },
      });
    }

    if (order.paymentMethod === 'online_at_delivery') {
      const fee = calcPlatformFee(order.totalAmount);
      order.platformFee = fee;
      order.payoutAmount = Math.max(0, order.totalAmount - fee);
      order.paymentStatus = 'paid';
    } else {
      // online_advance (default): the money now sits in escrow.
      order.amountHeld = order.totalAmount;
      order.paymentStatus = 'held_in_escrow';
    }
    await order.save();

    await AuditLog.create({
      actorId: req.user._id,
      actorName: req.user.name || req.user.email || '',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'Order',
      entityId: String(order._id),
      details: { orderNumber: order.orderNumber, method: order.paymentMethod, status: order.paymentStatus },
    }).catch((err) => console.log('[audit] failed to write log:', err.message));

    await notifyOrderParties(order, {
      type: order.paymentStatus === 'paid' ? 'payment_released' : 'payment_held',
      title: order.paymentStatus === 'paid'
        ? `Payment confirmed for ${order.orderNumber}`
        : `Payment held in escrow — ${order.orderNumber}`,
      message: order.paymentStatus === 'paid'
        ? `The delivery payment was confirmed. Platform fee deducted, the rest goes to the supplier.`
        : `The advance payment was confirmed and is now held in escrow. It releases to the supplier once delivery is confirmed.`,
      excludeUserId: req.user._id,
    });

    res.json({ order: toClient(order.toObject()) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/confirm-delivery  (buyer only)
 * The shopkeeper confirms the goods arrived. Only meaningful for an
 * online_advance order whose money is held in escrow: the platform fee is
 * deducted and the remainder is released to the supplier (recorded as a
 * payout — no money moves through an API).
 */
async function confirmDeliveryReceipt(req, res, next) {
  try {
    const found = await loadOwnOrder(req, res, req.params.id);
    if (!found) return;
    const { order, isBuyer } = found;
    if (!isBuyer) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Only the shopkeeper can confirm delivery receipt.' } });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Delivery can only be confirmed once the order is marked delivered.' },
      });
    }
    if (order.paymentMethod !== 'online_advance') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'This order was not paid in advance — there is no escrow to release.' },
      });
    }
    if (order.paymentStatus !== 'held_in_escrow') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: `No escrowed payment to release (status is "${order.paymentStatus}").` },
      });
    }

    const fee = calcPlatformFee(order.totalAmount);
    order.platformFee = fee;
    order.payoutAmount = Math.max(0, order.totalAmount - fee);
    order.amountHeld = 0;
    order.paymentStatus = 'released';
    await order.save();

    await notifyUser(order.supplierId, {
      type: 'payment_released',
      title: `Payment released — ${order.orderNumber}`,
      message: `The shopkeeper confirmed delivery. Platform fee deducted, the rest is released to you.`,
      link: `/supplier/orders/${order._id}`,
      orderId: order._id,
    });

    res.json({ order: toClient(order.toObject()) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/orders/:id/delivery-proof  (supplier only)
 * Body: { dataUrl, name? } — one photo taken at delivery, stored on the
 * order as deliveryProof. Allowed while the order is shipped or delivered.
 * This photo + the shopkeeper's delivery confirmation are the evidence for
 * dispute reasons 9-11. Nothing is hashed on-chain here.
 */
async function uploadDeliveryProof(req, res, next) {
  try {
    const found = await loadOwnOrder(req, res, req.params.id);
    if (!found) return;
    const { order, isSupplier } = found;
    if (!isSupplier) {
      return res.status(403).json({ error: { code: 'ROLE_FORBIDDEN', message: 'Only the supplier can upload a delivery photo.' } });
    }
    if (order.status !== 'shipped' && order.status !== 'delivered') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'A delivery photo can only be uploaded once the order is shipped.' },
      });
    }
    if (!req.body.dataUrl) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'A delivery photo (dataUrl) is required.' } });
    }

    let proof;
    try {
      proof = await saveDeliveryPhoto({ dataUrl: req.body.dataUrl, name: req.body.name });
    } catch (err) {
      if (err instanceof DeliveryProofError) {
        return res.status(400).json({ error: { code: err.code || 'DELIVERY_PROOF_INVALID', message: err.message } });
      }
      throw err;
    }

    order.deliveryProof = proof;
    await order.save();

    await notifyUser(order.buyerId, {
      type: 'order_delivered',
      title: `Delivery photo uploaded — ${order.orderNumber}`,
      message: 'The supplier uploaded a delivery photo as proof. Open the order to view it and confirm receipt.',
      link: `/shopkeeper/orders/${order._id}`,
      orderId: order._id,
    });

    res.json({ order: toClient(order.toObject()) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitPaymentReference,
  confirmPayment,
  confirmDeliveryReceipt,
  uploadDeliveryProof,
  PAYMENT_CHANNELS,
};
