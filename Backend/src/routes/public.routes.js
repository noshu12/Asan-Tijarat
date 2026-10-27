const router = require('express').Router();
const { getCategories, getStats, createContact } = require('../controllers/public.controller');

router.get('/categories', getCategories);
router.get('/stats', getStats);
router.post('/contact', createContact);

module.exports = router;
