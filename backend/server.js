require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

// ── Validate required env vars at startup ──────────────────────
const REQUIRED_ENV = [
  'MONGODB_URI',
  'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌  Missing required environment variables:', missing.join(', '));
  console.error('    Add them to your .env file and restart the server.');
  process.exit(1);
}

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/colleges', require('./routes/colleges'));

// Health check
app.get('/', (req, res) =>
  res.json({ message: 'Mandi Hariyaanna Portal API is running' })
);

// Global error handler — ensures all uncaught errors return JSON
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅  MongoDB connected');
    await require('./seedAdmin')();
    app.listen(PORT, () =>
      console.log(`✅  Server running on http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error('❌  MongoDB connection error:', err);
    process.exit(1);
  });