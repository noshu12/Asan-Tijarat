const mongoose = require('mongoose');

/**
 * ContactMessage — a message sent from the Contact page.
 * Stored in the `contacts` collection (same name as in Compass).
 * name + email are required — a message without a sender cannot
 * be answered. Stored, not emailed, until real SMTP is configured.
 */
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['new', 'read', 'replied'],
      default: 'new',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'contacts',
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

module.exports = mongoose.model('ContactMessage', contactMessageSchema);