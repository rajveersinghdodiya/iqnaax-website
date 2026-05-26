function listProducts(req, res) {
  res.json({ message: 'Product listing placeholder' });
}

function getProduct(req, res) {
  res.json({ message: `Product detail placeholder for id=${req.params.id}` });
}

module.exports = {
  listProducts,
  getProduct,
};
