function processCloneFromForm(newId, newName, sourceFolderLink, targetFolderLink, taskId) {
  resetTaskLog(taskId);

  try {
    writeLog(taskId, '▶️ STARTING CLONE PROCESS...', true);
    writeLog(taskId, '⚙️ Extracting folder IDs...', true);

    var sourceFolderId = extractFolderId(sourceFolderLink);
    var targetParentFolderId = extractFolderId(targetFolderLink);

    var newFolderId = cloneAndRenameFolder(sourceFolderId, targetParentFolderId, newId, newName, taskId);
    var newFolderUrl = DriveApp.getFolderById(newFolderId).getUrl();

    writeLog(taskId, '✅ CLONE COMPLETED SUCCESSFULLY!', true);
    return { status: 'success', url: newFolderUrl, message: 'Clone process completed!', logs: fullLogs };
  } catch (error) {
    writeLog(taskId, '❌ Process Error: ' + error.toString(), true);
    return { status: 'error', message: error.toString(), logs: fullLogs };
  }
}

function cloneAndRenameFolder(sourceFolderId, targetParentFolderId, newGameId, newGameName, taskId) {
  var sourceFolder = DriveApp.getFolderById(sourceFolderId);
  var targetParent = DriveApp.getFolderById(targetParentFolderId);

  // Tạo tên thư mục gốc mới
  var newRootName = renameString(sourceFolder.getName(), CHANGE_OWNER_CONFIG.template.gameId, CHANGE_OWNER_CONFIG.template.gameName, newGameId, newGameName);
  var newFolder = targetParent.createFolder(newRootName);

  writeLog(taskId, "-> Started Clone: Replace '" + CHANGE_OWNER_CONFIG.template.gameId + "' -> '" + newGameId + "'", true);

  // Set quyền và owner cho thư mục gốc
  applyFolderSettings(newFolder, newRootName, newGameId, newGameName, taskId);

  // Chạy đệ quy cho các thành phần bên trong
  copyFolderRecursive(sourceFolder, newFolder, newGameId, newGameName, taskId);

  writeLog(taskId, "🌟 DONE! URL Generated.", true);
  return newFolder.getId();
}

function copyFolderRecursive(source, target, newGameId, newGameName, taskId) {
  // 1. Xử lý Files
  var files = source.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var newFileName = renameString(file.getName(), CHANGE_OWNER_CONFIG.template.gameId, CHANGE_OWNER_CONFIG.template.gameName, newGameId, newGameName);

    var copiedFile = file.makeCopy(newFileName, target);
    changeOwnerSafely(copiedFile, taskId); // Đổi owner cho file
    writeLog(taskId, " + Copied file: " + newFileName, false);
  }

  // 2. Xử lý Sub-folders
  var subFolders = source.getFolders();
  while (subFolders.hasNext()) {
    var subFolder = subFolders.next();
    var newSubFolderName = renameString(subFolder.getName(), CHANGE_OWNER_CONFIG.template.gameId, CHANGE_OWNER_CONFIG.template.gameName, newGameId, newGameName);

    var newSubFolder = target.createFolder(newSubFolderName);
    writeLog(taskId, " -> Created folder: " + newSubFolderName, false);

    // Set quyền và owner cho thư mục con
    applyFolderSettings(newSubFolder, newSubFolderName, newGameId, newGameName, taskId);

    // Đệ quy đi sâu vào trong
    copyFolderRecursive(subFolder, newSubFolder, newGameId, newGameName, taskId);
  }
}

function applyFolderSettings(folder, folderName, newGameId, newGameName, taskId) {
  // 1. Phân quyền Edit dựa trên Config
  if (!CHANGE_OWNER_CONFIG.permissions) return;
  CHANGE_OWNER_CONFIG.permissions.forEach(function (perm) {
    var expectedSuffix = newGameId + "-" + newGameName + perm.suffix;
    if (folderName === expectedSuffix) {
      try {
        folder.addEditors(perm.emails);
        writeLog(taskId, "   [+] Granted Edit permission (" + perm.suffix + "): " + perm.emails.join(", "), false);
      } catch (error) {
        writeLog(taskId, "   [!] Permission Error: " + error.toString(), false);
      }
    }
  });

  // 2. Chuyển quyền sở hữu
  changeOwnerSafely(folder, taskId);
}

function changeOwnerSafely(driveItem, taskId) {
  if (CHANGE_OWNER_CONFIG.newOwnerEmail && CHANGE_OWNER_CONFIG.newOwnerEmail.trim() !== "") {
    try {
      driveItem.setOwner(CHANGE_OWNER_CONFIG.newOwnerEmail);
    } catch (error) {
      writeLog(taskId, "   [!] Owner Transfer Error for " + driveItem.getName() + ": " + error.toString(), false);
    }
  }
}
