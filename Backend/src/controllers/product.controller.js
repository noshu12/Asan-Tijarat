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

/**
 * Server-side validation for product create/update.
 * Returns { code, message } for the FIRST problem found, or null when valid.
 * Rejects bad values instead of silently coercing them — the client must
 * send clean numbers and text.
 */
function validateListingFields(b, isUpdate) {
  const fail = (code, message) => ({ code, message });

  // name
  if (!isUpdate || b.name !== undefined) {
    const name = b.name !== undefined && b.name !== null ? String(b.name).trim() : '';
    if (!name) return fail('MISSING_FIELDS', 'Product name is required.');
    if (name.length > 120) return fail('NAME_TOO_LONG', 'Product name must be 120 characters or less.');
  }

  // category
  if (!isUpdate || b.category !== undefined) {
    const category = b.category !== undefined && b.category !== null ? String(b.category).trim() : '';
    if (!category) return fail('MISSING_FIELDS', 'Category is required.');
    if (!CATEGORIES.includes(category)) {
      return fail('INVALID_CATEGORY', 'Category must be one of the 14 master categories.');
    }
  }

  // price — must be a real number above zero
  if (!isUpdate || b.price !== undefined) {
    if (b.price === undefined || b.price === null || b.price === '') {
      return fail('MISSING_FIELDS', 'Price is required.');
    }
    const price = Number(b.price);
    if (!Number.isFinite(price)) return fail('INVALID_PRICE', 'Price must be a number.');
    if (price <= 0) return fail('INVALID_PRICE', 'Price must be greater than 0.');
    if (price > 999999999) return fail('INVALID_PRICE', 'Price is unrealistically large.');
  }

  // unit
  if (b.unit !== undefined && b.unit !== null) {
    const unit = String(b.unit).trim();
    if (!unit) return fail('INVALID_UNIT', 'Unit cannot be blank.');
    if (unit.length > 40) return fail('INVALID_UNIT', 'Unit must be 40 characters or less.');
  }

  // moq — whole packs, at least 1
  if (b.moq !== undefined) {
    const moq = Number(b.moq);
    if (!Number.isInteger(moq) || moq < 1) {
      return fail('INVALID_MOQ', 'MOQ must be a whole number of at least 1 pack.');
    }
  }

  // stock — whole packs, zero or more
  if (b.stock !== undefined) {
    const stock = Number(b.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return fail('INVALID_STOCK', 'Stock must be a whole number of 0 or more packs.');
    }
  }

  // description
  if (b.description !== undefined && b.description !== null) {
    if (String(b.description).length > 2000) {
      return fail('DESCRIPTION_TOO_LONG', 'Description must be 2000 characters or less.');
    }
  }

  return null;
}

/**
 * MOQ can never exceed available stock — otherwise nobody could ever place
 * an order. (stock = 0 simply means Out of Stock; any MOQ is fine there.)
 */
function checkMoqAgainstStock(moq, stock) {
  if (stock > 0 && moq > stock) {
    return { code: 'MOQ_EXCEEDS_STOCK', message: 'MOQ cannot be larger than the available stock.' };
  }
  return null;
}

// Photos are handled separately (they may arrive as base64 uploads to write to
// disk) — see saveProductImages().
// NOTE: `status` is deliberately NOT client-mutable — it is always derived
// server-side via deriveStatus().

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
      query.$or = [{ name: rx }, { description: rx }, { category: rx }, { supplierName: rx }, { supplierCity: rx }];
    }

    const category = (req.query.category || '').trim();
    if (category && category !== 'all') {
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Unknown category filter.' } });
      }
      query.category = category;
    }

    // City filter — exact supplier city (the /cities endpoint lists the valid values).
    const city = (req.query.city || '').trim();
    if (city) query.supplierCity = city;

    // Price range filter — invalid numbers are ignored; min > max is swapped, not rejected.
    let minPrice = Number(req.query.minPrice);
    let maxPrice = Number(req.query.maxPrice);
    const priceQuery = {};
    if (Number.isFinite(minPrice) && minPrice >= 0) priceQuery.$gte = minPrice;
    if (Number.isFinite(maxPrice) && maxPrice >= 0) priceQuery.$lte = maxPrice;
    if (priceQuery.$gte !== undefined && priceQuery.$lte !== undefined && priceQuery.$gte > priceQuery.$lte) {
      const tmp = priceQuery.$gte;
      priceQuery.$gte = priceQuery.$lte;
      priceQuery.$lte = tmp;
    }
    if (Object.keys(priceQuery).length > 0) query.price = priceQuery;

    // In-stock filter — only listings with units actually available.
    if (String(req.query.inStock).toLowerCase() === 'true') query.stock = { $gt: 0 };

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

    // Server-side pagination — only when the client asks for a page. Older
    // callers that pass no page/limit keep getting the full list as before.
    const wantsPages = req.query.page !== undefined || req.query.limit !== undefined;
    let page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));

    const total = await Product.countDocuments(query);
    if (!wantsPages) {
      const products = await Product.find(query).sort(sortClause).lean();
      return res.json({ products: toClient(products), count: products.length });
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (page > totalPages) page = totalPages;
    const products = await Product.find(query)
      .sort(sortClause)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({
      products: toClient(products),
      count: products.length,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/products/cities — distinct supplier cities that have live
 * listings. Public; only used to populate the marketplace city filter.
 * Returns city names only, nothing else.
 */
async function getProductCities(req, res, next) {
  try {
    const cities = await Product.distinct('supplierCity', { status: { $ne: 'Out of Stock' } });
    const clean = [...new Set(cities.map((c) => String(c || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    res.json({ cities: clean });
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

    // Validate every field BEFORE touching the disk, so a rejected value
    // never leaves orphan photos behind.
    const invalid = validateListingFields(b, false);
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    const name = String(b.name).trim();
    const category = String(b.category).trim();
    const price = Number(b.price);
    const unit = b.unit !== undefined && b.unit !== null && String(b.unit).trim() !== ''
      ? String(b.unit).trim()
      : 'unit';
    const moq = b.moq !== undefined ? Math.trunc(Number(b.moq)) : 1;
    const stock = b.stock !== undefined ? Math.trunc(Number(b.stock)) : 0;
    const description = b.description ? String(b.description) : '';

    const moqStockError = checkMoqAgainstStock(moq, stock);
    if (moqStockError) {
      return res.status(400).json({ error: moqStockError });
    }

    // Write the photos BEFORE creating the listing, so a rejected upload never
    // leaves a dangling product behind.
    const photos = storePhotos(req, res);
    if (!photos) return undefined;
    if (!photos.image) {
      return res.status(400).json({
        error: { code: 'PHOTO_REQUIRED', message: 'At least one product photo is required.' },
      });
    }

    let product;
    try {
      product = await Product.create({
        name,
        category,
        price,
        unit,
        moq,
        stock,
        // Status is ALWAYS derived server-side — a client-supplied status is
        // ignored, so nobody can force a listing 'Active' via the API.
        status: deriveStatus(stock, moq),
        image: photos.image,
        additionalImages: photos.additionalImages,
        imageUploads: photos.imageUploads,
        description,
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

    // Validate the incoming fields first — never assign raw client values.
    const invalid = validateListingFields(req.body, true);
    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    const effMoq = req.body.moq !== undefined ? Math.trunc(Number(req.body.moq)) : product.moq;
    const effStock = req.body.stock !== undefined ? Math.trunc(Number(req.body.stock)) : product.stock;
    const moqStockError = checkMoqAgainstStock(effMoq, effStock);
    if (moqStockError) {
      return res.status(400).json({ error: moqStockError });
    }

    // Assign CLEANED values only. `status` stays out — it is re-derived below.
    if (req.body.name !== undefined) product.name = String(req.body.name).trim();
    if (req.body.category !== undefined) product.category = String(req.body.category).trim();
    if (req.body.price !== undefined) product.price = Number(req.body.price);
    if (req.body.unit !== undefined && req.body.unit !== null && String(req.body.unit).trim() !== '') {
      product.unit = String(req.body.unit).trim();
    }
    if (req.body.moq !== undefined) product.moq = effMoq;
    if (req.body.stock !== undefined) product.stock = effStock;
    if (req.body.description !== undefined) {
      product.description = req.body.description === null ? '' : String(req.body.description);
    }

    let pendingFiles = [];
    if (req.body.images !== undefined || req.body.image !== undefined) {
      const photos = storePhotos(req, res);
      if (!photos) return undefined;
      if (!photos.image) {
        return res.status(400).json({
          error: { code: 'PHOTO_REQUIRED', message: 'A listing must keep at least one photo.' },
        });
      }
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

module.exports = { getProducts, getProductCities, getProduct, getProductMarketSale, createProduct, updateProduct, deleteProduct };
module.exports.deriveStatus = deriveStatus;
