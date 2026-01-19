const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./services/database');
const zRaporRoutes = require('./routes/zrapor');

dotenv.config();
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('📁 uploads klasörü oluşturuldu');
}

// CORS ayarları - Frontend domain'ini ekle
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://muhasebe-frontend.vercel.app',
    'https://muhasebe-frontend-git-main-emres-projects-d36e6720.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/zrapor', zRaporRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Muhasebe OCR API çalışıyor! 🚀' });
});

// AUTH ROUTES
app.post('/api/auth/login', async (req, res) => {
  console.log('📥 Login isteği:', req.body);
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.log('❌ Email veya şifre eksik');
      return res.status(400).json({ message: 'Email ve şifre gerekli' });
    }
    
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log('👤 Kullanıcı sorgusu:', result.rows.length, 'kullanıcı bulundu');
    
    if (result.rows.length === 0) {
      console.log('❌ Kullanıcı bulunamadı');
      return res.status(401).json({ message: 'Email veya şifre hatalı' });
    }
    
    const user = result.rows[0];
    console.log('👤 Bulunan kullanıcı:', user.email, 'ID:', user.id);
    console.log('🔐 Hash:', user.password.substring(0, 20) + '...');
    
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('🔐 Şifre eşleşmesi:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Şifre yanlış');
      return res.status(401).json({ message: 'Email veya şifre hatalı' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login başarılı, token oluşturuldu');
    
    res.json({ 
      success: true, 
      message: 'Giriş başarılı', 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name 
      } 
    });
  } catch (error) {
    console.error('❌ Login hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  console.log('📥 Register isteği:', req.body);
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Tüm alanlar gerekli' });
    }
    
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'Bu email zaten kayıtlı' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    console.log('🔐 Şifre hashlendi:', hashedPassword.substring(0, 20) + '...');
    
    const result = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, hashedPassword, name]
    );
    
    const user = result.rows[0];
    
    const token = jwt.sign(
      { userId: user.id, email: user.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    console.log('✅ Kayıt başarılı, kullanıcı ID:', user.id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Kayıt başarılı', 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name 
      } 
    });
  } catch (error) {
    console.error('❌ Register hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Token bulunamadı' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }
    
    res.json({ 
      success: true, 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('❌ Profile hatası:', error);
    res.status(401).json({ message: 'Geçersiz token' });
  }
});

// OCR routes
const ocrRoutes = require('./routes/ocr');
app.use('/api/ocr', ocrRoutes);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor`);
});

// Hata yakalama
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});