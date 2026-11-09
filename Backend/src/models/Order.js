const mongoose = require('mongoose');
const { deviceLocationSchema } = require('../utils/location');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true, trim: true },
    productImage: { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, default: 'unit', trim: true },
    supplierName: { type: String, default: '', trim: true },
  },
  { _id: false }
);

/** One delivery-proof photo, stored on the order (Batch 05). */
const deliveryProofSchema = new mongoose.Schema(
  {
    url: { type: String, default: '' },
    storage: { type: String, default: '' }, // 'cloudinary' | 'local'
    publicId: { type: String, default: null },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date },
  },
  { _id: false }
);

/**
 * Order — mirrors Frontend/lib/types.ts `Order` + `OrderItem` interfaces.
 * Status flow: pending → confirmed → processing → shipped → delivered
 * (or cancelled). Lowercase only, matching the locked flow.
 *
 * Payment fields (Batch 05) — records + status only, NO gateway
 * integration: the shopkeeper pays through their own bank/JazzCash/Raast
 * app and submits the reference; the admin confirms it. totalAmount is
 * still just the items subtotal; the platform fee is computed at
 * confirmation/release from PLATFORM_FEE_PERCENT (see utils/payment.js).
 */
const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true }, // e.g. AT-2026-004
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyerName: { type: String, required: true, trim: true },
    buyerRole: { type: String, enum: ['shopkeeper', 'supplier'], required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    supplierName: { type: String, required: true, trim: true },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v) => v.length > 0, 'Order must contain at least one item.'],
    },

    subtotal: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    // Batch 05 — payment (2 methods only; COD was dropped).
    paymentMethod: {
      type: String,
      enum: ['online_advance', 'online_at_delivery'],
      default: 'online_advance',
    },
    // Channel the shopkeeper paid through: bank transfer, Raast, JazzCash.
    paymentChannel: {
      type: String,
      enum: ['bank', 'raast', 'jazzcash'],
      default: 'bank',
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'payment_submitted', 'held_in_escrow', 'released', 'frozen_dispute', 'refunded', 'paid'],
      default: 'unpaid',
      index: true,
    },
    // Transaction reference the shopkeeper submitted (bank/JazzCash/Raast).
    paymentReference: { type: String, default: '', trim: true },
    // Platform fee actually charged on this order (0 until a fee % is set).
    platformFee: { type: Number, default: 0, min: 0 },
    // Money currently held in escrow for this order.
    amountHeld: { type: Number, default: 0, min: 0 },
    // Money released/paid to the supplier after the fee.
    payoutAmount: { type: Number, default: 0, min: 0 },
    // Money refunded to the shopkeeper (full or partial, via a dispute).
    refundAmount: { type: Number, default: 0, min: 0 },
    // Previous paymentStatus, kept while a dispute freezes the payment so
    // the admin decision can restore or settle it (see dispute.controller).
    prevPaymentStatus: { type: String, default: '' },

    // Batch 05 — delivery proof photo (supplier uploads at delivery) +
    // the latest dispute on this order, if any.
    deliveryProof: { type: deliveryProofSchema, default: undefined },
    disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', default: null },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    deliveryDate: { type: Date },
    shippingAddress: { type: String, required: true, trim: true },
    /**
     * Shopkeeper's GPS point at checkout — sent WITH the order so the
     * supplier can tap the Google Maps link and navigate to the delivery
     * spot. `buyerLocationLink` is the prebuilt Maps URL (see
     * utils/location.js#googleMapsLink).
     */
    buyerLocation: { type: deviceLocationSchema, default: undefined },
    buyerLocationLink: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

// Batch 04 — compound indexes for the two order-list queries, which both
// filter by one party and sort newest-first: the index covers the filter
// AND the sort, so the list stops scanning + sorting in memory.
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ supplierId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
