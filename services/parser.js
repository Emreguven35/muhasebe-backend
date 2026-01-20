// backend/services/parser.js

// Fiş parse fonksiyonu
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

  // Kategori tespiti
  data.category = detectCategory(text);

  // Şirket adı (ilk satır genellikle)
  if (lines.length > 0) {
    data.companyName = lines[0];
  }

  // Adres
  const addressPattern = /(?:ADRES|ADR|ADDRESS)[:\s]*(.*?)(?=\n|VERGİ|TAX|$)/i;
  const addressMatch = text.match(addressPattern);
  if (addressMatch) {
    data.address = addressMatch[1].trim();
  }

  // Vergi dairesi
  const taxOfficePattern = /(?:VERGİ DAİRESİ|V\.D\.|VD)[:\s]*([^\n\d]+)/i;
  const taxOfficeMatch = text.match(taxOfficePattern);
  if (taxOfficeMatch) {
    data.taxOffice = taxOfficeMatch[1].trim();
  }

  // Vergi numarası
  const taxNumberPattern = /(?:VERGİ NO|V\.NO|VNO|VERGI NUMARASI)[:\s]*(\d+[-\s]?\d*)/i;
  const taxNumberMatch = text.match(taxNumberPattern);
  if (taxNumberMatch) {
    data.taxNumber = taxNumberMatch[1].replace(/[-\s]/g, '');
  }

  // Tarih (DD/MM/YYYY veya DD.MM.YYYY)
  const datePattern = /(\d{2})[\/\.](\d{2})[\/\.](\d{4})/;
  const dateMatch = text.match(datePattern);
  if (dateMatch) {
    const day = dateMatch[1];
    const month = dateMatch[2];
    const year = dateMatch[3];
    data.date = `${year}-${month}-${day}`;
  }

  // Saat
  const timePattern = /(\d{2}):(\d{2})(?::(\d{2}))?/;
  const timeMatch = text.match(timePattern);
  if (timeMatch) {
    data.time = `${timeMatch[1]}:${timeMatch[2]}`;
  }

  // Ürünler
  const itemPattern = /^(.+?)\s+([\d,.]+)\s*(?:₺|TL)?$/gm;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(text)) !== null) {
    const name = itemMatch[1].trim();
    const priceStr = itemMatch[2].replace(/\./g, '').replace(',', '.');
    const price = parseFloat(priceStr);
    
    if (!isNaN(price) && price > 0 && price < 100000) {
      data.items.push({
        name: name,
        price: price
      });
    }
  }

  // Ara toplam
  const subtotalPattern = /(?:ARA TOPLAM|TOPLAM|SUBTOTAL)[:\s]*([\d,.]+)/i;
  const subtotalMatch = text.match(subtotalPattern);
  if (subtotalMatch) {
    data.subtotal = parseFloat(subtotalMatch[1].replace(/\./g, '').replace(',', '.'));
  }

  // KDV hesaplama
  let totalVat = 0;
  
  // %1 KDV
  const vat1Pattern = /(?:KDV\s*%?\s*1\b|%1\s*KDV)[:\s]*([\d,.]+)/gi;
  let vat1Match;
  while ((vat1Match = vat1Pattern.exec(text)) !== null) {
    const amount = parseFloat(vat1Match[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(amount)) totalVat += amount;
  }

  // %10 KDV
  const vat10Pattern = /(?:KDV\s*%?\s*10\b|%10\s*KDV)[:\s]*([\d,.]+)/gi;
  let vat10Match;
  while ((vat10Match = vat10Pattern.exec(text)) !== null) {
    const amount = parseFloat(vat10Match[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(amount)) totalVat += amount;
  }

  // %20 KDV
  const vat20Pattern = /(?:KDV\s*%?\s*20\b|%20\s*KDV)[:\s]*([\d,.]+)/gi;
  let vat20Match;
  while ((vat20Match = vat20Pattern.exec(text)) !== null) {
    const amount = parseFloat(vat20Match[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(amount)) totalVat += amount;
  }

  // Genel KDV
  if (totalVat === 0) {
    const generalVatPattern = /(?:KDV|VAT)[:\s]*([\d,.]+)/i;
    const generalVatMatch = text.match(generalVatPattern);
    if (generalVatMatch) {
      totalVat = parseFloat(generalVatMatch[1].replace(/\./g, '').replace(',', '.'));
    }
  }

  data.vat = totalVat;

  // Toplam tutar
  const totalPattern = /(?:GENEL TOPLAM|TOPLAM|TOTAL|ÖDENECEK)[:\s]*([\d,.]+)/i;
  const totalMatch = text.match(totalPattern);
  if (totalMatch) {
    data.total = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
  }

  // Ödeme yöntemi
  if (text.match(/NAKİT|NAKIT|CASH/i)) {
    data.paymentMethod = 'Nakit';
  } else if (text.match(/KREDİ KARTI|KART|CARD/i)) {
    data.paymentMethod = 'Kredi Kartı';
  }

  // Fiş numarası
  const receiptNumberPattern = /(?:FİŞ NO|BELGE NO|RECEIPT)[:\s]*(\d+)/i;
  const receiptNumberMatch = text.match(receiptNumberPattern);
  if (receiptNumberMatch) {
    data.receiptNumber = receiptNumberMatch[1];
  }

  return data;
}

// Kategori tespit fonksiyonu
function detectCategory(text) {
  const lowerText = text.toLowerCase();
  
  const categories = {
    'Yemek': ['restoran', 'restaurant', 'kafe', 'cafe', 'pizza', 'burger', 'yemek', 'lokanta'],
    'Ulaşım': ['taksi', 'taxi', 'uber', 'otobus', 'otobüs', 'metro', 'benzin', 'akaryakıt', 'shell', 'opet', 'bp'],
    'Market': ['market', 'süpermarket', 'migros', 'carrefour', 'a101', 'bim', 'şok'],
    'Eğlence': ['sinema', 'cinema', 'tiyatro', 'konser', 'bilet', 'eğlence'],
    'Sağlık': ['eczane', 'pharmacy', 'hastane', 'hospital', 'doktor', 'klinik'],
    'Giyim': ['mağaza', 'store', 'butik', 'giyim', 'ayakkabı', 'tekstil'],
    'Elektronik': ['teknoloji', 'technology', 'elektronik', 'bilgisayar', 'telefon'],
    'Kırtasiye': ['kırtasiye', 'kitap', 'book', 'kalem', 'defter']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category;
      }
    }
  }

  return 'Diğer';
}

// Z Raporu parse fonksiyonu
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
    // Tarih (DD/MM/YYYY formatı)
    const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
      const [day, month, year] = dateMatch[1].split('/');
      data.date = `${year}-${month}-${day}`;
    }

    // Saat
    const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
    if (timeMatch) {
      data.time = timeMatch[1];
    }

    // Toplam satış
    const salesMatch = text.match(/MALI\s*BEL[LI]+E?R?\s*TOP(?:LAMI?)?\s*[*₺]?\s*([\d.,]+)/i);
    if (salesMatch) {
      data.totalSales = parseFloat(salesMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Toplam KDV
    const vatMatch = text.match(/(?:TOPKDV|TOP\s*KDV|TOPLAM\s*KDV)\s*[*₺]?\s*([\d.,]+)/i);
    if (vatMatch) {
      data.totalVat = parseFloat(vatMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Nakit
    const cashMatch = text.match(/(?:NAKIT|NAKİT)\s*[*₺]?\s*([\d.,]+)/i);
    if (cashMatch) {
      data.cashAmount = parseFloat(cashMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Kredi kartı
    const creditMatch = text.match(/(?:KREDI|KREDİ)\s*(?:KART|KARTI)?\s*[*₺]?\s*([\d.,]+)/i);
    if (creditMatch) {
      data.creditCardAmount = parseFloat(creditMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    // Fiş sayısı
    const receiptCountMatch = text.match(/(?:FIŞ|FIS)\s*(?:SAYISI|ADET)?\s*[:]?\s*(\d+)/i);
    if (receiptCountMatch) {
      data.receiptCount = parseInt(receiptCountMatch[1]);
    }

    // Mali numara
    const fiscalMatch = text.match(/(\d{7})/);
    if (fiscalMatch) {
      data.fiscalNumber = fiscalMatch[1];
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