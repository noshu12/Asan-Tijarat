const mongoose = require('mongoose');

/**
 * AuditLog — a record of an admin action, so approvals, role changes
 * and deletions can be traced later. Stored in the `auditlogs`
 * collection (same name as in Compass).
 */
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorName: { type: String, trim: true, default: '' },
    action: { type: String, required: true, trim: true }, // e.g. USER_VERIFIED, USER_DELETED, PRODUCT_STATUS_CHANGED
    entityType: { type: String, trim: true, default: '' }, // e.g. User, Product, Order
    entityId: { type: String, trim: true, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'auditlogs',
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

module.exports = mongoose.model('AuditLog', auditLogSchema);
