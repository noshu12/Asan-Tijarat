const mongoose = require('mongoose');

/**
 * Rating — one shopkeeper rating per delivered order (Batch 05).
 *
 * A rating can never be edited or deleted by the supplier (there is no
 * update/delete endpoint at all) — the record is the proof. The later
 * blockchain phase hashes it; this batch only stores it.
 */
const ratingSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shopkeeperId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shopkeeperName: { type: String, default: '', trim: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true, maxlength: 1000 },
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

module.exports = mongoose.model('Rating', ratingSchema);
