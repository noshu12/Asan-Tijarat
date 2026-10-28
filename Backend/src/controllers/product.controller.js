const Product = require('../models/Product');
const Order = require('../models/Order');
const { CATEGORIES } = require('../constants/categories');
const { toClient } = require('../utils/serialize');
const { saveProductImages, deleteStoredFiles, ProductImageError } = require('../utils/productImageStorage');

/** Auto-derive listing status from stock & MOQ (matches frontend behaviour). */
function deriveStatus(stock, moq) {
  if (stock <= 0) return 'Out of Stock';
  if (stock < moq * 1.5) return 'Low Stock';
  return 'Active';
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Photos are handled separately (they may arrive as base64 uploads to write to
// disk) — see saveProductImages().
const MUTABLE_FIELDS = ['name', 'category', 'price', 'unit', 'moq', 'stock', 'description'];

/**
 * Stores the supplier's uploaded photos and returns the fields to persist:
 * first photo = cover, the rest = gallery.
 * Re-throws validation failures as a 400 envelope so the caller can `return`.
 */
function storePhotos(req, res) {
  let stored;
  try {
    stored = saveProductImages({ images: req.body.images, image: req.body.image });
  } catch (err) {
    if (err instanceof ProductImageError) {
      res.status(400).json({ error: { code: err.code, message: err.message } });
      return null;
    }
    throw err;
  }

  return {
    image: stored.urls[0] || '',
    additionalImages: stored.urls.slice(1),
    imageUploads: stored.uploads,
    files: stored.files,
  };
}

/**
 * GET /api/products?search=&category=&sort=&supplierId=
 * sort ∈ { price_asc, price_desc } — rating/popular hat gaye, kyunki
 * Product model mein rating/ordersCount ab hain hi nahi.
 *
 * Public list (bina supplierId) mein Out of Stock products nahi dikhte.
 * Supplier ki apni list (supplierId ke saath) mein uske saare products
 * dikhte hain, taake wo stock manage kar sake.
 */
async function getProducts(req, res, next) {
  try {
    const query = {};

    const search = (req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: rx }, { description: rx }, { category: rx }, { supplierName: rx }];
    }

    const category = (req.query.category || '').trim();
    if (category && category !== 'all') query.category = category;

    if (req.query.supplierId) {
      query.supplierId = req.query.supplierId;
    } else {
      query.status = { $ne: 'Out of Stock' };
    }

    let sortClause = { createdAt: -1 };
    switch (req.query.sort) {
      case 'price_asc': sortClause = { price: 1 }; break;
      case 'price_desc': sortClause = { price: -1 }; break;
      default: break;
    }

    const products = await Product.find(query).sort(sortClause).lean();
    res.json({ products: toClient(products), count: products.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/products/:id
 */
async function getProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' },
      });
    }
    res.json({ product: toClient(product) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/products/:id/market-sale  (public — guests can see it too)
 *
 * Market-sale box data for the product popup: real delivered sales in
 * the last 30 days. Only `delivered` orders count as sold — a pending,
 * confirmed, processing, or shipped order is NOT a sale yet, and a
 * cancelled order never counts.
 *
 * Window uses order createdAt, because the Order model has no
 * deliveredAt/statusHistory field (deliveryDate is only the +3-day
 * estimate set on 'confirmed', not the actual delivery date).
 *
 * Only counts are returned — no buyer names, emails, or order details —
 * so guest viewers learn nothing private about any shopkeeper.
 * Response: { productId, days: 30, bagsSold, shopkeepers }
 */
async function getProductMarketSale(req, res, next) {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' },
      });
    }

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await Order.aggregate([
      { $match: { status: 'delivered', createdAt: { $gte: cutoff } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': req.params.id } },
      {
        $group: {
          _id: null,
          bagsSold: { $sum: '$items.quantity' },
          buyers: { $addToSet: '$buyerId' },
        },
      },
    ]);

    res.json({
      productId: req.params.id,
      days: 30,
      bagsSold: result[0] ? result[0].bagsSold : 0,
      shopkeepers: result[0] ? result[0].buyers.length : 0,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/products  (supplier only)
 * Body: { name, category, price, unit?, moq?, stock?, description?,
 *         images?: [{ dataUrl, name }], image?: { dataUrl, name } }
 */
async function createProduct(req, res, next) {
  try {
    const supplier = req.user;
    const b = req.body;

    if (!b.name || !b.category) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name and category are required.' },
      });
    }

    if (!CATEGORIES.includes(String(b.category).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_CATEGORY', message: 'Category must be one of the 14 master categories.' },
      });
    }

    // Write the photos BEFORE creating the listing, so a rejected upload never
    // leaves a dangling product behind.
    const photos = storePhotos(req, res);
    if (!photos) return undefined;

    const stock = Math.max(0, Number(b.stock) || 0);
    const moq = Math.max(1, Number(b.moq) || 1);

    let product;
    try {
      product = await Product.create({
        name: b.name.trim(),
        category: b.category.trim(),
        price: Math.max(0, Number(b.price) || 0),
        unit: (b.unit || 'unit').trim(),
        moq,
        stock,
        status: b.status || deriveStatus(stock, moq),
        image: photos.image,
        additionalImages: photos.additionalImages,
        imageUploads: photos.imageUploads,
        description: b.description || '',
        supplierId: supplier._id,
        supplierName: supplier.businessName || supplier.name,
        supplierCity: supplier.city || '',
      });
    } catch (err) {
      // Roll the written photos back — nothing should point at a ghost listing.
      deleteStoredFiles(photos.files);
      throw err;
    }

    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/products/:id  (supplier owner only)
 */
async function updateProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' },
      });
    }
    if (String(product.supplierId) !== String(req.user._id)) {
      return res.status(403).json({
        error: { code: 'NOT_YOUR_PRODUCT', message: 'You can only edit your own product listings.' },
      });
    }

    if (req.body.category !== undefined && !CATEGORIES.includes(String(req.body.category).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_CATEGORY', message: 'Category must be one of the 14 master categories.' },
      });
    }

    for (const field of MUTABLE_FIELDS) {
      if (req.body[field] !== undefined) product[field] = req.body[field];
    }

    let pendingFiles = [];
    if (req.body.images !== undefined || req.body.image !== undefined) {
      const photos = storePhotos(req, res);
      if (!photos) return undefined;
      product.image = photos.image;
      product.additionalImages = photos.additionalImages;
      product.imageUploads = photos.imageUploads;
      pendingFiles = photos.files;
    }

    // Re-opening stock flips status back automatically; zeroing marks it Out of Stock.
    product.status = deriveStatus(product.stock, product.moq);

    try {
      await product.save();
    } catch (err) {
      deleteStoredFiles(pendingFiles);
      throw err;
    }

    res.json({ product });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/products/:id  (supplier owner only)
 */
async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' },
      });
    }
    if (String(product.supplierId) !== String(req.user._id)) {
      return res.status(403).json({
        error: { code: 'NOT_YOUR_PRODUCT', message: 'You can only delete your own product listings.' },
      });
    }

    await Product.deleteOne({ _id: product._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProducts, getProduct, getProductMarketSale, createProduct, updateProduct, deleteProduct };
module.exports.deriveStatus = deriveStatus;
