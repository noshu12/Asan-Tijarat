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
const AuditLog = require('../models/AuditLog');
const ContactMessage = require('../models/ContactMessage');
const { toClient } = require('../utils/serialize');
const { UPLOAD_ROOT } = require('../utils/kycStorage');
const { sendEmail } = require('../utils/sendEmail');
const {
  accountVerifiedEmail,
  accountSuspendedEmail,
  accountRejectedEmail,
  accountReactivatedEmail,
  contactReplyEmail,
} = require('../utils/emailTemplates');

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Writes one line to the audit log. Never throws — a logging failure must
 * never block the admin action itself.
 */
async function logAdminAction(req, action, entityType, entityId, details) {
  try {
    await AuditLog.create({
      actorId: req.user ? req.user._id : undefined,
      actorName: req.user ? (req.user.name || req.user.email || '') : '',
      action,
      entityType: entityType || '',
      entityId: entityId ? String(entityId) : '',
      details: details || {},
    });
  } catch (err) {
    console.log('[audit] failed to write log:', err.message);
  }
}


const KYC_FIELDS = ['cnicFront', 'cnicBack', 'ntn', 'utilityBill'];

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
    await logAdminAction(req, verified ? 'USER_VERIFIED' : 'USER_UNVERIFIED', 'User', user._id, {
      email: user.email,
      businessName: user.businessName || '',
    });
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
    await logAdminAction(req, 'USER_SUSPENDED', 'User', user._id, { email: user.email, reason });
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
    await logAdminAction(req, 'USER_ACTIVATED', 'User', user._id, { email: user.email });
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
    await logAdminAction(req, 'USER_REJECTED', 'User', user._id, { email: user.email, reason });
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
    const deletedInfo = { email: user.email, businessName: user.businessName || '', role: user.role };
    await Product.deleteMany({ supplierId: user._id });
    await User.deleteOne({ _id: user._id });
    await logAdminAction(req, 'USER_DELETED', 'User', req.params.id, deletedInfo);
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
 * field ∈ cnicFront, cnicBack, ntn, utilityBill. File ka naam sirf stored
 * URL se basename lekar banaya jata hai, taake URL mein ../ likh kar koi
 * doosri file nahi kholi ja sake. Public nahi hai — router par
 * protect + requireRole('admin') pehle se laga hua hai.
 */
async function getKycDocument(req, res, next) {
  try {
    const { id, field } = req.params;

    if (!KYC_FIELDS.includes(field)) {
      return res.status(400).json({
        error: { code: 'INVALID_FIELD', message: 'field must be cnicFront, cnicBack, ntn or utilityBill.' },
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
    const deletedInfo = { name: product.name, supplierName: product.supplierName || '' };
    await Product.deleteOne({ _id: product._id });
    await logAdminAction(req, 'PRODUCT_DELETED', 'Product', req.params.id, deletedInfo);
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
 * GET /api/admin/audit-log?limit=&page=
 * Newest first. Lets the admin verify what the audit writes recorded.
 */
async function listAuditLog(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ logs: toClient(logs), count: logs.length, page, limit });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/contacts?limit=&page=
 * Newest first. Contact form se aaye messages admin yahan se dekhega.
 */
async function listContacts(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const contacts = await ContactMessage.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ contacts: toClient(contacts), count: contacts.length, page, limit });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/contacts/:id
 * Spam ya purana message delete karta hai. Delete bhi audit me likha
 * jata hai, taake pata chale kis ne kya message hataya.
 */
async function deleteContact(req, res, next) {
  try {
    const contact = await ContactMessage.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: { code: 'CONTACT_NOT_FOUND', message: 'No message matches that id.' } });
    }
    const deletedInfo = {
      name: contact.name,
      email: contact.email,
      subject: contact.subject || '',
    };
    await ContactMessage.deleteOne({ _id: contact._id });
    await logAdminAction(req, 'CONTACT_DELETED', 'ContactMessage', req.params.id, deletedInfo);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/contacts/:id/reply  { subject: string, message: string }
 * Admin replies to a contact-form message from the /admin/messages page.
 * The subject + message are typed on the site; the branded reply goes out
 * from the platform email address to the visitor who wrote in.
 * Email fail ho to 502 milta hai aur kuch log nahi hota — reply dobara
 * bheja ja sakta hai.
 */
async function replyContact(req, res, next) {
  try {
    const contact = await ContactMessage.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: { code: 'CONTACT_NOT_FOUND', message: 'No message matches that id.' } });
    }
    const subject = req.body.subject ? String(req.body.subject).trim() : '';
    const message = req.body.message ? String(req.body.message).trim() : '';
    if (!subject) {
      return res.status(400).json({ error: { code: 'MISSING_SUBJECT', message: 'A subject is required.' } });
    }
    if (subject.length > 200) {
      return res.status(400).json({ error: { code: 'INVALID_SUBJECT', message: 'Subject must be 200 characters or less.' } });
    }
    if (!message) {
      return res.status(400).json({ error: { code: 'MISSING_MESSAGE', message: 'A message is required.' } });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: { code: 'INVALID_MESSAGE', message: 'Message must be 5000 characters or less.' } });
    }
    const emailContent = contactReplyEmail({ name: contact.name, subject, message });
    const emailSent = await sendEmail({ to: contact.email, ...emailContent });
    if (!emailSent) {
      return res.status(502).json({ error: { code: 'EMAIL_FAILED', message: 'The reply could not be sent. Check the email configuration and try again.' } });
    }
    await logAdminAction(req, 'CONTACT_REPLIED', 'ContactMessage', req.params.id, {
      to: contact.email,
      subject,
    });
    res.json({ sent: true, to: contact.email });
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
  listAuditLog,
  listContacts,
  deleteContact,
  replyContact,
};
