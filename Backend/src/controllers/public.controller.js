const mongoose = require('mongoose');
const { CATEGORIES } = require('../constants/categories');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const ContactMessage = require('../models/ContactMessage');
const Rating = require('../models/Rating');
const { sendEmail } = require('../utils/sendEmail');
const {
  contactAdminNotificationEmail,
  contactAutoReplyEmail,
} = require('../utils/emailTemplates');
const { toClient } = require('../utils/serialize');
const {
  parseDataUrl,
  fileSignatureMatches,
  writeUploadedFile,
  deleteStoredFiles,
} = require('../utils/uploadStorage');

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
 * GET /api/public/suppliers/:id
 * Public supplier profile for the supplier profile page — PUBLIC-SAFE
 * FIELDS ONLY: businessName, city, categories, joinedAt. Email, phone,
 * CNIC, NTN aur koi bhi document/KYC data kabhi nahi bhejte.
 * No `verified` filter — unke listed products waise bhi public hain.
 * Rating: wahi live aggregation jo rating.controller.js#getSupplierRating
 * use karta hai (average 1 decimal, count; 0/0 jab koi rating na ho).
 * productsSold: sirf delivered orders gine jate hain, wahi rule jo
 * product.controller.js#getProductMarketSale use karta hai.
 * Reviews: latest 5, sirf { stars, comment, shopkeeperName, createdAt } —
 * koi id nahi. Products: newest first, max 50, products list wali
 * toClient() shape.
 */
async function getPublicSupplier(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid supplier id.' } });
    }
    const supplierId = new mongoose.Types.ObjectId(req.params.id);

    const supplier = await User.findOne({ _id: supplierId, role: 'supplier' }).lean();
    if (!supplier) {
      return res.status(404).json({ error: { code: 'SUPPLIER_NOT_FOUND', message: 'No supplier matches that id.' } });
    }

    const [agg] = await Rating.aggregate([
      { $match: { supplierId } },
      { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } },
    ]);
    const [reviewDocs, products, soldAgg] = await Promise.all([
      Rating.find({ supplierId }).sort({ createdAt: -1 }).limit(5).lean(),
      Product.find({ supplierId }).sort({ createdAt: -1 }).limit(50).lean(),
      Order.aggregate([
        { $match: { supplierId, status: 'delivered' } },
        { $unwind: '$items' },
        { $group: { _id: null, productsSold: { $sum: '$items.quantity' } } },
      ]),
    ]);

    res.json({
      supplier: {
        id: String(supplier._id),
        businessName: supplier.businessName || '',
        city: supplier.city || '',
        categories: supplier.categories || [],
        joinedAt: supplier.createdAt ? supplier.createdAt.toISOString() : null,
        rating: {
          average: agg ? Math.round(agg.average * 10) / 10 : 0,
          count: agg ? agg.count : 0,
        },
        productsSold: soldAgg[0] ? soldAgg[0].productsSold : 0,
        products: toClient(products),
        reviews: reviewDocs.map((r) => ({
          stars: r.stars,
          comment: r.comment || '',
          shopkeeperName: r.shopkeeperName || '',
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Contact pictures — wahi limits jo preview mein tay hui: max 3 files, har ek max 5 MB. */
const CONTACT_IMAGE_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_CONTACT_IMAGES = 3;
const MAX_CONTACT_IMAGE_BYTES = 5 * 1024 * 1024;
const CONTACT_IMAGE_ERROR = {
  code: 'CONTACT_IMAGE_INVALID',
  message: 'Attached pictures must be JPG, PNG or WEBP images, at most 3, each under 5MB.',
};

/**
 * POST /api/public/contact
 * Body: { name, email, subject?, message, website?, images? }
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
 * Pictures (optional): `images` — base64 data URLs ki array, max 3,
 * har ek max 5 MB, JPG/PNG/WEBP. Is codebase mein multer ya multipart
 * parser nahi hai (dekho utils/uploadStorage.js), is liye pictures
 * bhi baaki fields ki tarah isi JSON body mein aati hain. Har picture
 * parse + mime + size + magic-byte check se guzarti hai, phir
 * uploads/contact/ mein save hoti hai; koi bhi check fail ho to
 * pehle se likhi files delete kar ke 400 milta hai, kuch save nahi
 * hota. Emails mein picture data kabhi nahi jata.
 */
async function createContact(req, res, next) {
  try {
    const { name, email, subject, message, website, images } = req.body || {};

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

    // Optional pictures — validated + written BEFORE the DB create, taake
    // invalid upload par kuch bhi store na ho. Images message ki length
    // mein nahi gini jati (20-1000 char rule sirf message par hai).
    const imageUrls = [];
    const writtenFiles = [];
    if (images !== undefined) {
      if (!Array.isArray(images) || images.length > MAX_CONTACT_IMAGES) {
        return res.status(400).json({ error: CONTACT_IMAGE_ERROR });
      }
      for (const dataUrl of images) {
        const parsed = parseDataUrl(dataUrl);
        const extension = parsed ? CONTACT_IMAGE_MIME[parsed.mimeType] : undefined;
        // Magic-byte check: data-URL mime header client-controlled hai, is
        // liye bytes ko bhi verify karo — wahi pattern jo
        // productImageStorage.js use karta hai.
        if (
          !parsed ||
          !extension ||
          parsed.buffer.length > MAX_CONTACT_IMAGE_BYTES ||
          !fileSignatureMatches(parsed.buffer, parsed.mimeType)
        ) {
          deleteStoredFiles(writtenFiles);
          return res.status(400).json({ error: CONTACT_IMAGE_ERROR });
        }
        const { file, url } = writeUploadedFile({
          buffer: parsed.buffer,
          extension,
          folder: 'contact',
          prefix: 'contact',
        });
        writtenFiles.push(file);
        imageUrls.push(url);
      }
    }

    let contact;
    try {
      contact = await ContactMessage.create({
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        subject: subject ? String(subject).trim() : '',
        message: cleanMessage,
        images: imageUrls,
      });
    } catch (createErr) {
      // DB create fail ho gaya to orphan files na chhodein.
      deleteStoredFiles(writtenFiles);
      throw createErr;
    }

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

module.exports = { getCategories, getStats, getPublicSupplier, createContact };
