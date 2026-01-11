const vision = require('@google-cloud/vision');
const path = require('path');

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, '../config/google-vision-key.json')
});

async function detectText(imagePath) {
  try {
    const [result] = await client.textDetection(imagePath);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return {
        success: false,
        message: 'Metne çevrilemedi',
        error: 'Fişte metin bulunamadı. Lütfen daha net bir fotoğraf çekin.'
      };
    }

    // İlk element tüm metni içerir
    const fullText = detections[0].description;

    // Tüm satırları al (daha detaylı parse için)
    const lines = detections.slice(1).map(text => ({
      text: text.description,
      confidence: text.confidence || 0
    }));

    console.log('📝 OCR Tam Metin:\n', fullText);
    console.log('📊 Satır sayısı:', lines.length);
    console.log('📊 Ortalama güven:', 
      (lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length * 100).toFixed(1) + '%'
    );

    return {
      success: true,
      fullText: fullText,
      lines: lines
    };

  } catch (error) {
    console.error('Google Vision API hatası:', error);
    return {
      success: false,
      message: 'OCR işlemi başarısız',
      error: error.message
    };
  }
}

async function detectObjects(imagePath) {
  try {
    const [result] = await client.objectLocalization(imagePath);
    const objects = result.localizedObjectAnnotations;

    return {
      success: true,
      objects: objects.map(object => ({
        name: object.name,
        score: object.score
      }))
    };

  } catch (error) {
    console.error('Object detection hatası:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  detectText,
  detectObjects
};