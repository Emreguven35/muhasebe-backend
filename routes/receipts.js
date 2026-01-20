// backend/routes/receipts.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../services/database');
const { authenticateToken } = require('../middleware/auth');
const { compressImage, performOCR, deleteFile } = require('../services/ocr');
const { parseReceipt } = require('../services/parser');

// Upload klasörünü oluştur
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Multer ayarları
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Fiş yükle ve OCR yap (POST /api/receipts/upload)
router.post('/upload', authenticateToken, upload.single('receipt'), async (req, res) => {
  try {
    console.log('📥 Fiş upload isteği geldi');
    const userId = req.user.id;
    console.log('👤 User ID:', userId);

    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    console.log('📁 Dosya:', req.file.filename);

    // Resmi sıkıştır
    const compressedImagePath = await compressImage(req.file.path);

    // OCR yap
    const ocrText = await performOCR(compressedImagePath);
    console.log('📝 OCR Tam Metin:\n', ocrText);

    // Parse et
    const parsedData = parseReceipt(ocrText);
    console.log('✅ Parse edilen veri:', parsedData);

    // Veritabanına kaydet
    const result = await pool.query(
      `INSERT INTO receipts 
       (user_id, company_name, address, tax_office, tax_number, date, time, 
        items, subtotal, vat, total, payment_method, receipt_number, category, image_path, ocr_text) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
       RETURNING *`,
      [
        userId,
        parsedData.companyName,
        parsedData.address,
        parsedData.taxOffice,
        parsedData.taxNumber,
        parsedData.date,
        parsedData.time,
        JSON.stringify(parsedData.items),
        parsedData.subtotal,
        parsedData.vat,
        parsedData.total,
        parsedData.paymentMethod,
        parsedData.receiptNumber,
        parsedData.category,
        compressedImagePath,
        ocrText
      ]
    );

    // Orijinal dosyayı sil
    deleteFile(req.file.path);

    res.json({
      success: true,
      receipt: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Upload hatası:', error);
    res.status(500).json({ 
      error: 'Fiş yüklenirken bir hata oluştu',
      details: error.message 
    });
  }
});

// Tüm fişleri listele (GET /api/receipts)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 Receipts listesi, User ID:', userId);

    const result = await pool.query(
      'SELECT * FROM receipts WHERE user_id = $1 ORDER BY date DESC, time DESC',
      [userId]
    );

    console.log('✅ Bulunan fiş sayısı:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Receipts fetch hatası:', error);
    res.status(500).json({ error: 'Fişler alınırken bir hata oluştu' });
  }
});

// Dashboard istatistikleri (GET /api/receipts/stats)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Genel istatistikler
    const stats = await pool.query(
      `SELECT 
        COUNT(*)::int as total_receipts,
        COALESCE(SUM(total), 0) as total_amount
       FROM receipts 
       WHERE user_id = $1`,
      [userId]
    );

    // Bu ay istatistikleri
    const thisMonth = await pool.query(
      `SELECT 
        COUNT(*)::int as this_month_receipts,
        COALESCE(SUM(total), 0) as this_month_amount
       FROM receipts 
       WHERE user_id = $1 
       AND EXTRACT(MONTH FROM date::date) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(YEAR FROM date::date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [userId]
    );

    res.json({
      totalReceipts: stats.rows[0].total_receipts || 0,
      totalAmount: parseFloat(stats.rows[0].total_amount || 0),
      thisMonthReceipts: thisMonth.rows[0].this_month_receipts || 0,
      thisMonthAmount: parseFloat(thisMonth.rows[0].this_month_amount || 0)
    });
  } catch (error) {
    console.error('Stats hatası:', error);
    res.status(500).json({ 
      error: 'İstatistikler alınırken bir hata oluştu',
      details: error.message 
    });
  }
});

// Fiş güncelle (PUT /api/receipts/:id)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      company_name,
      date,
      receipt_number,
      category,
      total,
      vat
    } = req.body;

    // Fişin bu kullanıcıya ait olduğunu kontrol et
    const checkReceipt = await pool.query(
      'SELECT * FROM receipts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkReceipt.rows.length === 0) {
      return res.status(404).json({ error: 'Fiş bulunamadı' });
    }

    // Güncelle
    const result = await pool.query(
      `UPDATE receipts 
       SET company_name = $1, date = $2, receipt_number = $3, category = $4, total = $5, vat = $6
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [company_name, date, receipt_number, category, total, vat, id, userId]
    );

    res.json({
      success: true,
      receipt: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Güncelleme hatası:', error);
    res.status(500).json({ error: 'Fiş güncellenirken bir hata oluştu' });
  }
});

// Fiş sil (DELETE /api/receipts/:id)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const receipt = await pool.query(
      'SELECT * FROM receipts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (receipt.rows.length === 0) {
      return res.status(404).json({ error: 'Fiş bulunamadı' });
    }

    // Resmi sil
    deleteFile(receipt.rows[0].image_path);

    // Veritabanından sil
    await pool.query('DELETE FROM receipts WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Silme hatası:', error);
    res.status(500).json({ error: 'Fiş silinirken bir hata oluştu' });
  }
});

// Excel export (GET /api/receipts/export) - Placeholder
router.get('/export', authenticateToken, async (req, res) => {
  try {
    // TODO: Excel export fonksiyonu eklenecek
    res.status(501).json({ error: 'Excel export özelliği yakında eklenecek' });
  } catch (error) {
    console.error('Export hatası:', error);
    res.status(500).json({ error: 'Export sırasında bir hata oluştu' });
  }
});

module.exports = router;