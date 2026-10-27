const mongoose = require('mongoose');
const { CATEGORIES } = require('../constants/categories');

/**
 * Metadata of one photo the supplier uploaded from their device.
 * `url` is a server-generated path (`/uploads/products/<file>`) written by
 * src/utils/productImageStorage.js — the real image, never a placeholder.
 */
const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Product — mirrors Frontend/lib/types.ts `Product` interface.
 * supplierId references a supplier User account.
 *
 * category must be one of the 14 master categories in
 * src/constants/categories.js — no free text, no old categories.
 * No mock fields: no supplierVerified, no rating/reviewCount/
 * ordersCount, no isTrending, no aiReason. Pack size is the
 * product's `unit` (e.g. 1kg, 5kg, 10kg), not a category.
 */
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, enum: CATEGORIES, index: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, default: 'unit', trim: true },
    moq: { type: Number, required: true, min: 1, default: 1 }, // Minimum Order Quantity
    stock: { type: Number, required: true, min: 0, default: 0 },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    supplierName: { type: String, required: true, trim: true },
    supplierCity: { type: String, trim: true },

    // Photos uploaded by the supplier: `image` is the cover (upload order 0),
    // `additionalImages` the gallery, `imageUploads` the audit metadata.
    image: { type: String, default: '' },
    additionalImages: [{ type: String }],
    imageUploads: { type: [productImageSchema], default: [] },
    description: { type: String, default: '' },

    status: {
      type: String,
      enum: ['Active', 'Low Stock', 'Out of Stock'],
      required: true,
      default: 'Active',
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

module.exports = mongoose.model('Product', productSchema);
