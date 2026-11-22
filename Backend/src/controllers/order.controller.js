const Order = require('../models/Order');
const Dispute = require('../models/Dispute');
const Product = require('../models/Product');
const Counter = require('../models/Counter');
const { toClient } = require('../utils/serialize');
const { sanitizeLocation, googleMapsLink } = require('../utils/location');
const { calcLineTotal, sumLineTotals } = require('../utils/orderTotals');
const { reserveStock, restoreStock } = require('../utils/stock');
const { notifyUser, notifyAdmins, notifyOrderParties } = require('../utils/notify');
const { cancelSettlementPatch } = require('../utils/orderCancel');

/**
 * Legal order-state transitions, lowercase only.
 * Supplier pushes the order forward; buyer may cancel only while pending.
 * Once the supplier confirms, the order can no longer be cancelled.
 * pending → confirmed → processing → shipped → delivered (or cancelled from pending)
 */
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Next order number, e.g. AT-2026-004 (per calendar year).
 *
 * ATOMIC (Batch 04) — the old countDocuments()+1 raced: two simultaneous
 * checkouts could read the same count and issue the SAME order number (the
 * unique index then failed the second order AFTER its stock was reserved,
 * so the order was lost). Now a Counter document is incremented with a
 * single findOneAndUpdate($inc), which MongoDB executes atomically — two
 * callers can never receive the same seq.
 *
 * The counter is seeded ONCE from the highest number already issued this
 * year, so numbers from before the atomic counter never get reused.
 * $setOnInsert only writes when the document is created, so two
 * simultaneous first calls can't seed twice.
 */
async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `AT-${year}-`;
  const key = `order-${year}`;

  if (!(await Counter.exists({ _id: key }))) {
    const existing = await Order.find(
      { orderNumber: new RegExp(`^${prefix}`) },
      { orderNumber: 1 }
    ).lean();
    let maxSeq = 0;
    for (const o of existing) {
      const n = parseInt(String(o.orderNumber).slice(prefix.length), 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
    await Counter.findOneAndUpdate(
      { _id: key },
      { $setOnInsert: { seq: maxSeq } },
      { upsert: true, new: true }
    );
  }

  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true }
  );
  return `${prefix}${String(counter.seq).padStart(3, '0')}`;
}

// Batch 05 — the two payment methods (COD was dropped). Anything else is
// rejected so a stale client can never store an unknown method.
const PAYMENT_METHODS = ['online_advance', 'online_at_delivery'];
const PAYMENT_CHANNELS = ['bank', 'raast', 'jazzcash'];

/**
 * POST /api/orders  (shopkeeper only)
 * Body: { items: [{ productId, quantity }], shippingAddress, currentLocation?,
 *         paymentMethod?, paymentChannel? }
 *
 * Validates stock + MOQ, groups items per supplier, and creates ONE
 * order per supplier. totalAmount is just the items subtotal — no
 * platform fee, no payment fields (payment is §10 Later).
 *
 * `currentLocation` is the shopkeeper's GPS point captured at checkout
 * ({ lat, lng }); it is validated, stored on every created order and turned
 * into a Google Maps link (`buyerLocationLink`) so the supplier can open it
 * and navigate straight to the shop. When the payload carries no point we
 * fall back to the GPS saved on the shopkeeper's profile (currentLocation on
 * the account), so an order almost always reaches the supplier with a
 * working location link.
 *
 * Batch 05 — the checkout also picks the payment method (online_advance =
 * pay now via the shopkeeper's own bank/JazzCash/Raast app, held in escrow;
 * online_at_delivery = pay online when the goods arrive). No money moves
 * through an API — the order only records the choice; the reference is
 * submitted later (see payment.controller.js).
 */
async function createOrder(req, res, next) {
  try {
    const { items, shippingAddress, currentLocation, paymentMethod, paymentChannel } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: { code: 'EMPTY_CART', message: 'Order must contain at least one item.' },
      });
    }
    if (!shippingAddress || !String(shippingAddress).trim()) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'shippingAddress is required.' },
      });
    }
    // Batch 05 — unknown methods/channels are rejected, not stored.
    const method = paymentMethod === undefined ? 'online_advance' : String(paymentMethod).trim();
    if (!PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({
        error: { code: 'INVALID_PAYMENT_METHOD', message: 'Payment method must be online_advance or online_at_delivery.' },
      });
    }
    const channel = paymentChannel === undefined ? 'bank' : String(paymentChannel).trim().toLowerCase();
    if (!PAYMENT_CHANNELS.includes(channel)) {
      return res.status(400).json({
        error: { code: 'INVALID_CHANNEL', message: 'Payment channel must be bank, raast or jazzcash.' },
      });
    }

    // Shopkeeper's delivery location: prefer the fresh GPS point captured at
    // checkout, else the point saved on their profile. Reject malformed
    // payloads outright (mirrors /api/auth/register) so a broken Maps link
    // is never stored.
    let buyerLocationPoint = null;
    if (currentLocation !== undefined && currentLocation !== null) {
      buyerLocationPoint = sanitizeLocation(currentLocation);
      if (!buyerLocationPoint) {
        return res.status(400).json({
          error: {
            code: 'INVALID_LOCATION',
            message: 'currentLocation must be { lat: -90..90, lng: -180..180 }.',
          },
        });
      }
    } else if (req.user.currentLocation) {
      buyerLocationPoint = sanitizeLocation(req.user.currentLocation);
    }
    const buyerLocationLink = googleMapsLink(buyerLocationPoint) || '';

    // Resolve every line against the live catalogue.
    //
    // Batch 19 (Round-5 audit M6) — one Product.find({ _id: { $in } })
    // for the whole cart, then an id map, instead of one findById per
    // cart line (N sequential round trips, latency growing with cart
    // size). Validation order and error messages are unchanged: shape /
    // quantity first (no DB), then per-line product checks in cart order
    // (PRODUCT_NOT_FOUND / BELOW_MOQ / INSUFFICIENT_STOCK). A product
    // listed twice in the cart resolves from the same map entry, exactly
    // as two findByIds would have.
    for (const item of items) {
      if (!item || !item.productId || !item.quantity) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'Each item needs productId and quantity.' },
        });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          error: { code: 'INVALID_QUANTITY', message: 'Quantity must be a whole number of at least 1.' },
        });
      }
    }
    const ids = [...new Set(items.map((item) => String(item.productId)))];
    const found = await Product.find({ _id: { $in: ids } }).lean();
    const byId = new Map(found.map((p) => [String(p._id), p]));

    const lines = [];
    for (const item of items) {
      const product = byId.get(String(item.productId));
      if (!product) {
        return res.status(404).json({
          error: { code: 'PRODUCT_NOT_FOUND', message: `Product "${item.productId}" not found.` },
        });
      }
      if (item.quantity < product.moq) {
        return res.status(400).json({
          error: {
            code: 'BELOW_MOQ',
            message: `"${product.name}" requires a minimum order of ${product.moq} ${product.unit}.`,
          },
        });
      }
      // Fast, friendly pre-check only — stock can change between this read
      // and the write below, so the ATOMIC update further down is the real
      // gate that prevents overselling.
      if (item.quantity > product.stock) {
        return res.status(409).json({
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Only ${product.stock} x ${product.unit} of "${product.name}" in stock.`,
          },
        });
      }

      lines.push({
        productId: String(product._id),
        productName: product.name,
        productImage: product.image,
        unitPrice: product.price,
        quantity: item.quantity,
        unit: product.unit,
        supplierName: product.supplierName,
        _supplierId: String(product.supplierId),
        _lineTotal: calcLineTotal(product.price, item.quantity),
      });
    }

    // Group lines by supplier → one order per supplier.
    const groups = new Map();
    for (const line of lines) {
      if (!groups.has(line._supplierId)) {
        groups.set(line._supplierId, { supplierId: line._supplierId, supplierName: line.supplierName, items: [], subtotal: 0 });
      }
      const group = groups.get(line._supplierId);
      group.items.push(line);
    }
    for (const group of groups.values()) {
      group.subtotal = sumLineTotals(group.items);
    }

    const buyer = req.user;

    // C3 fix — TWO-PHASE checkout. Phase 1 reserves stock for EVERY line in
    // EVERY supplier group before ANY order is created. If any single line
    // fails, every reservation rolls back and zero orders exist, so a buyer
    // retry can never duplicate an already-created order. (Previously each
    // group reserved+created in turn, so a later group's 409 left earlier
    // groups' orders orphaned in the DB.)
    //
    // RACE-CONDITION FIX (kept): reserve stock ATOMICALLY — see
    // utils/stock.js. The filter itself demands enough stock
    // ({ stock: { $gte: quantity } }), so two simultaneous checkouts can
    // never oversell the same product — the loser gets modifiedCount 0.
    // A failed line rolls back every reservation made so far, so no
    // stock stays held and no orders were created yet.
    const allLines = [];
    for (const group of groups.values()) allLines.push(...group.items);
    const reservation = await reserveStock(Product, allLines);
    if (!reservation.ok) {
      const failedLine = reservation.failedLine;
      return res.status(409).json({
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `"${failedLine.productName}" just ran low. Please lower the quantity and try again.`,
        },
      });
    }

    // Phase 2: all stock reserved — now create one order per supplier group.
    // Order.create + nextOrderNumber() stay sequential (order numbers must
    // be issued in order); only the supplier notifications fan out in
    // parallel (Batch 19, audit L8 — notifyUser never throws).
    const created = [];
    const notifyJobs = [];
    for (const group of groups.values()) {
      // Stock is reserved — now create the order.
      // Strip internal fields before persisting the item snapshots —
      // the schema only takes these 7 fields, so pick them explicitly
      // (a rest-strip would leave _supplierId/_lineTotal flagged as
      // unused by the linter).
      const safeItems = group.items.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        productImage: line.productImage,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        unit: line.unit,
        supplierName: line.supplierName,
      }));

      const order = await Order.create({
        orderNumber: await nextOrderNumber(),
        buyerId: buyer._id,
        buyerName: buyer.businessName || buyer.name,
        buyerRole: buyer.role,
        supplierId: group.supplierId,
        supplierName: group.supplierName,
        items: safeItems,
        subtotal: group.subtotal,
        totalAmount: group.subtotal,
        // Batch 05 — payment choice recorded at checkout (no money moves).
        paymentMethod: method,
        paymentChannel: channel,
        paymentStatus: 'unpaid',
        status: 'pending',
        shippingAddress: String(shippingAddress).trim(),
        // Sent WITH the order: the supplier clicks this link to open Google
        // Maps at the shopkeeper's exact spot for delivery navigation.
        buyerLocation: buyerLocationPoint || undefined,
        buyerLocationLink,
      });
      created.push(order);

      // Batch 05 — the supplier learns about the new order in-app.
      // Collected, not awaited here: all group notifications go out
      // together after the loop (Batch 19, audit L8).
      notifyJobs.push(
        notifyUser(group.supplierId, {
          type: 'order_placed',
          title: `New order ${order.orderNumber}`,
          message: `${order.buyerName} placed an order (${order.items.length} item${order.items.length > 1 ? 's' : ''}, ${order.totalAmount} PKR).`,
          link: `/supplier/orders/${order._id}`,
          orderId: order._id,
        })
      );
    }
    await Promise.all(notifyJobs);

    // Batch 23 (TEAMLY realtime audit RT-1) — the supplier notify above
    // was the ONLY order_placed fan-out, so admins never learned a new
    // order existed. One order_placed per created order to all admins.
    // FIRE-AND-FORGET (not awaited, not in notifyJobs): notifyAdmins
    // never throws, and the response must not wait on the bell. It runs
    // after order creation, so a failed checkout sends nothing. Message
    // carries order number + amount only — no customer address/phone.
    for (const order of created) {
      notifyAdmins({
        type: 'order_placed',
        title: `New order ${order.orderNumber}`,
        message: `${order.buyerName} placed an order (${order.items.length} item${order.items.length > 1 ? 's' : ''}, ${order.totalAmount} PKR).`,
        link: `/admin/orders/${order._id}`,
        orderId: order._id,
      });
    }

    res.status(201).json({ orders: created, count: created.length });
  } catch (err) {
    next(err);
  }
}
/**
 * Legal statuses for the ?status= filter. Anything else (including a
 * query-operator object like ?status[$ne]=x) is rejected — req.query.status
 * is never passed raw into the Mongo query.
 */
const FILTERABLE_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

/**
 * GET /api/orders?status=  (protected)
 * Suppliers see orders sent to them; shopkeepers see orders they placed.
 */
async function getOrders(req, res, next) {
  try {
    const query =
      req.user.role === 'supplier'
        ? { supplierId: req.user._id }
        : { buyerId: req.user._id };

    if (req.query.status !== undefined && req.query.status !== '' && req.query.status !== 'all') {
      const s = String(req.query.status).trim().toLowerCase();
      if (!FILTERABLE_STATUSES.includes(s)) {
        return res.status(400).json({
          error: { code: 'INVALID_STATUS', message: `"${String(req.query.status).slice(0, 40)}" is not a valid order status.` },
        });
      }
      query.status = s;
    }

    // Paginated (Batch 04) — the full order history used to come back in
    // one response. Default 50, max 100; callers pass ?page=&limit=.
    const total = await Order.countDocuments(query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * limit)
      .limit(limit)
      // Batch 19 (audit M5) — list projection: the fields the supplier /
      // shopkeeper order lists read. The single-order endpoint
      // (getOrder) still returns the whole document.
      .select('_id orderNumber buyerId buyerName supplierId supplierName items subtotal totalAmount paymentMethod paymentChannel paymentStatus paymentReference amountHeld platformFee payoutAmount refundAmount deliveryProof disputeId status deliveryDate shippingAddress buyerLocationLink createdAt updatedAt')
      .lean();
    res.json({ orders: toClient(orders), count: orders.length, total, page: safePage, limit, totalPages });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/orders/:id  (protected — buyer or the order's supplier)
 */
async function getOrder(req, res, next) {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) {
      return res.status(404).json({
        error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' },
      });
    }

    const isBuyer = String(order.buyerId) === String(req.user._id);
    const isSupplier = String(order.supplierId) === String(req.user._id);
    // Batch 06 — the admin needs to read one order to decide a dispute
    // (evidence section on the admin disputes page); the client already
    // documents this endpoint as "buyer, supplier or admin".
    const isAdmin = req.user.role === 'admin' || req.user.role === 'subadmin';
    if (!isBuyer && !isSupplier && !isAdmin) {
      return res.status(403).json({
        error: { code: 'ORDER_NOT_YOURS', message: 'You can only view your own orders.' },
      });
    }

    res.json({ order: toClient(order) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/orders/:id/status  (protected — role + ownership guarded)
 * Body: { status }
 * Supplier: pending→confirmed→processing→shipped→delivered
 * Buyer:    pending→cancelled (only before the supplier confirms)
 *
 * Batch 05 — every move notifies the other party. Cancelling a pending
 * order whose advance payment is already held in escrow refunds it in full
 * (no platform fee on a refunded order). Marking an order delivered asks
 * the shopkeeper to confirm receipt so the escrow can release.
 */
async function updateOrderStatus(req, res, next) {
  try {
    const toStatus = req.body.status;
    if (!toStatus || !TRANSITIONS[toStatus]) {
      return res.status(400).json({
        error: { code: 'INVALID_STATUS', message: `"${toStatus}" is not a valid order status.` },
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' },
      });
    }

    const isBuyer = String(order.buyerId) === String(req.user._id);
    const isSupplier = String(order.supplierId) === String(req.user._id);
    if (!isBuyer && !isSupplier) {
      return res.status(403).json({
        error: { code: 'ORDER_NOT_YOURS', message: 'You can only update your own orders.' },
      });
    }

    const allowed = TRANSITIONS[order.status] || [];
    const buyerAllowed = isBuyer && toStatus === 'cancelled' && allowed.includes('cancelled');
    // Batch 04 — a supplier may NEVER cancel: cancelling a pending order is
    // the buyer's right only (see the TRANSITIONS comment at the top of this
    // file). The old check let a supplier cancel too, because 'cancelled'
    // sits in TRANSITIONS.pending alongside 'confirmed'.
    const supplierAllowed = isSupplier && toStatus !== 'cancelled' && allowed.includes(toStatus);

    if (!buyerAllowed && !supplierAllowed) {
      return res.status(403).json({
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot move order from "${order.status}" to "${toStatus}".`,
        },
      });
    }

    // Batch 18 (audit M5) — an open dispute freezes the ORDER, not just
    // the money: ANY status move returns DISPUTE_OPEN while a claim is
    // open, so a supplier can no longer push confirmed → processing →
    // shipped → delivered while the payment sits frozen_dispute. (The
    // old guard only ran for 'cancelled' — and was already unreachable
    // there, since disputes cannot open on pending orders and only
    // pending orders can be cancelled — so the freeze effectively
    // guarded nothing at all.)
    if (order.disputeId) {
      const d = await Dispute.findById(order.disputeId, { status: 1 }).lean();
      if (d && d.status !== 'resolved') {
        return res.status(400).json({
          error: { code: 'DISPUTE_OPEN', message: 'A dispute is open on this order — the payment is frozen until the admin decides.' },
        });
      }
    }

    const patch = { status: toStatus };
    if (toStatus === 'confirmed') {
      patch.deliveryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 days
    }
    if (toStatus === 'cancelled') {
      // Batch 18 (audit HIGH 1 + L10) — the money settlement for a
      // cancel, shared with the admin cancel endpoint (see
      // utils/orderCancel.js): escrowed OR paid money refunds in full,
      // a merely-submitted reference goes back to 'unpaid' with the
      // stale reference cleared.
      Object.assign(patch, cancelSettlementPatch(order));
    }

    // Batch 20 (audit (c)-1) — capture the PRE-cancel payment state
    // here: the atomic update below mutates the loaded doc in place
    // (and the findOneAndUpdate result may alias it), so the refund
    // check after it must use this snapshot, not order.paymentStatus.
    const refundedOnCancel =
      order.paymentStatus === 'held_in_escrow' || order.paymentStatus === 'paid';

    // Batch 18 (audit M3) — ATOMIC status move. The transition check
    // above read the order's status; this update only applies while the
    // order is STILL in that status. Two concurrent moves (e.g. buyer
    // cancels while the supplier confirms) can no longer both pass the
    // guard — the loser gets null and a 409.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: patch },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({
        error: { code: 'CONCURRENT_UPDATE', message: 'This order was just changed by another request — reload it and check its status.' },
      });
    }

    if (toStatus === 'cancelled') {
      // Stock was decremented when the order was placed — give it back,
      // since a cancelled order never reaches the supplier. This runs
      // AFTER the atomic update above, so a losing concurrent cancel
      // never restores stock twice. Batch 19 (audit L6) — one bulkWrite
      // for the whole restore set (utils/stock.js restoreStock).
      await restoreStock(Product, updated.items);
    }

    // Batch 05 — the other party learns about the move in-app.
    const typeMap = {
      confirmed: 'order_confirmed',
      processing: 'order_confirmed',
      shipped: 'order_shipped',
      delivered: 'order_delivered',
      cancelled: 'order_cancelled',
    };
    // Batch 06 — the delivered message is method-aware (audit finding 7):
    // method (b) has no receipt-confirm action, the shopkeeper must pay
    // and submit the transaction reference instead.
    const messageMap = {
      confirmed: `The supplier confirmed order ${updated.orderNumber}.`,
      processing: `The supplier started processing order ${updated.orderNumber}.`,
      shipped: `Order ${updated.orderNumber} is on its way.`,
      delivered: updated.paymentMethod === 'online_at_delivery'
        ? `Order ${updated.orderNumber} was marked delivered. Pay online now that the goods have arrived, then submit the transaction reference.`
        : `Order ${updated.orderNumber} was marked delivered. Please confirm receipt so the escrowed payment can release.`,
      cancelled: `Order ${updated.orderNumber} was cancelled by the shopkeeper.`,
    };
    await notifyOrderParties(updated, {
      type: typeMap[toStatus] || 'order_confirmed',
      title: `Order ${updated.orderNumber} — ${toStatus}`,
      message: messageMap[toStatus] || `Order ${updated.orderNumber} moved to ${toStatus}.`,
      excludeUserId: req.user._id,
    });

    // Batch 20 (audit (c)-1) — `payment_refunded` was wired everywhere
    // (Notification enum, frontend event lists) but never emitted: the
    // refund hid inside the order_cancelled message text. A cancel that
    // actually refunds money (escrowed or paid — see
    // cancelSettlementPatch) now also sends the distinct refund event,
    // so the bell/toast show the refund on its own. A cancel with no
    // money to return (unpaid, or a merely-submitted reference going
    // back to 'unpaid') sends nothing extra.
    if (toStatus === 'cancelled' && refundedOnCancel) {
      await notifyOrderParties(updated, {
        type: 'payment_refunded',
        title: `Payment refunded — ${updated.orderNumber}`,
        message: `Rs ${updated.refundAmount || 0} was refunded to the shopkeeper for cancelled order ${updated.orderNumber}.`,
        excludeUserId: req.user._id,
      });
    }

    // Batch 23 (TEAMLY realtime audit RT-5) — the generic admin status
    // feed. The parties above get their specific type (order_confirmed /
    // shipped / delivered / cancelled); admins get ONE order_status per
    // move, never inside a loop. FIRE-AND-FORGET: notifyAdmins never
    // throws. `order_status` was added to the Notification enum first —
    // the type did not exist before this batch.
    notifyAdmins({
      type: 'order_status',
      title: `Order ${updated.orderNumber} — ${toStatus}`,
      message: `Order ${updated.orderNumber} moved to ${toStatus}.`,
      link: `/admin/orders/${updated._id}`,
      orderId: updated._id,
    });

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getOrders, getOrder, updateOrderStatus, nextOrderNumber };
