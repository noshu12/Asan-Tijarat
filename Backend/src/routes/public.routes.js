const router = require('express').Router();
const { getCategories, getStats, createContact } = require('../controllers/public.controller');
const { requireTurnstile } = require('../utils/turnstile');

router.get('/categories', getCategories);
router.get('/stats', getStats);
router.post('/contact', requireTurnstile, createContact);

module.exports = router;
