const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const healthRouter = require('./routes/health');
const adminRouter = require('./routes/admin');
const productsRouter = require('./routes/products');
const blogsRouteModule = require('./routes/blogs');
const contactRouter = require('./routes/contact');
const { initDatabase } = require('./database/init');
const { errorHandler } = require('./middleware/errorHandler');
const { authRequired } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS: restrict to specific domains in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://iqnaax.com', 'https://www.iqnaax.com']
    : true, // Allow all origins in development
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

initDatabase();

app.use('/api/health', healthRouter);
app.use('/api/admin', adminRouter);
app.use('/api/products', productsRouter);
// mount public blogs routes at /api/blogs
app.use('/api/blogs', blogsRouteModule.publicRouter);
// mount admin blog routes at /api/admin/blogs
app.use('/api/admin/blogs', blogsRouteModule.adminRouter);
app.use('/api/contact', contactRouter);

// Serve product uploads at the same path used by the Flask backend: /api/uploads/products/:filename
app.get('/api/uploads/products/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', 'products', filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: 'File not found' });
  });
});

app.get('/', (req, res) => {
  res.json({ status: 'backend-node running' });
});

// Serve blog uploads compatible with Flask path: /api/uploads/blogs/:filename
app.get('/api/uploads/blogs/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', 'blogs', filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: 'File not found' });
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});