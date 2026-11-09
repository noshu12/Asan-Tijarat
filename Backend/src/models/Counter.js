const mongoose = require('mongoose');

/**
 * Counter — one tiny document per named sequence, incremented ATOMICALLY
 * with findOneAndUpdate($inc) so two simultaneous callers can never get
 * the same number. Used for order numbers (see order.controller.js
 * #nextOrderNumber). One document per calendar year, e.g. _id 'order-2026'.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('Counter', counterSchema);
