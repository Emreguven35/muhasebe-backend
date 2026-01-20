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

    // Veritabanına kaydet
    const result = await pool.query(
      `INSERT INTO receipts 
       (user_id, company_name, address, tax_office, tax_number, date, time, 
        receipt_number, category, total, vat, subtotal, payment_method, 
        image_path, ocr_text, parsed_data) 
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
        parsedData.receiptNumber,
        parsedData.category,
        parsedData.total,
        parsedData.vat,
        parsedData.subtotal,
        parsedData.paymentMethod,
        compressedImagePath,
        ocrText,
        JSON.stringify(parsedData)
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
    const { company_name, date, receipt_number, category, total, vat } = req.body;

    const result = await pool.query(
      `UPDATE receipts 
       SET company_name = $1, date = $2, receipt_number = $3, category = $4, total = $5, vat = $6
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [company_name, date, receipt_number, category, total, vat, id, userId]
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

// ==========================================
// EXCEL EXPORT (GET /api/receipts/export)
// ==========================================
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

    // Sütun tanımları
    worksheet.columns = [
      { header: 'Tarih', key: 'date', width: 12 },
      { header: 'Firma', key: 'company_name', width: 35 },
      { header: 'Fiş No', key: 'receipt_number', width: 15 },
      { header: 'Kategori', key: 'category', width: 15 },
      { header: 'Toplam (₺)', key: 'total', width: 15 },
      { header: 'KDV (₺)', key: 'vat', width: 12 },
      { header: 'Ödeme', key: 'payment_method', width: 12 },
      { header: 'Vergi Dairesi', key: 'tax_office', width: 18 },
      { header: 'Vergi No', key: 'tax_number', width: 15 }
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
        vat: parseFloat(receipt.vat) || 0,
        payment_method: receipt.payment_method || '-',
        tax_office: receipt.tax_office || '-',
        tax_number: receipt.tax_number || '-'
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
    worksheet.getColumn('vat').numFmt = '#,##0.00 ₺';

    // Toplam satırı
    const totalRowNumber = receipts.length + 2;
    const totalRow = worksheet.addRow({
      date: '',
      company_name: 'TOPLAM',
      receipt_number: `${receipts.length} Fiş`,
      category: '',
      total: receipts.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0),
      vat: receipts.reduce((sum, r) => sum + (parseFloat(r.vat) || 0), 0),
      payment_method: '',
      tax_office: '',
      tax_number: ''
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
      to: `I${receipts.length + 1}`
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

module.exports = router;