const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const controller = require('../controllers/productController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Ensure upload directory
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({ storage });

router.get('/', controller.listProducts);
router.get('/:id', controller.getProduct);
router.post('/', authRequired, upload.array('images'), controller.createProduct);
router.put('/:id', authRequired, upload.array('images'), controller.updateProduct);
router.delete('/:id', authRequired, controller.deleteProduct);

module.exports = router;
