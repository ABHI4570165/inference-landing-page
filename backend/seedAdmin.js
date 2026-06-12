const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

module.exports = async function seedAdmin() {
  try {
    const existing = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
    if (!existing) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await Admin.create({ email: process.env.ADMIN_EMAIL, password: hash, role: 'admin' });
      console.log('Admin seeded:', process.env.ADMIN_EMAIL);
    } else if (!existing.role) {
      // Backfill role on admins created before RBAC was introduced
      existing.role = 'admin';
      await existing.save();
    }
  } catch (err) {
    console.error('Seed admin error:', err);
  }
};
