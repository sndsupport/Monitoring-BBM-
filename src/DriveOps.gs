function getFolderByNameOrCreate(folderName, parentFolder = DriveApp.getRootFolder()) {
  let folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

function initDriveFolders() {
  let mainFolder = getFolderByNameOrCreate('BBM_OPERASIONAL');
  let odoFolder = getFolderByNameOrCreate('Odometer', mainFolder);
  getFolderByNameOrCreate('KM_Awal', odoFolder);
  getFolderByNameOrCreate('KM_Akhir', odoFolder);
  getFolderByNameOrCreate('Struk_BBM', mainFolder);
  getFolderByNameOrCreate('Evidence', mainFolder);
  return mainFolder.getId();
}

function uploadImageToDrive(base64Data, filename, subfolderName) {
  try {
    let mainFolder = getFolderByNameOrCreate('BBM_OPERASIONAL');
    // Simplified logic, in real use we navigate to proper subfolder
    
    let blob = Utilities.newBlob(Utilities.base64Decode(base64Data.split(',')[1]), 'image/jpeg', filename);
    let file = mainFolder.createFile(blob);
    
    return {
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl()
    };
  } catch (e) {
    return {
      success: false,
      error: e.toString()
    };
  }
}

