const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const controller = require('../controllers/blogController');
const { authRequired } = require('../middleware/auth');

const publicRouter = express.Router();
publicRouter.get('/', controller.listBlogs);
publicRouter.get('/:id', controller.getBlog);

// Admin router for blog management - mounted at /api/admin/blogs
const adminRouter = express.Router();

// Ensure uploads directory
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'blogs');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

const storage = multer.diskStorage({
	destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
	filename: function (req, file, cb) {
		const safe = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
		cb(null, `${Date.now()}_${safe}`);
	}
});
const upload = multer({ storage });

adminRouter.post('/', authRequired, upload.any(), controller.createBlog);
adminRouter.put('/:id', authRequired, upload.any(), controller.updateBlog);
adminRouter.delete('/:id', authRequired, controller.deleteBlog);

module.exports = { publicRouter, adminRouter };
