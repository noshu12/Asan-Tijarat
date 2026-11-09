const mongoose = require('mongoose');

/**
 * Dispute — a claim on one order (Batch 05).
 *
 * Flow (Noushad's rules): the shopkeeper first talks to the supplier
 * directly (order chat). If the supplier has a return policy and accepts,
 * it is resolved with NO dispute. Otherwise the shopkeeper files a claim
 * here and the admin responds/decides. The supplier can also raise a claim
 * (reasons 14-15).
 *
 * Reason groups and who is at fault:
 *   1-8   goods problems      → supplier's fault, supplier takes goods back
 *   9-11  delivery problems   → escrow protects the shopkeeper: no payment
 *                               until the shopkeeper confirms delivery
 *   12-13 payment problems    → admin decides on the evidence; the decision
 *                               is recorded here (hashed on-chain in the
 *                               later blockchain phase)
 *   14-15 shopkeeper refuses  → if goods match the order the shopkeeper must
 *                               accept them; if not, they go back; if the
 *                               shopkeeper does not pay, he gets no goods
 *
 * LATE DELIVERY IS DELIBERATELY NOT A REASON — deliveries are normally late
 * in Pakistan, so it never opens a dispute.
 */
const DISPUTE_REASONS = {
  wrong_goods: { label: 'Wrong goods sent', group: 'goods', fault: 'supplier' },
  wrong_quantity: { label: 'Wrong quantity', group: 'goods', fault: 'supplier' },
  defective: { label: 'Defective goods', group: 'goods', fault: 'supplier' },
  expired: { label: 'Expired goods', group: 'goods', fault: 'supplier' },
  fake: { label: 'Fake / counterfeit goods', group: 'goods', fault: 'supplier' },
  damaged: { label: 'Damaged in transit', group: 'goods', fault: 'supplier' },
  different_listing: { label: 'Different from listing', group: 'goods', fault: 'supplier' },
  wrong_pack: { label: 'Wrong pack / weight', group: 'goods', fault: 'supplier' },
  never_arrived: { label: 'Goods never arrived', group: 'delivery', fault: 'supplier' },
  partial_delivery: { label: 'Partial delivery', group: 'delivery', fault: 'supplier' },
  supplier_cancelled: { label: 'Supplier cancelled after advance payment', group: 'delivery', fault: 'supplier' },
  payment_dispute: { label: 'Payment dispute — paid but supplier says not received', group: 'payment', fault: 'evidence' },
  overcharge: { label: 'Overcharge', group: 'payment', fault: 'evidence' },
  refuses_delivery: { label: 'Shopkeeper refuses delivery', group: 'refusal', fault: 'shopkeeper' },
  refuses_payment: { label: 'Shopkeeper refuses to pay', group: 'refusal', fault: 'shopkeeper' },
};

// Reasons 1-13 are raised by the shopkeeper (buyer); 14-15 by the supplier.
const SHOPKEEPER_REASONS = Object.keys(DISPUTE_REASONS).filter(
  (r) => DISPUTE_REASONS[r].fault !== 'shopkeeper'
);
const SUPPLIER_REASONS = Object.keys(DISPUTE_REASONS).filter(
  (r) => DISPUTE_REASONS[r].fault === 'shopkeeper'
);

const disputeSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },
    reason: { type: String, enum: Object.keys(DISPUTE_REASONS), required: true },
    reasonLabel: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    raisedByRole: { type: String, enum: ['shopkeeper', 'supplier'], required: true },
    raisedByName: { type: String, default: '', trim: true },
    status: { type: String, enum: ['open', 'in_review', 'resolved'], default: 'open', index: true },
    // Filled by the admin decision. refundAmount is only used by
    // refund_partial (and recorded on refund_full / return_goods as the
    // full order total). The decision + note are the record the later
    // blockchain phase hashes — no hashing happens in this batch.
    resolution: {
      decision: {
        type: String,
        enum: ['release', 'refund_full', 'refund_partial', 'return_goods'],
        default: null,
      },
      refundAmount: { type: Number, default: 0, min: 0 },
      note: { type: String, default: '', trim: true, maxlength: 2000 },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      decidedByName: { type: String, default: '', trim: true },
      decidedAt: { type: Date, default: null },
    },
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

disputeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', disputeSchema);
module.exports.DISPUTE_REASONS = DISPUTE_REASONS;
module.exports.SHOPKEEPER_REASONS = SHOPKEEPER_REASONS;
module.exports.SUPPLIER_REASONS = SUPPLIER_REASONS;
