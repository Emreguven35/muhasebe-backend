const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test bağlantı
pool.on('connect', () => {
  console.log('✅ PostgreSQL bağlantısı başarılı');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL bağlantı hatası:', err);
});
// İlk bağlantıyı test et
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ PostgreSQL bağlantı hatası:', err);
  } else {
    console.log('✅ PostgreSQL bağlantısı başarılı');
  }
});
// Fiş kaydetme
async function saveReceipt(userId, receiptData) {
  const query = `
    INSERT INTO receipts 
    (user_id, firma_unvani, tarih, fis_no, gider_cinsi, toplam_tutar, kdv1, kdv10, kdv20, image_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;
  
  const values = [
    userId,
    receiptData.firmaUnvani,
    receiptData.tarih,
    receiptData.fisNo,
    receiptData.giderCinsi,
    receiptData.toplamTutar,
    receiptData.kdv1,
    receiptData.kdv10,
    receiptData.kdv20,
    receiptData.imagePath || null
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

// Kullanıcının fişlerini getir
async function getUserReceipts(userId) {
  const query = 'SELECT * FROM receipts WHERE user_id = $1 ORDER BY created_at DESC';
  const result = await pool.query(query, [userId]);
  return result.rows;
}

// Tüm fişleri getir (Excel export için)
async function getAllReceipts(userId) {
  const query = 'SELECT * FROM receipts WHERE user_id = $1 ORDER BY tarih ASC';
  const result = await pool.query(query, [userId]);
  return result.rows;
}

module.exports = {
  pool,
  saveReceipt,
  getUserReceipts,
  getAllReceipts
};