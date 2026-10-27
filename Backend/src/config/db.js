const mongoose = require('mongoose');

/**
 * Connects to MongoDB using MONGO_URI from .env.
 * Throws on failure so the caller can decide how to degrade.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/asan_tijarat';

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log(`[db] ✅ connected to MongoDB → ${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = connectDB;