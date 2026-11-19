// === HÀM THỰC HIỆN CHUYỂN QUYỀN ===
function processTransfer(folderUrl, newOwnerEmail, taskId) {
  if (!folderUrl || !newOwnerEmail) {
    return { status: 'error', message: '❌ Please fill in all required fields!', logs: fullLogs };
  }

  resetTaskLog(taskId);

  try {
    var match = folderUrl.match(/[-\w]{25,}/);
    var folderId = (match && match.length > 0) ? match[0] : null;

    if (!folderId) {
      writeLog(taskId, '❌ Invalid Folder URL. Could not extract Folder ID!', true);
      return { status: 'error', message: 'Invalid Folder URL!', logs: fullLogs };
    }

    var folder = DriveApp.getFolderById(folderId);
    var currentUserEmail = Session.getActiveUser().getEmail();

    writeLog(taskId, '▶️ STARTING TRANSFER OF OWNERSHIP...', true);
    writeLog(taskId, '👤 Current User: ' + currentUserEmail, true);
    writeLog(taskId, '🔍 Scanning folder: ' + folder.getName() + '...', true);

    transferOwnership(folder, newOwnerEmail, currentUserEmail, taskId);

    writeLog(taskId, '✅ COMPLETED SUCCESSFULLY!', true);

    return { status: 'success', message: 'Ownership transfer completed successfully!', logs: fullLogs };

  } catch (e) {
    writeLog(taskId, '❌ System Error: ' + e.message, true);
    return { status: 'error', message: 'System Error: ' + e.message, logs: fullLogs };
  }
}

function transferOwnership(folder, newOwnerEmail, currentUserEmail, taskId) {
  try {
    var folderOwner = folder.getOwner() ? folder.getOwner().getEmail() : "Unknown";
    if (folderOwner === currentUserEmail && folderOwner !== newOwnerEmail) {
      folder.setOwner(newOwnerEmail);
      writeLog(taskId, '📁 Transferred folder: ' + folder.getName(), false);
    } else {
      writeLog(taskId, '⏩ Skipped folder: ' + folder.getName() + ' (Owner: ' + folderOwner + ')', false);
    }
  } catch (e) {
    writeLog(taskId, '❌ Error in folder ' + folder.getName() + ': ' + e.message, false);
  }

  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    try {
      var fileOwner = file.getOwner() ? file.getOwner().getEmail() : "Unknown";
      if (fileOwner === currentUserEmail && fileOwner !== newOwnerEmail) {
        file.setOwner(newOwnerEmail);
        writeLog(taskId, '📄 Transferred file: ' + file.getName(), false);
      } else {
        writeLog(taskId, '⏩ Skipped file: ' + file.getName() + ' (Owner: ' + fileOwner + ')', false);
      }
    } catch (e) {
      writeLog(taskId, '❌ Error in file ' + file.getName() + ': ' + e.message, false);
    }
  }

  var subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    var subFolder = subFolders.next();
    transferOwnership(subFolder, newOwnerEmail, currentUserEmail, taskId);
  }
}

// === HÀM KIỂM TRA QUYỀN ===
function checkOwnershipStatus(folderUrl, targetEmail, taskId) {
  if (!folderUrl || !targetEmail) {
    return { status: 'error', html: '<div style="color: #d93025; text-align: center; font-weight: bold; padding: 10px;">❌ Please fill in all required fields!</div>' };
  }

  resetTaskLog(taskId);

  try {
    var match = folderUrl.match(/[-\w]{25,}/);
    var folderId = (match && match.length > 0) ? match[0] : null;

    if (!folderId) {
      writeLog(taskId, '❌ Invalid Folder URL. Could not extract Folder ID!', true);
      return { status: 'error', html: '<div style="color: #d93025; text-align: center; font-weight: bold; padding: 10px;">❌ Error: Invalid Folder URL!</div>' };
    }

    var folder = DriveApp.getFolderById(folderId);
    var otherOwners = new Set();
    var discrepancies = [];

    writeLog(taskId, '▶️ STARTING OWNERSHIP CHECK...', true);
    writeLog(taskId, '👤 Target Email: ' + targetEmail, true);

    function scanFolder(fld) {
      var owner = fld.getOwner() ? fld.getOwner().getEmail() : "Unknown";
      if (owner !== targetEmail) {
        otherOwners.add(owner);
        discrepancies.push("📁 <b>Folder:</b> " + fld.getName() + " (Owner: " + owner + ")");
        writeLog(taskId, '⚠️ Warning (Folder): ' + fld.getName() + ' - Owned by ' + owner, false);
      } else {
        writeLog(taskId, '✅ Valid (Folder): ' + fld.getName(), false);
      }

      var files = fld.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        var fileOwner = file.getOwner() ? file.getOwner().getEmail() : "Unknown";
        if (fileOwner !== targetEmail) {
          otherOwners.add(fileOwner);
          discrepancies.push("📄 <b>File:</b> " + file.getName() + " (Owner: " + fileOwner + ")");
          writeLog(taskId, '⚠️ Warning (File): ' + file.getName() + ' - Owned by ' + fileOwner, false);
        } else {
          writeLog(taskId, '✅ Valid (File): ' + file.getName(), false);
        }
      }

      var subFolders = fld.getFolders();
      while (subFolders.hasNext()) {
        scanFolder(subFolders.next());
      }
    }

    scanFolder(folder);

    writeLog(taskId, '✅ CHECK COMPLETED SUCCESSFULLY!', true);

    var finalHtml = '';
    if (discrepancies.length === 0) {
      finalHtml = '<div style="color: #188038; text-align: center; font-weight: bold; margin-bottom: 15px; font-size: 16px;">✅ Great! All files and folders are owned by ' + targetEmail + '!</div>';
    } else {
      finalHtml = '<div style="color: #d32f2f; text-align: center; margin-bottom:15px; font-size: 16px;">⚠️ <b>Found ' + discrepancies.length + ' item(s) NOT owned by ' + targetEmail + '</b></div>';

      finalHtml += '<div style="color: #333; font-weight: bold; text-align: left;">👤 Emails currently designated as Owner:</div>';
      finalHtml += '<ul style="text-align: left; margin-top: 5px; margin-bottom: 15px; font-size: 13px; color: #155724; background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 12px 12px 12px 35px;">';
      var ownersArray = Array.from(otherOwners);
      ownersArray.forEach(function (email) {
        finalHtml += '<li>' + email + '</li>';
      });
      finalHtml += '</ul>';

      finalHtml += '<div style="color: #333; font-weight: bold; text-align: left;">📂 Details of items with other owners:</div>';
      var displayLimit = 50;
      finalHtml += '<div style="margin-top: 5px; text-align: left; max-height: 180px; overflow-y: auto; border: 1px solid #ccc; padding: 12px; font-size: 13px; background: #f9f9f9; border-radius: 6px; line-height: 1.5;">';

      for (var i = 0; i < Math.min(discrepancies.length, displayLimit); i++) {
        finalHtml += discrepancies[i] + '<br>';
      }

      if (discrepancies.length > displayLimit) {
        finalHtml += '<br><i style="color: #666;">...and ' + (discrepancies.length - displayLimit) + ' other item(s).</i>';
      }
      finalHtml += '</div>';
    }

    return { status: 'success', html: finalHtml, logs: fullLogs };

  } catch (e) {
    writeLog(taskId, '❌ System Error: ' + e.message, true);
    return { status: 'error', html: '<div style="color: red; text-align: center; font-weight: bold;">❌ System Error: ' + e.message + '</div>', logs: fullLogs };
  }
}
