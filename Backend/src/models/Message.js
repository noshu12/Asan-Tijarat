const mongoose = require('mongoose');

/**
 * Message — one chat line inside a per-order thread (Batch 05).
 *
 * Buyer (shopkeeper) and supplier talk here first — that is step 1 of the
 * dispute flow, before any claim reaches the admin. The admin can read the
 * thread too: it is dispute evidence.
 */
const messageSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['shopkeeper', 'supplier', 'admin', 'subadmin'], required: true },
    senderName: { type: String, default: '', trim: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
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

// Threads read oldest-first, so the index covers the order AND the sort.
messageSchema.index({ orderId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
