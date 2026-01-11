const ExcelJS = require('exceljs');

async function createExcel(receipts) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Harcamalar');

  // Başlıklar
  worksheet.columns = [
    { header: 'Tarih', key: 'tarih', width: 12 },
    { header: 'Fatura No', key: 'fisNo', width: 12 },
    { header: 'Gider Cinsi', key: 'giderCinsi', width: 20 },
    { header: '%1 KDV', key: 'kdv1', width: 10 },
    { header: '%10 KDV', key: 'kdv10', width: 10 },
    { header: '%20 KDV', key: 'kdv20', width: 10 },
    { header: 'Toplam', key: 'toplamTutar', width: 12 }
  ];

  // Başlık stilini ayarla
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Verileri ekle
  receipts.forEach(receipt => {
    worksheet.addRow({
      tarih: receipt.tarih,
      fisNo: receipt.fisNo,
      giderCinsi: receipt.giderCinsi,
      kdv1: receipt.kdv1,
      kdv10: receipt.kdv10,
      kdv20: receipt.kdv20,
      toplamTutar: receipt.toplamTutar
    });
  });

  // Toplam satırı
  const totalRow = worksheet.addRow({
    tarih: '',
    fisNo: '',
    giderCinsi: 'TOPLAM',
    kdv1: { formula: `SUM(D2:D${worksheet.rowCount})` },
    kdv10: { formula: `SUM(E2:E${worksheet.rowCount})` },
    kdv20: { formula: `SUM(F2:F${worksheet.rowCount})` },
    toplamTutar: { formula: `SUM(G2:G${worksheet.rowCount})` }
  });
  totalRow.font = { bold: true };

  return workbook;
}

module.exports = { createExcel };