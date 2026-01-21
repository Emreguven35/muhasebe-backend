// backend/routes/receipts.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { pool } = require('../services/database');
const { authenticateToken } = require('../middleware/auth');
const { performOCR } = require('../services/ocr');
const { parseReceipt } = require('../services/parser');
const sharp = require('sharp');

// Multer ayarları
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Dosya silme helper
function deleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Dosya silinirken hata:', err);
    }
  }
}

// Resim sıkıştırma
async function compressImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const compressedPath = imagePath.replace(/(\.[^.]+)$/, '-compressed$1');
  
  await sharp(imagePath)
    .resize(1200, 1200, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 85 })
    .toFile(compressedPath);
  
  return compressedPath;
}

// Dashboard istatistikleri (GET /api/receipts/stats) - DİĞER ROUTE'LARDAN ÖNCE OLMALI
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📊 Stats isteği, User ID:', userId);

    // Toplam fiş sayısı ve tutarlar
    const receiptsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(total), 0) as total_amount,
        COALESCE(SUM(vat), 0) as total_vat,
        COALESCE(SUM(vat1), 0) as total_vat1,
        COALESCE(SUM(vat10), 0) as total_vat10,
        COALESCE(SUM(vat20), 0) as total_vat20
       FROM receipts WHERE user_id = $1`,
      [userId]
    );

    // Bu ayki fişler
    const monthlyResult = await pool.query(
      `SELECT 
        COUNT(*) as monthly_count,
        COALESCE(SUM(total), 0) as monthly_amount
       FROM receipts 
       WHERE user_id = $1 
       AND date >= date_trunc('month', CURRENT_DATE)`,
      [userId]
    );

    // Kategori bazlı dağılım
    const categoryResult = await pool.query(
      `SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as amount
       FROM receipts 
       WHERE user_id = $1 
       GROUP BY category
       ORDER BY amount DESC`,
      [userId]
    );

    res.json({
      totalReceipts: parseInt(receiptsResult.rows[0].total_count),
      totalAmount: parseFloat(receiptsResult.rows[0].total_amount),
      totalVat: parseFloat(receiptsResult.rows[0].total_vat),
      totalVat1: parseFloat(receiptsResult.rows[0].total_vat1),
      totalVat10: parseFloat(receiptsResult.rows[0].total_vat10),
      totalVat20: parseFloat(receiptsResult.rows[0].total_vat20),
      monthlyReceipts: parseInt(monthlyResult.rows[0].monthly_count),
      monthlyAmount: parseFloat(monthlyResult.rows[0].monthly_amount),
      categoryBreakdown: categoryResult.rows
    });

  } catch (error) {
    console.error('❌ Stats hatası:', error);
    res.status(500).json({ error: 'İstatistikler alınırken hata oluştu' });
  }
});

// Excel export (GET /api/receipts/export) - /:id'den ÖNCE OLMALI
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📊 Excel export isteği, User ID:', userId);

    // Fişleri getir
    const result = await pool.query(
      'SELECT * FROM receipts WHERE user_id = $1 ORDER BY date DESC',
      [userId]
    );

    const receipts = result.rows;

    if (receipts.length === 0) {
      return res.status(400).json({ error: 'Export edilecek fiş bulunamadı' });
    }

    // Excel oluştur
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Muhasebe OCR';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Fişler', {
      properties: { tabColor: { argb: '4F81BD' } }
    });

    // Sütun tanımları - KDV'ler ayrı ayrı
    worksheet.columns = [
      { header: 'Tarih', key: 'date', width: 12 },
      { header: 'Firma', key: 'company_name', width: 30 },
      { header: 'Fiş No', key: 'receipt_number', width: 18 },
      { header: 'Kategori', key: 'category', width: 12 },
      { header: 'Toplam (₺)', key: 'total', width: 13 },
      { header: 'KDV %1 (₺)', key: 'vat1', width: 12 },
      { header: 'KDV %10 (₺)', key: 'vat10', width: 12 },
      { header: 'KDV %20 (₺)', key: 'vat20', width: 12 },
      { header: 'Toplam KDV (₺)', key: 'vat', width: 14 },
      { header: 'Ödeme', key: 'payment_method', width: 12 }
    ];

    // Başlık satırı stili
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4F81BD' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    // Verileri ekle
    receipts.forEach((receipt, index) => {
      const row = worksheet.addRow({
        date: receipt.date ? new Date(receipt.date).toLocaleDateString('tr-TR') : '-',
        company_name: receipt.company_name || '-',
        receipt_number: receipt.receipt_number || '-',
        category: receipt.category || '-',
        total: parseFloat(receipt.total) || 0,
        vat1: parseFloat(receipt.vat1) || 0,
        vat10: parseFloat(receipt.vat10) || 0,
        vat20: parseFloat(receipt.vat20) || 0,
        vat: parseFloat(receipt.vat) || 0,
        payment_method: receipt.payment_method || '-'
      });

      // Satır stili (zebra pattern)
      if (index % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'F2F2F2' }
        };
      }

      row.alignment = { vertical: 'middle' };
    });

    // Para formatı
    worksheet.getColumn('total').numFmt = '#,##0.00 ₺';
    worksheet.getColumn('vat1').numFmt = '#,##0.00 ₺';
    worksheet.getColumn('vat10').numFmt = '#,##0.00 ₺';
    worksheet.getColumn('vat20').numFmt = '#,##0.00 ₺';
    worksheet.getColumn('vat').numFmt = '#,##0.00 ₺';

    // Toplam satırı
    const totalRow = worksheet.addRow({
      date: '',
      company_name: 'TOPLAM',
      receipt_number: `${receipts.length} Fiş`,
      category: '',
      total: receipts.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0),
      vat1: receipts.reduce((sum, r) => sum + (parseFloat(r.vat1) || 0), 0),
      vat10: receipts.reduce((sum, r) => sum + (parseFloat(r.vat10) || 0), 0),
      vat20: receipts.reduce((sum, r) => sum + (parseFloat(r.vat20) || 0), 0),
      vat: receipts.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0),
      payment_method: ''
    });

    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E2EFDA' }
    };

    // Kenarlık ekle
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'CCCCCC' } },
          left: { style: 'thin', color: { argb: 'CCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
          right: { style: 'thin', color: { argb: 'CCCCCC' } }
        };
      });
    });

    // Auto filter
    worksheet.autoFilter = {
      from: 'A1',
      to: `J${receipts.length + 1}`
    };

    // Freeze header
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // Response headers
    const fileName = `fisler_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    // Excel'i gönder
    await workbook.xlsx.write(res);
    res.end();

    console.log('✅ Excel export başarılı:', fileName);

  } catch (error) {
    console.error('❌ Excel export hatası:', error);
    res.status(500).json({ 
      error: 'Excel oluşturulurken bir hata oluştu',
      details: error.message 
    });
  }
});

// Fişleri listele (GET /api/receipts)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 Receipts listesi, User ID:', userId);

    const result = await pool.query(
      'SELECT * FROM receipts WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
      [userId]
    );

    console.log('✅ Bulunan fiş sayısı:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Receipts fetch hatası:', error);
    res.status(500).json({ error: 'Fişler alınırken bir hata oluştu' });
  }
});

// Fiş yükle (POST /api/receipts/upload)
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

    // OCR işlemi
    const ocrText = await performOCR(compressedImagePath);
    console.log('📝 OCR Tam Metin:\n', ocrText);

    // Fiş parse
    const parsedData = parseReceipt(ocrText);
    console.log('✅ Parse edilen veri:', parsedData);

    // Veritabanına kaydet - vat1, vat10, vat20 dahil
    const result = await pool.query(
      `INSERT INTO receipts 
       (user_id, company_name, address, tax_office, tax_number, date, time, 
        receipt_number, category, total, vat, vat1, vat10, vat20, subtotal, payment_method, 
        image_path, ocr_text) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
       RETURNING *`,
      [
        userId,
        parsedData.companyName,
        parsedData.address,
        parsedData.taxOffice,
        parsedData.taxNumber,
        parsedData.date,
        parsedData.time,
        parsedData.receiptNumber,
        parsedData.category,
        parsedData.total,
        parsedData.vat,
        parsedData.vat1,
        parsedData.vat10,
        parsedData.vat20,
        parsedData.subtotal,
        parsedData.paymentMethod,
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

// Fiş güncelle (PUT /api/receipts/:id)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { company_name, date, receipt_number, category, total, vat, vat1, vat10, vat20 } = req.body;

    const result = await pool.query(
      `UPDATE receipts 
       SET company_name = $1, date = $2, receipt_number = $3, category = $4, 
           total = $5, vat = $6, vat1 = $7, vat10 = $8, vat20 = $9
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [company_name, date, receipt_number, category, total, vat, vat1 || 0, vat10 || 0, vat20 || 0, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fiş bulunamadı' });
    }

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

module.exports = router;