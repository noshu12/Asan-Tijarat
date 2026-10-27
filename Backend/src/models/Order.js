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

/**
 * Order — mirrors Frontend/lib/types.ts `Order` + `OrderItem` interfaces.
 * Status flow: pending → confirmed → processing → shipped → delivered
 * (or cancelled). Lowercase only, matching the locked flow.
 *
 * No payment fields: no platformFee, no paymentMethod, no
 * paymentStatus — payment is §10 Later, not now. totalAmount is
 * therefore just the subtotal of the items.
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

module.exports = mongoose.model('Order', orderSchema);
