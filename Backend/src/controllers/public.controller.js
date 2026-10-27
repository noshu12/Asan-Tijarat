const { CATEGORIES } = require('../constants/categories');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const ContactMessage = require('../models/ContactMessage');

/**
 * GET /api/public/categories
 * Master list — wahi 14 categories jo categories.js mein hain.
 * Ye display list hai, is mein koi database count nahi hai.
 */
async function getCategories(req, res, next) {
  try {
    res.json({ categories: CATEGORIES });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/public/stats
 * Sirf live counts — khali ho to 0, koi fake number nahi.
 * suppliers/shopkeepers sirf verified wale gine jate hain, pending
 * accounts is mein nahi aate. Email/phone/documents kabhi nahi bhejte.
 */
async function getStats(req, res, next) {
  try {
    const [productCount, supplierCount, shopkeeperCount, orderCount, categoriesInUse] = await Promise.all([
      Product.countDocuments(),
      User.countDocuments({ role: 'supplier', verified: true }),
      User.countDocuments({ role: 'shopkeeper', verified: true }),
      Order.countDocuments(),
      Product.distinct('category'),
    ]);

    res.json({
      products: productCount,
      suppliers: supplierCount,
      shopkeepers: shopkeeperCount,
      orders: orderCount,
      categories: categoriesInUse.length,
      categoriesInUse,
      categoriesAvailable: CATEGORIES.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/public/contact
 * Body: { name, email, subject?, message }
 * ContactMessage collection mein save hota hai, status 'new' se shuru.
 * Public hai, is liye is mein koi user data wapas nahi bhejte.
 */
async function createContact(req, res, next) {
  try {
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, email and message are required.' },
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({
        error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' },
      });
    }

    const contact = await ContactMessage.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      subject: subject ? String(subject).trim() : '',
      message: String(message).trim(),
    });

    res.status(201).json({
      message: 'Message received. We will get back to you soon.',
      id: contact.id,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCategories, getStats, createContact };
