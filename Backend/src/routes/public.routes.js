const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { getCategories, getStats, createContact } = require('../controllers/public.controller');

// Dedicated contact limiter — sirf POST /contact par.
// 15 minute me ek IP se 10 messages. Isse zyada par 429 milta hai,
// aur wo message save ya email nahi hota. GET routes par koi limit
// nahi lagayi, taake categories/stats ki loading mutasir na ho.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  handler: (req, res) => {
    return res.status(429).json({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many contact messages sent. Please try again in a few minutes.',
      },
    });
  },
});

router.get('/categories', getCategories);
router.get('/stats', getStats);
router.post('/contact', contactLimiter, createContact);

module.exports = router;
