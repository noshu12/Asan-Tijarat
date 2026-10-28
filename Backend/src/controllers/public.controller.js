const { CATEGORIES } = require('../constants/categories');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const ContactMessage = require('../models/ContactMessage');
const { sendEmail } = require('../utils/sendEmail');
const {
  contactAdminNotificationEmail,
  contactAutoReplyEmail,
} = require('../utils/emailTemplates');

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
 * Body: { name, email, subject?, message, website? }
 * ContactMessage collection mein save hota hai, status 'new' se shuru.
 * Public hai, is liye is mein koi user data wapas nahi bhejte.
 * Save ke baad do emails jati hain, dono kabhi save ko nahi rokti:
 *  (1) admin notification — sirf tab jab Backend/.env mein
 *      CONTACT_NOTIFY_EMAIL set ho. Ye address kabhi code mein
 *      hard-code nahi hai.
 *  (2) user auto-reply — bhejne wale ke email par, sirf ye kehne
 *      ke liye ke message receive ho gaya hai, koi waqt ka wada nahi.
 * Honeypot: 'website' hidden field bhara hua aaye to spam samajh
 * kar save/email kiye baghair 201 de dete hain, taake bot ko
 * pata na chale ke wo pakra gaya hai.
 */
async function createContact(req, res, next) {
  try {
    const { name, email, subject, message, website } = req.body || {};

    if (website && String(website).trim()) {
      return res.status(201).json({
        message: 'Message received. We will get back to you soon.',
      });
    }

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

    const cleanMessage = String(message).trim();
    if (cleanMessage.length < 20 || cleanMessage.length > 1000) {
      return res.status(400).json({
        error: { code: 'INVALID_MESSAGE', message: 'Message must be between 20 and 1000 characters.' },
      });
    }

    const contact = await ContactMessage.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      subject: subject ? String(subject).trim() : '',
      message: cleanMessage,
    });

    try {
      const cleanSubject = subject ? String(subject).trim() : '';
      const cleanName = String(name).trim();
      const cleanEmail = String(email).toLowerCase().trim();

      const notifyTo = (process.env.CONTACT_NOTIFY_EMAIL || '').trim();
      if (notifyTo) {
        const adminMail = contactAdminNotificationEmail({
          name: cleanName,
          email: cleanEmail,
          subject: cleanSubject,
          message: cleanMessage,
        });
        const adminSent = await sendEmail({ to: notifyTo, ...adminMail });
        if (!adminSent) {
          console.log('[contact] Admin notification email not sent (no SMTP configured or email failed)');
        }
      }

      const autoMail = contactAutoReplyEmail({
        name: cleanName,
        subject: cleanSubject,
        message: cleanMessage,
      });
      const replySent = await sendEmail({ to: cleanEmail, ...autoMail });
      if (!replySent) {
        console.log('[contact] Auto-reply email not sent (no SMTP configured or email failed)');
      }
    } catch (emailErr) {
      console.log('[contact] Email notification failed:', emailErr && emailErr.message ? emailErr.message : emailErr);
    }

    res.status(201).json({
      message: 'Message received. We will get back to you soon.',
      id: contact.id,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCategories, getStats, createContact };
