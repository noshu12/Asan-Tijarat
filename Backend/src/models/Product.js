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
    // Cloudinary mode: 'local' | 'cloudinary'. publicId lets future cleanup
    // delete the asset; local mode keeps url as the /uploads path.
    storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
    publicId: { type: String, trim: true, default: '' },
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
    // Batch 04 — price sort + city filter are indexed (the catalogue sorts
    // by price and filters by supplier city).
    price: { type: Number, required: true, min: 0, index: true },
    unit: { type: String, required: true, default: 'unit', trim: true },
    moq: { type: Number, required: true, min: 1, default: 1 }, // Minimum Order Quantity
    stock: { type: Number, required: true, min: 0, default: 0 },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    supplierName: { type: String, required: true, trim: true },
    supplierCity: { type: String, trim: true, index: true },

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

// Batch 19 (Round-5 audit M8) — the text index is GONE, deliberately.
// It was dead weight: grep $text across Backend/src returned zero hits,
// and the catalogue search still uses the regex $or — substring matching
// ("bas" → "Basmati") must keep working, and a text index cannot serve
// that. Switching the search to $text would have lost the substring
// match, so the decision (Noushad, Batch 19) is: drop the index, keep
// the regex search. The index cost write time + storage for zero
// benefit. If the catalogue ever outgrows regex search, that is a
// separate search redesign, not an index re-add.
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ supplierId: 1, createdAt: -1 });

// Batch 19 (Round-5 audit L1) — compounds for the category / city
// filtered list shapes getProducts actually runs (category + createdAt
// sort, supplierCity + createdAt sort). Before this, filtered lists
// fell back to a single-field index + in-memory sort.
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ supplierCity: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
