// ────────────────────────────────────────────────────────────
//  Admin controllers — platform management over MongoDB.
//  Every route here is guarded by requireRole('admin') in the
//  router, so only admin JWTs can reach these handlers.
// ────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { toClient } = require('../utils/serialize');
const { UPLOAD_ROOT } = require('../utils/kycStorage');

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const KYC_FIELDS = ['cnicFront', 'cnicBack', 'ntn'];

/**
 * GET /api/admin/stats
 * Platform-wide KPIs for the admin dashboard.
 */
async function getStats(req, res, next) {
  try {
    const [userCount, supplierCount, shopkeeperCount, pendingVerifications, productCount, orderCount] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: 'supplier' }),
        User.countDocuments({ role: 'shopkeeper' }),
        User.countDocuments({ verified: false, role: { $ne: 'admin' } }),
        Product.countDocuments({}),
        Order.countDocuments({}),
      ]);

    const revenueAgg = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const revenue = revenueAgg[0] || { total: 0 };

    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5).lean();

    res.json({
      stats: {
        users: userCount,
        suppliers: supplierCount,
        shopkeepers: shopkeeperCount,
        pendingVerifications,
        products: productCount,
        orders: orderCount,
        revenue: revenue.total,
      },
      recentOrders: toClient(recentOrders),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users?role=&verified=&search=
 */
async function listUsers(req, res, next) {
  try {
    const query = {};
    if (req.query.role && req.query.role !== 'all') query.role = req.query.role;
    if (req.query.verified === 'true') query.verified = true;
    if (req.query.verified === 'false') query.verified = false;

    const search = (req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { businessName: rx }];
    }

    const users = await User.find(query).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ users: toClient(users), count: users.length });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/verify  { verified: boolean }
 * KYC approval / revocation for shopkeepers & suppliers.
 * verified ke saath status bhi sync hota hai, taake login (verified)
 * aur naya status field dono ek hi baat kahen.
 */
async function verifyUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: { code: 'ADMIN_IMMUTABLE', message: 'Admin accounts cannot be verified or unverified.' } });
    }
    const verified = req.body.verified === undefined ? true : Boolean(req.body.verified);
    user.verified = verified;
    user.status = verified ? 'active' : 'pending';
    await user.save();
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/role  { role: 'shopkeeper' | 'supplier' }
 */
async function updateUserRole(req, res, next) {
  try {
    const role = req.body.role;
    if (!['shopkeeper', 'supplier'].includes(role)) {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE', message: 'role must be "shopkeeper" or "supplier".' },
      });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: { code: 'ADMIN_IMMUTABLE', message: 'Admin accounts cannot be reassigned.' } });
    }
    user.role = role;
    await user.save();
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/users/:id
 * Removes the account and any product listings owned by it.
 */
async function deleteUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: { code: 'ADMIN_IMMUTABLE', message: 'Admin accounts cannot be deleted.' } });
    }
    await Product.deleteMany({ supplierId: user._id });
    await User.deleteOne({ _id: user._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users/:id/kyc/:field
 * Admin-only KYC preview — yehi wo route hai jo Safety mein band
 * hui public /uploads preview ki jagah lega.
 *
 * field ∈ cnicFront, cnicBack, ntn. File ka naam sirf stored URL se
 * basename lekar banaya jata hai, taake URL mein ../ likh kar koi
 * doosri file nahi kholi ja sake. Public nahi hai — router par
 * protect + requireRole('admin') pehle se laga hua hai.
 */
async function getKycDocument(req, res, next) {
  try {
    const { id, field } = req.params;

    if (!KYC_FIELDS.includes(field)) {
      return res.status(400).json({
        error: { code: 'INVALID_FIELD', message: 'field must be cnicFront, cnicBack or ntn.' },
      });
    }

    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }

    const doc = user.documents && user.documents[field];
    if (!doc || !doc.url) {
      return res.status(404).json({
        error: { code: 'KYC_NOT_FOUND', message: 'No document uploaded for this field.' },
      });
    }

    const filePath = path.join(UPLOAD_ROOT, 'kyc', path.basename(doc.url));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: { code: 'KYC_NOT_FOUND', message: 'Document file not found on disk.' },
      });
    }

    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/products?search=&status=&supplierId=
 */
async function listProducts(req, res, next) {
  try {
    const query = {};
    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
    if (req.query.supplierId) query.supplierId = req.query.supplierId;

    const search = (req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: rx }, { description: rx }, { category: rx }, { supplierName: rx }];
    }

    const products = await Product.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ products: toClient(products), count: products.length });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/products/:id/status  { status }
 * Lets moderators hide/restore a listing.
 */
async function updateProductStatus(req, res, next) {
  try {
    const status = req.body.status;
    if (!['Active', 'Low Stock', 'Out of Stock'].includes(status)) {
      return res.status(400).json({
        error: { code: 'INVALID_STATUS', message: 'status must be Active, Low Stock or Out of Stock.' },
      });
    }
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' },
      });
    }
    product.status = status;
    await product.save();
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/products/:id
 */
async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' },
      });
    }
    await Product.deleteOne({ _id: product._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/orders?status=&search=
 */
async function listOrders(req, res, next) {
  try {
    const query = {};
    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;

    const search = (req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [
        { orderNumber: rx },
        { buyerName: rx },
        { supplierName: rx },
        { 'items.productName': rx },
      ];
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ orders: toClient(orders), count: orders.length });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/orders/:id/status  { status }
 * Admin override of the order state machine — lowercase status,
 * bina payment ke, jaisa naye Order model mein hai.
 */
async function updateOrderStatus(req, res, next) {
  try {
    const status = req.body.status;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        error: { code: 'INVALID_STATUS', message: `${status} is not a valid order status.` },
      });
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' },
      });
    }
    order.status = status;
    if (status === 'confirmed') {
      order.deliveryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }
    await order.save();
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  verifyUser,
  updateUserRole,
  deleteUser,
  getKycDocument,
  listProducts,
  updateProductStatus,
  deleteProduct,
  listOrders,
  updateOrderStatus,
};
