const jwt = require('jsonwebtoken');

// Auth for the public counselling form. After a student verifies their
// identity (+ attendance) they receive a short-lived token scoped to one
// response document — no admin privileges, no login required.
module.exports = function counsellingAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Please verify your details first', code: 'NO_TOKEN' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'counselling') {
      return res.status(403).json({ message: 'Invalid session', code: 'FORBIDDEN' });
    }
    req.counselling = decoded; // { role, studentId, responseId, attendanceDate }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Your session expired. Please verify your details again — your saved answers are kept.',
        code: 'TOKEN_EXPIRED'
      });
    }
    res.status(401).json({ message: 'Invalid session', code: 'INVALID_TOKEN' });
  }
};
