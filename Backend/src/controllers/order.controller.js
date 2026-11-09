const Order = require('../models/Order');
const Product = require('../models/Product');
const Counter = require('../models/Counter');
const { toClient } = require('../utils/serialize');
const { sanitizeLocation, googleMapsLink } = require('../utils/location');
const { notifyUser, notifyOrderParties } = require('../utils/notify');

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
    const lines = [];
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

      const product = await Product.findById(item.productId).lean();
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
        _lineTotal: product.price * item.quantity,
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
      group.subtotal += line._lineTotal;
    }

    const buyer = req.user;

    // C3 fix — TWO-PHASE checkout. Phase 1 reserves stock for EVERY line in
    // EVERY supplier group before ANY order is created. If any single line
    // fails, every reservation rolls back and zero orders exist, so a buyer
    // retry can never duplicate an already-created order. (Previously each
    // group reserved+created in turn, so a later group's 409 left earlier
    // groups' orders orphaned in the DB.)
    //
    // RACE-CONDITION FIX (kept): reserve stock ATOMICALLY. The filter itself
    // demands enough stock ({ stock: { $gte: quantity } }), so two simultaneous
    // checkouts can never oversell the same product — the loser gets
    // modifiedCount 0.
    const allReserved = [];
    let failedLine = null;
    for (const group of groups.values()) {
      for (const line of group.items) {
        const r = await Product.updateOne(
          { _id: line.productId, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } }
        );
        if (r.modifiedCount === 0) {
          failedLine = line;
          break;
        }
        allReserved.push(line);
      }
      if (failedLine) break;
    }
    if (failedLine) {
      // Another checkout grabbed the stock first — give back everything
      // reserved so far, then fail cleanly with 409. No orders were created.
      for (const line of allReserved) {
        await Product.updateOne({ _id: line.productId }, { $inc: { stock: line.quantity } });
      }
      return res.status(409).json({
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `"${failedLine.productName}" just ran low. Please lower the quantity and try again.`,
        },
      });
    }

    // Phase 2: all stock reserved — now create one order per supplier group.
    const created = [];
    for (const group of groups.values()) {
      // Stock is reserved — now create the order.
      // Strip internal fields before persisting the item snapshots.
      const safeItems = group.items.map(({ _supplierId, _lineTotal, ...rest }) => rest);

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
      await notifyUser(group.supplierId, {
        type: 'order_placed',
        title: `New order ${order.orderNumber}`,
        message: `${order.buyerName} placed an order (${order.items.length} item${order.items.length > 1 ? 's' : ''}, ${order.totalAmount} PKR).`,
        link: `/supplier/orders/${order._id}`,
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
    if (!isBuyer && !isSupplier) {
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

    order.status = toStatus;
    if (toStatus === 'confirmed') {
      order.deliveryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 days
    }
    if (toStatus === 'cancelled') {
      // Stock was decremented when the order was placed — give it back,
      // since a cancelled pending order never reaches the supplier.
      for (const item of order.items) {
        await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
      }
      // Batch 05 — an advance payment already held in escrow goes straight
      // back to the shopkeeper in full (a cancelled order takes no fee).
      // A merely submitted (unconfirmed) reference just goes back to
      // 'unpaid' — the money was never confirmed in.
      if (order.paymentStatus === 'held_in_escrow') {
        order.refundAmount = order.totalAmount;
        order.platformFee = 0;
        order.payoutAmount = 0;
        order.amountHeld = 0;
        order.paymentStatus = 'refunded';
      } else if (order.paymentStatus === 'payment_submitted') {
        order.paymentStatus = 'unpaid';
      }
    }

    await order.save();

    // Batch 05 — the other party learns about the move in-app.
    const typeMap = {
      confirmed: 'order_confirmed',
      processing: 'order_confirmed',
      shipped: 'order_shipped',
      delivered: 'order_delivered',
      cancelled: 'order_cancelled',
    };
    const messageMap = {
      confirmed: `The supplier confirmed order ${order.orderNumber}.`,
      processing: `The supplier started processing order ${order.orderNumber}.`,
      shipped: `Order ${order.orderNumber} is on its way.`,
      delivered: `Order ${order.orderNumber} was marked delivered. Please confirm receipt so the escrowed payment can release.`,
      cancelled: `Order ${order.orderNumber} was cancelled by the shopkeeper.`,
    };
    await notifyOrderParties(order, {
      type: typeMap[toStatus] || 'order_confirmed',
      title: `Order ${order.orderNumber} — ${toStatus}`,
      message: messageMap[toStatus] || `Order ${order.orderNumber} moved to ${toStatus}.`,
      excludeUserId: req.user._id,
    });

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getOrders, getOrder, updateOrderStatus, nextOrderNumber };
