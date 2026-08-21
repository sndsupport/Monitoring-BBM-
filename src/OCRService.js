/**
 * Fungsi untuk memproses foto odometer menggunakan Google Drive OCR bawaan.
 * @param {String} fileId - ID File gambar di Drive
 * @returns {Object} Teks yang berhasil diekstrak
 */
function processOdometerImageOCR(fileId) {
  try {
    let originalFile = DriveApp.getFileById(fileId);
    
    // 2. Buat copy dari file tersebut dan ubah mimeType-nya menjadi Google Document
    let docResource = {
      title: originalFile.getName() + '_OCR',
      mimeType: MimeType.GOOGLE_DOCS
    };
    
    let ocrFile = Drive.Files.copy(docResource, fileId, {ocr: true, ocrLanguage: 'id'});
    
    // 3. Buka dokumen yang dihasilkan dan ambil teksnya
    let doc = DocumentApp.openById(ocrFile.id);
    let extractedText = doc.getBody().getText();
    
    // 4. Bersihkan file sementara (document)
    DriveApp.getFileById(ocrFile.id).setTrashed(true);
    
    // 5. Kembalikan teks dan ambil angka odometer saja.
    // Odometer biasanya tampil sebagai satu deret digit terpanjang di foto;
    // angka lain (tanggal, jam, dsb yang ikut terbaca OCR) biasanya lebih pendek,
    // jadi jangan digabung semua (bisa salah baca jadi satu angka raksasa).
    let digitGroups = extractedText.match(/\d+/g) || [];
    let numbersOnly = digitGroups.length
      ? digitGroups.reduce((longest, curr) => curr.length > longest.length ? curr : longest, '')
      : '';

    return {
      success: true,
      rawText: extractedText,
      extractedNumbers: numbersOnly
    };
    
  } catch (e) {
    Logger.log('OCR Error: ' + e.toString());
    return {
      success: false,
      error: e.toString()
    };
  }
}

