const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { parseZRapor } = require('../services/zRaporParser');
const { query } = require('../services/database');
const fs = require('fs');

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Z Raporu yükle
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log('📥 Z Raporu upload isteği geldi');
    console.log('👤 User ID:', req.user.userId);
    console.log('📁 Dosya:', req.file.filename);
    
    const imagePath = req.file.path;
    
    // OCR ile parse et
    const parsedData = await parseZRapor(imagePath);
    
    // Veritabanına kaydet
    const result = await query(
      `INSERT INTO z_reports 
       (user_id, tarih, fis_no, rapor_no, toplam_satis, toplam_kdv, matrah, 
        kdv1, kdv10, kdv20, kredili_satis, pos_satis, nakit_satis, image_path) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
       RETURNING id`,
      [
        req.user.userId,
        parsedData.tarih || null,
        parsedData.fisNo || null,
        parsedData.raporNo || null,
        parsedData.toplamSatis,
        parsedData.toplamKdv,
        parsedData.matrah,
        parsedData.kdv1,
        parsedData.kdv10,
        parsedData.kdv20,
        parsedData.krediliSatis,
        parsedData.posSatis,
        parsedData.nakitSatis,
        null
      ]
    );
    
    console.log('✅ Z Raporu veritabanına kaydedildi:', result.rows[0].id);
    
    // Fotoğrafı sil
    fs.unlinkSync(imagePath);
    console.log('🗑️ Fotoğraf silindi:', imagePath);
    
    res.json({ 
      success: true, 
      message: 'Z Raporu kaydedildi',
      data: parsedData
    });
    
  } catch (error) {
    console.error('❌ Z Raporu yükleme hatası:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Z Raporlarını listele
router.get('/list', authenticateToken, async (req, res) => {
  try {
    console.log('📋 Z Rapor listesi isteği, User ID:', req.user.userId);
    
    const result = await query(
      `SELECT * FROM z_reports 
       WHERE user_id = $1 
       ORDER BY tarih DESC, created_at DESC`,
      [req.user.userId]
    );
    
    console.log('📋 Bulunan Z raporu sayısı:', result.rows.length);
    
    res.json({ success: true, reports: result.rows });
  } catch (error) {
    console.error('❌ Z Rapor listesi hatası:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Z Raporu güncelle
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tarih, fis_no, rapor_no, toplam_satis, toplam_kdv, matrah,
      kdv1, kdv10, kdv20, kredili_satis, pos_satis, nakit_satis
    } = req.body;
    
    await query(
      `UPDATE z_reports 
       SET tarih = $1, fis_no = $2, rapor_no = $3, 
           toplam_satis = $4, toplam_kdv = $5, matrah = $6,
           kdv1 = $7, kdv10 = $8, kdv20 = $9,
           kredili_satis = $10, pos_satis = $11, nakit_satis = $12
       WHERE id = $13 AND user_id = $14`,
      [tarih, fis_no, rapor_no, toplam_satis, toplam_kdv, matrah,
       kdv1, kdv10, kdv20, kredili_satis, pos_satis, nakit_satis,
       id, req.user.userId]
    );
    
    res.json({ success: true, message: 'Z Raporu güncellendi' });
  } catch (error) {
    console.error('❌ Z Raporu güncelleme hatası:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Z Raporu sil
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await query(
      `DELETE FROM z_reports WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.userId]
    );
    
    console.log('✅ Z Raporu silindi:', req.params.id);
    
    res.json({ success: true, message: 'Z Raporu silindi' });
  } catch (error) {
    console.error('❌ Z Raporu silme hatası:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;