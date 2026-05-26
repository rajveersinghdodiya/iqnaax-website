const { getDbConnection } = require('../database');

function _open() {
  return getDbConnection();
}

function all(sql, params = []) {
  const db = _open();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  const db = _open();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function run(sql, params = []) {
  const db = _open();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      const info = { lastID: this ? this.lastID : null, changes: this ? this.changes : null };
      db.close();
      if (err) return reject(err);
      resolve(info);
    });
  });
}

module.exports = {
  all,
  get,
  run,
};
