function listBlogs(req, res) {
  res.json({ message: 'Blog listing placeholder' });
}

function getBlog(req, res) {
  res.json({ message: `Blog detail placeholder for id=${req.params.id}` });
}

module.exports = {
  listBlogs,
  getBlog,
};
