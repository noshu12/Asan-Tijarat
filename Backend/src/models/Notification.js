const mongoose = require('mongoose');

/**
 * Notification — real in-app notifications (Batch 05).
 *
 * Replaces the fakes Batch 03 removed: the PortalHeader bell used to show a
 * hardcoded badge "2" and the toggles were localStorage-only. Now every
 * event that matters (order moved, payment held/released, dispute opened or
 * decided, new chat message, rating received, KYC decision) writes one row
 * here, and the bell reads the unread count + list from the API.
 *
 * `link` is the in-app page the notification opens, e.g.
 * `/shopkeeper/orders/<orderId>` or `/admin/disputes`.
 */
const NOTIFICATION_TYPES = [
  'order_placed',
  'order_confirmed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'payment_submitted',
  'payment_held',
  'payment_released',
  'payment_refunded',
  'dispute_opened',
  'dispute_resolved',
  'chat_message',
  'rating_received',
  'account_verified',
  'account_suspended',
  'account_rejected',
  'account_reactivated',
  // Batch 23 (TEAMLY realtime audit RT-2..RT-5) — 9 new types, 26 total.
  // `order_status` is the generic admin-only status feed (RT-5); the
  // product/user/KYC types below are the admin + public-catalogue events
  // (RT-2/RT-3/RT-4). `product_approved` / `product_rejected` are enum
  // entries ONLY: no product approve/reject flow exists anywhere in the
  // codebase (Product.status is only Active/Low Stock/Out of Stock,
  // derived from stock; admin routes only list/delete products), so
  // nothing emits them yet — see the Batch 23 FIX-NOTE.
  'product_created',
  'product_updated',
  'product_approved',
  'product_rejected',
  'stock_updated',
  'price_updated',
  'user_registered',
  'kyc_submitted',
  'order_status',
];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, default: '', trim: true },
    link: { type: String, default: '', trim: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    read: { type: Boolean, default: false, index: true },
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

// The bell badge + list both filter by user and sort newest-first.
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
