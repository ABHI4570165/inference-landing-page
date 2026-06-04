const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

module.exports = async function seedAdmin() {
  try {
    const existing = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
    if (!existing) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await Admin.create({ email: process.env.ADMIN_EMAIL, password: hash });
      console.log('Admin seeded:', process.env.ADMIN_EMAIL);
    }
  } catch (err) {
    console.error('Seed admin error:', err);
  }
};
