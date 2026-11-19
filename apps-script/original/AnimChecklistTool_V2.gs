/**
 * Main function to process root folders
 */
function processRootFolders(animFolder, state) {
  const rootFoldersIter = animFolder.getFolders();
  const subFolderList = [];

  while (rootFoldersIter.hasNext()) {
    const rf = rootFoldersIter.next();
    if (!rf.getName().toLowerCase().includes('demo')) {
      subFolderList.push(rf);
    }
  }

  subFolderList.sort((a, b) => sortAlphaNumeric(a.getName(), b.getName()));

  subFolderList.forEach(subFolder => {
    // Add Level 1 Header Row
    state.sheet.appendRow(["", subFolder.getName(), "", "", "", "", "", ""]);
    state.folderHeaderRows.push(state.currentRow++);

    // Get Level 2 folders
    const ssFolderList = getSortedFolders(subFolder);

    ssFolderList.forEach(ssFolder => {
      const sssFolderList = getSortedFolders(ssFolder);
      const isCocos = checkIsCocos(ssFolder, sssFolderList);

      if (isCocos) {
        processCocosRow(ssFolder, sssFolderList, ssFolder.getName(), state);
      } else {
        const isLevel3Spine = processSpineRow(ssFolder, ssFolder.getName(), state);

        // If Level 2 is not Spine, scan Level 3
        if (!isLevel3Spine && sssFolderList.length > 0) {
          sssFolderList.forEach(sssFolder => {
            const displayName = `${ssFolder.getName()} / ${sssFolder.getName()}`;
            processSpineRow(sssFolder, displayName, state);
          });
        }
      }
    });
  });
}

function processSpineRow(targetFolder, folderDisplayName, state) {
  const files = targetFolder.getFiles();
  const jsonFiles = [];
  const fileNames = []; // 1. Thêm mảng chứa tên file
  let imageFile = null;
  let hasJson = false, hasPng = false, hasAtlas = false;

  while (files.hasNext()) {
    const file = files.next();
    const fileName = file.getName();
    const lowerName = fileName.toLowerCase();

    // 2. Thu thập tên các file và thêm dấu gạch đầu dòng
    fileNames.push("- " + fileName);

    if (lowerName.includes('.json')) {
      hasJson = true;
      jsonFiles.push(file);
    }
    if (lowerName.includes('.png')) hasPng = true;
    if (lowerName.includes('.atlas')) hasAtlas = true;
    if (file.getMimeType().includes("image/") && !imageFile) imageFile = file;
  }

  if (!hasJson || !hasPng || !hasAtlas) return false;

  // 3. Sắp xếp lại danh sách tên file cho gọn gàng (A-Z)
  fileNames.sort();

  const richTextNote = buildSpineRichText(jsonFiles);
  const outputImageCell = imageFile ? getInCellImage(imageFile) : null;
  const folderHyperlink = `=HYPERLINK("${targetFolder.getUrl()}", "${folderDisplayName}")`;

  // 4. Gộp mảng tên file thành một chuỗi văn bản, phân cách bằng dấu xuống dòng
  const fileNameString = fileNames.join("\n");

  // 5. Thay thế chuỗi rỗng "" ở index thứ 4 bằng fileNameString
  const rowData = [state.countNo++, "Spine", "", folderHyperlink, fileNameString, "DONE", "", ""];
  state.sheet.appendRow(rowData);

  if (outputImageCell) {
    state.sheet.getRange(state.currentRow, 3).setValue(outputImageCell);
  }
  if (richTextNote) {
    state.sheet.getRange(state.currentRow, 7).setRichTextValue(richTextNote);
  }

  state.currentRow++;
  return true;
}

function processCocosRow(targetFolder, childFolders, folderDisplayName, state) {
  const rootFiles = getSortedFiles(targetFolder);
  const collectedImages = rootFiles.filter(f => f.getMimeType().includes("image/"));

  let fullTextFileName = rootFiles.map(f => f.getName()).join("\n") + (rootFiles.length ? "\n\n" : "");
  const textStyles = [];

  childFolders.forEach(cf => {
    const cFiles = getSortedFiles(cf);
    const cFileNames = cFiles.map(f => f.getName());
    cFiles.forEach(f => { if (f.getMimeType().includes("image/")) collectedImages.push(f); });

    if (cFileNames.length > 0) {
      const cHeader = cf.getName() + ":\n";
      textStyles.push({ start: fullTextFileName.length, end: fullTextFileName.length + cHeader.length, type: 'bold' });
      fullTextFileName += cHeader;

      cFileNames.forEach(name => {
        const fText = "- " + name + "\n";
        textStyles.push({ start: fullTextFileName.length, end: fullTextFileName.length + fText.length, type: 'cocosFileColor' });
        fullTextFileName += fText;
      });
      fullTextFileName += "\n";
    }
  });

  const richTextFile = buildRichText(fullTextFileName, textStyles);
  let richTextNote = null;

  if (collectedImages.length > 1) {
    const limitNotice = `⚠️ Có tổng cộng ${collectedImages.length} file ảnh.\n(Chỉ hiển thị 1 ảnh đại diện ở cột Output do giới hạn In-cell của Google Sheets)`;
    const noteRtvBuilder = SpreadsheetApp.newRichTextValue().setText(limitNotice);
    const warningColorStyle = SpreadsheetApp.newTextStyle().setBold(true).setItalic(true).setForegroundColor("#c0392b").build();
    noteRtvBuilder.setTextStyle(0, limitNotice.length, warningColorStyle);
    richTextNote = noteRtvBuilder.build();
  }

  const outputImageCell = getInCellImage(collectedImages[0]);
  const demoImageCell = getInCellImage(state.demoMap[targetFolder.getName().toLowerCase()]);
  const folderHyperlink = `=HYPERLINK("${targetFolder.getUrl()}", "${folderDisplayName}")`;

  const rowData = [state.countNo++, "Cocos", "", folderHyperlink, "", "DONE", "", ""];
  state.sheet.appendRow(rowData);

  if (outputImageCell) state.sheet.getRange(state.currentRow, 3).setValue(outputImageCell);
  if (demoImageCell) state.sheet.getRange(state.currentRow, 8).setValue(demoImageCell);
  if (richTextFile) state.sheet.getRange(state.currentRow, 5).setRichTextValue(richTextFile);
  if (richTextNote) state.sheet.getRange(state.currentRow, 7).setRichTextValue(richTextNote);

  state.currentRow++;
}

function getInCellImage(driveFile) {
  if (!driveFile) return "";

  try {
    let finalBlob = null;
    const driveMetaData = Drive.Files.get(driveFile.getId(), { fields: "thumbnailLink" });

    if (driveMetaData.thumbnailLink) {
      const thumbUrl = driveMetaData.thumbnailLink.replace('=s220', '=s500');
      const res = UrlFetchApp.fetch(thumbUrl, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) finalBlob = res.getBlob();
    }

    if (!finalBlob) finalBlob = driveFile.getBlob();

    const mimeType = finalBlob.getContentType();
    const bytes = finalBlob.getBytes();
    const base64String = Utilities.base64Encode(bytes);
    const dataUrl = `data:${mimeType};base64,${base64String}`;

    return SpreadsheetApp.newCellImage()
      .setSourceUrl(dataUrl)
      .setAltTextTitle(driveFile.getName())
      .build();
  } catch (e) {
    Logger.log(`Lỗi tạo in-cell image cho ${driveFile.getName()}: ${e.message}`);
    return "Error/Too Large";
  }
}

function prepareAnimSheet(ss, sheetName, shouldClear) {
  let sheet = ss.getSheetByName(sheetName);
  const headerRow = ["No", "Type", "Output Images", "Folder", "File Name", "Status", "Description/ Note", "Demo"];

  if (sheet) {
    if (shouldClear) {
      sheet.clear();
      sheet.getImages().forEach(img => img.remove());
      const maxRows = sheet.getMaxRows();
      const maxCols = sheet.getMaxColumns();
      if (maxRows > 0 && maxCols > 0) {
        sheet.getRange(1, 1, maxRows, maxCols).breakApart().clearDataValidations();
      }
      sheet.appendRow(headerRow);
    }
  } else {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headerRow);
  }

  return sheet;
}

function getDemoMap(demoFolder) {
  const map = {};
  const files = demoFolder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName().toLowerCase();
    const extIndex = name.lastIndexOf('.');

    if (extIndex > -1) {
      const baseName = name.substring(0, extIndex);
      map[baseName] = file;
    }
  }
  return map;
}

function checkIsCocos(ssFolder, sssFolderList) {
  const checkExt = (file) => file.getName().toLowerCase().match(/\.(anim|prefab)$/);

  const hasCocosFiles = (folder) => {
    const fIter = folder.getFiles();
    while (fIter.hasNext()) {
      if (checkExt(fIter.next())) return true;
    }
    return false;
  };

  if (hasCocosFiles(ssFolder)) return true;

  for (const sss of sssFolderList) {
    if (hasCocosFiles(sss)) return true;
  }
  return false;
}

function buildSpineRichText(jsonFiles) {
  let fullText = "";
  const textStyles = [];

  jsonFiles.forEach(jFile => {
    try {
      const parsedData = JSON.parse(jFile.getBlob().getDataAsString());
      const baseName = jFile.getName().replace('.json', '');

      if (parsedData?.skins) {
        const skinNames = Array.isArray(parsedData.skins)
          ? parsedData.skins.map(s => s.name).filter(n => n !== "default")
          : Object.keys(parsedData.skins).filter(k => k !== "default");

        if (skinNames.length > 0) {
          const headerSkin = "Skin:\n";
          textStyles.push({ start: fullText.length, end: fullText.length + headerSkin.length, type: 'bold' });
          fullText += headerSkin;

          skinNames.forEach(skin => {
            const sText = `- ${skin}\n`;
            textStyles.push({ start: fullText.length, end: fullText.length + sText.length, type: 'skinColor' });
            fullText += sText;
          });
          fullText += "\n";
        }
      }

      if (parsedData?.animations) {
        const animNames = Object.keys(parsedData.animations);
        const headerText = `${baseName} - ${animNames.length} animation:\n`;
        textStyles.push({ start: fullText.length, end: fullText.length + headerText.length, type: 'bold' });
        fullText += headerText;

        animNames.forEach(anim => {
          const animText = `- ${anim}\n`;
          textStyles.push({ start: fullText.length, end: fullText.length + animText.length, type: 'animColor' });
          fullText += animText;
        });
        fullText += "\n";
      }
    } catch (e) {
      Logger.log(`Lỗi parse JSON cho file ${jFile.getName()}: ${e.message}`);
    }
  });

  return buildRichText(fullText, textStyles);
}

function buildRichText(fullText, textStyles) {
  if (!fullText) return null;
  fullText = fullText.replace(/\n+$/, '');

  const rtvBuilder = SpreadsheetApp.newRichTextValue().setText(fullText);
  const styles = {
    bold: SpreadsheetApp.newTextStyle().setBold(true).setForegroundColor("#000000").build(),
    animColor: SpreadsheetApp.newTextStyle().setBold(false).setForegroundColor("#0000ff").build(),
    skinColor: SpreadsheetApp.newTextStyle().setBold(false).setForegroundColor("#d35400").build(),
    cocosFileColor: SpreadsheetApp.newTextStyle().setBold(false).setForegroundColor("#27ae60").build()
  };

  textStyles.forEach(s => {
    const st = Math.min(s.start, fullText.length);
    const en = Math.min(s.end, fullText.length);
    if (st < en && styles[s.type]) {
      rtvBuilder.setTextStyle(st, en, styles[s.type]);
    }
  });

  return rtvBuilder.build();
}

function applyAnimSheetFormatting(sheet, state) {
  const lastRow = state.currentRow - 1;
  const headersLength = 8;
  const totalDataRange = sheet.getRange(1, 1, lastRow, headersLength);

  totalDataRange.setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true)
    .setWrap(true);

  sheet.getRange(2, 5, lastRow - 1, 1).setHorizontalAlignment("left");
  sheet.getRange(2, 7, lastRow - 1, 1).setHorizontalAlignment("left");

  sheet.setRowHeights(2, lastRow - 1, 250);
  sheet.setRowHeight(1, 50);
  sheet.getRange(1, 1, 1, headersLength).setFontWeight("bold").setBackground("#FFFF00");

  const typeRule = SpreadsheetApp.newDataValidation().requireValueInList(TYPE_RULE, true).setAllowInvalid(false).build();
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_RULE, true).setAllowInvalid(false).build();

  const typeRange = sheet.getRange(2, 2, lastRow - 1, 1);
  const statusRange = sheet.getRange(2, 6, lastRow - 1, 1);

  sheet.getRange(2, 3, lastRow - 1, 1).setBackground("#666666");
  sheet.getRange(2, 8, lastRow - 1, 1).setBackground("#666666");

  typeRange.setBackground("#b4c6e7").setDataValidation(typeRule);
  statusRange.setBackground("#c6e0b4").setDataValidation(statusRule);

  applyDropdownColors(sheet, typeRange, TYPE_COLORS);
  applyDropdownColors(sheet, statusRange, STATUS_COLORS);

  const widths = [45, 70, 300, 200, 275, 80, 275, 365];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  state.folderHeaderRows.forEach(rowNum => {
    sheet.getRange(rowNum, 1, 1, headersLength).setBackground("#fae3d9").setFontWeight("bold").clearDataValidations();
    sheet.getRange(rowNum, 2, 1, headersLength - 1).mergeAcross().setHorizontalAlignment("center");
    sheet.setRowHeight(rowNum, 35);
  });
}

function openAnimChecklistTool() {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('AnimChecklistToolUI_V2')
    .setWidth(500)
    .setHeight(600)
    .setTitle('Animation Checklist Tool');
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Animation Checklist Tool');
}

function processAnimationChecklist(folderUrl, sheetUrl, demoUrl, insertInCell) {
  const ssId = extractIdFromUrl(sheetUrl);
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = "Anim_Source";
  const shouldClear = !!folderUrl;

  const sheet = prepareAnimSheet(ss, sheetName, shouldClear);

  const state = {
    sheet: sheet,
    currentRow: 2,
    countNo: 1,
    folderHeaderRows: [],
    demoMap: {}
  };

  if (folderUrl) {
    const folderId = extractIdFromUrl(folderUrl);
    const animFolder = DriveApp.getFolderById(folderId);
    processRootFolders(animFolder, state);
    if (state.currentRow > 2) {
      applyAnimSheetFormatting(sheet, state);
    }
  }

  if (demoUrl) {
    const demoId = extractIdFromUrl(demoUrl);
    const demoFolder = DriveApp.getFolderById(demoId);
    const demoMap = getDemoMap(demoFolder);
    updateDemoFromSheet(sheet, demoMap, insertInCell);
  }
}

function updateDemoFromSheet(sheet, demoMap, insertInCell) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // =========================================================================
  // FIX: XÓA ẢNH NỔI (OVER-CELL) TRIỆT ĐỂ
  // =========================================================================
  const existingImages = sheet.getImages();

  // 1. Duyệt mảng ngược từ dưới lên để không bị trượt index khi remove()
  for (let i = existingImages.length - 1; i >= 0; i--) {
    try {
      const img = existingImages[i];
      const anchor = img.getAnchorCell();

      // 2. Bắt buộc phải kiểm tra anchor tồn tại để tránh lỗi "Cannot read property getRow of null"
      if (anchor) {
        const row = anchor.getRow();
        const col = anchor.getColumn();
        // Chỉ xóa các ảnh từ dòng 2 trở đi thuộc cột 3 (Output) và cột 8 (Demo)
        if (row >= 2 && (col === 3 || col === 8)) {
          img.remove();
        }
      }
    } catch (e) {
      Logger.log("Lỗi xóa ảnh: " + e.message);
    }
  }

  // 3. BẮT BUỘC: Ép Google Sheets thực thi lệnh xóa và làm mới giao diện ngay lập tức
  // trước khi tiến hành chèn ảnh đè lên. 
  SpreadsheetApp.flush();
  // =========================================================================

  // Tiếp tục xử lý lấy dữ liệu từ bảng tính
  const typeData = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const folderData = sheet.getRange(2, 4, lastRow - 1, 1).getDisplayValues();
  const fileNameData = sheet.getRange(2, 5, lastRow - 1, 1).getDisplayValues();

  for (let i = 0; i < folderData.length; i++) {
    const rowNum = i + 2;
    const rowType = typeData[i][0].trim();
    let matchedFile = null;
    const fileContent = fileNameData[i][0];

    if (fileContent) {
      const lines = fileContent.toLowerCase().split('\n');
      for (let line of lines) {
        let cleanName = line.replace(/^- /, '').trim();
        if (!cleanName || cleanName.endsWith(':')) continue;

        let baseName = cleanName;
        if (cleanName.includes('.')) {
          baseName = cleanName.substring(0, cleanName.lastIndexOf('.'));
        }

        if (demoMap[baseName]) {
          matchedFile = demoMap[baseName];
          break;
        }
      }
    }

    if (!matchedFile && folderData[i][0]) {
      let folderName = folderData[i][0].toLowerCase();
      let folderParts = folderName.split('/');
      let childName = folderParts[folderParts.length - 1].trim();
      if (demoMap[childName]) {
        matchedFile = demoMap[childName];
      }
    }

    if (matchedFile) {
      const isGif = matchedFile.getName().toLowerCase().endsWith('.gif');
      let targetCol = (rowType === "Cocos" && !isGif) ? 3 : 8;

      // KIỂM TRA CHECKBOX
      if (insertInCell === true || insertInCell === "true") {
        // --- CHÈN IN-CELL ---
        const demoImageCell = getInCellImage(matchedFile);
        if (demoImageCell && demoImageCell !== "Error/Too Large") {
          sheet.getRange(rowNum, targetCol).setValue(demoImageCell);
        }
      } else {
        // --- CHÈN OVER-CELL (ẢNH NỔI) ---
        try {
          // Vẫn cần dòng này để xóa text/in-cell image nếu có
          sheet.getRange(rowNum, targetCol).setValue("");

          const blob = matchedFile.getBlob();
          const img = sheet.insertImage(blob, targetCol, rowNum);

          const cellW = sheet.getColumnWidth(targetCol) || 300;
          const cellH = sheet.getRowHeight(rowNum) || 250;
          const imgW = img.getWidth();
          const imgH = img.getHeight();

          const padding = 10;
          const scale = Math.min(1, (cellW - padding) / imgW, (cellH - padding) / imgH);
          const newW = imgW * scale;
          const newH = imgH * scale;

          img.setWidth(newW);
          img.setHeight(newH);

          img.setAnchorCellXOffset(Math.max(0, (cellW - newW) / 2));
          img.setAnchorCellYOffset(Math.max(0, (cellH - newH) / 2));
        } catch (e) {
          Logger.log(`Lỗi chèn ảnh nổi cho ${matchedFile.getName()}: ${e.message}`);
          // FALLBACK về In-cell nếu ảnh nổi lỗi (như ảnh GIF quá nặng)
          const fallbackCell = getInCellImage(matchedFile);
          if (fallbackCell && fallbackCell !== "Error/Too Large") {
            sheet.getRange(rowNum, targetCol).setValue(fallbackCell);
          }
        }
      }
    }
  }
}