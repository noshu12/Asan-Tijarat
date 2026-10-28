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
const { sendEmail } = require('../utils/sendEmail');
const {
  accountVerifiedEmail,
  accountSuspendedEmail,
  accountRejectedEmail,
  accountReactivatedEmail,
} = require('../utils/emailTemplates');

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
 * Jab account pehli dafa pending se verified hota hai (false -> true),
 * to user ko approval email jati hai ke ab wo sign in kar sakta hai.
 * Email fail ho to bhi verification nahi rukti — verify pehle se
 * save ho chuka hota hai, email sirf notification hai.
 * OTP guard: verified=true sirf tab allowed hai jab user.emailVerified
 * true ho. OTP verify kiye baghair account ko approve nahi kiya ja
 * sakta — is se OTP step bypass nahi hoga. Unverify (verified=false)
 * is guard se block nahi hota.
 * Suspend/reject guard: suspended ya rejected account par Verify/Unverify
 * nahi chalega, warna Verify daba kar suspend bypass ho jata. Aise
 * account ke liye Activate ka rasta hai, Verify ka nahi.
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
    if (user.status === 'suspended' || user.status === 'rejected') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Suspended or rejected accounts cannot be verified or unverified. Use Activate for a suspended account.' } });
    }
    const verified = req.body.verified === undefined ? true : Boolean(req.body.verified);
    if (verified && !user.emailVerified) {
      return res.status(403).json({ error: { code: 'OTP_NOT_VERIFIED', message: 'This account has not verified its email OTP yet. Approve only after OTP verification.' } });
    }
    const wasVerified = user.verified;
    user.verified = verified;
    user.status = verified ? 'active' : 'pending';
    await user.save();
    if (verified && !wasVerified) {
      const emailContent = accountVerifiedEmail({ name: user.name, businessName: user.businessName });
      const emailSent = await sendEmail({ to: user.email, ...emailContent });
      if (!emailSent) {
        console.log(`[admin] Approval email not sent (no SMTP configured or email failed) for ${user.email}`);
      }
    }
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/suspend  { reason: string }
 * Temporarily blocks sign-in. verified flag nahi badalta, taake
 * Activate par account wapas active ho sake. Reason lazmi hai aur
 * wahi reason branded suspend email me user ko jata hai.
 * Email fail ho to bhi suspension nahi rukti.
 */
async function suspendUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: { code: 'ADMIN_IMMUTABLE', message: 'Admin accounts cannot be suspended.' } });
    }
    if (user.status === 'suspended') {
      return res.status(400).json({ error: { code: 'ALREADY_SUSPENDED', message: 'This account is already suspended.' } });
    }
    if (user.status === 'rejected') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'A rejected account cannot be suspended.' } });
    }
    const reason = req.body.reason ? String(req.body.reason).trim() : '';
    if (!reason) {
      return res.status(400).json({ error: { code: 'MISSING_REASON', message: 'A reason is required to suspend an account.' } });
    }
    if (reason.length > 500) {
      return res.status(400).json({ error: { code: 'INVALID_REASON', message: 'Reason must be 500 characters or less.' } });
    }
    user.status = 'suspended';
    user.suspensionReason = reason;
    user.rejectionReason = '';
    await user.save();
    const emailContent = accountSuspendedEmail({ name: user.name, businessName: user.businessName, reason });
    const emailSent = await sendEmail({ to: user.email, ...emailContent });
    if (!emailSent) {
      console.log(`[admin] Suspension email not sent (no SMTP configured or email failed) for ${user.email}`);
    }
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/activate
 * Suspended account ko wapas chalu karta hai. verified=true ho to
 * status active hota hai aur reactivated email jati hai, warna
 * status pending hota hai aur koi reactivated email nahi jati —
 * wo account pehle Verify hoga, phir verified email jayegi.
 * Email fail ho to bhi activation nahi rukti.
 */
async function activateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: { code: 'ADMIN_IMMUTABLE', message: 'Admin accounts cannot be activated.' } });
    }
    if (user.status !== 'suspended') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Only suspended accounts can be activated.' } });
    }
    user.status = user.verified ? 'active' : 'pending';
    user.suspensionReason = '';
    await user.save();
    if (user.status === 'active') {
      const emailContent = accountReactivatedEmail({ name: user.name, businessName: user.businessName });
      const emailSent = await sendEmail({ to: user.email, ...emailContent });
      if (!emailSent) {
        console.log(`[admin] Reactivation email not sent (no SMTP configured or email failed) for ${user.email}`);
      }
    }
    res.json({ user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/reject  { reason: string }
 * Sirf pending registration ko reject karta hai. verified=false ho
 * jata hai aur status rejected, taake login kabhi na khule.
 * Reason lazmi hai aur wahi reason branded reject email me jata hai.
 * Email fail ho to bhi rejection nahi rukti.
 */
async function rejectUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'No user matches that id.' } });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: { code: 'ADMIN_IMMUTABLE', message: 'Admin accounts cannot be rejected.' } });
    }
    if (user.status !== 'pending') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Only pending accounts can be rejected. Suspend an active account instead.' } });
    }
    const reason = req.body.reason ? String(req.body.reason).trim() : '';
    if (!reason) {
      return res.status(400).json({ error: { code: 'MISSING_REASON', message: 'A reason is required to reject an account.' } });
    }
    if (reason.length > 500) {
      return res.status(400).json({ error: { code: 'INVALID_REASON', message: 'Reason must be 500 characters or less.' } });
    }
    user.verified = false;
    user.status = 'rejected';
    user.rejectionReason = reason;
    user.suspensionReason = '';
    await user.save();
    const emailContent = accountRejectedEmail({ name: user.name, businessName: user.businessName, reason });
    const emailSent = await sendEmail({ to: user.email, ...emailContent });
    if (!emailSent) {
      console.log(`[admin] Rejection email not sent (no SMTP configured or email failed) for ${user.email}`);
    }
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
      return res.status(404).json({ error: { code: 'KYC_NOT_FOUND', message: 'No document uploaded for this field.' } });
    }

    const filePath = path.join(UPLOAD_ROOT, 'kyc', path.basename(doc.url));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: { code: 'KYC_NOT_FOUND', message: 'Document file not found on disk.' } });
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
 * DELETE /api/admin/products/:id
 */
async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND', message: 'No product matches that id.' } });
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
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'No order matches that id.' } });
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
  suspendUser,
  activateUser,
  rejectUser,
  deleteUser,
  getKycDocument,
  listProducts,
  deleteProduct,
  listOrders,
  updateOrderStatus,
};
