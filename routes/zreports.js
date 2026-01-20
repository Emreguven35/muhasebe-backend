// backend/routes/zreports.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../services/database');
const { authenticateToken } = require('../middleware/auth');
const { compressImage, performOCR, deleteFile } = require('../services/ocr');
const { parseZReport } = require('../services/parser');

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

// Z Raporu yükle ve OCR yap (POST /api/z-reports/upload)
router.post('/upload', authenticateToken, upload.single('receipt'), async (req, res) => {
  try {
    console.log('📥 Z Raporu upload isteği geldi');
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
    const parsedData = parseZReport(ocrText);
    console.log('✅ Parse edilen Z Raporu:', parsedData);

    // Veritabanına kaydet
    const result = await pool.query(
      `INSERT INTO z_reports 
       (user_id, report_date, report_time, total_sales, total_vat, cash_amount, 
        credit_card_amount, receipt_count, fiscal_number, image_path, ocr_text, parsed_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [
        userId,
        parsedData.date,
        parsedData.time,
        parsedData.totalSales,
        parsedData.totalVat,
        parsedData.cashAmount,
        parsedData.creditCardAmount,
        parsedData.receiptCount,
        parsedData.fiscalNumber,
        compressedImagePath,
        ocrText,
        JSON.stringify(parsedData)
      ]
    );

    // Orijinal dosyayı sil
    deleteFile(req.file.path);

    res.json({
      success: true,
      zReport: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Z Raporu upload hatası:', error);
    res.status(500).json({ 
      error: 'Z Raporu yüklenirken bir hata oluştu',
      details: error.message 
    });
  }
});

// Tüm Z Raporlarını listele (GET /api/z-reports)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 Z Reports listesi, User ID:', userId);

    const result = await pool.query(
      'SELECT * FROM z_reports WHERE user_id = $1 ORDER BY report_date DESC, report_time DESC',
      [userId]
    );

    console.log('✅ Bulunan Z Raporu sayısı:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Z Reports fetch hatası:', error);
    res.status(500).json({ error: 'Z Raporları alınırken bir hata oluştu' });
  }
});

// Z Raporu sil (DELETE /api/z-reports/:id)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const zReport = await pool.query(
      'SELECT * FROM z_reports WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (zReport.rows.length === 0) {
      return res.status(404).json({ error: 'Z Raporu bulunamadı' });
    }

    // Resmi sil
    deleteFile(zReport.rows[0].image_path);

    // Veritabanından sil
    await pool.query('DELETE FROM z_reports WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Z Raporu silme hatası:', error);
    res.status(500).json({ error: 'Z Raporu silinirken bir hata oluştu' });
  }
});

module.exports = router;