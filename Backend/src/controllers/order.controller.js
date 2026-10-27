const Order = require('../models/Order');
const Product = require('../models/Product');
const { toClient } = require('../utils/serialize');
const { sanitizeLocation, googleMapsLink } = require('../utils/location');

/**
 * Legal order-state transitions, lowercase only.
 * Supplier pushes the order forward; buyer may cancel early stages.
 * pending → confirmed → processing → shipped → delivered (or cancelled)
 */
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** Next order number, e.g. AT-2026-004 (per calendar year). */
async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `AT-${year}-`;
  const count = await Order.countDocuments({ orderNumber: new RegExp(`^${prefix}`) });
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

/**
 * POST /api/orders  (shopkeeper only)
 * Body: { items: [{ productId, quantity }], shippingAddress, currentLocation? }
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
 */
async function createOrder(req, res, next) {
  try {
    const { items, shippingAddress, currentLocation } = req.body;

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
    const created = [];

    for (const group of groups.values()) {
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
        status: 'pending',
        shippingAddress: String(shippingAddress).trim(),
        // Sent WITH the order: the supplier clicks this link to open Google
        // Maps at the shopkeeper's exact spot for delivery navigation.
        buyerLocation: buyerLocationPoint || undefined,
        buyerLocationLink,
      });
      created.push(order);

      // Decrement stock on each purchased product.
      for (const line of group.items) {
        await Product.updateOne(
          { _id: line.productId },
          { $inc: { stock: -line.quantity } }
        );
      }
    }

    res.status(201).json({ orders: created, count: created.length });
  } catch (err) {
    next(err);
  }
}
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

    if (req.query.status) query.status = req.query.status;

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean();
    res.json({ orders: toClient(orders), count: orders.length });
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
 * Buyer:    pending→cancelled, confirmed→cancelled
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
    const supplierAllowed = isSupplier && allowed.includes(toStatus);

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

    await order.save();
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, getOrders, getOrder, updateOrderStatus, nextOrderNumber };
