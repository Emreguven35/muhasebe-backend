// backend/services/parser.js
// ==========================================
// FİŞ PARSE FONKSİYONU - GELİŞMİŞ VERSİYON v2.1
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
    vat1: 0,
    vat10: 0,
    vat20: 0,
    total: 0,
    paymentMethod: null,
    receiptNumber: null,
    category: null
  };

  // Debug için OCR metnini logla
  console.log('📝 Parser başladı, metin uzunluğu:', text.length);

  // 1. KATEGORİ TESPİTİ (önce yapılmalı)
  data.category = detectCategory(text);
  console.log('📂 Kategori:', data.category);

  // 2. ŞİRKET ADI
  data.companyName = extractCompanyName(lines, text);
  console.log('🏢 Firma:', data.companyName);

  // 3. ADRES
  data.address = extractAddress(text);

  // 4. VERGİ DAİRESİ
  data.taxOffice = extractTaxOffice(text);

  // 5. VERGİ NUMARASI
  data.taxNumber = extractTaxNumber(text);

  // 6. TARİH
  data.date = extractDate(text);
  console.log('📅 Tarih:', data.date);

  // 7. SAAT
  data.time = extractTime(text);

  // 8. FİŞ NUMARASI - lines'ı da gönder
  data.receiptNumber = extractReceiptNumber(text, lines);
  console.log('🔢 Fiş No:', data.receiptNumber);

  // 9. ÖDEME YÖNTEMİ
  data.paymentMethod = extractPaymentMethod(text);

  // 10. TOPLAM TUTAR (en önemli!)
  data.total = extractTotal(text);
  console.log('💰 Toplam:', data.total);

  // 11. KDV - Ayrı ayrı çıkar
  const vatDetails = extractVATDetailed(text, data.total);
  data.vat1 = vatDetails.vat1;
  data.vat10 = vatDetails.vat10;
  data.vat20 = vatDetails.vat20;
  data.vat = vatDetails.total;
  console.log('📊 KDV Detay - %1:', data.vat1, '%10:', data.vat10, '%20:', data.vat20, 'Toplam:', data.vat);

  // 12. ARA TOPLAM
  data.subtotal = extractSubtotal(text, data.total, data.vat);

  // 13. ÜRÜNLER
  data.items = extractItems(text, data.total);

  console.log('✅ Parser tamamlandı:', JSON.stringify(data, null, 2));

  return data;
}

// ==========================================
// KATEGORİ TESPİT FONKSİYONU
// ==========================================
function detectCategory(text) {
  const lowerText = text.toLowerCase();
  
  const categories = {
    'Market': [
      'market', 'süpermarket', 'supermarket', 'migros', 'carrefour', 'a101', 'bim', 'şok',
      'sok ', 'hakmar', 'file', 'macro', 'metro', 'kipa', 'özdilek', 'gratis',
      'watsons', 'rossmann', 'eve', 'happy center', 'tansaş', 'endi', 'halktan',
      'gıda', 'gida', 'perakende', 'kuruyemiş', 'kuruyemis', 'şekerleme', 'sekerleme',
      'bakliyat', 'manav', 'kasap', 'şarküteri', 'sarkuteri', 'tekel'
    ],
    'Akaryakıt': [
      'petrol', 'opet', 'shell', 'bp ', 'total', 'benzin', 'motorin', 'dizel',
      'lpg', 'akaryakıt', 'akarya', 'fuel', 'pompa', 'litre', 'mazot', 'eurodizel',
      'ipragaz', 'petrol ofisi', 'aytemiz', 'kalyon', 'po ', 'm-oil', 'lukoil',
      'türkiye petrolleri', 'turkiye petrolleri', 'tüpraş', 'tupras'
    ],
    'Yemek': [
      'restoran', 'restaurant', 'kafe', 'cafe', 'kahve', 'coffee', 'pizza',
      'burger', 'kebap', 'kebab', 'döner', 'doner', 'lokanta', 'yemek',
      'mutfak', 'kitchen', 'starbucks', 'mcdonalds', 'burger king', 'kfc',
      'popeyes', 'dominos', 'little caesars', 'sbarro', 'tavuk', 'chicken',
      'simit', 'börek', 'borek', 'pastane', 'fırın', 'firin', 'bakery',
      'çay bahçesi', 'cay bahcesi', 'meyhane', 'balık', 'balik'
    ],
    'Ulaşım': [
      'taksi', 'taxi', 'uber', 'otobus', 'otobüs', 'tramvay',
      'vapur', 'ferry', 'bilet', 'ticket', 'otopark', 'parking', 'hgs',
      'ogs', 'köprü', 'kopru', 'geçiş', 'gecis', 'otoyol', 'izban', 'eshot',
      'iett', 'ego', 'kent kart', 'kentkart', 'istanbulkart', 'izelman'
    ],
    'Sağlık': [
      'eczane', 'pharmacy', 'hastane', 'hospital', 'doktor', 'klinik',
      'clinic', 'medikal', 'medical', 'sağlık', 'saglik', 'ilaç', 'ilac',
      'dişçi', 'diş', 'dis', 'göz', 'goz', 'kulak', 'laboratuvar', 'optik'
    ],
    'Eğlence': [
      'sinema', 'cinema', 'tiyatro', 'konser', 'eğlence', 'eglence',
      'bowling', 'bilardo', 'oyun', 'game', 'lunapark', 'aquapark', 'müze', 'muze'
    ],
    'Giyim': [
      'mağaza', 'magaza', 'store', 'butik', 'giyim', 'ayakkabı', 'ayakkabi',
      'tekstil', 'moda', 'fashion', 'lcw', 'lc waikiki', 'koton', 'defacto',
      'mavi', 'colins', 'vakko', 'beymen', 'network', 'ipekyol', 'adidas', 'nike',
      'zara', 'h&m', 'pull&bear', 'bershka', 'massimo dutti'
    ],
    'Elektronik': [
      'teknoloji', 'technology', 'elektronik', 'bilgisayar', 'computer',
      'telefon', 'phone', 'tablet', 'laptop', 'teknosa', 'media markt',
      'vatan', 'darty', 'apple', 'samsung', 'huawei', 'xiaomi', 'mediamarkt'
    ],
    'Kırtasiye': [
      'kırtasiye', 'kirtasiye', 'kitap', 'book', 'kalem', 'defter', 'okul',
      'school', 'ofis', 'office', 'd&r', 'remzi', 'pandora', 'kitabevi'
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

  // Öncelik sırasına göre kontrol et (Market önce, çünkü en yaygın)
  const priorityOrder = ['Market', 'Akaryakıt', 'Yemek', 'Ulaşım', 'Sağlık', 'Giyim', 'Elektronik', 'Kırtasiye', 'Konaklama', 'Hizmet', 'Eğlence'];
  
  for (const category of priorityOrder) {
    const keywords = categories[category];
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }

  return 'Diğer';
}

// ==========================================
// ŞİRKET ADI ÇIKARMA - GELİŞTİRİLMİŞ
// ==========================================
function extractCompanyName(lines, text) {
  // Önce bilinen firma isimlerini ara
  const knownCompanies = [
    { pattern: /IZELMAN[^\n]*/i, name: null }, // Pattern'den al
    { pattern: /HALKTAN[^\n]*/i, name: null },
    { pattern: /MİGROS|MIGROS/i, name: 'MİGROS' },
    { pattern: /CARREFOUR/i, name: 'CARREFOUR' },
    { pattern: /A101/i, name: 'A101' },
    { pattern: /BİM |BIM /i, name: 'BİM' },
    { pattern: /ŞOK |SOK /i, name: 'ŞOK' },
    { pattern: /OPET/i, name: 'OPET' },
    { pattern: /SHELL/i, name: 'SHELL' },
    { pattern: /BP\s/i, name: 'BP' },
    { pattern: /PETROL OFİSİ|PETROL OFISI/i, name: 'PETROL OFİSİ' },
    { pattern: /STARBUCKS/i, name: 'STARBUCKS' },
    { pattern: /MC\s*DONALD|MCDONALDS/i, name: 'McDONALDS' }
  ];

  for (const company of knownCompanies) {
    const match = text.match(company.pattern);
    if (match) {
      if (company.name) {
        return company.name;
      }
      // Pattern'den firma adını çıkar
      return match[0].trim();
    }
  }

  // Şirket adı pattern'leri
  const companyPatterns = [
    // LTD, A.Ş., vb. içeren satırlar
    /([A-ZÇĞİÖŞÜa-zçğıöşü0-9\s\.]+(?:LTD|A\.?Ş\.?|TİC|SAN|ŞTİ|STI)[^\n]*)/i,
    // ŞUBE içeren satırlar
    /([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s]+ŞUBE[SİI]?[^\n]*)/i
  ];

  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim();
      // Çok uzunsa kısalt
      if (name.length > 60) {
        name = name.substring(0, 60);
      }
      return name;
    }
  }

  // İlk anlamlı satırı bul
  const skipPatterns = [
    /^e-?arşiv/i, /^e-?fatura/i, /^fatura/i, /^fis$/i, /^fiş$/i,
    /^\d+$/, /^[0-9\s\-\.\:\/]+$/, /^\d{2}[\.\/-]\d{2}[\.\/-]\d{2,4}/,
    /^\d{2}:\d{2}/, /^www\./i, /^http/i, /^tel:/i, /^\+90/
  ];

  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i];
    if (line.length < 3) continue;
    
    let skip = false;
    for (const pattern of skipPatterns) {
      if (pattern.test(line)) {
        skip = true;
        break;
      }
    }
    
    if (!skip) {
      return line;
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
    /((?:MAH\.?|MAHALLESİ|MAHALLESI)[^\n]*(?:CAD\.?|CADDE|SOK\.?|SOKAK|SK\.?)[^\n]*)/i,
    /((?:CAD\.?|CADDE)[^\n]*(?:NO|NUMARA)[:\s]*\d+[^\n]*)/i
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
// TARİH ÇIKARMA - GELİŞTİRİLMİŞ
// ==========================================
function extractDate(text) {
  // 1. Önce YYYY-MM-DD formatını ara (e-Fatura formatı)
  const isoPattern = /(?:TARİH|TARIH|DATE)\s*[:\s]\s*(\d{4})[\/\.\-](\d{2})[\/\.\-](\d{2})/i;
  const isoMatch = text.match(isoPattern);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2];
    const day = isoMatch[3];
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
      console.log('📅 Tarih bulundu (ISO format):', `${year}-${month}-${day}`);
      return `${year}-${month}-${day}`;
    }
  }

  // 2. Genel YYYY-MM-DD pattern (TARİH kelimesi olmadan)
  const isoGeneralPattern = /(\d{4})[\/\.\-](\d{2})[\/\.\-](\d{2})/;
  const isoGeneralMatch = text.match(isoGeneralPattern);
  if (isoGeneralMatch) {
    const year = isoGeneralMatch[1];
    const month = isoGeneralMatch[2];
    const day = isoGeneralMatch[3];
    const yearNum = parseInt(year);
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    // Yıl 2020-2030 arasında olmalı
    if (yearNum >= 2020 && yearNum <= 2030 && dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
      console.log('📅 Tarih bulundu (ISO genel):', `${year}-${month}-${day}`);
      return `${year}-${month}-${day}`;
    }
  }

  // 3. DD/MM/YYYY veya DD.MM.YYYY formatı (TARİH ile)
  const dateLinePatterns = [
    /(?:TARİH|TARIH|DATE)\s*[:\s]\s*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/i,
    /(?:TARİH|TARIH|DATE)\s*[:\s]\s*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{2})(?!\d)/i
  ];

  for (const pattern of dateLinePatterns) {
    const match = text.match(pattern);
    if (match) {
      let day = match[1];
      let month = match[2];
      let year = match[3];
      
      if (year.length === 2) {
        year = '20' + year;
      }
      
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
        console.log('📅 Tarih bulundu (DD/MM/YYYY):', `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  // 4. Genel tarih pattern'leri
  const patterns = [
    // DD/MM/YYYY veya DD.MM.YYYY
    /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/,
    // DD/MM/YY
    /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{2})(?!\d)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let day = match[1];
      let month = match[2];
      let year = match[3];
      
      if (year.length === 2) {
        year = '20' + year;
      }
      
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
// FİŞ NUMARASI ÇIKARMA - GELİŞTİRİLMİŞ v3.0
// ==========================================
function extractReceiptNumber(text, lines) {
  console.log('🔢 Fiş no aranıyor...');
  
  // Lines yoksa oluştur
  if (!lines) {
    lines = text.split('\n').map(line => line.trim()).filter(line => line);
  }

  // 1. ÖNCELİKLİ: Satır bazlı analiz - "FİŞ NO" satırından sonraki değer
  // OCR bazen "FİŞ NO" ve değeri ayrı satırlara koyuyor
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    
    // "FİŞ NO", "FIS NO" gibi satır mı?
    if (/^F[İI]?[SŞ]\s*NO\s*:?\s*$/i.test(line) || /^F[İI]?[SŞ]\s*NO$/i.test(line)) {
      // Sonraki satırlarda değer ara
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j].trim();
        // : ile başlayabilir veya doğrudan sayı olabilir
        const numMatch = nextLine.match(/^:?\s*(\d{3,10})$/);
        if (numMatch) {
          console.log('✅ Fiş no bulundu (sonraki satır):', numMatch[1]);
          return numMatch[1];
        }
      }
    }
    
    // Aynı satırda "FİŞ NO : 00023" veya "FİŞ NO: 00023"
    const sameLineMatch = line.match(/F[İI]?[SŞ]\s*NO\s*:?\s*(\d{3,10})/i);
    if (sameLineMatch) {
      console.log('✅ Fiş no bulundu (aynı satır):', sameLineMatch[1]);
      return sameLineMatch[1];
    }
  }

  // 2. e-Arşiv fatura numarası (A ile başlayan, 16+ karakter)
  const eArsivMatch = text.match(/(?:FATURA\s*NO|FATURA\s*NUMARASI|BELGE\s*NO)[:\s#]*([A-Z]\d{10,20})/i);
  if (eArsivMatch) {
    console.log('✅ e-Arşiv fatura no bulundu:', eArsivMatch[1]);
    return eArsivMatch[1];
  }

  // 3. ETTN (e-arşiv için)
  const ettnMatch = text.match(/ETTN[:\s]*([A-Fa-f0-9\-]{20,50})/i);
  if (ettnMatch) {
    console.log('✅ ETTN bulundu:', ettnMatch[1]);
    return ettnMatch[1];
  }

  // 4. Z NO
  const zNoMatch = text.match(/Z\s*NO[:\s]*:?\s*(\d{3,10})/i);
  if (zNoMatch) {
    console.log('✅ Z no bulundu:', zNoMatch[1]);
    return zNoMatch[1];
  }

  // 5. EKÜ NO
  const ekuMatch = text.match(/EK[ÜU]\s*NO[:\s]*:?\s*(\d{3,10})/i);
  if (ekuMatch) {
    console.log('✅ EKÜ no bulundu:', ekuMatch[1]);
    return ekuMatch[1];
  }

  // 6. Genel fiş/belge no pattern'leri
  const patterns = [
    /(?:BELGE\s*NO|RECEIPT\s*NO|SERİ\s*NO)[:\s#]*([A-Z0-9\-]{3,20})/i,
    /(?:NO|NUMARA)[:\s#]*(\d{6,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = match[1].trim();
      // Telefon numarası, MERSİS no gibi değerleri atla
      if (!/^0?\d{10,11}$/.test(num) && !/^444/.test(num) && !/^850/.test(num)) {
        // 16 haneli ve 0 ile başlıyorsa MERSİS olabilir, atla
        if (num.length === 16 && num.startsWith('0')) {
          console.log('⚠️ MERSİS no atlandı:', num);
          continue;
        }
        console.log('✅ Fiş no bulundu (genel pattern):', num);
        return num;
      }
    }
  }

  console.log('⚠️ Fiş no bulunamadı');
  return null;
}

// ==========================================
// ÖDEME YÖNTEMİ ÇIKARMA
// ==========================================
function extractPaymentMethod(text) {
  const upperText = text.toUpperCase();
  
  if (upperText.match(/KREDİ\s*KART|KREDI\s*KART|CREDIT\s*CARD|VISA|MASTER|TROY|BANKA\s*KART|BANKAKARTI|\*{4}\s*\*{4}|\d{4}\s*\*{4}|DENİZBANK|DENIZBANK|AKBANK|GARANTİ|GARANTI|YAPI\s*KREDİ|YAPI\s*KREDI|İŞ\s*BANK|IS\s*BANK|ZIRAAT|HALK\s*BANK|VAKIF\s*BANK/)) {
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
// SAYI PARSE HELPER - Türk ve Uluslararası format
// ==========================================
function parseNumber(str) {
  if (!str) return 0;
  
  // String'i temizle
  let cleaned = str.trim();
  
  // Sadece sayı, nokta ve virgül bırak
  cleaned = cleaned.replace(/[^\d.,]/g, '');
  
  if (!cleaned) return 0;
  
  // Format tespiti:
  // Türk formatı: 1.234,56 (nokta binlik, virgül ondalık)
  // Uluslararası format: 1,234.56 veya 5000.00 (virgül binlik, nokta ondalık)
  
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  
  if (hasComma && hasDot) {
    // Her ikisi de var - hangisi son?
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // Türk formatı: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Uluslararası format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Sadece virgül var
    // Virgülden sonra 2 hane varsa ondalık, değilse binlik
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      // Ondalık: 5000,00
      cleaned = cleaned.replace(',', '.');
    } else {
      // Binlik: 5,000
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    // Sadece nokta var
    // Noktadan sonra 2 hane varsa ondalık, değilse binlik
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length === 2) {
      // Ondalık: 5000.00 - olduğu gibi bırak
    } else if (parts.length > 2) {
      // Birden fazla nokta: 1.234.567 - binlik ayraç
      cleaned = cleaned.replace(/\./g, '');
    } else if (parts[1] && parts[1].length === 3) {
      // Tek nokta, 3 hane: 5.000 - binlik ayraç
      cleaned = cleaned.replace(/\./g, '');
    }
    // Diğer durumlar: olduğu gibi bırak (örn: 5000.5)
  }
  
  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
}

// ==========================================
// TOPLAM TUTAR ÇIKARMA - EN ÖNEMLİ! v3.1
// ==========================================
function extractTotal(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // 0. ÖNCELİKLİ: "Odenecek KDV Dahil Tutar" pattern'i (BİM fişleri)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (/[OÖ]denecek\s*KDV\s*Dahil\s*Tutar/i.test(line)) {
      // Aynı satırda değer var mı?
      const sameLineMatch = line.match(/[*+]?([\d.,]+)\s*$/);
      if (sameLineMatch) {
        const total = parseNumber(sameLineMatch[1]);
        if (total > 0 && total < 1000000) {
          console.log('💵 Toplam bulundu (Odenecek KDV Dahil - aynı satır):', total);
          return total;
        }
      }
      
      // Sonraki satırda değer ara
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const numMatch = lines[j].match(/^[*+]?([\d.,]+)$/);
        if (numMatch) {
          const total = parseNumber(numMatch[1]);
          if (total > 0 && total < 1000000) {
            console.log('💵 Toplam bulundu (Odenecek KDV Dahil - sonraki satır):', total);
            return total;
          }
        }
      }
    }
  }

  // 1. Satır bazlı analiz - "TOPLAM TUTAR" veya "TOPLAM" satırından sonraki değer
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    
    // TOPLAM TUTAR, GENEL TOPLAM, ÖDENECEK TUTAR satırı mı?
    if (/^(TOPLAM\s*TUTAR|GENEL\s*TOPLAM|ÖDENECEK\s*TUTAR|ODENECEK\s*TUTAR|NET\s*TUTAR)$/i.test(line) ||
        /^TOPLAM$/i.test(line)) {
      // Sonraki satırlarda sayı ara
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const numMatch = lines[j].match(/^[*+]?([\d.,]+)(?:\s*₺|\s*TL)?$/);
        if (numMatch) {
          const total = parseNumber(numMatch[1]);
          if (!isNaN(total) && total > 0 && total < 1000000) {
            console.log('💵 Toplam bulundu (satır bazlı):', total);
            return total;
          }
        }
      }
    }
    
    // Aynı satırda "TOPLAM TUTAR 5000.00" formatı (iki kelime + sayı)
    const sameLineMatch = lines[i].match(/(?:TOPLAM\s*TUTAR|GENEL\s*TOPLAM|ÖDENECEK\s*TUTAR|ODENECEK\s*TUTAR)[:\s]*([\d.,]+)/i);
    if (sameLineMatch) {
      const total = parseNumber(sameLineMatch[1]);
      if (!isNaN(total) && total > 0 && total < 1000000) {
        console.log('💵 Toplam bulundu (aynı satır):', total);
        return total;
      }
    }
  }

  // 2. "İşlem Nakit: X TL" veya "İşlem Kredi: X TL" formatı (e-Fatura)
  const islemPattern = /İşlem\s*(?:Nakit|Kredi|Kart)[:\s]*([\d.,]+)\s*(?:₺|TL)/i;
  const islemMatch = text.match(islemPattern);
  if (islemMatch) {
    const total = parseNumber(islemMatch[1]);
    if (!isNaN(total) && total > 0 && total < 1000000) {
      console.log('💵 Toplam bulundu (İşlem pattern):', total);
      return total;
    }
  }

  // 3. Öncelikli pattern'ler
  const priorityPatterns = [
    /(?:ÖDENECEK\s*TUTAR|ODENECEK\s*TUTAR)[:\s*₺TL]*([\d.,]+)/i,
    /(?:GENEL\s*TOPLAM)[:\s*₺TL]*([\d.,]+)/i,
    /(?:NET\s*TUTAR)[:\s*₺TL]*([\d.,]+)/i,
    /(?:TOPLAM\s*TUTAR)[:\s*₺TL]*([\d.,]+)/i,
    /(?:^|\n)\s*TOPLAM[:\s*₺TL]*([\d.,]+)/im,
    /(?:MAL\/HİZMET\s*TOPLAM\s*TUTARI|MAL\/HIZMET\s*TOPLAM\s*TUTARI)[:\s*₺TL]*([\d.,]+)/i
  ];

  for (const pattern of priorityPatterns) {
    const match = text.match(pattern);
    if (match) {
      const total = parseNumber(match[1]);
      
      if (!isNaN(total) && total > 0 && total < 1000000) {
        console.log('💵 Toplam bulundu (öncelikli pattern):', total);
        return total;
      }
    }
  }

  // * veya + işareti ile başlayan tutarları ara (fişlerde yaygın)
  // Örnek: *880,43 veya +880,43
  const starPatterns = [
    /(?:ÖDENECEK|ODENECEK|TOPLAM)[^\n]*[*+]([\d.,]+)/gi,
    /[*+]([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})/g
  ];

  let candidates = [];
  
  for (const pattern of starPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const total = parseNumber(match[1]);
      if (!isNaN(total) && total > 0 && total < 1000000) {
        candidates.push(total);
      }
    }
  }

  // KDV'Lİ TOPLAM'ı ara
  const kdvliPattern = /KDV'?L[İI]\s*TOPLAM[:\s*₺TL]*([\d.,]+)/i;
  const kdvliMatch = text.match(kdvliPattern);
  if (kdvliMatch) {
    const total = parseNumber(kdvliMatch[1]);
    if (!isNaN(total) && total > 0) {
      candidates.push(total);
    }
  }

  // YALNIZ satırından tutar çıkar (Türkçe yazılmış tutar)
  const yalnizPattern = /YALNIZ[:\s]*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*TL/i;
  const yalnizMatch = text.match(yalnizPattern);
  if (yalnizMatch) {
    const turkceToNumber = convertTurkishToNumber(yalnizMatch[1]);
    if (turkceToNumber > 0) {
      candidates.push(turkceToNumber);
    }
  }

  // Eğer adaylar varsa, en çok tekrar edeni veya mantıklı olanı seç
  if (candidates.length > 0) {
    // Frekans analizi
    const frequency = {};
    for (const val of candidates) {
      const key = val.toFixed(2);
      frequency[key] = (frequency[key] || 0) + 1;
    }
    
    // En çok tekrar edeni bul
    let maxFreq = 0;
    let mostCommon = candidates[0];
    for (const [key, freq] of Object.entries(frequency)) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mostCommon = parseFloat(key);
      }
    }
    
    console.log('💵 Toplam bulundu (aday analizi):', mostCommon);
    return mostCommon;
  }

  // Son çare: TL ile biten en büyük tutarı al
  const tlPattern = /([\d.,]+)\s*(?:TL|₺)/gi;
  let maxTotal = 0;
  let match;
  while ((match = tlPattern.exec(text)) !== null) {
    const totalStr = match[1]
      .replace(/\./g, '')
      .replace(',', '.');
    
    const total = parseFloat(totalStr);
    // NAKİT, PARA ÜSTÜ gibi değerleri filtrele
    const context = text.substring(Math.max(0, match.index - 20), match.index);
    if (!/NAKİT|NAKIT|PARA\s*ÜST|PARA\s*UST/i.test(context)) {
      if (!isNaN(total) && total > maxTotal && total < 1000000) {
        maxTotal = total;
      }
    }
  }

  if (maxTotal > 0) {
    console.log('💵 Toplam bulundu (TL pattern):', maxTotal);
    return maxTotal;
  }

  return 0;
}

// Türkçe yazılmış sayıyı rakama çevir
function convertTurkishToNumber(text) {
  const numbers = {
    'bir': 1, 'iki': 2, 'üç': 3, 'dört': 4, 'beş': 5,
    'altı': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9, 'on': 10,
    'yirmi': 20, 'otuz': 30, 'kırk': 40, 'elli': 50,
    'altmış': 60, 'yetmiş': 70, 'seksen': 80, 'doksan': 90,
    'yüz': 100, 'bin': 1000, 'milyon': 1000000
  };

  let result = 0;
  let current = 0;
  
  const words = text.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    if (numbers[word] !== undefined) {
      if (word === 'yüz') {
        current = (current || 1) * 100;
      } else if (word === 'bin') {
        current = (current || 1) * 1000;
        result += current;
        current = 0;
      } else if (word === 'milyon') {
        current = (current || 1) * 1000000;
        result += current;
        current = 0;
      } else {
        current += numbers[word];
      }
    }
  }
  
  result += current;
  
  // Kuruş kısmını ara
  const kurusMatch = text.match(/(\w+)\s*kr/i);
  if (kurusMatch && numbers[kurusMatch[1].toLowerCase()]) {
    result += numbers[kurusMatch[1].toLowerCase()] / 100;
  } else if (kurusMatch) {
    // KIRKÜÇ gibi birleşik yazımlar
    const kurusText = kurusMatch[1].toLowerCase();
    if (kurusText.includes('kırk')) {
      result += 0.40;
      if (kurusText.includes('üç')) result += 0.03;
    }
  }
  
  return result;
}

// ==========================================
// KDV ÇIKARMA - DETAYLI (%1, %10, %20 ayrı ayrı)
// ==========================================
function extractVATDetailed(text, total) {
  console.log('🔍 KDV detaylı aranıyor, toplam tutar:', total);
  
  const result = {
    vat1: 0,
    vat10: 0,
    vat20: 0,
    total: 0
  };
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // KDV tablosu var mı kontrol et (MATRAH, KDV TUTAR gibi başlıklar)
  const hasKdvTable = /MATRAH|KDV\s*TUTAR|KDV\s*DAHİL|KDV\s*DAHIL/i.test(text);
  
  // 1. BİM/A101 tipi KDV tablosu - Tek satırda: "%1. 472.77 *4.73 *477.50" formatı
  if (hasKdvTable) {
    for (const line of lines) {
      // Satır % veya rakamla başlamalı (KDV oranı satırı)
      // OCR bazen %1'i "31." veya "Z1" olarak okuyabilir
      
      // %1 KDV satırı - tek satırda tüm değerler
      if (/^[%Z]?1[\.,\s]/.test(line) && !/^[%Z]?10/.test(line) && !/^[%Z]?18/.test(line) && !/^[%Z]?20/.test(line)) {
        const match = line.match(/^[%Z]?1[\.,]?\s+([\d.,]+)\s+[*+]?([\d.,]+)/);
        if (match) {
          const vatAmount = parseNumber(match[2]);
          if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.05 : 1000)) {
            result.vat1 += vatAmount;
            console.log('📊 %1 KDV bulundu (tablo tek satır):', vatAmount);
          }
        }
      }
      
      // %8 KDV satırı
      if (/^[%Z]?8[\.,\s]/.test(line) && !/^[%Z]?18/.test(line)) {
        const match = line.match(/^[%Z]?8[\.,]?\s+([\d.,]+)\s+[*+]?([\d.,]+)/);
        if (match) {
          const vatAmount = parseNumber(match[2]);
          if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.15 : 1000)) {
            result.vat10 += vatAmount;
            console.log('📊 %8 KDV bulundu (tablo):', vatAmount);
          }
        }
      }
      
      // %10 KDV satırı
      if (/^[%Z]?10[\.,\s]/.test(line)) {
        const match = line.match(/^[%Z]?10[\.,]?\s+([\d.,]+)\s+[*+]?([\d.,]+)/);
        if (match) {
          const vatAmount = parseNumber(match[2]);
          if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.15 : 1000)) {
            result.vat10 += vatAmount;
            console.log('📊 %10 KDV bulundu (tablo):', vatAmount);
          }
        }
      }
      
      // %18 KDV satırı
      if (/^[%Z]?18[\.,\s]/.test(line)) {
        const match = line.match(/^[%Z]?18[\.,]?\s+([\d.,]+)\s+[*+]?([\d.,]+)/);
        if (match) {
          const vatAmount = parseNumber(match[2]);
          if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.25 : 1000)) {
            result.vat20 += vatAmount;
            console.log('📊 %18 KDV bulundu (tablo):', vatAmount);
          }
        }
      }
      
      // %20 KDV satırı
      if (/^[%Z]?20[\.,\s]/.test(line)) {
        const match = line.match(/^[%Z]?20[\.,]?\s+([\d.,]+)\s+[*+]?([\d.,]+)/);
        if (match) {
          const vatAmount = parseNumber(match[2]);
          if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.25 : 1000)) {
            result.vat20 += vatAmount;
            console.log('📊 %20 KDV bulundu (tablo):', vatAmount);
          }
        }
      }
    }
    
    // 1b. OCR satırları ayırdıysa - ardışık satırlardan KDV değerlerini topla
    // Format: "31. 472.77" sonra "*4.73" ayrı satırda
    if (result.vat1 === 0 && result.vat10 === 0 && result.vat20 === 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // "%1" veya "31." (OCR hatası) veya "Z1" ile başlayan MATRAH satırı
        // Sonraki satırda KDV tutarı olmalı
        if (/^[%Z3]?1[\.,]?\s+[\d.,]+$/.test(line) && !/^[%Z]?10/.test(line)) {
          // Sonraki satır KDV tutarı mı?
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const kdvMatch = nextLine.match(/^[*+]?([\d.,]+)$/);
            if (kdvMatch) {
              const vatAmount = parseNumber(kdvMatch[1]);
              if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.05 : 100)) {
                result.vat1 += vatAmount;
                console.log('📊 %1 KDV bulundu (ayrı satır):', vatAmount);
              }
            }
          }
        }
        
        // "%20" veya "20" ile başlayan MATRAH satırı
        if (/^[%Z]?20[\.,]?\s+[\d.,]+$/.test(line)) {
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const kdvMatch = nextLine.match(/^[*+]?([\d.,]+)$/);
            if (kdvMatch) {
              const vatAmount = parseNumber(kdvMatch[1]);
              if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.25 : 100)) {
                result.vat20 += vatAmount;
                console.log('📊 %20 KDV bulundu (ayrı satır):', vatAmount);
              }
            }
          }
        }
        
        // "20" tek başına bir satır, sonraki satır matrah, ondan sonraki KDV
        if (/^20$/.test(line)) {
          // i+1 = matrah satırı, i+2 = KDV tutarı
          if (i + 2 < lines.length) {
            const kdvLine = lines[i + 2];
            const kdvMatch = kdvLine.match(/^[*+]?([\d.,]+)$/);
            if (kdvMatch) {
              const vatAmount = parseNumber(kdvMatch[1]);
              if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.25 : 100)) {
                result.vat20 += vatAmount;
                console.log('📊 %20 KDV bulundu (3 satır format):', vatAmount);
              }
            }
          }
        }
        
        // "%10" ile başlayan MATRAH satırı
        if (/^[%Z]?10[\.,]?\s+[\d.,]+$/.test(line)) {
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const kdvMatch = nextLine.match(/^[*+]?([\d.,]+)$/);
            if (kdvMatch) {
              const vatAmount = parseNumber(kdvMatch[1]);
              if (vatAmount > 0 && vatAmount < (total > 0 ? total * 0.15 : 100)) {
                result.vat10 += vatAmount;
                console.log('📊 %10 KDV bulundu (ayrı satır):', vatAmount);
              }
            }
          }
        }
      }
    }
  }
  
  // 2. "KDV %1", "KDV %10", "KDV %20" formatları
  const kdvPatterns = [
    { rate: 1, pattern: /KDV\s*%?\s*1\b[:\s]*([\d.,]+)/gi, field: 'vat1' },
    { rate: 8, pattern: /KDV\s*%?\s*8\b[:\s]*([\d.,]+)/gi, field: 'vat10' },
    { rate: 10, pattern: /KDV\s*%?\s*10\b[:\s]*([\d.,]+)/gi, field: 'vat10' },
    { rate: 18, pattern: /KDV\s*%?\s*18\b[:\s]*([\d.,]+)/gi, field: 'vat20' },
    { rate: 20, pattern: /KDV\s*%?\s*20\b[:\s]*([\d.,]+)/gi, field: 'vat20' }
  ];
  
  for (const { rate, pattern, field } of kdvPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const vatAmount = parseNumber(match[1]);
      if (vatAmount > 0 && vatAmount < total * 0.30) {
        result[field] += vatAmount;
        console.log(`📊 KDV %${rate} bulundu (pattern):`, vatAmount);
      }
    }
  }
  
  // 3. TOPKDV veya TOPLAM KDV varsa ve henüz KDV bulunamadıysa
  if (result.vat1 === 0 && result.vat10 === 0 && result.vat20 === 0) {
    // TOPKDV pattern
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (/TOPKDV|TOPLAM\s*KDV/i.test(line)) {
        // Aynı satırda değer
        const sameLineMatch = line.match(/[*+]?([\d.,]+)\s*$/);
        if (sameLineMatch) {
          const vatAmount = parseNumber(sameLineMatch[1]);
          if (vatAmount > 0) {
            // Hangi orana ait olduğunu tahmin et
            if (total > 0) {
              const rate = (vatAmount / (total - vatAmount)) * 100;
              if (rate < 5) result.vat1 = vatAmount;
              else if (rate < 15) result.vat10 = vatAmount;
              else result.vat20 = vatAmount;
              console.log('📊 TOPKDV bulundu, tahmini oran %' + Math.round(rate) + ':', vatAmount);
            } else {
              result.vat10 = vatAmount; // Varsayılan olarak %10'a koy
            }
            break;
          }
        }
        
        // Sonraki satırda değer
        if (i + 1 < lines.length) {
          const nextLineMatch = lines[i + 1].match(/^[*+]?([\d.,]+)$/);
          if (nextLineMatch) {
            const vatAmount = parseNumber(nextLineMatch[1]);
            if (vatAmount > 0) {
              if (total > 0) {
                const rate = (vatAmount / (total - vatAmount)) * 100;
                if (rate < 5) result.vat1 = vatAmount;
                else if (rate < 15) result.vat10 = vatAmount;
                else result.vat20 = vatAmount;
              } else {
                result.vat10 = vatAmount;
              }
              break;
            }
          }
        }
      }
    }
  }
  
  // 4. Akıllı analiz - toplam biliniyorsa KDV oranını tahmin et
  if (result.vat1 === 0 && result.vat10 === 0 && result.vat20 === 0 && total > 0) {
    const allNumbers = text.match(/[\d.,]+/g) || [];
    
    for (const numStr of allNumbers) {
      const num = parseNumber(numStr);
      if (num <= 0 || num >= total) continue;
      
      // %1 KDV kontrolü (KDV = Toplam * 1 / 101)
      const expected1 = (total * 1) / 101;
      if (Math.abs(num - expected1) < expected1 * 0.05) {
        result.vat1 = num;
        console.log('📊 %1 KDV bulundu (hesaplama):', num);
        break;
      }
      
      // %10 KDV kontrolü (KDV = Toplam * 10 / 110)
      const expected10 = (total * 10) / 110;
      if (Math.abs(num - expected10) < expected10 * 0.05) {
        result.vat10 = num;
        console.log('📊 %10 KDV bulundu (hesaplama):', num);
        break;
      }
      
      // %20 KDV kontrolü (KDV = Toplam * 20 / 120)
      const expected20 = (total * 20) / 120;
      if (Math.abs(num - expected20) < expected20 * 0.05) {
        result.vat20 = num;
        console.log('📊 %20 KDV bulundu (hesaplama):', num);
        break;
      }
    }
  }
  
  // Toplam KDV hesapla
  result.total = result.vat1 + result.vat10 + result.vat20;
  
  // Yuvarlama
  result.vat1 = Math.round(result.vat1 * 100) / 100;
  result.vat10 = Math.round(result.vat10 * 100) / 100;
  result.vat20 = Math.round(result.vat20 * 100) / 100;
  result.total = Math.round(result.total * 100) / 100;
  
  return result;
}

// ==========================================
// KDV ÇIKARMA - GELİŞTİRİLMİŞ v4.1 (Eski fonksiyon - geriye uyumluluk için)
// ==========================================
function extractVAT(text, total) {
  console.log('🔍 KDV aranıyor, toplam tutar:', total);
  
  // Total 0 ise KDV araması anlamsız, ama yine de deneyelim
  const maxVat = total > 0 ? total * 0.30 : 100000;
  const minVat = total > 0 ? total * 0.005 : 0.01;
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // 0. ÖNCELİKLİ: BİM tipi KDV tablosu - "%1. 472.77 *4.73" formatı
  // KDV TUTAR sütunundaki değerleri topla
  let bimVatTotal = 0;
  for (const line of lines) {
    // "%1. 472.77 *4.73 *477.50" veya "21. 472.77 *4.73" formatı
    const bimMatch = line.match(/[%Z]?\d+[\.,]?\s+[\d.,]+\s+[*+]?([\d.,]+)\s+[*+]?[\d.,]+/);
    if (bimMatch) {
      const vatAmount = parseNumber(bimMatch[1]);
      if (vatAmount > 0 && vatAmount < 1000) {
        bimVatTotal += vatAmount;
        console.log('📊 BİM KDV satırı bulundu:', vatAmount);
      }
    }
  }
  
  if (bimVatTotal > 0) {
    console.log('📊 KDV bulundu (BİM tablosu toplamı):', bimVatTotal);
    return bimVatTotal;
  }

  // 1. "TOPLAM KDV" pattern'i - aynı satırda veya yakınında
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (/TOPLAM\s*KDV/i.test(line)) {
      // Aynı satırda sayı var mı?
      const sameLineMatch = line.match(/TOPLAM\s*KDV[\s:]*([\d.,]+)/i);
      if (sameLineMatch) {
        const vat = parseNumber(sameLineMatch[1]);
        if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
          console.log('📊 KDV bulundu (TOPLAM KDV aynı satır):', vat);
          return vat;
        }
      }
      
      // Satırın sonunda sayı var mı?
      const endMatch = line.match(/([\d.,]+)\s*$/);
      if (endMatch) {
        const vat = parseNumber(endMatch[1]);
        if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
          console.log('📊 KDV bulundu (TOPLAM KDV satır sonu):', vat);
          return vat;
        }
      }
      
      // Sonraki satırlarda değer ara
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const numMatch = lines[j].match(/^[*+]?([\d.,]+)(?:\s*₺|\s*TL)?$/);
        if (numMatch) {
          const vat = parseNumber(numMatch[1]);
          if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
            console.log('📊 KDV bulundu (TOPLAM KDV sonraki satır):', vat);
            return vat;
          }
        }
      }
    }
  }

  // 2. "KDV" kelimesi olan satır (TOPLAM KDV değil)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Sadece "KDV" veya "TOPKDV" yazan satır
    if (/^(KDV|TOPKDV)$/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const numMatch = lines[j].match(/^[*+]?([\d.,]+)(?:\s*₺|\s*TL)?$/);
        if (numMatch) {
          const vat = parseNumber(numMatch[1]);
          if (!isNaN(vat) && vat > 0 && (total === 0 || (vat < maxVat && vat > minVat))) {
            console.log('📊 KDV bulundu (KDV satır bazlı):', vat);
            return vat;
          }
        }
      }
    }
  }

  // 3. TOPKDV pattern - aynı satırda değer
  for (let i = 0; i < lines.length; i++) {
    if (/TOPKDV/i.test(lines[i])) {
      const sameLineMatch = lines[i].match(/TOPKDV[^0-9]*[*+]?([\d]+[.,][\d]{2})/i);
      if (sameLineMatch) {
        const vat = parseNumber(sameLineMatch[1]);
        if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
          console.log('📊 KDV bulundu (TOPKDV aynı satır):', vat);
          return vat;
        }
      }
    }
  }

  // 4. KDV TUTARI pattern
  const kdvTutarMatch = text.match(/KDV\s*TUTARI[^0-9]*([\d]+[.,][\d]{2})/i);
  if (kdvTutarMatch) {
    const vat = parseNumber(kdvTutarMatch[1]);
    if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
      console.log('📊 KDV bulundu (KDV TUTARI):', vat);
      return vat;
    }
  }

  // 5. %10 KDV hesaplama - eğer metinde "%10" varsa ve toplam biliniyorsa
  if (total > 0 && /%\s*10/i.test(text)) {
    // %10 KDV formülü: KDV = Toplam * 10 / 110
    const calculatedVat = (total * 10) / 110;
    // Metinde bu değere yakın bir sayı var mı kontrol et
    const allNumbers = text.match(/[\d.,]+/g) || [];
    for (const numStr of allNumbers) {
      const num = parseNumber(numStr);
      // Hesaplanan KDV'ye %5 toleransla yakın mı?
      if (num > 0 && Math.abs(num - calculatedVat) < calculatedVat * 0.05) {
        console.log('📊 KDV bulundu (%10 hesaplama ile doğrulama):', num);
        return num;
      }
    }
  }

  // 6. AKILLI ANALİZ: Toplam biliniyorsa, mantıklı KDV değerini bul
  // KDV oranları: %1, %8, %10, %18, %20
  // KDV = Toplam * Oran / (100 + Oran)
  if (total > 0) {
    const possibleVatRates = [1, 8, 10, 18, 20];
    const allNumbers = text.match(/[\d.,]+/g) || [];
    
    for (const numStr of allNumbers) {
      const num = parseNumber(numStr);
      if (num <= 0 || num >= total) continue;
      
      // Bu sayı herhangi bir KDV oranına uyuyor mu?
      for (const rate of possibleVatRates) {
        const expectedVat = (total * rate) / (100 + rate);
        // %2 tolerans
        if (Math.abs(num - expectedVat) < expectedVat * 0.02) {
          console.log(`📊 KDV bulundu (akıllı analiz, %${rate}):`, num);
          return num;
        }
      }
    }
  }

  // 7. Son çare: %X KDV formatları
  const vatLinePatterns = [
    /KDV\s*%?\s*1[:\s]+([\d]+[.,][\d]{2})/gi,
    /KDV\s*%?\s*8[:\s]+([\d]+[.,][\d]{2})/gi,
    /KDV\s*%?\s*10[:\s]+([\d]+[.,][\d]{2})/gi,
    /KDV\s*%?\s*18[:\s]+([\d]+[.,][\d]{2})/gi,
    /KDV\s*%?\s*20[:\s]+([\d]+[.,][\d]{2})/gi
  ];

  let totalVat = 0;
  for (const pattern of vatLinePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const vat = parseNumber(match[1]);
      if (!isNaN(vat) && vat > 0 && (total === 0 || vat < total * 0.10)) {
        totalVat += vat;
      }
    }
  }

  if (totalVat > 0) {
    console.log('📊 KDV bulundu (çoklu oran toplamı):', totalVat);
    return totalVat;
  }

  console.log('⚠️ KDV bulunamadı');
  return 0;
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
  
  const skipPatterns = [
    /TOPLAM|KDV|TUTAR|NAKİT|NAKIT|KREDİ|KREDI|KART|FİŞ|FIS|BELGE|TARİH|TARIH|SAAT/i,
    /VERGİ|VERGI|VD\s|V\.D\.|ADRES|TEL:|FAX:|MAIL:|WWW\./i,
    /PARA\s*ÜST|PARA\s*UST|ÖDENECEK|ODENECEK|YALNIZ/i
  ];

  const itemPatterns = [
    // Ürün + miktar x fiyat
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*[xX*]\s*([\d.,]+)$/,
    // Ürün + fiyat (sonda * veya + ile)
    /^(.+?)\s+[*+]([\d.,]+)$/,
    // Ürün + fiyat TL
    /^(.+?)\s+([\d.,]+)\s*(?:TL|₺)$/
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length < 3) continue;
    
    // Atlanacak satırları kontrol et
    let skip = false;
    for (const pattern of skipPatterns) {
      if (pattern.test(trimmedLine)) {
        skip = true;
        break;
      }
    }
    if (skip) continue;

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
      /(?:GÜNLÜK\s*TOPLAM|GUNLUK\s*TOPLAM|GÜNLÜK\s*SATIŞ|GUNLUK\s*SATIS)[:\s*₺TL]*([\d.,]+)/gi,
      /(?:MALİ\s*BEL[İI]?R?\s*TOP(?:LAMI?)?|MALI\s*BELIR\s*TOP)[:\s*₺TL]*([\d.,]+)/gi,
      /(?:GENEL\s*TOPLAM|NET\s*SATIŞ|NET\s*SATIS)[:\s*₺TL]*([\d.,]+)/gi,
      /(?:TOPLAM\s*SATIŞ|TOPLAM\s*SATIS|TOTAL\s*SALES)[:\s*₺TL]*([\d.,]+)/gi
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
      /(?:FİŞ\s*SAYISI|FIS\s*SAYISI|FİŞ\s*ADET|FIS\s*ADET|BELGE\s*SAYISI)[:\s]*(\d+)/gi,
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
      /(?:Z\s*NO|Z\s*RAPOR\s*NO|MALİ\s*NO|MALI\s*NO|EKÜ\s*NO|EKU\s*NO)[:\s]*(\d+)/gi,
      /(\d{4,7})(?=\s*Z|\s*MALİ|\s*MALI)/gi
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