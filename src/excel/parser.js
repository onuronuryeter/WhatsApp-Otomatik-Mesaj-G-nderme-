const XLSX = require('xlsx');
const path = require('path');

const COLUMN_MAPPINGS = {
  // İngilizce
  'name': 'business_name', 'business name': 'business_name', 'title': 'business_name',
  'phone': 'phone', 'phone number': 'phone', 'telephone': 'phone', 'tel': 'phone', 'mobile': 'phone',
  'email': 'email', 'e-mail': 'email', 'mail': 'email',
  'website': 'website', 'web': 'website', 'url': 'website', 'site': 'website',
  'address': 'address', 'location': 'address', 'full address': 'address',
  'rating': 'rating', 'score': 'rating', 'stars': 'rating', 'rate': 'rating',
  'reviews': 'review_count', 'review count': 'review_count', 'number of reviews': 'review_count',
  'category': 'category', 'type': 'category', 'business type': 'category',
  'search': 'search_query', 'search query': 'search_query', 'keyword': 'search_query',
  // Türkçe
  'işletme adı': 'business_name', 'ad': 'business_name', 'isim': 'business_name', 'firma': 'business_name',
  'telefon': 'phone', 'tel no': 'phone', 'gsm': 'phone', 'cep': 'phone',
  'e-posta': 'email', 'eposta': 'email',
  'web sitesi': 'website', 'web adresi': 'website',
  'adres': 'address', 'konum': 'address',
  'puan': 'rating', 'değerlendirme': 'rating', 'yıldız': 'rating',
  'yorum sayısı': 'review_count', 'yorum': 'review_count',
  'kategori': 'category', 'tür': 'category',
  'arama': 'search_query', 'arama sorgusu': 'search_query'
};

function cleanHeader(str) {
  return String(str || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .trim();
}

function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (!rawData || rawData.length < 2) {
    throw new Error('Excel dosyası boş veya geçersiz format');
  }

  // Akıllı başlık satırı bulma (ilk 10 satırı tara)
  let headerRowIndex = 0;
  let maxMatches = -1;

  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    
    let matches = 0;
    const currentHeaders = row.map(h => cleanHeader(h));
    currentHeaders.forEach(h => {
      if (COLUMN_MAPPINGS[h]) matches++;
    });

    if (matches > maxMatches) {
      maxMatches = matches;
      headerRowIndex = i;
    }
  }

  // Eğer hiç eşleşme bulamazsak ilk satırı al
  if (maxMatches === 0) headerRowIndex = 0;

  const headers = rawData[headerRowIndex].map(h => cleanHeader(h));
  const rows = rawData.slice(headerRowIndex + 1);

  // Sütun eşleştirme
  const columnMap = {};
  headers.forEach((header, index) => {
    const mapped = COLUMN_MAPPINGS[header];
    if (mapped) columnMap[index] = mapped;
  });

  const contacts = [];
  const errors = [];
  const duplicates = new Set();

  rows.forEach((row, rowIndex) => {
    if (!row || row.every(cell => !cell)) return; // Boş satırları atla

    const contact = {
      business_name: null,
      phone: null,
      email: null,
      website: null,
      address: null,
      rating: null,
      review_count: null,
      category: null,
      search_query: null
    };

    // Eşlenmiş sütunlardan veri al
    Object.entries(columnMap).forEach(([index, field]) => {
      const value = row[parseInt(index)];
      if (value !== null && value !== undefined && value !== '') {
        contact[field] = String(value).trim();
      }
    });

    // BAŞLIK EŞLEŞMESİ BAŞARISIZ OLDUYSA (veya telefon sütunu boşsa) VERİDEN TAHMİN ET
    if (!contact.phone) {
      for (let i = 0; i < row.length; i++) {
        const cellVal = String(row[i] || '').replace(/\D/g, '');
        if (cellVal.length >= 10 && cellVal.length <= 13) {
          contact.phone = cellVal;
          // Eğer işletme adı da boşsa, bir önceki hücreyi veya bir sonraki hücreyi işletme adı yap
          if (!contact.business_name) {
            contact.business_name = String(row[i-1] || row[i+1] || '').trim();
          }
          break;
        }
      }
    }

    // Telefon zorunlu
    if (!contact.phone) {
      errors.push({ row: rowIndex + headerRowIndex + 2, reason: 'Telefon numarası bulunamadı' });
      return;
    }

    // Telefonu temizle
    let cleanPhone = String(contact.phone).replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      errors.push({ row: rowIndex + headerRowIndex + 2, reason: `Geçersiz telefon: ${contact.phone}` });
      return;
    }

    // 0090 veya 00 ile başlıyorsa temizle
    if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.substring(2);
    // 0 ile başlıyorsa temizle
    if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
    
    // 10 haneli ise (532... veya 212...) başına 90 ekle
    if (cleanPhone.length === 10) cleanPhone = '90' + cleanPhone;

    contact.phone = cleanPhone;

    // Tekrar kontrolü
    if (duplicates.has(cleanPhone)) {
      errors.push({ row: rowIndex + 2, reason: `Tekrarlayan numara: ${cleanPhone}` });
      return;
    }
    duplicates.add(cleanPhone);

    // Rating sayıya çevir
    if (contact.rating) {
      contact.rating = parseFloat(String(contact.rating).replace(',', '.')) || null;
    }
    if (contact.review_count) {
      contact.review_count = parseInt(contact.review_count) || null;
    }

    contacts.push(contact);
  });

  return {
    contacts,
    errors,
    total: rows.length,
    imported: contacts.length,
    errorCount: errors.length,
    headers: headers,
    columnMap
  };
}

function detectColumns(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (!rawData || rawData.length === 0) return { headers: [], preview: [] };

  // Akıllı başlık satırı bulma (ilk 10 satırı tara)
  let headerRowIndex = 0;
  let maxMatches = -1;

  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    
    let matches = 0;
    const currentHeaders = row.map(h => cleanHeader(h));
    currentHeaders.forEach(h => {
      if (COLUMN_MAPPINGS[h]) matches++;
    });

    if (matches > maxMatches) {
      maxMatches = matches;
      headerRowIndex = i;
    }
  }

  // Eğer hiç eşleşme bulamazsak varsayılan olarak ilk satırı kabul et
  if (maxMatches === 0) headerRowIndex = 0;

  const headers = rawData[headerRowIndex].map(h => String(h || '').trim());
  const preview = rawData.slice(headerRowIndex + 1, headerRowIndex + 6).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });

  return { headers, preview };
}

module.exports = { parseExcel, detectColumns, COLUMN_MAPPINGS };
