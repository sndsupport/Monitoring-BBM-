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
  let branches = getDB().getSheetByName('Cabang');
  let cabangs = [];
  if (branches && branches.getLastRow() > 1) {
    const data = branches.getRange(2, 1, branches.getLastRow() - 1, 2).getValues();
    cabangs = data.map(r => r[0]).filter(c => c);
  }
  cabangs.forEach(function(c) {
    const bf = getFolderByNameOrCreate(String(c).replace(/[^A-Za-z0-9_-]/g, ''), mainFolder);
    getFolderByNameOrCreate('KM_Awal', bf);
    getFolderByNameOrCreate('KM_Akhir', bf);
    getFolderByNameOrCreate('Indikator_BBM', bf);
    getFolderByNameOrCreate('Flazz_TopUp', bf);
    getFolderByNameOrCreate('Flazz_Recon', bf);
    getFolderByNameOrCreate('Struk_BBM', bf);
  });
  return mainFolder.getId();
}

function uploadImageToDrive(base64Data, filename, subfolderName, cabang) {
  try {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

    let mimeType = 'image/jpeg';
    let match = base64Data.match(/^data:(.*?);base64,/);
    if (match) mimeType = match[1];
    let base64String = match ? base64Data.split(',')[1] : base64Data;

    if (allowedTypes.indexOf(String(mimeType).toLowerCase()) === -1) {
      throw new Error('Tipe file tidak diizinkan: ' + mimeType);
    }
    const bytes = Utilities.base64Decode(base64String);
    if (bytes.length > 10 * 1024 * 1024) {
      throw new Error('Ukuran file melebihi 10MB');
    }

    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const cabangDir = String(cabang || 'TANPA-CABANG').replace(/[^A-Za-z0-9_-]/g, '');
    const mainFolder = getFolderByNameOrCreate('BBM_OPERASIONAL');
    const branchFolder = getFolderByNameOrCreate(cabangDir, mainFolder);
    const targetFolder = subfolderName ? getFolderByNameOrCreate(subfolderName, branchFolder) : branchFolder;

    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

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

function fixPhotoPermissions() {
  const main = getFolderByNameOrCreate('BBM_OPERASIONAL');
  let count = 0;
  function process(folder) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      try {
        files.next().setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        count++;
      } catch (e) { /* skip file bermasalah */ }
    }
    const subs = folder.getFolders();
    while (subs.hasNext()) process(subs.next());
  }
  process(main);
  return count + ' foto diperbarui izinnya';
}

function extractDriveFileId(urlOrId) {
  if (!urlOrId) return '';
  let s = String(urlOrId);
  let m = s.match(/\/file\/d\/([\w-]+)/);       // https://drive.google.com/file/d/<ID>/view
  if (m) return m[1];
  m = s.match(/[-\w]{25,}/);                      // fallback: pola ID standalone/thumbnail
  return m ? m[0] : '';
}

function deleteDriveFileById(fileId) {
  try {
    if (!fileId) return { success: true };
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

