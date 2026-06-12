const jwt = require('jsonwebtoken');

// Log rejected admin-area requests so brute-force / probing attempts are visible
function logUnauthorized(req, reason) {
  console.warn(
    `[SECURITY] Unauthorized admin access — ${reason} | ` +
    `${req.method} ${req.originalUrl} | IP: ${req.ip} | UA: ${req.headers['user-agent'] || 'unknown'}`
  );
}

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    logUnauthorized(req, 'missing token');
    return res.status(401).json({ message: 'No token, unauthorized', code: 'NO_TOKEN' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Role-based access control — only admin tokens may pass
    if (decoded.role !== 'admin') {
      logUnauthorized(req, `insufficient role "${decoded.role || 'none'}"`);
      return res.status(403).json({ message: 'Forbidden: admin access required', code: 'FORBIDDEN' });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logUnauthorized(req, 'expired token');
      return res.status(401).json({ message: 'Session expired, please log in again', code: 'TOKEN_EXPIRED' });
    }
    logUnauthorized(req, 'invalid token');
    res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
  }
};
