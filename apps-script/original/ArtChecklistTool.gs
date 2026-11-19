function updateDriveFolderToSpreadsheet(rootFolderId, artSourceId, spreadsheetId, allowedSheets) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const foldersToProcess = getFoldersToProcess(rootFolderId, artSourceId);

  for (const item of foldersToProcess) {
    const { folder, originalName, sheetName, isPSD } = item;

    if (allowedSheets && allowedSheets.length > 0) {
      if (!allowedSheets.includes(originalName) && !allowedSheets.includes(sheetName)) {
        continue;
      }
    }

    const sheet = prepareSheet(ss, sheetName, isPSD);

    if (sheet) {
      const state = {
        sheet: sheet,
        currentRowIndex: 2,
        globalCount: 1,
        folderHeaderRows: [],
        hasSubFolders: folder.getFolders().hasNext(),
        isPSD: isPSD,
        headers: isPSD
          ? ["No", "Type", "Folder", "File Name", "Status", "Description/ Note"]
          : ["No", "Type", "Output Images", "Folder", "File Name", "Dimensions", "Status", "Description/ Note", "Demo"]
      };

      sheet.appendRow(state.headers);

      // Chạy đệ quy quét file
      processFolderRecursive(folder, state);

      // Nếu có dữ liệu thì format, không thì xóa sheet (trừ khi được chỉ định)
      if (state.currentRowIndex > 2) {
        applySheetFormatting(sheet, state);
      } else if (!allowedSheets || allowedSheets.length === 0) {
        ss.deleteSheet(sheet);
      }
    }
  }
}

/**
 * Thu thập và sắp xếp các thư mục cần xử lý
 */
function getFoldersToProcess(rootFolderId, artSourceId) {
  const foldersToProcess = [];

  if (rootFolderId) {
    const rootFolder = DriveApp.getFolderById(rootFolderId);
    const topSubFolders = rootFolder.getFolders();
    while (topSubFolders.hasNext()) {
      const f = topSubFolders.next();
      foldersToProcess.push({
        folder: f,
        originalName: f.getName(),
        sheetName: f.getName().replace(/^\d+_/, ''),
        isPSD: false
      });
    }
    foldersToProcess.sort((a, b) => sortAlphaNumeric(a.originalName, b.originalName));
  }

  if (artSourceId) {
    try {
      const artFolder = DriveApp.getFolderById(artSourceId);
      foldersToProcess.unshift({
        folder: artFolder,
        originalName: "Art_Source",
        sheetName: "Art_Source",
        isPSD: true
      });
    } catch (e) {
      Logger.log("Không thể truy cập Art Source folder: " + e.toString());
    }
  }

  return foldersToProcess;
}

/**
 * Xóa dữ liệu cũ hoặc tạo sheet mới
 */
function prepareSheet(ss, sheetName, isPSD) {
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.clear();
    const drawings = sheet.getDrawings();
    drawings.forEach(d => d.remove());

    const maxRows = sheet.getMaxRows();
    const maxCols = sheet.getMaxColumns();
    if (maxRows > 0 && maxCols > 0) {
      const range = sheet.getRange(1, 1, maxRows, maxCols);
      range.breakApart();
      range.clearDataValidations();
    }
  } else {
    sheet = ss.insertSheet(sheetName, ss.getNumSheets());
  }

  if (isPSD) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }
  return sheet;
}

/**
 * Hàm đệ quy quét file trong thư mục
 */
function processFolderRecursive(currentFolder, state) {
  const files = currentFolder.getFiles();
  const fileArray = [];
  const fntMap = {};

  // Phân loại file
  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();
    const name = file.getName();

    if (mimeType.includes('image/') || state.isPSD) {
      fileArray.push(file);
    } else if (name.toLowerCase().endsWith('.fnt')) {
      const baseName = name.substring(0, name.lastIndexOf('.'));
      fntMap[baseName] = file;
    }
  }

  if (fileArray.length > 0) {
    const currentFolderName = currentFolder.getName();

    // Tạo dòng header cho thư mục (nếu có subfolder)
    if (state.hasSubFolders) {
      const emptyRow = new Array(state.headers.length).fill("");
      emptyRow[1] = currentFolderName;

      state.sheet.getRange(state.currentRowIndex, 1, 1, state.headers.length).setValues([emptyRow]);
      state.folderHeaderRows.push(state.currentRowIndex);
      state.currentRowIndex++;
    }

    fileArray.sort((a, b) => sortAlphaNumeric(a.getName(), b.getName()));

    const rowData = [];

    // Xử lý từng file
    for (const f of fileArray) {
      const fileId = f.getId();
      const fileName = f.getName();
      const lastDotIndex = fileName.lastIndexOf('.');
      const baseImageName = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
      const fntFile = fntMap[baseImageName];

      const typeVal = state.isPSD ? "PSD" : (fntFile ? "Bitmap Font" : "Static");
      const folderLinkFormula = `=HYPERLINK("${currentFolder.getUrl()}", "${currentFolderName}")`;
      const uploadTime = Utilities.formatDate(f.getLastUpdated(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

      let cellText = fileName;
      if (fntFile) cellText += "\n" + fntFile.getName();

      // Đẩy trực tiếp cellText vào rowData thay vì chuỗi rỗng ""
      if (state.isPSD) {
        rowData.push([state.globalCount++, typeVal, folderLinkFormula, cellText, "DONE", "Last updated: " + uploadTime]);
      } else {
        let dimensions = "N/A";
        let outputImageCell = "Error/Too Large";

        try {
          const driveFile = Drive.Files.get(fileId, { fields: "imageMediaMetadata" });
          if (driveFile.imageMediaMetadata?.width) {
            dimensions = `${driveFile.imageMediaMetadata.width} x ${driveFile.imageMediaMetadata.height}`;
          }

          const blob = f.getBlob();
          const base64String = Utilities.base64Encode(blob.getBytes());
          const dataUrl = `data:${blob.getContentType()};base64,${base64String}`;

          outputImageCell = SpreadsheetApp.newCellImage()
            .setSourceUrl(dataUrl)
            .setAltTextTitle(fileName)
            .build();
        } catch (e) {
          Logger.log(`Lỗi Base64: ${fileName} - ${e.message}`);
        }

        // Thay khoảng trắng bằng cellText vào đúng vị trí cột File Name
        rowData.push([
          state.globalCount++, typeVal, outputImageCell, folderLinkFormula, cellText, dimensions, "DONE", "Last updated: " + uploadTime, ""
        ]);
      }
    }

    // Đẩy toàn bộ dữ liệu vào sheet (không dùng setRichTextValues nữa)
    state.sheet.getRange(state.currentRowIndex, 1, rowData.length, state.headers.length).setValues(rowData);

    state.currentRowIndex += rowData.length;
  }

  // Xử lý các thư mục con
  const subFolders = currentFolder.getFolders();
  const subFolderArray = [];
  while (subFolders.hasNext()) subFolderArray.push(subFolders.next());

  subFolderArray.sort((a, b) => sortAlphaNumeric(a.getName(), b.getName()));
  subFolderArray.forEach(sub => processFolderRecursive(sub, state));
}

function applySheetFormatting(sheet, state) {
  const { currentRowIndex, headers, isPSD, folderHeaderRows } = state;
  const numRows = currentRowIndex - 2;

  // Căn giữa, đóng khung tổng thể
  const totalDataRange = sheet.getRange(1, 1, currentRowIndex - 1, headers.length);
  totalDataRange.setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true);

  sheet.setRowHeights(2, numRows, isPSD ? 40 : 150);
  sheet.setRowHeight(1, 50);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#FFFF00");

  // ==========================================
  // DATA VALIDATION (TẠO DROPDOWN)
  // ==========================================
  const typeRule = SpreadsheetApp.newDataValidation().requireValueInList(TYPE_RULE, true).setAllowInvalid(false).build();
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_RULE, true).setAllowInvalid(false).build();

  // Khai báo range cho Type và Status (Dựa vào isPSD để lấy đúng cột Status)
  const typeRange = sheet.getRange(2, 2, numRows, 1);
  const statusRange = sheet.getRange(2, isPSD ? 5 : 7, numRows, 1);

  // Gán dropdown vào ô và đặt màu nền mặc định
  typeRange.setBackground("#b4c6e7").setDataValidation(typeRule);
  statusRange.setBackground("#c6e0b4").setDataValidation(statusRule);

  // ==========================================
  // TÔ MÀU CHO TỪNG LỰA CHỌN DROPDOWN
  // ==========================================
  applyDropdownColors(sheet, typeRange, TYPE_COLORS);
  applyDropdownColors(sheet, statusRange, STATUS_COLORS);

  // ==========================================
  // SETUP ĐỘ RỘNG CỘT
  // ==========================================
  if (isPSD) {
    const widths = [40, 70, 200, 300, 120, 300];
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  } else {
    const widths = [40, 70, 250, 200, 300, 120, 70, 300, 250];
    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }

  // ==========================================
  // ĐỊNH DẠNG DÒNG FOLDER HEADER
  // ==========================================
  folderHeaderRows.forEach(rowNum => {
    sheet.getRange(rowNum, 1, 1, headers.length).setBackground("#fae3d9").setFontWeight("bold").clearDataValidations();
    sheet.getRange(rowNum, 2, 1, headers.length - 1).mergeAcross().setHorizontalAlignment("center");
    sheet.setRowHeight(rowNum, 35);
  });
}

// ==========================================
// HTML
// ==========================================
function openArtChecklistTool() {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('ArtChecklistToolUI')
    .setWidth(600)
    .setHeight(750)
    .setTitle('ART Checklist Update Tool');
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'ART Checklist Update Tool');
}

function getSubFoldersFromUrl(folderUrlInput, artSourceUrlInput) {
  const folderId = extractIdFromUrl(folderUrlInput);
  const artSourceId = extractIdFromUrl(artSourceUrlInput);
  const list = [];

  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const subsIterator = folder.getFolders();
    while (subsIterator.hasNext()) {
      list.push(subsIterator.next().getName());
    }
  }

  list.sort(sortAlphaNumeric);

  if (artSourceId) {
    list.unshift("Art_Source");
  }

  if (list.length === 0) {
    throw new Error("Không có sub-folder (tab) nào trong thư mục này.");
  }

  return list;
}

function executeCustomSheetsFromUi(folderUrlInput, artSourceUrlInput, sheetUrlInput, selectedList) {
  const folderId = extractIdFromUrl(folderUrlInput);
  const sheetId = extractIdFromUrl(sheetUrlInput);
  const artSourceId = extractIdFromUrl(artSourceUrlInput);

  if ((!folderId && !artSourceId) || !sheetId) {
    throw new Error("Link Folder hoặc Sheet không hợp lệ, vui lòng kiểm tra lại!");
  }

  updateDriveFolderToSpreadsheet(folderId, artSourceId, sheetId, selectedList);
  return "Thành công";
}