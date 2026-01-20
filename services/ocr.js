// backend/services/ocr.js
const vision = require('@google-cloud/vision');
const sharp = require('sharp');
const fs = require('fs');

// Google Vision Client
let visionClient;

try {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    // Railway'de JSON string'den oku
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    visionClient = new vision.ImageAnnotatorClient({
      credentials: credentials
    });
    console.log('✅ Google Vision API - JSON credentials yüklendi');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Local'de dosya path'inden oku
    visionClient = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    console.log('✅ Google Vision API - File credentials yüklendi');
  } else {
    console.error('❌ Google Vision credentials bulunamadı!');
    throw new Error('Google Vision credentials eksik');
  }
} catch (error) {
  console.error('❌ Google Vision setup hatası:', error);
}

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

// Geçici dosyayı sil
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  compressImage,
  performOCR,
  deleteFile
};