function getHealth(req, res) {
  res.json({ status: 'healthy', service: 'IQNAAX Node Backend API' });
}

module.exports = {
  getHealth,
};
