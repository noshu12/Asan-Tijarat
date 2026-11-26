const router = require('express').Router();
const { getCategories, getStats, getPublicSupplier, createContact } = require('../controllers/public.controller');
const { requireTurnstile } = require('../utils/turnstile');

router.get('/categories', getCategories);
router.get('/stats', getStats);
router.get('/suppliers/:id', getPublicSupplier);
router.post('/contact', requireTurnstile, createContact);

module.exports = router;
