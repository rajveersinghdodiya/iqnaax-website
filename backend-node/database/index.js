const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'backend', 'iqnaax.db');

function getDbConnection() {
  return new sqlite3.Database(databasePath);
}

module.exports = {
  databasePath,
  getDbConnection,
};
