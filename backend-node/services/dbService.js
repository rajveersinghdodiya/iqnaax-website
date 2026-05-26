const { getDbConnection } = require('../database');

function query(sql, params = []) {
  const db = getDbConnection();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

module.exports = {
  query,
};
