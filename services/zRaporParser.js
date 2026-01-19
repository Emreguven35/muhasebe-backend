const { analyzeImage } = require('./googleVision');

function parseDecimal(text) {
  if (!text) return '0.00';
  
  let cleaned = text.replace(/[^\d,\.]/g, '');
  
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  
  const value = parseFloat(cleaned);
  return isNaN(value) ? '0.00' : value.toFixed(2);
}

async function parseZRapor(imagePath) {
  const text = await analyzeImage(imagePath);
  console.log('📝 Z Raporu OCR metni:', text);
  
  const data = {
    tarih: '',
    fisNo: '',
    raporNo: '',
    toplamSatis: '0.00',
    toplamKdv: '0.00',
    matrah: '0.00',
    kdv1: '0.00',
    kdv10: '0.00',
    kdv20: '0.00',
    krediliSatis: '0.00',
    posSatis: '0.00',
    nakitSatis: '0.00'
  };
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // 1. TARİH
  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
    if (dateMatch) {
      let [, day, month, year] = dateMatch;
      if (year.length === 2) year = '20' + year;
      data.tarih = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      console.log('📅 Tarih:', data.tarih);
      break;
    }
  }
  
  // 2. Z NO / RAPOR NO
  for (const line of lines) {
    const zMatch = line.match(/Z\s*NO?[:\s#]*(\d+)/i);
    if (zMatch) {
      data.raporNo = zMatch[1];
      console.log('📊 Rapor No:', data.raporNo);
      break;
    }
  }
  
  // 3. FİŞ NO
  for (const line of lines) {
    const fisMatch = line.match(/F[IİÎ][SŞ]\s*NO?[:\s#]*(\d+)/i);
    if (fisMatch) {
      data.fisNo = fisMatch[1];
      console.log('🧾 Fiş No:', data.fisNo);
      break;
    }
  }
  
  // 4. SATIŞ TUTARLARI
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();
    
    // NAKİT
    if ((upper.includes('NAKİT') || upper.includes('NAKIT')) && 
        !upper.includes('İADE') && !upper.includes('İPTAL')) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.nakitSatis = parseDecimal(match[1]);
          console.log('💵 Nakit:', data.nakitSatis);
          break;
        }
      }
    }
    
    // POS / KART
    if ((upper.includes('POS') || upper.includes('KART') || upper.includes('KREDİ')) && 
        !upper.includes('İADE') && !upper.includes('İPTAL')) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.posSatis = parseDecimal(match[1]);
          console.log('💳 POS:', data.posSatis);
          break;
        }
      }
    }
    
    // KREDİLİ SATIŞ
    if (upper.includes('KREDİLİ') && upper.includes('SATIŞ')) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.krediliSatis = parseDecimal(match[1]);
          console.log('🏦 Kredili:', data.krediliSatis);
          break;
        }
      }
    }
    
    // TOPLAM SATIŞ
    if ((upper.includes('TOPLAM') || upper.includes('GENEL')) && 
        upper.includes('SATIŞ') && !upper.includes('KDV')) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.toplamSatis = parseDecimal(match[1]);
          console.log('💰 Toplam Satış:', data.toplamSatis);
          break;
        }
      }
    }
    
    // TOPLAM KDV
    if (upper.includes('TOPLAM') && upper.includes('KDV')) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.toplamKdv = parseDecimal(match[1]);
          console.log('📊 Toplam KDV:', data.toplamKdv);
          break;
        }
      }
    }
  }
  
  // 5. KDV ORANLARI
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();
    
    if (/%1[^0]|YÜZDE\s*1[^0]|KDV\s*1[^0]/i.test(upper)) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.kdv1 = parseDecimal(match[1]);
          console.log('📈 KDV %1:', data.kdv1);
          break;
        }
      }
    }
    
    if (/%10|YÜZDE\s*10|KDV\s*10/i.test(upper)) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.kdv10 = parseDecimal(match[1]);
          console.log('📈 KDV %10:', data.kdv10);
          break;
        }
      }
    }
    
    if (/%20|YÜZDE\s*20|KDV\s*20/i.test(upper)) {
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const match = lines[j].match(/(\d{1,3}(?:[,\.]\d{3})*[,\.]\d{2})/);
        if (match) {
          data.kdv20 = parseDecimal(match[1]);
          console.log('📈 KDV %20:', data.kdv20);
          break;
        }
      }
    }
  }
  
  // 6. MATRAH HESAPLA (Toplam Satış - Toplam KDV)
  const toplam = parseFloat(data.toplamSatis);
  const kdv = parseFloat(data.toplamKdv);
  data.matrah = (toplam - kdv).toFixed(2);
  console.log('📊 Matrah:', data.matrah);
  
  console.log('✅ Z Raporu parse edildi:', data);
  return data;
}

module.exports = { parseZRapor };