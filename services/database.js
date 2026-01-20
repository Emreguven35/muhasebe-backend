// backend/services/database.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Bağlantı testi
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL bağlantı hatası:', err.stack);
  } else {
    console.log('✅ PostgreSQL bağlantısı başarılı');
    release();
  }
});

module.exports = { pool };