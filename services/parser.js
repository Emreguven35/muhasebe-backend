// backend/services/parser.js

// ==========================================
// FİŞ PARSE FONKSİYONU - GELİŞMİŞ VERSİYON
// ==========================================
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

  // 1. KATEGORİ TESPİTİ (önce yapılmalı)
  data.category = detectCategory(text);

  // 2. ŞİRKET ADI (ilk anlamlı satır)
  data.companyName = extractCompanyName(lines, text);

  // 3. ADRES
  data.address = extractAddress(text);

  // 4. VERGİ DAİRESİ
  data.taxOffice = extractTaxOffice(text);

  // 5. VERGİ NUMARASI
  data.taxNumber = extractTaxNumber(text);

  // 6. TARİH
  data.date = extractDate(text);

  // 7. SAAT
  data.time = extractTime(text);

  // 8. FİŞ NUMARASI
  data.receiptNumber = extractReceiptNumber(text);

  // 9. ÖDEME YÖNTEMİ
  data.paymentMethod = extractPaymentMethod(text);

  // 10. TOPLAM TUTAR (en önemli!)
  data.total = extractTotal(text);

  // 11. KDV
  data.vat = extractVAT(text, data.total);

  // 12. ARA TOPLAM
  data.subtotal = extractSubtotal(text, data.total, data.vat);

  // 13. ÜRÜNLER
  data.items = extractItems(text, data.total);

  return data;
}

// ==========================================
// KATEGORİ TESPİT FONKSİYONU
// ==========================================
function detectCategory(text) {
  const lowerText = text.toLowerCase();
  
  const categories = {
    'Akaryakıt': [
      'petrol', 'opet', 'shell', 'bp', 'total', 'benzin', 'motorin', 'dizel',
      'lpg', 'akaryakıt', 'fuel', 'pompa', 'litre', 'lt', 'mazot', 'eurodizel',
      'İPRAGAZ', 'ipragaz', 'PETROL OFİSİ', 'petrol ofisi', 'aytemiz', 'kalyon',
      'türkiye petrolleri', 'turkiye petrolleri', 'PO ', 'M-OİL', 'm-oil'
    ],
    'Market': [
      'market', 'süpermarket', 'migros', 'carrefour', 'a101', 'bim', 'şok',
      'sok ', 'hakmar', 'file', 'macro', 'metro', 'kipa', 'özdilek', 'gratis',
      'watsons', 'rossmann', 'eve', 'happy center', 'tansaş', 'endi'
    ],
    'Yemek': [
      'restoran', 'restaurant', 'kafe', 'cafe', 'kahve', 'coffee', 'pizza',
      'burger', 'kebap', 'kebab', 'döner', 'doner', 'lokanta', 'yemek',
      'mutfak', 'kitchen', 'starbucks', 'mcdonalds', 'burger king', 'kfc',
      'popeyes', 'dominos', 'little caesars', 'sbarro', 'tavuk', 'chicken',
      'simit', 'börek', 'borek', 'pastane', 'fırın', 'firin', 'bakery'
    ],
    'Ulaşım': [
      'taksi', 'taxi', 'uber', 'otobus', 'otobüs', 'metro', 'tramvay',
      'vapur', 'ferry', 'bilet', 'ticket', 'otopark', 'parking', 'hgs',
      'ogs', 'köprü', 'kopru', 'geçiş', 'gecis', 'otoyol'
    ],
    'Sağlık': [
      'eczane', 'pharmacy', 'hastane', 'hospital', 'doktor', 'klinik',
      'clinic', 'medikal', 'medical', 'sağlık', 'saglik', 'ilaç', 'ilac',
      'dişçi', 'diş', 'dis', 'göz', 'goz', 'kulak', 'laboratuvar'
    ],
    'Eğlence': [
      'sinema', 'cinema', 'tiyatro', 'konser', 'bilet', 'eğlence', 'eglence',
      'bowling', 'bilardo', 'oyun', 'game', 'lunapark', 'aquapark', 'müze', 'muze'
    ],
    'Giyim': [
      'mağaza', 'magaza', 'store', 'butik', 'giyim', 'ayakkabı', 'ayakkabi',
      'tekstil', 'moda', 'fashion', 'lcw', 'lc waikiki', 'koton', 'defacto',
      'mavi', 'colins', 'vakko', 'beymen', 'network', 'ipekyol', 'adidas', 'nike'
    ],
    'Elektronik': [
      'teknoloji', 'technology', 'elektronik', 'bilgisayar', 'computer',
      'telefon', 'phone', 'tablet', 'laptop', 'teknosa', 'media markt',
      'vatan', 'darty', 'apple', 'samsung', 'huawei', 'xiaomi'
    ],
    'Kırtasiye': [
      'kırtasiye', 'kirtasiye', 'kitap', 'book', 'kalem', 'defter', 'okul',
      'school', 'ofis', 'office', 'd&r', 'dr ', 'remzi', 'pandora'
    ],
    'Konaklama': [
      'otel', 'hotel', 'motel', 'pansiyon', 'apart', 'konaklama', 'booking',
      'hostel', 'resort', 'tatil', 'holiday'
    ],
    'Hizmet': [
      'kuaför', 'kuafor', 'berber', 'barber', 'güzellik', 'guzellik', 'spa',
      'masaj', 'massage', 'kuru temizleme', 'çamaşır', 'camasir', 'terzi'
    ]
  };

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }

  return 'Diğer';
}

// ==========================================
// ŞİRKET ADI ÇIKARMA
// ==========================================
function extractCompanyName(lines, text) {
  // İlk anlamlı satırı bul (boş olmayan, çok kısa olmayan)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // En az 3 karakter, sayı ile başlamayan
    if (line.length >= 3 && !/^\d+$/.test(line) && !/^[0-9\s\-\.\:\/]+$/.test(line)) {
      // Tarih veya saat satırı değilse
      if (!/^\d{2}[\.\/-]\d{2}[\.\/-]\d{2,4}/.test(line) && !/^\d{2}:\d{2}/.test(line)) {
        return line;
      }
    }
  }
  return lines[0] || null;
}

// ==========================================
// ADRES ÇIKARMA
// ==========================================
function extractAddress(text) {
  const patterns = [
    /(?:ADRES|ADR|ADDRESS)[:\s]*(.*?)(?=\n|VERGİ|TAX|TEL|$)/i,
    /(?:MAH\.?|MAHALLESİ|MAHALLESI)[^,\n]*(?:CAD\.?|CADDE|SOK\.?|SOKAK|SK\.?)[^,\n]*/i,
    /(?:NO|NUMARA)[:\s]*\d+[^,\n]*/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] ? match[1].trim() : match[0].trim();
    }
  }
  return null;
}

// ==========================================
// VERGİ DAİRESİ ÇIKARMA
// ==========================================
function extractTaxOffice(text) {
  const patterns = [
    /(?:VERGİ DAİRESİ|V\.?D\.?|VD)[:\s\-]*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?=\s*[-\d]|\n|VER|$)/i,
    /([A-ZÇĞİÖŞÜ]+)\s+(?:VERGİ|V\.?D\.?)/i,
    /([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s+VERGI\s+DA/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const office = match[1].trim();
      if (office.length >= 2 && office.length <= 50) {
        return office;
      }
    }
  }
  return null;
}

// ==========================================
// VERGİ NUMARASI ÇIKARMA
// ==========================================
function extractTaxNumber(text) {
  const patterns = [
    /(?:VERGİ\s*NO|V\.?NO|VNO|VERGI\s*NUMARASI|VKN|TCKN)[:\s\-]*(\d{10,11})/i,
    /(?:VD|V\.D\.?)[:\s\-]*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+[:\s\-]*(\d{10,11})/i,
    /(\d{10,11})(?=\s*VD|\s*V\.D\.?)/i,
    /[-](\d{10,11})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = match[1].replace(/[-\s]/g, '');
      if (num.length === 10 || num.length === 11) {
        return num;
      }
    }
  }
  return null;
}

// ==========================================
// TARİH ÇIKARMA
// ==========================================
function extractDate(text) {
  const patterns = [
    // DD/MM/YYYY veya DD.MM.YYYY
    /(?:TARİH|TARIH|DATE)[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
    /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/,
    // DD/MM/YY
    /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{2})(?!\d)/,
    // YYYY-MM-DD
    /(\d{4})[\/\.\-](\d{2})[\/\.\-](\d{2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let day, month, year;
      
      if (match[1].length === 4) {
        // YYYY-MM-DD formatı
        year = match[1];
        month = match[2];
        day = match[3];
      } else {
        day = match[1];
        month = match[2];
        year = match[3];
        
        // 2 haneli yıl
        if (year.length === 2) {
          year = '20' + year;
        }
      }
      
      // Geçerlilik kontrolü
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }
  return null;
}

// ==========================================
// SAAT ÇIKARMA
// ==========================================
function extractTime(text) {
  const patterns = [
    /(?:SAAT|TIME)[:\s]*(\d{2})[:\.](\d{2})(?:[:\.](\d{2}))?/i,
    /(\d{2})[:\.](\d{2})[:\.](\d{2})/,
    /(\d{2})[:\.](\d{2})(?!\d)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return `${match[1]}:${match[2]}`;
      }
    }
  }
  return null;
}

// ==========================================
// FİŞ NUMARASI ÇIKARMA
// ==========================================
function extractReceiptNumber(text) {
  const patterns = [
    /(?:FİŞ\s*NO|FIS\s*NO|BELGE\s*NO|RECEIPT|FATURA\s*NO|SERİ\s*NO)[:\s#]*([A-Z0-9\-]+)/i,
    /(?:NO|NUMARA)[:\s#]*(\d{4,})/i,
    /Z\s*NO[:\s]*(\d+)/i,
    /EKÜ\s*NO[:\s]*(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

// ==========================================
// ÖDEME YÖNTEMİ ÇIKARMA
// ==========================================
function extractPaymentMethod(text) {
  const upperText = text.toUpperCase();
  
  if (upperText.match(/KREDİ\s*KART|KREDI\s*KART|CREDIT\s*CARD|VISA|MASTER|TROY|BANKA\s*KART|BANKAKARTI|\*{4}\s*\*{4}|\d{4}\s*\*{4}/)) {
    return 'Kredi Kartı';
  }
  if (upperText.match(/NAKİT|NAKIT|CASH|PEŞİN|PESIN/)) {
    return 'Nakit';
  }
  if (upperText.match(/YEMEK\s*KART|SODEXO|MULTINET|TICKET|SETCARD|METROPOL/)) {
    return 'Yemek Kartı';
  }
  if (upperText.match(/TEMASSIZ|CONTACTLESS|NFC/)) {
    return 'Temassız';
  }
  
  return null;
}

// ==========================================
// TOPLAM TUTAR ÇIKARMA - EN ÖNEMLİ!
// ==========================================
function extractTotal(text) {
  // Önce en spesifik pattern'leri dene
  const patterns = [
    // TOPLAM, GENEL TOPLAM vs.
    /(?:GENEL\s*TOPLAM|TOPLAM\s*TUTAR|TOPLAM|TOTAL|NET\s*TUTAR|ÖDENECEK|ODENECEK|TUTAR)[:\s*#₺TL]*([\d.,]+)/gi,
    // İŞLEM TUTARI (POS slipleri için)
    /(?:İŞLEM\s*TUTARI|ISLEM\s*TUTARI|İŞLEM\s*TUTAR)[:\s*₺TL]*([\d.,]+)/gi,
    // SATIŞ TUTARI
    /(?:SATIŞ\s*TUTARI|SATIS\s*TUTARI)[:\s*₺TL]*([\d.,]+)/gi,
    // Sadece büyük tutarlar (1000+ formatında: 1.234,56)
    /(?:^|\s)([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})(?:\s*(?:TL|₺))?/gm,
    // Daha basit format: 123,45 veya 123.45
    /(?:^|\s)([\d]+[,.][\d]{2})(?:\s*(?:TL|₺))?/gm
  ];

  let maxTotal = 0;
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const totalStr = match[1]
        .replace(/\./g, '')  // Binlik ayracı kaldır
        .replace(',', '.');   // Ondalık virgülü noktaya çevir
      
      const total = parseFloat(totalStr);
      
      // Geçerli ve mantıklı bir tutar mı?
      if (!isNaN(total) && total > 0 && total < 1000000) {
        // Daha yüksek tutarı al (genelde toplam en yüksek değerdir)
        if (total > maxTotal) {
          maxTotal = total;
        }
      }
    }
  }

  // Eğer hala 0 ise, TL/₺ ile biten sayıları ara
  if (maxTotal === 0) {
    const tlPattern = /([\d.,]+)\s*(?:TL|₺)/gi;
    let match;
    while ((match = tlPattern.exec(text)) !== null) {
      const totalStr = match[1]
        .replace(/\./g, '')
        .replace(',', '.');
      
      const total = parseFloat(totalStr);
      if (!isNaN(total) && total > maxTotal && total < 1000000) {
        maxTotal = total;
      }
    }
  }

  return maxTotal;
}

// ==========================================
// KDV ÇIKARMA
// ==========================================
function extractVAT(text, total) {
  let totalVat = 0;

  // Çoklu KDV oranları
  const vatPatterns = [
    // %1 KDV
    { pattern: /(?:KDV\s*%?\s*1(?:\s|$)|%1\s*KDV|TOPKDV\s*%?\s*1)[:\s*₺TL]*([\d.,]+)/gi, rate: 1 },
    // %8 KDV
    { pattern: /(?:KDV\s*%?\s*8(?:\s|$)|%8\s*KDV|TOPKDV\s*%?\s*8)[:\s*₺TL]*([\d.,]+)/gi, rate: 8 },
    // %10 KDV
    { pattern: /(?:KDV\s*%?\s*10(?:\s|$)|%10\s*KDV|TOPKDV\s*%?\s*10)[:\s*₺TL]*([\d.,]+)/gi, rate: 10 },
    // %18 KDV
    { pattern: /(?:KDV\s*%?\s*18(?:\s|$)|%18\s*KDV|TOPKDV\s*%?\s*18)[:\s*₺TL]*([\d.,]+)/gi, rate: 18 },
    // %20 KDV
    { pattern: /(?:KDV\s*%?\s*20(?:\s|$)|%20\s*KDV|TOPKDV\s*%?\s*20)[:\s*₺TL]*([\d.,]+)/gi, rate: 20 }
  ];

  for (const { pattern } of vatPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const vatStr = match[1]
        .replace(/\./g, '')
        .replace(',', '.');
      const vat = parseFloat(vatStr);
      if (!isNaN(vat) && vat > 0) {
        totalVat += vat;
      }
    }
  }

  // Genel KDV pattern'i (eğer yukarıdakiler bulunamadıysa)
  if (totalVat === 0) {
    const generalPatterns = [
      /(?:KDV|TOPLAM\s*KDV|TOP\.?\s*KDV|TOPKDV)[:\s*₺TL]*([\d.,]+)/gi,
      /(?:VAT|TAX)[:\s*₺TL]*([\d.,]+)/gi
    ];

    for (const pattern of generalPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const vatStr = match[1]
          .replace(/\./g, '')
          .replace(',', '.');
        const vat = parseFloat(vatStr);
        if (!isNaN(vat) && vat > 0 && vat < total) {
          totalVat += vat;
        }
      }
    }
  }

  // Hala 0 ise ve toplam varsa, %18 veya %20 hesapla (akaryakıt için %20)
  if (totalVat === 0 && total > 0) {
    // Tahmini KDV hesaplama yapmıyoruz, 0 döndür
  }

  return totalVat;
}

// ==========================================
// ARA TOPLAM ÇIKARMA
// ==========================================
function extractSubtotal(text, total, vat) {
  const patterns = [
    /(?:ARA\s*TOPLAM|SUBTOTAL|ARA\s*TUTAR)[:\s*₺TL]*([\d.,]+)/gi
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const subtotalStr = match[1]
        .replace(/\./g, '')
        .replace(',', '.');
      const subtotal = parseFloat(subtotalStr);
      if (!isNaN(subtotal) && subtotal > 0) {
        return subtotal;
      }
    }
  }

  // Ara toplam bulunamadıysa, toplam - kdv
  if (total > 0 && vat > 0) {
    return total - vat;
  }

  return 0;
}

// ==========================================
// ÜRÜNLER ÇIKARMA
// ==========================================
function extractItems(text, total) {
  const items = [];
  const lines = text.split('\n');
  
  // Ürün satırı pattern'leri
  const itemPatterns = [
    // Ürün adı + miktar + fiyat
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*[xX*]\s*([\d.,]+)$/,
    // Ürün adı + fiyat (sonda)
    /^(.+?)\s+([\d.,]+)\s*(?:TL|₺)?$/,
    // *Ürün adı + fiyat
    /^\*(.+?)\s+([\d.,]+)$/
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length < 3) continue;
    
    // Toplam, KDV gibi satırları atla
    if (/TOPLAM|KDV|TUTAR|NAKİT|KREDİ|KART|FİŞ|BELGE|TARİH|SAAT/i.test(trimmedLine)) {
      continue;
    }

    for (const pattern of itemPatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const name = match[1].trim();
        const priceStr = (match[3] || match[2])
          .replace(/\./g, '')
          .replace(',', '.');
        const price = parseFloat(priceStr);

        // Geçerli ürün mü?
        if (name.length >= 2 && !isNaN(price) && price > 0 && price < total * 0.9) {
          // Aynı isimde ürün yoksa ekle
          if (!items.find(item => item.name === name)) {
            items.push({ name, price });
          }
        }
        break;
      }
    }
  }

  return items;
}

// ==========================================
// Z RAPORU PARSE FONKSİYONU
// ==========================================
function parseZReport(text) {
  const data = {
    date: null,
    time: null,
    totalSales: 0,
    totalVat: 0,
    cashAmount: 0,
    creditCardAmount: 0,
    receiptCount: 0,
    fiscalNumber: null
  };

  try {
    // TARİH
    const datePatterns = [
      /(?:TARİH|TARIH|DATE)[:\s]*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
      /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        data.date = `${match[3]}-${match[2]}-${match[1]}`;
        break;
      }
    }

    // SAAT
    const timeMatch = text.match(/(\d{2})[:\.](\d{2})(?:[:\.](\d{2}))?/);
    if (timeMatch) {
      data.time = `${timeMatch[1]}:${timeMatch[2]}`;
    }

    // TOPLAM SATIŞ
    const salesPatterns = [
      /(?:GÜNLÜK\s*TOPLAM|GUNLUK\s*TOPLAM|GÜNLÜK\s*SATIŞ|MALI\s*BEL[İI]?R?\s*TOP(?:LAMI?)?|GENEL\s*TOPLAM|NET\s*SATIŞ)[:\s*₺TL]*([\d.,]+)/gi,
      /(?:TOPLAM\s*SATIŞ|TOTAL\s*SALES)[:\s*₺TL]*([\d.,]+)/gi
    ];
    
    for (const pattern of salesPatterns) {
      const match = pattern.exec(text);
      if (match) {
        data.totalSales = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        break;
      }
    }

    // TOPLAM KDV
    const vatPatterns = [
      /(?:TOPKDV|TOP\.?\s*KDV|TOPLAM\s*KDV)[:\s*₺TL]*([\d.,]+)/gi,
      /(?:KDV\s*TOPLAMI)[:\s*₺TL]*([\d.,]+)/gi
    ];
    
    for (const pattern of vatPatterns) {
      const match = pattern.exec(text);
      if (match) {
        data.totalVat = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        break;
      }
    }

    // NAKİT
    const cashPatterns = [
      /(?:NAKİT|NAKIT|CASH)[:\s*₺TL]*([\d.,]+)/gi
    ];
    
    for (const pattern of cashPatterns) {
      const match = pattern.exec(text);
      if (match) {
        data.cashAmount = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        break;
      }
    }

    // KREDİ KARTI
    const creditPatterns = [
      /(?:KREDİ\s*KART|KREDI\s*KART|K\.?\s*KART|CREDIT)[:\s*₺TL]*([\d.,]+)/gi
    ];
    
    for (const pattern of creditPatterns) {
      const match = pattern.exec(text);
      if (match) {
        data.creditCardAmount = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        break;
      }
    }

    // FİŞ SAYISI
    const receiptCountPatterns = [
      /(?:FİŞ\s*SAYISI|FIS\s*SAYISI|FİŞ\s*ADET|BELGE\s*SAYISI)[:\s]*(\d+)/gi,
      /(\d+)\s*(?:FİŞ|FIS|ADET)/gi
    ];
    
    for (const pattern of receiptCountPatterns) {
      const match = pattern.exec(text);
      if (match) {
        data.receiptCount = parseInt(match[1]);
        break;
      }
    }

    // MALİ NUMARA / Z NO
    const fiscalPatterns = [
      /(?:Z\s*NO|Z\s*RAPOR\s*NO|MALİ\s*NO|EKÜ\s*NO)[:\s]*(\d+)/gi,
      /(\d{4,7})(?=\s*Z|\s*MALİ)/gi
    ];
    
    for (const pattern of fiscalPatterns) {
      const match = pattern.exec(text);
      if (match) {
        data.fiscalNumber = match[1];
        break;
      }
    }

    // Mali numara bulunamadıysa 7 haneli sayı ara
    if (!data.fiscalNumber) {
      const sevenDigit = text.match(/\b(\d{7})\b/);
      if (sevenDigit) {
        data.fiscalNumber = sevenDigit[1];
      }
    }

  } catch (error) {
    console.error('❌ Z Raporu parse hatası:', error);
  }

  return data;
}

module.exports = {
  parseReceipt,
  parseZReport
};