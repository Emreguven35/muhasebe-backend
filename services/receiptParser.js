// ==========================================
// YARDIMCI FONKSİYONLAR
// ==========================================

// Karakter normalizasyonu - OCR hatalarını düzelt
function normalizeForDigits(text) {
  return text
    .replace(/O/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2');
}

// Fuzzy string matching - Levenshtein distance
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Fuzzy kelime eşleştirme
function fuzzyMatch(text, target, threshold = 2) {
  const words = text.split(/\s+/);
  for (const word of words) {
    if (levenshtein(word.toUpperCase(), target.toUpperCase()) <= threshold) {
      return true;
    }
  }
  return false;
}

// Tarih doğrulama
function isValidDate(day, month, year) {
  let fullYear = year.length === 2 ? '20' + year : year;
  const d = parseInt(day);
  const m = parseInt(month);
  const y = parseInt(fullYear);
  
  // Mantıklı tarih kontrolü
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < 2020 || y > 2026) return false;
  
  // Ay'a göre gün kontrolü
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d > daysInMonth[m - 1]) return false;
  
  return true;
}

// Gelişmiş tarih çıkarma
function extractBestDate(lines) {
  const datePatterns = [
    // Önce SADECE tarih olan satırları ara (başında/sonunda başka şey yok)
    /^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](20\d{2})$/,
    /^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2})$/,
    // Sonra tarih + saat kombinasyonu
    /(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](20\d{2})\s+\d{1,2}:\d{2}/,
    /(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2})\s+\d{1,2}:\d{2}/
  ];
  
  // Öncelik: Alt kısım (%70-100), sonra üst kısım (%0-30)
  const totalLines = lines.length;
  const bottomThird = lines.slice(Math.floor(totalLines * 0.7));
  const topThird = lines.slice(0, Math.floor(totalLines * 0.3));
  const searchOrder = [...bottomThird, ...topThird];
  
  for (let line of searchOrder) {
    // Ürün/fiyat satırlarını atla
    if (/^\d+\s*X\s*\d+|ADET|KG|LT|GRAM/i.test(line)) continue;
    
    // EPDK, NO: içerenleri atla
    if (/EPDK|ADRES|MAH\.|SOK\.|CAD\.|VKN|MERSİS/i.test(line)) continue;
    
    // Boşlukları KALDIRMA - orijinal satırda ara
    let testLine = line.trim();
    
    console.log('🔍 Test edilen satır:', testLine); // DEBUG
    
    for (let pattern of datePatterns) {
      const match = testLine.match(pattern);
      if (match) {
        console.log('🔍 Tarih match bulundu:', match);
        
        let day, month, year;
        
        // ISO format (YYYY-MM-DD) kontrolü
        if (match[0].startsWith('20')) {
          year = match[1];
          month = match[2];
          day = match[3];
        } else {
          day = match[1];
          month = match[2];
          year = match[3];
        }
        
        console.log('🔍 Parse edilen:', { day, month, year });
        console.log('🔍 Validation:', isValidDate(day, month, year));
        
        if (isValidDate(day, month, year)) {
          console.log('✅ Geçerli tarih bulundu!');
          
          // Yıl formatını düzenle
          if (year.length === 2) year = '20' + year;
          
          return {
            formatted: `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`,
            day: parseInt(day),
            month: parseInt(month),
            year: parseInt(year)
          };
        } else {
          console.log('❌ Tarih geçersiz, devam ediliyor...');
        }
      }
    }
  }
  
  console.log('❌ Hiçbir geçerli tarih bulunamadı');
  return null;
}

// ==========================================
// ANA PARSE FONKSİYONU
// ==========================================

function parseReceipt(text) {
  const data = {
    firmaUnvani: '',
    tarih: '',
    fisNo: '',
    toplamTutar: '',
    kdv1: '0',
    kdv10: '0',
    kdv20: '0',
    giderCinsi: 'DİĞER'
  };

  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const fullContent = text.toUpperCase();

  // 1. FİRMA UNVANI (İlk 5 satırda büyük harfli, sayı içermeyen)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    const upperRatio = (line.match(/[A-ZÇĞİÖŞÜ]/g) || []).length / line.length;
    if (upperRatio > 0.5 && !/\d{2}/.test(line) && line.length > 3) {
      data.firmaUnvani = line;
      break;
    }
  }

  // 2. TARİH (GELİŞMİŞ ALGORİTMA)
  const dateResult = extractBestDate(lines);
  let dateLineIndex = -1;

  if (dateResult) {
    data.tarih = dateResult.formatted;
    
    // Tarih satırının index'ini bul (fiş no için kullanılacak)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(dateResult.day.toString()) && 
          lines[i].includes(dateResult.month.toString())) {
        dateLineIndex = i;
        break;
      }
    }
    
    console.log('📅 Tespit edilen tarih:', data.tarih);
  }

  // 3. FİŞ NO (GELİŞMİŞ ALGORİTMA)
  
  // 3a. Fuzzy matching ile anahtar kelime ara
  const fisPatterns = [
    /(?:F[IİÎ][SŞ]\s*NO?|F[IİÎ][SŞ]\s*NUMARAS[IİÎ])[:\s#\-]*([0-9\/\-]{3,10})/i,
    /(?:BELGE\s*NO?|MAKBUZ\s*NO?)[:\s#\-]*([0-9\/\-]{3,10})/i,
    /(?:Z\s*NO?|Z\s*RAPOR)[:\s#\-]*([0-9\/\-]{3,10})/i,
    /(?:SIRA\s*NO?)[:\s#\-]*([0-9\/\-]{3,10})/i
  ];

  for (const pattern of fisPatterns) {
    const match = fullContent.match(pattern);
    if (match) {
      data.fisNo = normalizeForDigits(match[1]);
      break;
    }
  }

  // 3b. Tarih satırının yakınındaki sayılara bak (±2 satır)
  if (!data.fisNo && dateLineIndex !== -1) {
    const searchRange = [
      ...lines.slice(Math.max(0, dateLineIndex - 2), dateLineIndex),
      ...lines.slice(dateLineIndex + 1, Math.min(lines.length, dateLineIndex + 3))
    ];
    
    for (const line of searchRange) {
      // MERNİS, VKN, TCKN içerenleri atla
      if (/MERNİS|MERNIS|VKN|TCKN|TC\s*KİMLİK|VERGİ|DAIRE/i.test(line)) {
        continue;
      }
      
      // Fuzzy match ile "FİŞ" kelimesi geçiyorsa
      if (fuzzyMatch(line, 'FIS', 2) || fuzzyMatch(line, 'BELGE', 2)) {
        const numMatch = line.match(/([0-9\/\-]{3,10})/);
        if (numMatch) {
          data.fisNo = normalizeForDigits(numMatch[1]);
          break;
        }
      }
    }
  }

  // 3c. Son çare: İlk 10 satırda, kısıtlamalarla sayı ara
  if (!data.fisNo) {
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i];
      
      // Ürün/fiyat satırlarını atla (TL, ₺, virgül içerenler)
      if (/TL|₺|,\d{2}/.test(line)) continue;
      
      // MERNİS, VKN vb. atla
      if (/MERNİS|MERNIS|VKN|TCKN|TC\s*KİMLİK|VERGİ|DAIRE/i.test(line)) continue;
      
      // 4-8 haneli sayı bul (çok uzun olanlar VKN olabilir)
      const match = line.match(/\b(\d{4,8})\b/);
      if (match) {
        data.fisNo = normalizeForDigits(match[1]);
        break;
      }
    }
  }

  // 4. TOPLAM TUTAR (En büyük sayı genellikle toplam)
  const totalPatterns = [
    /(?:TOPLAM|GENEL|ÖDENECEK|TOTAL|TUTAR|NAKİT|KREDİ\s*KART)[:\s]*(\d+[,\.]\d{2})/i,
    /(?:TOPLAM|GENEL|ÖDENECEK)[:\s]*TL[:\s]*(\d+[,\.]\d{2})/i,
    /(\d+[,\.]\d{2})\s*(?:TL|₺)/,
    /(?:ALACAK|ÖDENDİ)[:\s]*(\d+[,\.]\d{2})/i
  ];

  let maxAmount = 0;
  let foundTotal = false;

  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(',', '.'));
        if (amount > maxAmount) {
          maxAmount = amount;
          data.toplamTutar = amount.toFixed(2);
          foundTotal = true;
        }
      }
    }
  }

  // Toplam bulunamadıysa en büyük tutarı al (ürün fiyatlarından ayır)
  if (!foundTotal) {
    const amounts = [];
    for (const line of lines) {
      const matches = line.match(/(\d+[,\.]\d{2})/g);
      if (matches) {
        matches.forEach(amt => {
          const amount = parseFloat(amt.replace(',', '.'));
          if (amount > 1 && amount < 10000) { // Makul aralık
            amounts.push(amount);
          }
        });
      }
    }
    
    // En büyük 3 tutarın ortalamasına yakın olanı al (genelde toplam en büyüktür)
    if (amounts.length > 0) {
      amounts.sort((a, b) => b - a);
      data.toplamTutar = amounts[0].toFixed(2);
    }
  }

  // 5. KDV HESAPLAMA
  if (data.toplamTutar) {
    const total = parseFloat(data.toplamTutar);
    
    // Metinde KDV kelimesi ara
    let kdvFound = false;
    for (const line of lines) {
      if (/KDV|KDVLI|K\.D\.V/i.test(line)) {
        const kdvMatch = line.match(/(\d+[,\.]\d{2})/);
        if (kdvMatch) {
          const kdvAmount = parseFloat(kdvMatch[1].replace(',', '.'));
          
          // KDV oranını tahmin et
          const ratio = (kdvAmount / total) * 100;
          if (ratio > 15 && ratio < 25) {
            data.kdv20 = kdvAmount.toFixed(2);
          } else if (ratio > 8 && ratio < 12) {
            data.kdv10 = kdvAmount.toFixed(2);
          } else if (ratio > 0.5 && ratio < 2) {
            data.kdv1 = kdvAmount.toFixed(2);
          }
          kdvFound = true;
          break;
        }
      }
    }
    
    // KDV bulunamadıysa akıllı tahmin
    if (!kdvFound) {
      // Metinde KDV oranı geçiyor mu? (%1, %10, %20)
      let kdvRate = 20; // Default
      
      if (/%10|YÜZDE\s*10|KDV\s*10/i.test(fullContent)) {
        kdvRate = 10;
      } else if (/%1[^0]|YÜZDE\s*1[^0]|KDV\s*1[^0]/i.test(fullContent)) {
        kdvRate = 1;
      } else if (/%20|YÜZDE\s*20|KDV\s*20/i.test(fullContent)) {
        kdvRate = 20;
      } else {
        // Oran belirtilmemişse toplam tutardan tahmin et
        // Türkiye'de yaygın KDV oranları: %1, %10, %20
        // En küçük farkı veren oranı seç
        const estimations = [
          { rate: 1, kdv: total - (total / 1.01) },
          { rate: 10, kdv: total - (total / 1.10) },
          { rate: 20, kdv: total - (total / 1.20) }
        ];
        
        // KDV tutarları metinde aranabilir - en yakın olanı bul
        let bestMatch = estimations[2]; // Default %20
        let minDiff = Infinity;
        
        for (const est of estimations) {
          // Metinde bu KDV tutarına yakın bir sayı var mı?
          for (const line of lines) {
            const amounts = line.match(/(\d+[,\.]\d{2})/g);
            if (amounts) {
              amounts.forEach(amt => {
                const amount = parseFloat(amt.replace(',', '.'));
                const diff = Math.abs(amount - est.kdv);
                if (diff < minDiff && diff < est.kdv * 0.1) { // %10 tolerans
                  minDiff = diff;
                  bestMatch = est;
                }
              });
            }
          }
        }
        
        kdvRate = bestMatch.rate;
      }
      
      // KDV'yi doğru alana yaz
      const kdvAmount = total - (total / (1 + kdvRate / 100));
      
      if (kdvRate === 1) {
        data.kdv1 = kdvAmount.toFixed(2);
      } else if (kdvRate === 10) {
        data.kdv10 = kdvAmount.toFixed(2);
      } else {
        data.kdv20 = kdvAmount.toFixed(2);
      }
      
      console.log(`📊 Tespit edilen KDV oranı: %${kdvRate}`);
    }
  }

  // 6. GİDER CİNSİ BELİRLE
  const textUpper = text.toUpperCase();
  if (textUpper.includes('OTOPARK') || textUpper.includes('PARK')) {
    data.giderCinsi = 'OTOPARK';
  } else if (textUpper.includes('MARKET') || textUpper.includes('SÜPERMARKET') || textUpper.includes('GIDA')) {
    data.giderCinsi = 'MARKET';
  } else if (textUpper.includes('RESTORAN') || textUpper.includes('KAFE') || textUpper.includes('YİYECEK') || textUpper.includes('LOKANTA')) {
    data.giderCinsi = 'YİYECEK';
  } else if (textUpper.includes('YAKIT') || textUpper.includes('PETROL') || textUpper.includes('BENZİN') || textUpper.includes('MOTORIN')) {
    data.giderCinsi = 'YAKIT';
  } else if (textUpper.includes('TAKSI') || textUpper.includes('UBER') || textUpper.includes('ULAŞIM')) {
    data.giderCinsi = 'ULAŞIM';
  }

  console.log('✅ Parse sonucu:', data);
  
  return data;
}

module.exports = { parseReceipt };