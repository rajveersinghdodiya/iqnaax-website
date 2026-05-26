const bcrypt = require('bcryptjs');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  try {
    return bcrypt.compareSync(password, hash);
  } catch (e) {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
