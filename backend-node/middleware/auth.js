const jwt = require('jsonwebtoken');

// In production, JWT_SECRET must be set via environment variable
let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is not set. ' +
      'Production deployment requires a strong JWT_SECRET. ' +
      'Generate one with: openssl rand -base64 32'
    );
  } else {
    // Development: use a temporary secret with warning
    JWT_SECRET = 'dev-jwt-secret-change-in-production';
    console.warn('⚠️  WARNING: Using development JWT_SECRET. Set JWT_SECRET in .env for production.');
  }
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function superAdminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

module.exports = {
  authRequired,
  superAdminRequired,
  JWT_SECRET,
};
