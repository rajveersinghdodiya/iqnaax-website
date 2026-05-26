const path = require('path');
const fs = require('fs');
const db = require('../services/db');

const UPLOAD_PREFIX = '/uploads/products/';

async function getProductImages(productId, req) {
  const rows = await db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [productId]);
  return rows.map(r => ({
    id: r.id,
    image_path: r.image_path,
    image_url: r.image_url,
    image_full_url: buildImageFullUrl(r.image_path, r.image_url, req),
    sort_order: r.sort_order,
  }));
}

function buildImageFullUrl(image_path, image_url, req) {
  if (image_path) {
    const host = req.protocol + '://' + req.get('host');
    return `${host}/api${image_path}`;
  }
  if (image_url) return image_url;
  return null;
}

async function buildProduct(row, req) {
  const images = await getProductImages(row.id, req);
  let imgs = images;
  if ((!images || images.length === 0) && row.image_url) {
    imgs = [{ id: null, image_path: null, image_url: row.image_url, image_full_url: row.image_url, sort_order: 0 }];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    video_url: row.video_url,
    image_url: row.image_url,
    created_at: row.created_at,
    images: imgs,
  };
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch (e) { return []; }
}

async function listProducts(req, res, next) {
  try {
    const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
    const products = [];
    for (const r of rows) {
      products.push(await buildProduct(r, req));
    }
    res.json(products);
  } catch (err) { next(err); }
}

async function getProduct(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(await buildProduct(row, req));
  } catch (err) { next(err); }
}

async function createProduct(req, res, next) {
  try {
    const body = req.body || {};
    const name = body.name || null;
    const description = body.description || null;
    const price = body.price ? parseFloat(body.price) : 0.0;
    const image_url = body.image_url || null;
    const video_url = body.video_url || null;

    const result = await db.run('INSERT INTO products (name, description, price, image_url, video_url) VALUES (?, ?, ?, ?, ?)', [name, description, price, image_url, video_url]);
    const productId = result.lastID;

    // handle image_urls array
    const imageUrls = parseJsonArray(body.image_urls);
    let sortOrder = 0;
    for (const u of imageUrls) {
      if (typeof u === 'string' && u.trim()) {
        await db.run('INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)', [productId, null, u.trim(), sortOrder]);
        sortOrder += 1;
      }
    }

    // handle uploaded files
    const files = req.files || [];
    for (const f of files) {
      const imagePath = UPLOAD_PREFIX + f.filename;
      await db.run('INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)', [productId, imagePath, null, sortOrder]);
      sortOrder += 1;
    }

    const created = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    res.status(201).json({ message: 'Product created successfully', product: await buildProduct(created, req) });
  } catch (err) { next(err); }
}

async function deleteImageRow(imageId) {
  const row = await db.get('SELECT image_path FROM product_images WHERE id = ?', [imageId]);
  if (!row) return;
  if (row.image_path) {
    const filePath = path.join(__dirname, '..', row.image_path.replace(/^\//, ''));
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
  await db.run('DELETE FROM product_images WHERE id = ?', [imageId]);
}

async function updateProduct(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Product not found' });

    const body = req.body || {};
    const name = body.name || row.name;
    const description = body.description || row.description;
    const price = body.price ? parseFloat(body.price) : row.price;
    const image_url = typeof body.image_url !== 'undefined' ? body.image_url : row.image_url;
    const video_url = typeof body.video_url !== 'undefined' ? body.video_url : row.video_url;

    await db.run('UPDATE products SET name = ?, description = ?, price = ?, image_url = ?, video_url = ? WHERE id = ?', [name, description, price, image_url, video_url, id]);

    // Handle deleted_image_ids
    const deletedImageIds = parseJsonArray(body.deleted_image_ids);
    for (const iid of deletedImageIds) {
      const num = parseInt(iid, 10);
      if (!isNaN(num)) await deleteImageRow(num);
    }

    // Handle image_order (array of image ids)
    const imageOrder = parseJsonArray(body.image_order);
    if (Array.isArray(imageOrder)) {
      let idx = 0;
      for (const imageId of imageOrder) {
        if (imageId === null) { idx++; continue; }
        const num = parseInt(imageId, 10);
        if (!isNaN(num)) {
          await db.run('UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?', [idx, num, id]);
        }
        idx++;
      }
    }

    // Add new image_urls
    const imageUrls = parseJsonArray(body.image_urls);
    for (const u of imageUrls) {
      if (typeof u === 'string' && u.trim()) {
        const next = await db.get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM product_images WHERE product_id = ?', [id]);
        await db.run('INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)', [id, null, u.trim(), next.next_order]);
      }
    }

    // Add uploaded files
    const files = req.files || [];
    for (const f of files) {
      const next = await db.get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM product_images WHERE product_id = ?', [id]);
      const imagePath = UPLOAD_PREFIX + f.filename;
      await db.run('INSERT INTO product_images (product_id, image_path, image_url, sort_order) VALUES (?, ?, ?, ?)', [id, imagePath, null, next.next_order]);
    }

    const updated = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    res.json({ message: 'Product updated successfully', product: await buildProduct(updated, req) });
  } catch (err) { next(err); }
}

async function deleteProduct(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Product not found' });

    const images = await db.all('SELECT id FROM product_images WHERE product_id = ?', [id]);
    for (const img of images) {
      await deleteImageRow(img.id);
    }

    await db.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) { next(err); }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
