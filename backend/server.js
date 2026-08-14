const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
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

console.log(`✓ Loaded env from ${path.join(__dirname, '.env')}`);
console.log(`✓ HUGGINGFACE_API_KEY loaded: ${process.env.HUGGINGFACE_API_KEY ? 'YES' : 'NO'}`);

// Behind a reverse proxy (Render/Railway/Nginx) — needed so rate limiting
// sees the real client IP instead of the proxy's
app.set('trust proxy', 1);

// ── Security middleware ─────────────────────────────────────────
// Helmet: secure HTTP headers. CORP disabled because the frontend is served
// from a different origin and fetches API responses cross-origin.
app.use(helmet({ crossOriginResourcePolicy: false }));

// FRONTEND_URL may be a single origin or a comma-separated list (e.g. when
// more than one deployed frontend — Vercel, a custom domain, etc. — needs to
// call this same API). Unset defaults to '*' (open), same as before.
//
// NOTE: this is read from the ENVIRONMENT, not from any file in the repo.
// backend/.env is gitignored and never deployed, so on Render/Railway this
// must be set in the host's own environment-variable settings.
//
// Origins are normalised before comparison. A browser's `Origin` header is
// always scheme + host + optional port with NO trailing slash and a lowercase
// host, so a value pasted as "https://example.com/" would otherwise never
// match — the most common cause of a CORS failure that "should" work.
function normaliseOrigin(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();   // not a URL — compare as-is
  }
}

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(normaliseOrigin)
  .filter(Boolean);

if (allowedOrigins.length) {
  console.log(`✓ CORS restricted to ${allowedOrigins.length} origin(s): ${allowedOrigins.join(', ')}`);
} else {
  console.warn('⚠  FRONTEND_URL is not set — CORS is open to any origin (*)');
}

app.use(cors({
  origin: allowedOrigins.length
    ? (origin, cb) => {
        // No Origin header: same-origin, curl, or a server-to-server call
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(normaliseOrigin(origin))) return cb(null, true);
        // Rejected quietly rather than by throwing: the browser still blocks
        // the call, but the API returns a normal response instead of a 500,
        // and the real origin is logged so the mismatch is visible.
        console.warn(
          `[CORS] blocked origin "${origin}" — not in FRONTEND_URL ` +
          `(allowed: ${allowedOrigins.join(', ')})`
        );
        cb(null, false);
      }
    : '*',
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

// Counselling verification limiter — stops identity-guessing while allowing
// a full classroom (behind one college / CGNAT IP) to verify normally
const counsellingVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts from this network. Please wait a few minutes and try again.' }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/students', submitLimiter);
app.use('/api/counselling/verify', counsellingVerifyLimiter);

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/students',    require('./routes/students'));
app.use('/api/colleges',    require('./routes/colleges'));
app.use('/api/attendance',  require('./routes/attendance'));
app.use('/api/attendance-sessions', require('./routes/attendanceSessions'));
app.use('/api/counselling', require('./routes/counselling'));
app.use('/api/admin/counselling', require('./routes/counsellingAdmin'));
app.use('/api/reception', require('./routes/reception'));
app.use('/api/admin/dashboard', require('./routes/dashboard'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/public/forms', submitLimiter, require('./routes/publicForms'));

// Health check
app.get('/', (req, res) =>
  res.json({ message: 'Portal API is running' })
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
    await require('./seedCounsellingQuestions')();
    await require('./backfillReceptionCheckins')();
    await require('./backfillWorkspaces')();
    await require('./backfillApplicationForms')();
    // Any report still marked 'generating' belongs to a previous process that
    // is no longer running — release it so it can be regenerated.
    await require('./services/aiReport').recoverOrphanedReports();

    app.listen(PORT, () =>
      console.log(`✅  Server running on http://localhost:${PORT}`)
    );
  })
  .catch(err => {
    console.error('❌  MongoDB connection error:', err);
    process.exit(1);
  });
