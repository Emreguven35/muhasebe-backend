const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken'); 
const { detectText } = require('../services/googleVision');
const { parseReceipt } = require('../services/receiptParser');
const { createExcel } = require('../services/excelExport');
const { saveReceipt, getUserReceipts } = require('../services/database');
const { pool } = require('../services/database');  
const fs = require('fs');
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Token bulunamadı' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Geçersiz token' });
  }
};
// Multer yapılandırması (dosya yükleme)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Sadece resim dosyaları yüklenebilir!');
    }
  }
});
// Multer hata yakalama
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('❌ Multer hatası:', error);
    return res.status(400).json({ message: error.message });
  }
  console.error('❌ Genel hata:', error);
  next(error);
});
// OCR endpoint'i
// OCR endpoint'i - AUTHENTICATED
router.post('/upload', authenticateToken, upload.single('receipt'), async (req, res) => {
  console.log('📥 Upload isteği geldi');
  console.log('👤 User ID:', req.userId);
  
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Dosya yüklenmedi' });
    }

    console.log('📁 Dosya:', req.file.filename);  
    const imagePath = req.file.path;
    
    // 1. OCR işlemi
    const result = await detectText(imagePath);
    
    if (!result.success) {
      // Hata varsa dosyayı sil
      try {
        fs.unlinkSync(imagePath);
      } catch (e) {
        console.error('Dosya silinemedi:', e);
      }
      return res.status(400).json({ 
        message: result.message,
        error: result.error 
      });
    }

    // 2. Parse et
    const parsedData = parseReceipt(result.fullText);
    console.log('🔍 Parse edildi:', parsedData);  
    
    // 3. Veritabanına kaydet
    try {
      console.log('🔍 Veritabanına kaydediliyor...'); 
      const savedReceipt = await saveReceipt(req.userId, {
        ...parsedData,
        imagePath: null
      });
      console.log('✅ Fiş veritabanına kaydedildi:', savedReceipt.id);
    } catch (dbError) {
      console.error('⚠️ Veritabanı kayıt hatası:', dbError);
    }

    // 4. Dosyayı sil
    try {
      fs.unlinkSync(imagePath);
      console.log('🗑️ Fotoğraf silindi:', imagePath);
    } catch (unlinkError) {
      console.error('⚠️ Dosya silinemedi:', unlinkError);
    }

    // 5. Response gönder
    res.json({
      success: true,
      message: 'OCR başarılı',
      fullText: result.fullText,
      parsedData: parsedData,
      fileName: req.file.filename
    });

  } catch (error) {
    console.error('Upload hatası:', error);
    
    // Hata durumunda da dosyayı sil
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    
    res.status(500).json({ 
      message: 'Sunucu hatası',
      error: error.message 
    });
  }
});
    // Parse et
    const parsedData = parseReceipt(result.fullText);
    console.log('🔍 Parse edildi:', parsedData);  
     // Veritabanına kaydet
    try {
        console.log('🔍 Veritabanına kaydediliyor...'); 
      const savedReceipt = await saveReceipt(req.userId, {
        ...parsedData,
        imagePath: null
      });
      console.log('✅ Fiş veritabanına kaydedildi:', savedReceipt.id);
      fs.unlinkSync(imagePath);

    } catch (dbError) {
      console.error('⚠️ Veritabanı kayıt hatası:',  dbError);
    }

    res.json({
      success: true,
      message: 'OCR başarılı',
      fullText: result.fullText,
      parsedData: parsedData,
      fileName: req.file.filename
    });

  } catch (error) {
    console.error('Upload hatası:', error);
    res.status(500).json({ 
      message: 'Sunucu hatası',
      error: error.message 
    });
  }
  });
// Excel export endpoint'i


router.post('/export-excel', async (req, res) => {
  try {
    const { receipts } = req.body;

    if (!receipts || receipts.length === 0) {
      return res.status(400).json({ message: 'Fiş verisi bulunamadı' });
    }

    const workbook = await createExcel(receipts);
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=harcamalar.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
        console.error('Excel export hatası:', error);
        res.status(500).json({ 
            message: 'Excel oluşturulamadı',
            error: error.message 
        });
    }
});

// Kullanıcının fişlerini getir
router.get('/receipts', authenticateToken, async (req, res) => {
  try {
    console.log('📋 Receipts isteği, User ID:', req.userId);
    const receipts = await getUserReceipts(req.userId); // userId = 1
    console.log('📋 Bulunan fiş sayısı:', receipts.length);  
    res.json({
      success: true,
      receipts: receipts
    });
  } catch (error) {
    console.error('Fiş listesi hatası:', error);
    res.status(500).json({ 
      message: 'Fişler getirilemedi',
      error: error.message 
    });
  }
});
// Fiş güncelleme endpoint'i
router.put('/receipts/:id', authenticateToken, async (req, res) => {
  try {
    const receiptId = req.params.id;
    const { firma_unvani, tarih, fis_no, gider_cinsi, toplam_tutar, kdv20 } = req.body;
    
    console.log('✏️ Fiş güncelleniyor:', receiptId, 'User:', req.userId);
    
    // Önce fişin bu kullanıcıya ait olduğunu kontrol et
    const checkResult = await pool.query(
      'SELECT * FROM receipts WHERE id = $1 AND user_id = $2',
      [receiptId, req.userId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Fiş bulunamadı veya yetkiniz yok' });
    }
    
    // Güncelle
    const result = await pool.query(
      `UPDATE receipts 
       SET firma_unvani = $1, tarih = $2, fis_no = $3, gider_cinsi = $4, 
           toplam_tutar = $5, kdv20 = $6
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [firma_unvani, tarih, fis_no, gider_cinsi, toplam_tutar, kdv20, receiptId, req.userId]
    );
    
    console.log('✅ Fiş güncellendi:', receiptId);
    
    res.json({
      success: true,
      message: 'Fiş güncellendi',
      receipt: result.rows[0]
    });
  } catch (error) {
    console.error('Güncelleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

// Fiş silme endpoint'i
router.delete('/receipts/:id', authenticateToken, async (req, res) => {
  try {
    const receiptId = req.params.id;
    
    console.log('🗑️ Fiş siliniyor:', receiptId, 'User:', req.userId);
    
    // Önce fişin bu kullanıcıya ait olduğunu kontrol et
    const checkResult = await pool.query(
      'SELECT * FROM receipts WHERE id = $1 AND user_id = $2',
      [receiptId, req.userId]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Fiş bulunamadı veya yetkiniz yok' });
    }
    
    // Sil
    await pool.query(
      'DELETE FROM receipts WHERE id = $1 AND user_id = $2',
      [receiptId, req.userId]
    );
    
    console.log('✅ Fiş silindi:', receiptId);
    
    res.json({
      success: true,
      message: 'Fiş silindi'
    });
  } catch (error) {
    console.error('Silme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});
module.exports = router;
