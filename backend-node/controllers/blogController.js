const path = require('path');
const fs = require('fs');
const db = require('../services/db');

const BASE_UPLOAD_PREFIX = '/uploads/blogs/';
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'blogs');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

function makeAbsoluteUrl(req, p) {
  if (!p || typeof p !== 'string') return p;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith('/')) {
    const host = req.protocol + '://' + req.get('host');
    return `${host}${p}`;
  }
  return p;
}

function loadContentBlocks(content) {
  if (!content) return [];
  if (Array.isArray(content)) return content;
  try { return JSON.parse(content); } catch (e) { return []; }
}

function normalizeBlockMediaUrls(blocks, req) {
  if (!Array.isArray(blocks)) return blocks;
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.image_path && typeof block.image_path === 'string' && block.image_path.startsWith('/')) {
      block.image_path = makeAbsoluteUrl(req, block.image_path);
    }
    if (block.image_url && typeof block.image_url === 'string' && block.image_url.startsWith('/')) {
      block.image_url = makeAbsoluteUrl(req, block.image_url);
    }
    if (block.url && typeof block.url === 'string' && block.url.startsWith('/')) {
      block.url = makeAbsoluteUrl(req, block.url);
    }
    if (block.type === 'image-gallery' && Array.isArray(block.images)) {
      for (const image of block.images) {
        if (!image || typeof image !== 'object') continue;
        if (image.image_path && typeof image.image_path === 'string' && image.image_path.startsWith('/')) {
          image.image_path = makeAbsoluteUrl(req, image.image_path);
        }
        if (image.image_url && typeof image.image_url === 'string' && image.image_url.startsWith('/')) {
          image.image_url = makeAbsoluteUrl(req, image.image_url);
        }
      }
    }
  }
  return blocks;
}

function getVideoPreviewUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = url.startsWith('http') ? url : `https://${url.replace(/^\//, '')}`;
    const u = new URL(parsed);
    const host = u.hostname || '';
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      if (host.includes('youtu.be')) {
        const videoId = u.pathname.replace(/^\//, '');
        if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      } else {
        const v = u.searchParams.get('v');
        if (v) return `https://img.youtube.com/vi/${v}/hqdefault.jpg`;
      }
    }
    if (host.includes('vimeo.com')) {
      const videoId = u.pathname.replace(/^\//, '').split('/').pop();
      if (videoId) return `https://vumbnail.com/${videoId}.jpg`;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function findPreviewImageFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const type = block.type;
    if (type === 'hero-image') {
      if (block.image_url) return block.image_url;
      if (block.image_path) return block.image_path;
    }
    if (type === 'image-gallery') {
      for (const img of block.images || []) {
        if (img.image_url) return img.image_url;
        if (img.image_path) return img.image_path;
      }
    }
    if (type === 'two-column') {
      if (block.image_url) return block.image_url;
      if (block.image_path) return block.image_path;
    }
    if (type === 'video') {
      const preview = getVideoPreviewUrl(block.url);
      if (preview) return preview;
    }
  }
  return null;
}

function findFileByField(reqFiles, field) {
  if (!Array.isArray(reqFiles)) return null;
  return reqFiles.find(f => f.fieldname === field) || null;
}

function processBlockUploads(blocks, req) {
  if (!Array.isArray(blocks)) return blocks;
  const files = req.files || [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const uploadField = block.upload_field;
    if (uploadField) {
      const file = findFileByField(files, uploadField);
      if (file) {
        const saved = BASE_UPLOAD_PREFIX + file.filename;
        if (block.type === 'video') {
          block.url = saved;
          block.source = 'upload';
        } else {
          block.image_path = saved;
        }
        delete block.upload_field;
        delete block.image_url;
      }
    }
    if (block.type === 'image-gallery' && Array.isArray(block.images)) {
      for (const image of block.images) {
        const uf = image && image.upload_field;
        if (uf) {
          const file = findFileByField(files, uf);
          if (file) {
            image.image_path = BASE_UPLOAD_PREFIX + file.filename;
            delete image.upload_field;
            delete image.image_url;
          }
        }
      }
    }
  }
  return blocks;
}

async function buildBlogResponse(row, req) {
  const content = row.content;
  let blocks = loadContentBlocks(content);
  blocks = normalizeBlockMediaUrls(blocks, req);
  const parsed_content = (typeof content === 'string' && (!blocks || blocks.length === 0) && content.trim()) ? content : blocks;

  let preview_image = null;
  if (row.image_path || row.image_url) {
    preview_image = row.image_path ? makeAbsoluteUrl(req, row.image_path) : (row.image_url && row.image_url.startsWith('/') ? makeAbsoluteUrl(req, row.image_url) : row.image_url);
  }
  if (!preview_image) {
    preview_image = findPreviewImageFromBlocks(blocks);
    if (preview_image && typeof preview_image === 'string' && preview_image.startsWith('/')) preview_image = makeAbsoluteUrl(req, preview_image);
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    author: row.author,
    publish_date: row.publish_date,
    content: parsed_content,
    image_path: row.image_path,
    image_url: row.image_url,
    image_full_url: preview_image,
    video_url: row.video_url,
    category: row.category,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listBlogs(req, res, next) {
  try {
    const rows = await db.all('SELECT * FROM blogs ORDER BY created_at DESC');
    const out = [];
    for (const r of rows) out.push(await buildBlogResponse(r, req));
    res.json(out);
  } catch (e) { next(e); }
}

async function getBlog(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await db.get('SELECT * FROM blogs WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Blog not found' });
    res.json(await buildBlogResponse(row, req));
  } catch (e) { next(e); }
}

async function createBlog(req, res, next) {
  try {
    const body = req.body || {};
    const title = body.title || null;
    const description = body.description || null;
    const author = body.author || null;
    const publish_date = body.publish_date || null;
    const category = body.category || null;
    const content_raw = body.content || '';

    let blocks = loadContentBlocks(content_raw);
    if (blocks && blocks.length) {
      blocks = processBlockUploads(blocks, req);
    }
    const content_to_store = (blocks && blocks.length) ? JSON.stringify(blocks) : (content_raw || '');

    // handle main image file (field name 'image')
    let image_path = null;
    const files = req.files || [];
    const mainImage = files.find(f => f.fieldname === 'image');
    if (mainImage) image_path = BASE_UPLOAD_PREFIX + mainImage.filename;

    const image_url = body.image_url || null;
    const video_url = body.video_url || null;

    const result = await db.run(
      `INSERT INTO blogs (title, description, author, publish_date, content, image_path, image_url, video_url, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, author, publish_date, content_to_store, image_path, image_url, video_url, category]
    );

    const blogId = result.lastID;
    const row = await db.get('SELECT * FROM blogs WHERE id = ?', [blogId]);
    res.status(201).json({ message: 'Blog created', blog: await buildBlogResponse(row, req) });
  } catch (e) { next(e); }
}

async function updateBlog(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await db.get('SELECT * FROM blogs WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Blog not found' });

    const body = req.body || {};
    const title = body.title || row.title;
    const description = body.description || row.description;
    const author = body.author || row.author;
    const publish_date = body.publish_date || row.publish_date;
    const category = body.category || row.category;
    const content_raw = body.content || row.content || '';

    let blocks = loadContentBlocks(content_raw);
    if (blocks && blocks.length) {
      blocks = processBlockUploads(blocks, req);
    }
    const content_to_store = (blocks && blocks.length) ? JSON.stringify(blocks) : content_raw || row.content || '';

    let image_path = row.image_path;
    const files = req.files || [];
    const mainImage = files.find(f => f.fieldname === 'image');
    if (mainImage) {
      const uploaded_path = BASE_UPLOAD_PREFIX + mainImage.filename;
      if (image_path) {
        const old = path.join(__dirname, '..', image_path.replace(/^\//, ''));
        try { if (fs.existsSync(old)) fs.unlinkSync(old); } catch (e) {}
      }
      image_path = uploaded_path;
    }

    const image_url = (typeof body.image_url !== 'undefined') ? body.image_url : row.image_url;
    const video_url = (typeof body.video_url !== 'undefined') ? body.video_url : row.video_url;

    await db.run(
      `UPDATE blogs SET title = ?, description = ?, author = ?, publish_date = ?, content = ?, image_path = ?, image_url = ?, video_url = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title, description, author, publish_date, content_to_store, image_path, image_url, video_url, category, id]
    );

    const updated = await db.get('SELECT * FROM blogs WHERE id = ?', [id]);
    res.json({ message: 'Blog updated', blog: await buildBlogResponse(updated, req) });
  } catch (e) { next(e); }
}

async function deleteBlog(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const row = await db.get('SELECT * FROM blogs WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Blog not found' });

    if (row.image_path) {
      const file = path.join(__dirname, '..', row.image_path.replace(/^\//, ''));
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (e) {}
    }

    await db.run('DELETE FROM blogs WHERE id = ?', [id]);
    res.json({ message: 'Blog deleted' });
  } catch (e) { next(e); }
}

module.exports = {
  listBlogs,
  getBlog,
  createBlog,
  updateBlog,
  deleteBlog,
};
