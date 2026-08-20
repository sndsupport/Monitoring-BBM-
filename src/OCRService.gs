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
    
    // 5. Filter logika Odometer
    // Odometer biasanya adalah angka 4 hingga 7 digit yang menyatu
    let possibleNumbers = extractedText.match(/\d{4,7}/g);
    let bestNumber = "";
    if (possibleNumbers && possibleNumbers.length > 0) {
       // Ambil angka terpanjang dari kandidat yang ada
       bestNumber = possibleNumbers.reduce((a, b) => a.length > b.length ? a : b);
    } else {
       // Fallback: Jika tidak ada angka panjang, ambil angka apa pun yang paling panjang
       let allNumbers = extractedText.match(/\d+/g);
       if (allNumbers && allNumbers.length > 0) {
          bestNumber = allNumbers.reduce((a, b) => a.length > b.length ? a : b);
       }
    }
    
    return {
      success: true,
      rawText: extractedText,
      extractedNumbers: bestNumber
    };
    
  } catch (e) {
    Logger.log('OCR Error: ' + e.toString());
    return {
      success: false,
      error: e.toString()
    };
  }
}

