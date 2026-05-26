function log(message) {
  console.log(`[backend-node] ${message}`);
}

function error(message) {
  console.error(`[backend-node] ${message}`);
}

module.exports = {
  log,
  error,
};
