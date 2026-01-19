const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// PostgreSQL bağlantısı
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

// Google Vision Client
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

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

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Resim sıkıştırma fonksiyonu
async function compressImage(imagePath) {
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

// OCR fonksiyonu
async function performOCR(imagePath) {
  try {
    const [result] = await visionClient.textDetection(imagePath);
    const detections = result.textAnnotations;
    return detections.length > 0 ? detections[0].description : '';
  } catch (error) {
    console.error('OCR Hatası:', error);
    throw error;
  }
}

// Fiş parse fonksiyonu
function parseReceipt(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  const data = {
    companyName: null,
    address: null,
    taxOffice: null,
    taxNumber: null,
    date: null,
    time: null,
    items: [],
    subtotal: 0,
    vat: 0,
    total: 0,
    paymentMethod: null,
    receiptNumber: null,
    category: null
  };

  // Kategori tespiti (önce yapılmalı)
  data.category = detectCategory(text);

  // Şirket adı (ilk satır genellikle)
  if (lines.length > 0) {
    data.companyName = lines[0];
  }

  // Adres
  const addressPattern = /(?:ADRES|ADR|ADDRESS)[:\s]*(.*?)(?=\n|VERGİ|TAX|$)/i;
  const addressMatch = text.match(addressPattern);
  if (addressMatch) {
    data.address = addressMatch[1].trim();
  }

  // Vergi dairesi ve numarası
  const taxOfficePattern = /(?:VERGİ DAİRESİ|V\.D\.|VD)[:\s]*([^\n\d]+)/i;
  const taxOfficeMatch = text.match(taxOfficePattern);
  if (taxOfficeMatch) {
    data.taxOffice = taxOfficeMatch[1].trim();
  }

  const taxNumberPattern = /(?:VERGİ NO|V\.NO|VNO|VERGI NUMARASI)[:\s]*(\d+[-\s]?\d*)/i;
  const taxNumberMatch = text.match(taxNumberPattern);
  if (taxNumberMatch) {
    data.taxNumber = taxNumberMatch[1].replace(/[-\s]/g, '');
  }

  // Tarih (DD/MM/YYYY veya DD.MM.YYYY)
  const datePattern = /(\d{2})[\/\.](\d{2})[\/\.](\d{4})/;
  const dateMatch = text.match(datePattern);
  if (dateMatch) {
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];
    data.date = `${year}-${month}-${day}`;
  }

  // Saat
  const timePattern = /(\d{2}):(\d{2})(?::(\d{2}))?/;
  const timeMatch = text.match(timePattern);
  if (timeMatch) {
    data.time = `${timeMatch[1]}:${timeMatch[2]}`;
  }

  // Ürünler
  const itemPattern = /^(.+?)\s+([\d,.]+)\s*(?:₺|TL)?$/gm;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(text)) !== null) {
    const name = itemMatch[1].trim();
    const priceStr = itemMatch[2].replace(/\./g, '').replace(',', '.');
    const price = parseFloat(priceStr);
    
    if (!isNaN(price) && price > 0 && price < 100000) {
      data.items.push({
        name: name,
        price: price
      });
    }
  }

  // Ara toplam
  const subtotalPattern = /(?:ARA TOPLAM|TOPLAM|SUBTOTAL)[:\s]*([\d,.]+)/i;
  const subtotalMatch = text.match(subtotalPattern);
  if (subtotalMatch) {
    data.subtotal = parseFloat(subtotalMatch[1].replace(/\./g, '').replace(',', '.'));
  }

  // KDV hesaplama - çok kademeli
  let totalVat = 0;
  
  // %1 KDV
  const vat1Pattern = /(?:KDV\s*%?\s*1\b|%1\s*KDV)[:\s]*([\d,.]+)/gi;
  let vat1Match;
  while ((vat1Match = vat1Pattern.exec(text)) !== null) {
    const amount = parseFloat(vat1Match[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(amount)) totalVat += amount;
  }

  // %10 KDV
  const vat10Pattern = /(?:KDV\s*%?\s*10\b|%10\s*KDV)[:\s]*([\d,.]+)/gi;
  let vat10Match;
  while ((vat10Match = vat10Pattern.exec(text)) !== null) {
    const amount = parseFloat(vat10Match[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(amount)) totalVat += amount;
  }

  // %20 KDV
  const vat20Pattern = /(?:KDV\s*%?\s*20\b|%20\s*KDV)[:\s]*([\d,.]+)/gi;
  let vat20Match;
  while ((vat20Match = vat20Pattern.exec(text)) !== null) {
    const amount = parseFloat(vat20Match[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(amount)) totalVat += amount;
  }

  // Genel KDV (eğer yukarıdakiler bulunamadıysa)
  if (totalVat === 0) {
    const generalVatPattern = /(?:KDV|VAT)[:\s]*([\d,.]+)/i;
    const generalVatMatch = text.match(generalVatPattern);
    if (generalVatMatch) {
      totalVat = parseFloat(generalVatMatch[1].replace(/\./g, '').replace(',', '.'));
    }
  }

  data.vat = totalVat;

  // Toplam tutar
  const totalPattern = /(?:GENEL TOPLAM|TOPLAM|TOTAL|ÖDENECEK)[:\s]*([\d,.]+)/i;
  const totalMatch = text.match(totalPattern);
  if (totalMatch) {
    data.total = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
  }

  // Ödeme yöntemi
  if (text.match(/NAKİT|NAKIT|CASH/i)) {
    data.paymentMethod = 'Nakit';
  } else if (text.match(/KREDİ KARTI|KART|CARD/i)) {
    data.paymentMethod = 'Kredi Kartı';
  }

  // Fiş numarası
  const receiptNumberPattern = /(?:FİŞ NO|BELGE NO|RECEIPT)[:\s]*(\d+)/i;
  const receiptNumberMatch = text.match(receiptNumberPattern);
  if (receiptNumberMatch) {
    data.receiptNumber = receiptNumberMatch[1];
  }

  return data;
}

// Kategori tespit fonksiyonu
function detectCategory(text) {
  const lowerText = text.toLowerCase();
  
  // Kategori anahtar kelimeleri
  const categories = {
    'Yemek': ['restoran', 'restaurant', 'kafe', 'cafe', 'pizza', 'burger', 'yemek', 'lokanta'],
    'Ulaşım': ['taksi', 'taxi', 'uber', 'otobus', 'otobüs', 'metro', 'benzin', 'akaryakıt', 'shell', 'opet', 'bp'],
    'Market': ['market', 'süpermarket', 'migros', 'carrefour', 'a101', 'bim', 'şok'],
    'Eğlence': ['sinema', 'cinema', 'tiyatro', 'konser', 'bilet', 'eğlence'],
    'Sağlık': ['eczane', 'pharmacy', 'hastane', 'hospital', 'doktor', 'klinik'],
    'Giyim': ['mağaza', 'store', 'butik', 'giyim', 'ayakkabı', 'tekstil'],
    'Elektronik': ['teknoloji', 'technology', 'elektronik', 'bilgisayar', 'telefon'],
    'Kırtasiye': ['kırtasiye', 'kitap', 'book', 'kalem', 'defter']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category;
      }
    }
  }

  return 'Diğer';
}

// Z Raporu parse fonksiyonu
function parseZReport(text) {
  const data = {
    date: null,
    time: null,
    totalSales: 0,
    totalVat: 0,
    cashAmount: 0,
    creditCardAmount: 0,
    receiptCount: 0,
    departmentSales: [],
    fiscalNumber: null
  };

  try {
    // Tarih çıkar (DD/MM/YYYY formatı)
    const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split('/');
      data.date = `${year}-${month}-${day}`;
    }

    // Saat çıkar
    const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
    if (timeMatch) {
      data.time = timeMatch[1];
    }

    // Mali belge toplamı (Toplam satış)
    const salesMatch = text.match(/MALI\s*BEL[LI]+E?R?\s*TOP(?:LAMI?)?\s*[*₺]?\s*([\d.,]+)/i);
    if (salesMatch) {
      data.totalSales = parseFloat(salesMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Toplam KDV
    const vatMatch = text.match(/(?:TOPKDV|TOP\s*KDV|TOPLAM\s*KDV)\s*[*₺]?\s*([\d.,]+)/i);
    if (vatMatch) {
      data.totalVat = parseFloat(vatMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Nakit
    const cashMatch = text.match(/(?:NAKIT|NAKİT)\s*[*₺]?\s*([\d.,]+)/i);
    if (cashMatch) {
      data.cashAmount = parseFloat(cashMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Kredi kartı
    const creditMatch = text.match(/(?:KREDI|KREDİ)\s*(?:KART|KARTI)?\s*[*₺]?\s*([\d.,]+)/i);
    if (creditMatch) {
      data.creditCardAmount = parseFloat(creditMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Fiş sayısı
    const receiptCountMatch = text.match(/(?:FIŞ|FIS)\s*(?:SAYISI|ADET)?\s*[:]?\s*(\d+)/i);
    if (receiptCountMatch) {
      data.receiptCount = parseInt(receiptCountMatch[1]);
    }

    // Mali numara
    const fiscalMatch = text.match(/(\d{7})/);
    if (fiscalMatch) {
      data.fiscalNumber = fiscalMatch[1];
    }

  } catch (error) {
    console.error('❌ Z Raporu parse hatası:', error);
  }

  return data;
}

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token bulunamadı' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Geçersiz token' });
    }
    req.user = user;
    next();
  });
};

// ROUTES

// Kayıt
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Bu email zaten kayıtlı' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    const token = jwt.sign(
      { id: result.rows[0].id, email: result.rows[0].email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu' });
  }
});

// Giriş
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Kullanıcı bulunamadı' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Şifre hatalı' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu' });
  }
});

// Fiş upload
app.post('/api/upload', upload.single('receipt'), async (req, res) => {
  try {
    console.log('📥 Upload isteği geldi');
    const userId = req.body.userId;
    console.log('👤 User ID:', userId);

    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    console.log('📁 Dosya:', req.file.filename);

    const compressedImagePath = await compressImage(req.file.path);

    const ocrText = await performOCR(compressedImagePath);
    console.log('📝 OCR Tam Metin:\n', ocrText);

    const parsedData = parseReceipt(ocrText);
    console.log('✅ Parse edilen veri:', parsedData);

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

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

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

// Z Raporu upload
app.post('/api/upload-z-report', upload.single('receipt'), async (req, res) => {
  try {
    console.log('📥 Z Raporu upload isteği geldi');
    const userId = req.body.userId;
    console.log('👤 User ID:', userId);

    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yüklenmedi' });
    }

    console.log('📁 Dosya:', req.file.filename);

    const compressedImagePath = await compressImage(req.file.path);

    const ocrText = await performOCR(compressedImagePath);
    console.log('📝 OCR Tam Metin:\n', ocrText);

    const parsedData = parseZReport(ocrText);
    console.log('✅ Parse edilen Z Raporu verisi:', parsedData);

    const result = await pool.query(
      `INSERT INTO z_reports 
       (user_id, report_date, report_time, total_sales, total_vat, cash_amount, 
        credit_card_amount, receipt_count, image_path, ocr_text, parsed_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
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
        compressedImagePath,
        ocrText,
        JSON.stringify(parsedData)
      ]
    );

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

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

// Fişleri listele
app.get('/api/receipts', async (req, res) => {
  try {
    const userId = req.query.userId;
    console.log('📋 Receipts isteği, User ID:', userId);

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

// Z Raporlarını listele
app.get('/api/z-reports', async (req, res) => {
  try {
    const userId = req.query.userId;
    console.log('📋 Z Reports isteği, User ID:', userId);

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

// Fiş güncelle
app.put('/api/receipts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId;
    const {
      company_name,
      date,
      receipt_number,
      category,
      total,
      vat
    } = req.body;

    // Önce fişin bu kullanıcıya ait olduğunu kontrol et
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

// Fiş sil
app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId;

    const receipt = await pool.query(
      'SELECT * FROM receipts WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (receipt.rows.length === 0) {
      return res.status(404).json({ error: 'Fiş bulunamadı' });
    }

    if (receipt.rows[0].image_path && fs.existsSync(receipt.rows[0].image_path)) {
      fs.unlinkSync(receipt.rows[0].image_path);
    }

    await pool.query('DELETE FROM receipts WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Silme hatası:', error);
    res.status(500).json({ error: 'Fiş silinirken bir hata oluştu' });
  }
});

// Dashboard istatistikleri
app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const userId = req.query.userId;

    const stats = await pool.query(
      `SELECT 
        COUNT(*) as total_receipts,
        COALESCE(SUM(total), 0) as total_amount,
        COALESCE(SUM(vat), 0) as total_vat,
        COUNT(DISTINCT category) as category_count
       FROM receipts 
       WHERE user_id = $1`,
      [userId]
    );

    const categoryStats = await pool.query(
      `SELECT category, COUNT(*) as count, COALESCE(SUM(total), 0) as total
       FROM receipts 
       WHERE user_id = $1 
       GROUP BY category 
       ORDER BY total DESC`,
      [userId]
    );

    res.json({
      ...stats.rows[0],
      categories: categoryStats.rows
    });
  } catch (error) {
    console.error('Stats hatası:', error);
    res.status(500).json({ error: 'İstatistikler alınırken bir hata oluştu' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor`);
});