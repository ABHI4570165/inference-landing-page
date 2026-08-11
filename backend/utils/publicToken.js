const crypto = require('crypto');

// Short, URL-safe, unguessable public token for links/QR codes that resolve
// to a workspace or form without exposing the raw Mongo _id. Not meant to be
// memorable — copy/paste and QR only.
function generatePublicToken(prefix = '') {
  const random = crypto.randomBytes(9).toString('base64url'); // 12 chars
  return prefix ? `${prefix}_${random}` : random;
}

module.exports = { generatePublicToken };
