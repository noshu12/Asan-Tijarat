// ────────────────────────────────────────────────────────────
//  Analytics routes — every route here requires a signed-in user
//  (protect), and each controller re-checks the role, so a supplier
//  can never read shopkeeper analytics and vice versa.
//
//  Mount in server.js with:
//    app.use('/api/analytics', require('./src/routes/analytics.routes'));
// ────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const analytics = require('../controllers/analytics.controller');

router.use(protect);

router.get('/supplier', analytics.getSupplierAnalytics);
router.get('/shopkeeper', analytics.getShopkeeperAnalytics);

module.exports = router;
