const jwt = require('jsonwebtoken');
const db = require('../services/db');
const { verifyPassword } = require('../utils/crypto');
const { JWT_SECRET } = require('../middleware/auth');

function generateJWT(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
}

async function adminLogin(req, res, next) {
  try {
    const body = req.body || {};
    const username = body.username;
    const password = body.password;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const row = await db.get('SELECT id, username, password_hash, role FROM admin_users WHERE username = ?', [username]);
    if (!row) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    if (!verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const token = generateJWT(row);
    const now = new Date().toISOString();
    await db.run('UPDATE admin_users SET last_login = ? WHERE id = ?', [now, row.id]);

    res.json({
      success: true,
      token,
      admin: {
        id: row.id,
        username: row.username,
        role: row.role,
      }
    });
  } catch (err) { next(err); }
}

async function adminLogout(req, res, next) {
  try {
    // JWT tokens are stateless; no logout action needed in DB
    // In a production system, you might blacklist tokens here
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
}

async function adminMe(req, res, next) {
  try {
    const user = req.user;
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (err) { next(err); }
}

async function adminStats(req, res, next) {
  try {
    const productCount = await db.get('SELECT COUNT(*) AS total FROM products', []);
    const inquiryCount = await db.get('SELECT COUNT(*) AS total FROM contacts', []);
    const today = new Date().toISOString().split('T')[0];
    const todayCount = await db.get("SELECT COUNT(*) AS total FROM contacts WHERE DATE(created_at) = ?", [today]);

    res.json({
      total_products: productCount?.total || 0,
      total_inquiries: inquiryCount?.total || 0,
      todays_inquiries: todayCount?.total || 0,
    });
  } catch (err) { next(err); }
}

async function getInquiries(req, res, next) {
  try {
    const rows = await db.all(`SELECT id, name, organization, email, phone, inquiry_type, message, created_at FROM contacts ORDER BY created_at DESC`, []);
    res.json(rows || []);
  } catch (err) { next(err); }
}

async function deleteInquiry(req, res, next) {
  try {
    const id = parseInt(req.params.inquiry_id, 10);
    const row = await db.get('SELECT id FROM contacts WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Inquiry not found' });

    await db.run('DELETE FROM contacts WHERE id = ?', [id]);
    res.json({ message: 'Inquiry deleted successfully' });
  } catch (err) { next(err); }
}

async function listAdminUsers(req, res, next) {
  try {
    const rows = await db.all('SELECT id, username, role, created_at, last_login FROM admin_users ORDER BY created_at DESC', []);
    res.json(rows || []);
  } catch (err) { next(err); }
}

async function createAdminUser(req, res, next) {
  try {
    const body = req.body || {};
    const username = body.username;
    const password = body.password;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const { hashPassword } = require('../utils/crypto');
    const password_hash = hashPassword(password);
    const result = await db.run('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)', [username, password_hash, 'sub_admin']);
    const newId = result.lastID;
    const row = await db.get('SELECT id, username, role, created_at, last_login FROM admin_users WHERE id = ?', [newId]);

    res.status(201).json({ user: row });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    next(err);
  }
}

async function updateAdminUser(req, res, next) {
  try {
    const userId = parseInt(req.params.user_id, 10);
    const body = req.body || {};
    const username = body.username;
    const password = body.password;

    const row = await db.get('SELECT id, username, role FROM admin_users WHERE id = ?', [userId]);
    if (!row) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const params = [];

    if (username) {
      updates.push('username = ?');
      params.push(username);
    }
    if (password) {
      const { hashPassword } = require('../utils/crypto');
      updates.push('password_hash = ?');
      params.push(hashPassword(password));
    }

    if (updates.length > 0) {
      params.push(userId);
      const sql = `UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`;
      await db.run(sql, params);
    }

    const updated = await db.get('SELECT id, username, role, created_at, last_login FROM admin_users WHERE id = ?', [userId]);
    res.json({ user: updated });
  } catch (err) { next(err); }
}

async function deleteAdminUser(req, res, next) {
  try {
    const userId = parseInt(req.params.user_id, 10);
    const row = await db.get('SELECT id FROM admin_users WHERE id = ?', [userId]);
    if (!row) return res.status(404).json({ error: 'User not found' });

    await db.run('DELETE FROM admin_users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
}

module.exports = {
  adminLogin,
  adminLogout,
  adminMe,
  adminStats,
  getInquiries,
  deleteInquiry,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
};
