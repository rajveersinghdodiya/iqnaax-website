const express = require('express');
const controller = require('../controllers/adminController');
const { authRequired, superAdminRequired } = require('../middleware/auth');

const router = express.Router();

// Public auth routes
router.post('/login', controller.adminLogin);
router.post('/logout', authRequired, controller.adminLogout);

// Protected admin routes
router.get('/me', authRequired, controller.adminMe);
router.get('/stats', authRequired, controller.adminStats);
router.get('/inquiries', authRequired, controller.getInquiries);
router.delete('/inquiries/:inquiry_id', authRequired, controller.deleteInquiry);

// Super admin only routes
router.get('/users', authRequired, superAdminRequired, controller.listAdminUsers);
router.post('/users', authRequired, superAdminRequired, controller.createAdminUser);
router.put('/users/:user_id', authRequired, superAdminRequired, controller.updateAdminUser);
router.delete('/users/:user_id', authRequired, superAdminRequired, controller.deleteAdminUser);

module.exports = router;
