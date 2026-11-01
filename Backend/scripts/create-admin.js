// create-admin.js — ONE-TIME admin bootstrap for the production database.
//
// Run ONCE on the production DB, then DELETE this file. It is env-gated:
// it refuses to run unless ALLOW_ADMIN_SEED=true is set, and it refuses to
// create a second admin if one already exists.
//
// Usage (from Backend/):
//   ALLOW_ADMIN_SEED=true ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<strong-password>' ADMIN_PHONE=03001234567 node scripts/create-admin.js
//
// The password is hashed by the User model's pre('save') hook — never stored
// or logged in plain text. After the admin signs in on the admin subdomain,
// they enable 2FA from Admin → Security before doing anything else.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function main() {
  if (String(process.env.ALLOW_ADMIN_SEED || '').toLowerCase() !== 'true') {
    console.error('Refusing to run: set ALLOW_ADMIN_SEED=true to enable this one-time script.');
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const phone = (process.env.ADMIN_PHONE || '').trim();
  const name = (process.env.ADMIN_NAME || 'Platform Admin').trim();

  if (!email || !password || !phone) {
    console.error('Missing required env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE (all required).');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MONGO_URI in env.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.error(`An admin already exists (${existing.email}). Refusing to create a second one.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const admin = new User({
    name,
    email,
    phone,
    password,
    role: 'admin',
    verified: true,
    emailVerified: true,
    status: 'active',
  });
  await admin.save();

  console.log(`Admin created: ${email}`);
  console.log('Next: sign in on the admin subdomain and enable 2FA (Admin → Security).');
  console.log('Then DELETE this script file.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('create-admin failed:', err.message);
  process.exit(1);
});
