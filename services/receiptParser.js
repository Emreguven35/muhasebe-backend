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

  // 1. FİRMA UNVANI (İlk 3 satırda büyük harfli kelime ara)
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Büyük harf oranı yüksekse ve sayı içermiyorsa firma adı olabilir
    const upperRatio = (line.match(/[A-ZÇĞİÖŞÜ]/g) || []).length / line.length;
    if (upperRatio > 0.5 && !/\d{2}/.test(line) && line.length > 3) {
      data.firmaUnvani = line;
      break;
    }
  }

  // 2. TARİH (GG/AA/YYYY, GG.AA.YYYY, GG-AA-YYYY formatları)
  const datePattern = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4}|\d{2})/;
  for (const line of lines) {
    const match = line.match(datePattern);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      data.tarih = `${day}/${month}/${year}`;
      break;
    }
  }

  // 3. FİŞ NO (5 haneli sayı veya Z/FİŞ kelimelerinin yanındaki sayı)
  const fisPattern = /(?:FİŞ|BELGE|Z|NO)[:\s#]*(\d{4,6})/i;
  for (const line of lines) {
    const match = line.match(fisPattern);
    if (match) {
      data.fisNo = match[1].padStart(5, '0');
      break;
    }
  }
  // Yoksa 5-6 haneli ilk sayıyı al
  if (!data.fisNo) {
    for (const line of lines) {
      const match = line.match(/\b(\d{5,6})\b/);
      if (match) {
        data.fisNo = match[1];
        break;
      }
    }
  }

  // 4. TOPLAM TUTAR (En büyük sayı genellikle toplam)
  // TOPLAM, GENEL TOPLAM, ÖDENECEK gibi kelimelerden sonra ara
  const totalPatterns = [
    /(?:TOPLAM|GENEL|ÖDENECEK|TOTAL|TUTAR)[:\s]*(\d+[,\.]\d{2})/i,
    /(?:TOPLAM|GENEL|ÖDENECEK|TOTAL|TUTAR)[:\s]*TL[:\s]*(\d+[,\.]\d{2})/i,
    /(\d+[,\.]\d{2})\s*(?:TL|₺)/
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

  // Toplam bulunamadıysa en büyük sayıyı al
  if (!foundTotal) {
    for (const line of lines) {
      const amounts = line.match(/(\d+[,\.]\d{2})/g);
      if (amounts) {
        amounts.forEach(amt => {
          const amount = parseFloat(amt.replace(',', '.'));
          if (amount > maxAmount && amount < 10000) { // Makul bir üst limit
            maxAmount = amount;
            data.toplamTutar = amount.toFixed(2);
          }
        });
      }
    }
  }

  // 5. KDV HESAPLAMA
  // %20 KDV oranından tersine hesapla
  if (data.toplamTutar) {
    const total = parseFloat(data.toplamTutar);
    
    // Önce metinde "KDV" kelimesi ara
    let kdvFound = false;
    for (const line of lines) {
      if (/KDV|KDVLI/i.test(line)) {
        const kdvMatch = line.match(/(\d+[,\.]\d{2})/);
        if (kdvMatch) {
          data.kdv20 = parseFloat(kdvMatch[1].replace(',', '.')).toFixed(2);
          kdvFound = true;
          break;
        }
      }
    }
    
    // KDV bulunamadıysa %20 oranından hesapla
    if (!kdvFound) {
      // Toplam = Net + KDV
      // Net * 1.20 = Toplam
      // KDV = Toplam - (Toplam / 1.20)
      const kdv20 = total - (total / 1.20);
      data.kdv20 = kdv20.toFixed(2);
    }
  }

  // 6. GİDER CİNSİ BELİRLE
  const textUpper = text.toUpperCase();
  if (textUpper.includes('OTOPARK') || textUpper.includes('PARK')) {
    data.giderCinsi = 'OTOPARK';
  } else if (textUpper.includes('MARKET') || textUpper.includes('SÜPERMARKET')) {
    data.giderCinsi = 'MARKET';
  } else if (textUpper.includes('RESTORAN') || textUpper.includes('KAFE') || textUpper.includes('YİYECEK')) {
    data.giderCinsi = 'YİYECEK';
  } else if (textUpper.includes('YAKIT') || textUpper.includes('PETROL') || textUpper.includes('BENZİN')) {
    data.giderCinsi = 'YAKIT';
  } else if (textUpper.includes('TAKSI') || textUpper.includes('UBER') || textUpper.includes('ULAŞIM')) {
    data.giderCinsi = 'ULAŞIM';
  }

  console.log('✅ Parse sonucu:', data);
  
  return data;
}

module.exports = { parseReceipt };