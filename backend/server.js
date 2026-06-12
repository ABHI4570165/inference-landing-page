require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const path      = require('path');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

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

// Behind a reverse proxy (Render/Railway/Nginx) — needed so rate limiting
// sees the real client IP instead of the proxy's
app.set('trust proxy', 1);

// ── Security middleware ─────────────────────────────────────────
// Helmet: secure HTTP headers. CORP disabled because the frontend is served
// from a different origin and fetches API responses cross-origin.
app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json({ limit: '100kb' }));

// Strip $ / . operators from req.body, req.query, req.params —
// blocks NoSQL operator injection attempts
app.use(mongoSanitize());

// ── Rate limiting ───────────────────────────────────────────────
// Global API limiter — generous, protects against scraping/flooding.
// NOTE: mobile carriers (Jio/Airtel CGNAT) put THOUSANDS of users behind a
// single IP, so per-IP limits must stay high or real applicants get blocked.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

// Login limiter — strict, blocks credential brute-forcing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Submission limiter — must accommodate college labs AND mobile-carrier CGNAT
// where many genuine applicants share one IP; still stops runaway bot floods
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.method !== 'POST',
  handler: (req, res) => {
    console.warn(`[RATE LIMITED] submission blocked | ip=${req.ip} ua="${req.headers['user-agent'] || 'unknown'}"`);
    res.status(429).json({ message: 'Too many submissions from this network right now. Please wait a few minutes and try again.' });
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/students', submitLimiter);

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
