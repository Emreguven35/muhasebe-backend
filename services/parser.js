// backend/services/parser.js
// ==========================================
// FİŞ PARSE FONKSİYONU - GELİŞMİŞ VERSİYON v2.0
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

  // 8. FİŞ NUMARASI
  data.receiptNumber = extractReceiptNumber(text);
  console.log('🔢 Fiş No:', data.receiptNumber);

  // 9. ÖDEME YÖNTEMİ
  data.paymentMethod = extractPaymentMethod(text);

  // 10. TOPLAM TUTAR (en önemli!)
  data.total = extractTotal(text);
  console.log('💰 Toplam:', data.total);

  // 11. KDV
  data.vat = extractVAT(text, data.total);
  console.log('📊 KDV:', data.vat);

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
      'iett', 'ego', 'kent kart', 'kentkart', 'istanbulkart'
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
    { pattern: /HALKTAN[^\n]*/i, name: null }, // Pattern'den al
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
// FİŞ NUMARASI ÇIKARMA - GELİŞTİRİLMİŞ
// ==========================================
function extractReceiptNumber(text) {
  const patterns = [
    // e-Arşiv fatura numarası (A ile başlayan)
    /(?:FATURA\s*NO|FATURA\s*NUMARASI)[:\s#]*([A-Z]\d{10,20})/i,
    // Genel fiş/belge no
    /(?:FİŞ\s*NO|FIS\s*NO|BELGE\s*NO|RECEIPT|SERİ\s*NO)[:\s#]*([A-Z0-9\-]+)/i,
    // Sadece numara
    /(?:NO|NUMARA)[:\s#]*(\d{6,})/i,
    // Z NO
    /Z\s*NO[:\s]*(\d+)/i,
    // EKÜ NO
    /EKÜ\s*NO[:\s]*(\d+)/i,
    // ETTN (e-arşiv için)
    /ETTN[:\s]*([A-Z0-9\-]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = match[1].trim();
      // Telefon numarası olmadığından emin ol
      if (!/^0?\d{10}$/.test(num) && !/^444/.test(num)) {
        return num;
      }
    }
  }
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
// TOPLAM TUTAR ÇIKARMA - EN ÖNEMLİ! v2.0
// ==========================================
function extractTotal(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
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
          const total = parseFloat(numMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(total) && total > 0 && total < 1000000) {
            console.log('💵 Toplam bulundu (satır bazlı):', total);
            return total;
          }
        }
      }
    }
    
    // Aynı satırda "TOPLAM TUTAR: 5000.00" formatı
    const sameLine = lines[i].match(/(?:TOPLAM\s*TUTAR|GENEL\s*TOPLAM|ÖDENECEK|ODENECEK)[:\s]*([\d.,]+)/i);
    if (sameLine) {
      const total = parseFloat(sameLine[1].replace(/\./g, '').replace(',', '.'));
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
    const total = parseFloat(islemMatch[1].replace(/\./g, '').replace(',', '.'));
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
      const totalStr = match[1]
        .replace(/\./g, '')
        .replace(',', '.');
      
      const total = parseFloat(totalStr);
      
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
      const totalStr = match[1]
        .replace(/\./g, '')
        .replace(',', '.');
      
      const total = parseFloat(totalStr);
      if (!isNaN(total) && total > 0 && total < 1000000) {
        candidates.push(total);
      }
    }
  }

  // KDV'Lİ TOPLAM'ı ara
  const kdvliPattern = /KDV'?L[İI]\s*TOPLAM[:\s*₺TL]*([\d.,]+)/i;
  const kdvliMatch = text.match(kdvliPattern);
  if (kdvliMatch) {
    const total = parseFloat(kdvliMatch[1].replace(/\./g, '').replace(',', '.'));
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
// KDV ÇIKARMA - GELİŞTİRİLMİŞ v3.0
// ==========================================
function extractVAT(text, total) {
  console.log('🔍 KDV aranıyor, toplam tutar:', total);
  
  // Total 0 ise KDV araması anlamsız, ama yine de deneyelim
  const maxVat = total > 0 ? total * 0.30 : 100000;
  const minVat = total > 0 ? total * 0.005 : 0.01;
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // 1. "KDV" satırından sonraki değer (e-Fatura formatı)
  // Örnek: KDV\n454.55
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    
    // Sadece "KDV" veya "TOPLAM KDV" yazan satır
    if (/^(KDV|TOPLAM\s*KDV|TOPKDV)$/i.test(lines[i])) {
      // Sonraki satırlarda sayı ara
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const numMatch = lines[j].match(/^[*+]?([\d.,]+)(?:\s*₺|\s*TL)?$/);
        if (numMatch) {
          const vat = parseFloat(numMatch[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(vat) && vat > 0 && (total === 0 || (vat < maxVat && vat > minVat))) {
            console.log('📊 KDV bulundu (satır bazlı):', vat);
            return vat;
          }
        }
      }
    }
    
    // "KDV: 454.55" formatı (aynı satırda)
    const kdvSameLine = lines[i].match(/^KDV[:\s]*([\d.,]+)/i);
    if (kdvSameLine) {
      const vat = parseFloat(kdvSameLine[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(vat) && vat > 0 && (total === 0 || (vat < maxVat && vat > minVat))) {
        console.log('📊 KDV bulundu (aynı satır):', vat);
        return vat;
      }
    }
  }

  // 2. TOPLAM KDV satırını bul
  const toplamKdvMatch = text.match(/TOPLAM\s*KDV[:\s]*([\d.,]+)/i);
  if (toplamKdvMatch) {
    const vat = parseFloat(toplamKdvMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(vat) && vat > 0) {
      console.log('📊 KDV bulundu (TOPLAM KDV):', vat);
      return vat;
    }
  }

  // 3. TOPKDV satırını bul ve değerini al
  for (let i = 0; i < lines.length; i++) {
    if (/TOPKDV/i.test(lines[i])) {
      // Aynı satırda değer var mı?
      const sameLineMatch = lines[i].match(/TOPKDV[^0-9]*[*+]?([\d]+[.,][\d]{2})/i);
      if (sameLineMatch) {
        const vat = parseFloat(sameLineMatch[1].replace(/\./g, '').replace(',', '.'));
        if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
          console.log('📊 KDV bulundu (TOPKDV aynı satır):', vat);
          return vat;
        }
      }
    }
  }

  // 4. "TOPKDV" kelimesinden sonra gelen ilk küçük sayıyı bul
  const topkdvIndex = text.toUpperCase().indexOf('TOPKDV');
  if (topkdvIndex !== -1) {
    const afterTopkdv = text.substring(topkdvIndex);
    const smallValues = afterTopkdv.match(/[*+]?([\d]{1,3}[.,][\d]{2})/g);
    if (smallValues) {
      for (const val of smallValues) {
        const numStr = val.replace(/[*+]/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(numStr);
        if (!isNaN(num) && num > 0 && (total === 0 || (num < maxVat && num > minVat))) {
          console.log('📊 KDV bulundu (TOPKDV sonrası küçük değer):', num);
          return num;
        }
      }
    }
  }

  // 5. KDV TUTARI pattern'i
  const kdvTutarMatch = text.match(/KDV\s*TUTARI[^0-9]*([\d]+[.,][\d]{2})/i);
  if (kdvTutarMatch) {
    const vat = parseFloat(kdvTutarMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
      console.log('📊 KDV bulundu (KDV TUTARI):', vat);
      return vat;
    }
  }

  // 6. %X KDV formatları
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
      const vat = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(vat) && vat > 0 && (total === 0 || vat < total * 0.10)) {
        totalVat += vat;
      }
    }
  }

  if (totalVat > 0) {
    console.log('📊 KDV bulundu (çoklu oran toplamı):', totalVat);
    return totalVat;
  }

  // 7. Son çare: Genel KDV pattern
  const generalVatMatch = text.match(/(?:TOPLAM\s*KDV|TOP\.?\s*KDV)[:\s]*([\d]+[.,][\d]{2})/i);
  if (generalVatMatch) {
    const vat = parseFloat(generalVatMatch[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(vat) && vat > 0 && (total === 0 || vat < maxVat)) {
      console.log('📊 KDV bulundu (genel pattern):', vat);
      return vat;
    }
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