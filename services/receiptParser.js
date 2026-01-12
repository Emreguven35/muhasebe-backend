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

  // 2. TARİH (GG/AA/YYYY, GG.AA.YYYY, GG-AA-YYYY)
  const datePattern = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4}|\d{2})/;
  let dateLineIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(datePattern);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      data.tarih = `${day}/${month}/${year}`;
      dateLineIndex = i;
      break;
    }
  }

  // 3. FİŞ NO (GELİŞMİŞ ALGORİTMA)
  
  // 3a. Fuzzy matching ile anahtar kelime ara
  const fisKeywords = [
    'FIS NO', 'FİS NO', 'FİŞ NO', 'FIS NUMARASI', 'FİŞ NUMARASI',
    'BELGE NO', 'MAKBUZ NO', 'Z NO', 'Z RAPOR', 'SIRA NO'
  ];
  
  // Tam metin üzerinde fuzzy arama
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
    
    // KDV bulunamadıysa %20 oranından hesapla
    if (!kdvFound) {
      const kdv20 = total - (total / 1.20);
      data.kdv20 = kdv20.toFixed(2);
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