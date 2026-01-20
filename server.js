// backend/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
const authRoutes = require('./routes/auth');
const receiptsRoutes = require('./routes/receipts');
const zreportsRoutes = require('./routes/zreports');

// Auth routes
app.use('/api', authRoutes);

// Receipt routes (upload dahil)
app.use('/api/receipts', receiptsRoutes);

// Z-report routes (upload dahil)
app.use('/api/z-reports', zreportsRoutes);

// BU SATIRLARI KALDIR (tekrar tanımlıyoruz):
// app.post('/api/upload', receiptsRoutes);
// app.post('/api/upload-z-report', zreportsRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Muhasebe OCR API çalışıyor',
    version: '2.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Bulunamayan endpoint:', req.method, req.path);
  res.status(404).json({ error: 'Endpoint bulunamadı' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server hatası:', err);
  res.status(500).json({ 
    error: 'Sunucu hatası',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} portunda çalışıyor`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});