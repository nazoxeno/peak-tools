/**
 * PEAK Tools Engine
 * ------------------------------------------------------------------
 * Phần "máy" chạy bằng Apps Script cho các tool cần chèn ảnh vào Google Sheet
 * (Sheets API của web không hỗ trợ). Web gọi các hàm public bên dưới qua
 * Apps Script API (scripts.run), chạy bằng tài khoản của người dùng.
 *
 * Mỗi hàm public xử lý MỘT phần việc nhỏ (1 tab / 1 folder / 1 nhóm dòng)
 * để không vượt giới hạn 6 phút. Web tự chia việc và gọi lần lượt.
 *
 * Hàm kết thúc bằng dấu _ là hàm nội bộ (không gọi được từ web).
 */

var ENGINE_VERSION = 1;

/** Web gọi để kiểm tra kết nối. */
function ping() {
  return { ok: true, version: ENGINE_VERSION };
}

// ===================================================================
// ART CHECKLIST
// ===================================================================

/**
 * Cập nhật 1 tab checklist từ 1 folder.
 * @param {{spreadsheetId:string, folderId:string, sheetName:string, isPSD:boolean,
 *          typeColors:Object, statusColors:Object}} p
 */
function artProcessFolder(p) {
  var logs = [];
  var ss = SpreadsheetApp.openById(p.spreadsheetId);
  var folder = DriveApp.getFolderById(p.folderId);
  var sheet = artPrepareSheet_(ss, p.sheetName, p.isPSD);

  var state = {
    sheet: sheet,
    currentRowIndex: 2,
    globalCount: 1,
    folderHeaderRows: [],
    hasSubFolders: folder.getFolders().hasNext(),
    isPSD: p.isPSD,
    headers: p.isPSD
      ? ['No', 'Type', 'Folder', 'File Name', 'Status', 'Description/ Note']
      : ['No', 'Type', 'Output Images', 'Folder', 'File Name', 'Dimensions', 'Status', 'Description/ Note', 'Demo'],
    logs: logs
  };

  sheet.appendRow(state.headers);
  artProcessFolderRecursive_(folder, state);

  if (state.currentRowIndex > 2) {
    artApplyFormatting_(sheet, state, p);
  }

  return { rows: state.globalCount - 1, logs: logs };
}

function artPrepareSheet_(ss, sheetName, isPSD) {
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.clear();
    sheet.getDrawings().forEach(function (d) { d.remove(); });
    sheet.setConditionalFormatRules([]);
    var maxRows = sheet.getMaxRows();
    var maxCols = sheet.getMaxColumns();
    if (maxRows > 0 && maxCols > 0) {
      var range = sheet.getRange(1, 1, maxRows, maxCols);
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

function artProcessFolderRecursive_(currentFolder, state) {
  var files = currentFolder.getFiles();
  var fileArray = [];
  var fntMap = {};

  while (files.hasNext()) {
    var file = files.next();
    var mimeType = file.getMimeType();
    var name = file.getName();

    if (mimeType.indexOf('image/') !== -1 || state.isPSD) {
      fileArray.push(file);
    } else if (name.toLowerCase().slice(-4) === '.fnt') {
      fntMap[name.substring(0, name.lastIndexOf('.'))] = file;
    }
  }

  if (fileArray.length > 0) {
    var currentFolderName = currentFolder.getName();
    state.logs.push('📁 ' + currentFolderName + ' — ' + fileArray.length + ' file');

    if (state.hasSubFolders) {
      var emptyRow = new Array(state.headers.length).fill('');
      emptyRow[1] = currentFolderName;
      state.sheet.getRange(state.currentRowIndex, 1, 1, state.headers.length).setValues([emptyRow]);
      state.folderHeaderRows.push(state.currentRowIndex);
      state.currentRowIndex++;
    }

    fileArray.sort(function (a, b) { return sortAlphaNumeric_(a.getName(), b.getName()); });

    var rowData = [];
    fileArray.forEach(function (f) {
      var fileId = f.getId();
      var fileName = f.getName();
      var lastDot = fileName.lastIndexOf('.');
      var baseImageName = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
      var fntFile = fntMap[baseImageName];

      var typeVal = state.isPSD ? 'PSD' : (fntFile ? 'Bitmap Font' : 'Static');
      var folderLinkFormula = '=HYPERLINK("' + currentFolder.getUrl() + '", "' + currentFolderName + '")';
      var uploadTime = Utilities.formatDate(f.getLastUpdated(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

      var cellText = fileName;
      if (fntFile) cellText += '\n' + fntFile.getName();

      if (state.isPSD) {
        rowData.push([state.globalCount++, typeVal, folderLinkFormula, cellText, 'DONE', 'Last updated: ' + uploadTime]);
        return;
      }

      var dimensions = 'N/A';
      var outputImageCell = 'Error/Too Large';
      try {
        var meta = Drive.Files.get(fileId, { fields: 'imageMediaMetadata' });
        if (meta.imageMediaMetadata && meta.imageMediaMetadata.width) {
          dimensions = meta.imageMediaMetadata.width + ' x ' + meta.imageMediaMetadata.height;
        }
        var blob = f.getBlob();
        var dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
        outputImageCell = SpreadsheetApp.newCellImage().setSourceUrl(dataUrl).setAltTextTitle(fileName).build();
      } catch (e) {
        state.logs.push('⚠️ Không tạo được ảnh: ' + fileName + ' — ' + e.message);
      }

      rowData.push([
        state.globalCount++, typeVal, outputImageCell, folderLinkFormula, cellText, dimensions, 'DONE', 'Last updated: ' + uploadTime, ''
      ]);
    });

    state.sheet.getRange(state.currentRowIndex, 1, rowData.length, state.headers.length).setValues(rowData);
    state.currentRowIndex += rowData.length;
  }

  getSortedFolders_(currentFolder).forEach(function (sub) {
    artProcessFolderRecursive_(sub, state);
  });
}

function artApplyFormatting_(sheet, state, p) {
  var headers = state.headers;
  var isPSD = state.isPSD;
  var numRows = state.currentRowIndex - 2;

  sheet.getRange(1, 1, state.currentRowIndex - 1, headers.length)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true);

  sheet.setRowHeights(2, numRows, isPSD ? 40 : 150);
  sheet.setRowHeight(1, 50);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#FFFF00');

  var typeRange = sheet.getRange(2, 2, numRows, 1);
  var statusRange = sheet.getRange(2, isPSD ? 5 : 7, numRows, 1);
  applyDropdown_(sheet, typeRange, p.typeColors, '#b4c6e7');
  applyDropdown_(sheet, statusRange, p.statusColors, '#c6e0b4');

  var widths = isPSD ? [40, 70, 200, 300, 120, 300] : [40, 70, 250, 200, 300, 120, 70, 300, 250];
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  formatFolderHeaderRows_(sheet, state.folderHeaderRows, headers.length);
}

// ===================================================================
// ANIMATION CHECKLIST
// ===================================================================

var ANIM_SHEET = 'Anim_Source';
var ANIM_HEADERS = ['No', 'Type', 'Output Images', 'Folder', 'File Name', 'Status', 'Description/ Note', 'Demo'];

/** Bước 1: xoá & tạo lại tab Anim_Source. Trả về state ban đầu. */
function animPrepare(p) {
  var ss = SpreadsheetApp.openById(p.spreadsheetId);
  var sheet = ss.getSheetByName(ANIM_SHEET);

  if (sheet) {
    sheet.clear();
    sheet.getImages().forEach(function (img) { img.remove(); });
    sheet.setConditionalFormatRules([]);
    var maxRows = sheet.getMaxRows();
    var maxCols = sheet.getMaxColumns();
    if (maxRows > 0 && maxCols > 0) {
      sheet.getRange(1, 1, maxRows, maxCols).breakApart().clearDataValidations();
    }
  } else {
    sheet = ss.insertSheet(ANIM_SHEET);
  }
  sheet.appendRow(ANIM_HEADERS);

  return { currentRow: 2, countNo: 1, folderHeaderRows: [] };
}

/** Bước 2 (lặp): xử lý 1 folder cấp 1 trong folder Animation. */
function animProcessRootFolder(p) {
  var ss = SpreadsheetApp.openById(p.spreadsheetId);
  var state = {
    sheet: ss.getSheetByName(ANIM_SHEET),
    currentRow: p.state.currentRow,
    countNo: p.state.countNo,
    folderHeaderRows: p.state.folderHeaderRows,
    logs: []
  };
  var subFolder = DriveApp.getFolderById(p.folderId);

  state.sheet.appendRow(['', subFolder.getName(), '', '', '', '', '', '']);
  state.folderHeaderRows.push(state.currentRow++);

  getSortedFolders_(subFolder).forEach(function (ssFolder) {
    var sssFolderList = getSortedFolders_(ssFolder);

    if (animIsCocos_(ssFolder, sssFolderList)) {
      animCocosRow_(ssFolder, sssFolderList, ssFolder.getName(), state);
    } else {
      var isSpine = animSpineRow_(ssFolder, ssFolder.getName(), state);
      if (!isSpine) {
        sssFolderList.forEach(function (sssFolder) {
          animSpineRow_(sssFolder, ssFolder.getName() + ' / ' + sssFolder.getName(), state);
        });
      }
    }
  });

  return {
    state: { currentRow: state.currentRow, countNo: state.countNo, folderHeaderRows: state.folderHeaderRows },
    logs: state.logs
  };
}

/** Bước 3: định dạng toàn bộ tab. */
function animFinalize(p) {
  if (p.state.currentRow <= 2) return { ok: true };
  var sheet = SpreadsheetApp.openById(p.spreadsheetId).getSheetByName(ANIM_SHEET);
  var lastRow = p.state.currentRow - 1;
  var n = ANIM_HEADERS.length;

  sheet.getRange(1, 1, lastRow, n)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true)
    .setWrap(true);
  sheet.getRange(2, 5, lastRow - 1, 1).setHorizontalAlignment('left');
  sheet.getRange(2, 7, lastRow - 1, 1).setHorizontalAlignment('left');

  sheet.setRowHeights(2, lastRow - 1, 250);
  sheet.setRowHeight(1, 50);
  sheet.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#FFFF00');

  sheet.getRange(2, 3, lastRow - 1, 1).setBackground('#666666');
  sheet.getRange(2, 8, lastRow - 1, 1).setBackground('#666666');

  applyDropdown_(sheet, sheet.getRange(2, 2, lastRow - 1, 1), p.typeColors, '#b4c6e7');
  applyDropdown_(sheet, sheet.getRange(2, 6, lastRow - 1, 1), p.statusColors, '#c6e0b4');

  [45, 70, 300, 200, 275, 80, 275, 365].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  formatFolderHeaderRows_(sheet, p.state.folderHeaderRows, n);
  return { ok: true };
}

/** Số dòng hiện có của tab Anim_Source (để web chia nhóm khi cập nhật Demo). */
function animSheetInfo(p) {
  var sheet = SpreadsheetApp.openById(p.spreadsheetId).getSheetByName(ANIM_SHEET);
  if (!sheet) throw new Error('Sheet chưa có tab "' + ANIM_SHEET + '". Hãy chạy kèm folder Animation trước.');
  return { lastRow: sheet.getLastRow() };
}

/**
 * Bước Demo (lặp): chèn ảnh demo cho các dòng [startRow, endRow].
 * @param {{spreadsheetId:string, demoFolderId:string, insertInCell:boolean, startRow:number, endRow:number}} p
 */
function animUpdateDemo(p) {
  var sheet = SpreadsheetApp.openById(p.spreadsheetId).getSheetByName(ANIM_SHEET);
  var logs = [];
  var demoMap = animDemoMap_(DriveApp.getFolderById(p.demoFolderId));
  var startRow = Math.max(2, p.startRow);
  var endRow = Math.min(sheet.getLastRow(), p.endRow);
  if (endRow < startRow) return { matched: 0, logs: logs };

  // Xoá ảnh nổi cũ ở cột Output (3) & Demo (8) trong khoảng dòng này
  var images = sheet.getImages();
  for (var k = images.length - 1; k >= 0; k--) {
    try {
      var anchor = images[k].getAnchorCell();
      if (!anchor) continue;
      var r = anchor.getRow();
      var c = anchor.getColumn();
      if (r >= startRow && r <= endRow && (c === 3 || c === 8)) images[k].remove();
    } catch (e) {
      logs.push('⚠️ Lỗi xoá ảnh cũ: ' + e.message);
    }
  }
  SpreadsheetApp.flush();

  var count = endRow - startRow + 1;
  var typeData = sheet.getRange(startRow, 2, count, 1).getDisplayValues();
  var folderData = sheet.getRange(startRow, 4, count, 1).getDisplayValues();
  var fileNameData = sheet.getRange(startRow, 5, count, 1).getDisplayValues();
  var matched = 0;

  for (var i = 0; i < count; i++) {
    var rowNum = startRow + i;
    var matchedFile = animFindDemo_(demoMap, fileNameData[i][0], folderData[i][0]);
    if (!matchedFile) continue;

    var isGif = matchedFile.getName().toLowerCase().slice(-4) === '.gif';
    var targetCol = (typeData[i][0].trim() === 'Cocos' && !isGif) ? 3 : 8;

    if (p.insertInCell) {
      var cellImg = getInCellImage_(matchedFile);
      if (cellImg && cellImg !== 'Error/Too Large') sheet.getRange(rowNum, targetCol).setValue(cellImg);
    } else {
      insertFloatingImage_(sheet, matchedFile, rowNum, targetCol, logs);
    }
    matched++;
  }

  return { matched: matched, logs: logs };
}

function animFindDemo_(demoMap, fileContent, folderText) {
  if (fileContent) {
    var lines = fileContent.toLowerCase().split('\n');
    for (var j = 0; j < lines.length; j++) {
      var cleanName = lines[j].replace(/^- /, '').trim();
      if (!cleanName || cleanName.slice(-1) === ':') continue;
      var baseName = cleanName.indexOf('.') !== -1 ? cleanName.substring(0, cleanName.lastIndexOf('.')) : cleanName;
      if (demoMap[baseName]) return demoMap[baseName];
    }
  }
  if (folderText) {
    var parts = folderText.toLowerCase().split('/');
    var childName = parts[parts.length - 1].trim();
    if (demoMap[childName]) return demoMap[childName];
  }
  return null;
}

function insertFloatingImage_(sheet, file, rowNum, col, logs) {
  try {
    sheet.getRange(rowNum, col).setValue('');
    var img = sheet.insertImage(file.getBlob(), col, rowNum);
    var cellW = sheet.getColumnWidth(col) || 300;
    var cellH = sheet.getRowHeight(rowNum) || 250;
    var scale = Math.min(1, (cellW - 10) / img.getWidth(), (cellH - 10) / img.getHeight());
    var newW = img.getWidth() * scale;
    var newH = img.getHeight() * scale;
    img.setWidth(newW).setHeight(newH);
    img.setAnchorCellXOffset(Math.max(0, (cellW - newW) / 2));
    img.setAnchorCellYOffset(Math.max(0, (cellH - newH) / 2));
  } catch (e) {
    logs.push('⚠️ Ảnh nổi lỗi (' + file.getName() + '), chuyển sang in-cell: ' + e.message);
    var fallback = getInCellImage_(file);
    if (fallback && fallback !== 'Error/Too Large') sheet.getRange(rowNum, col).setValue(fallback);
  }
}

function animSpineRow_(targetFolder, folderDisplayName, state) {
  var files = targetFolder.getFiles();
  var jsonFiles = [];
  var fileNames = [];
  var imageFile = null;
  var hasJson = false, hasPng = false, hasAtlas = false;

  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    var lower = fileName.toLowerCase();
    fileNames.push('- ' + fileName);
    if (lower.indexOf('.json') !== -1) { hasJson = true; jsonFiles.push(file); }
    if (lower.indexOf('.png') !== -1) hasPng = true;
    if (lower.indexOf('.atlas') !== -1) hasAtlas = true;
    if (file.getMimeType().indexOf('image/') !== -1 && !imageFile) imageFile = file;
  }

  if (!hasJson || !hasPng || !hasAtlas) return false;

  fileNames.sort();
  var richTextNote = animSpineRichText_(jsonFiles, state.logs);
  var outputImageCell = imageFile ? getInCellImage_(imageFile) : null;
  var folderHyperlink = '=HYPERLINK("' + targetFolder.getUrl() + '", "' + folderDisplayName + '")';

  state.sheet.appendRow([state.countNo++, 'Spine', '', folderHyperlink, fileNames.join('\n'), 'DONE', '', '']);
  if (outputImageCell) state.sheet.getRange(state.currentRow, 3).setValue(outputImageCell);
  if (richTextNote) state.sheet.getRange(state.currentRow, 7).setRichTextValue(richTextNote);

  state.logs.push('🦴 Spine: ' + folderDisplayName);
  state.currentRow++;
  return true;
}

function animCocosRow_(targetFolder, childFolders, folderDisplayName, state) {
  var rootFiles = getSortedFiles_(targetFolder);
  var collectedImages = rootFiles.filter(function (f) { return f.getMimeType().indexOf('image/') !== -1; });

  var fullText = rootFiles.map(function (f) { return f.getName(); }).join('\n') + (rootFiles.length ? '\n\n' : '');
  var textStyles = [];

  childFolders.forEach(function (cf) {
    var cFiles = getSortedFiles_(cf);
    cFiles.forEach(function (f) { if (f.getMimeType().indexOf('image/') !== -1) collectedImages.push(f); });
    if (cFiles.length === 0) return;

    var cHeader = cf.getName() + ':\n';
    textStyles.push({ start: fullText.length, end: fullText.length + cHeader.length, type: 'bold' });
    fullText += cHeader;
    cFiles.forEach(function (f) {
      var t = '- ' + f.getName() + '\n';
      textStyles.push({ start: fullText.length, end: fullText.length + t.length, type: 'cocosFileColor' });
      fullText += t;
    });
    fullText += '\n';
  });

  var richTextFile = buildRichText_(fullText, textStyles);
  var richTextNote = null;
  if (collectedImages.length > 1) {
    var notice = '⚠️ Có tổng cộng ' + collectedImages.length + ' file ảnh.\n(Chỉ hiển thị 1 ảnh đại diện ở cột Output do giới hạn In-cell của Google Sheets)';
    richTextNote = SpreadsheetApp.newRichTextValue().setText(notice)
      .setTextStyle(0, notice.length, SpreadsheetApp.newTextStyle().setBold(true).setItalic(true).setForegroundColor('#c0392b').build())
      .build();
  }

  var outputImageCell = getInCellImage_(collectedImages[0]);
  var folderHyperlink = '=HYPERLINK("' + targetFolder.getUrl() + '", "' + folderDisplayName + '")';

  state.sheet.appendRow([state.countNo++, 'Cocos', '', folderHyperlink, '', 'DONE', '', '']);
  if (outputImageCell) state.sheet.getRange(state.currentRow, 3).setValue(outputImageCell);
  if (richTextFile) state.sheet.getRange(state.currentRow, 5).setRichTextValue(richTextFile);
  if (richTextNote) state.sheet.getRange(state.currentRow, 7).setRichTextValue(richTextNote);

  state.logs.push('🎬 Cocos: ' + folderDisplayName);
  state.currentRow++;
}

function animIsCocos_(ssFolder, sssFolderList) {
  var hasCocosFiles = function (folder) {
    var it = folder.getFiles();
    while (it.hasNext()) {
      if (/\.(anim|prefab)$/.test(it.next().getName().toLowerCase())) return true;
    }
    return false;
  };
  if (hasCocosFiles(ssFolder)) return true;
  for (var i = 0; i < sssFolderList.length; i++) {
    if (hasCocosFiles(sssFolderList[i])) return true;
  }
  return false;
}

function animSpineRichText_(jsonFiles, logs) {
  var fullText = '';
  var textStyles = [];

  jsonFiles.forEach(function (jFile) {
    try {
      var data = JSON.parse(jFile.getBlob().getDataAsString());
      var baseName = jFile.getName().replace('.json', '');

      if (data && data.skins) {
        var skinNames = Array.isArray(data.skins)
          ? data.skins.map(function (s) { return s.name; }).filter(function (n) { return n !== 'default'; })
          : Object.keys(data.skins).filter(function (k) { return k !== 'default'; });
        if (skinNames.length > 0) {
          var hs = 'Skin:\n';
          textStyles.push({ start: fullText.length, end: fullText.length + hs.length, type: 'bold' });
          fullText += hs;
          skinNames.forEach(function (skin) {
            var t = '- ' + skin + '\n';
            textStyles.push({ start: fullText.length, end: fullText.length + t.length, type: 'skinColor' });
            fullText += t;
          });
          fullText += '\n';
        }
      }

      if (data && data.animations) {
        var animNames = Object.keys(data.animations);
        var ha = baseName + ' - ' + animNames.length + ' animation:\n';
        textStyles.push({ start: fullText.length, end: fullText.length + ha.length, type: 'bold' });
        fullText += ha;
        animNames.forEach(function (anim) {
          var t = '- ' + anim + '\n';
          textStyles.push({ start: fullText.length, end: fullText.length + t.length, type: 'animColor' });
          fullText += t;
        });
        fullText += '\n';
      }
    } catch (e) {
      logs.push('⚠️ Lỗi đọc JSON ' + jFile.getName() + ': ' + e.message);
    }
  });

  return buildRichText_(fullText, textStyles);
}

function animDemoMap_(demoFolder) {
  var map = {};
  var files = demoFolder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName().toLowerCase();
    var ext = name.lastIndexOf('.');
    if (ext > -1) map[name.substring(0, ext)] = file;
  }
  return map;
}

// ===================================================================
// DÙNG CHUNG
// ===================================================================

function getInCellImage_(driveFile) {
  if (!driveFile) return '';
  try {
    var finalBlob = null;
    var meta = Drive.Files.get(driveFile.getId(), { fields: 'thumbnailLink' });
    if (meta.thumbnailLink) {
      var res = UrlFetchApp.fetch(meta.thumbnailLink.replace('=s220', '=s500'), { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) finalBlob = res.getBlob();
    }
    if (!finalBlob) finalBlob = driveFile.getBlob();

    var dataUrl = 'data:' + finalBlob.getContentType() + ';base64,' + Utilities.base64Encode(finalBlob.getBytes());
    return SpreadsheetApp.newCellImage().setSourceUrl(dataUrl).setAltTextTitle(driveFile.getName()).build();
  } catch (e) {
    return 'Error/Too Large';
  }
}

function buildRichText_(fullText, textStyles) {
  if (!fullText) return null;
  fullText = fullText.replace(/\n+$/, '');

  var builder = SpreadsheetApp.newRichTextValue().setText(fullText);
  var styles = {
    bold: SpreadsheetApp.newTextStyle().setBold(true).setForegroundColor('#000000').build(),
    animColor: SpreadsheetApp.newTextStyle().setBold(false).setForegroundColor('#0000ff').build(),
    skinColor: SpreadsheetApp.newTextStyle().setBold(false).setForegroundColor('#d35400').build(),
    cocosFileColor: SpreadsheetApp.newTextStyle().setBold(false).setForegroundColor('#27ae60').build()
  };
  textStyles.forEach(function (s) {
    var st = Math.min(s.start, fullText.length);
    var en = Math.min(s.end, fullText.length);
    if (st < en && styles[s.type]) builder.setTextStyle(st, en, styles[s.type]);
  });
  return builder.build();
}

/** Dropdown (theo danh sách key của colorMap) + màu nền mặc định + tô màu theo giá trị. */
function applyDropdown_(sheet, range, colorMap, defaultBg) {
  var values = Object.keys(colorMap || {});
  range.setBackground(defaultBg);
  if (values.length === 0) return;

  range.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build()
  );

  var rules = sheet.getConditionalFormatRules();
  values.forEach(function (text) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(text)
        .setBackground(colorMap[text])
        .setRanges([range])
        .build()
    );
  });
  sheet.setConditionalFormatRules(rules);
}

function formatFolderHeaderRows_(sheet, rows, numCols) {
  rows.forEach(function (rowNum) {
    sheet.getRange(rowNum, 1, 1, numCols).setBackground('#fae3d9').setFontWeight('bold').clearDataValidations();
    sheet.getRange(rowNum, 2, 1, numCols - 1).mergeAcross().setHorizontalAlignment('center');
    sheet.setRowHeight(rowNum, 35);
  });
}

function sortAlphaNumeric_(a, b) {
  return a.toString().localeCompare(b.toString(), undefined, { numeric: true, sensitivity: 'base' });
}

function getSortedFolders_(folder) {
  var arr = [];
  var it = folder.getFolders();
  while (it.hasNext()) arr.push(it.next());
  return arr.sort(function (a, b) { return sortAlphaNumeric_(a.getName(), b.getName()); });
}

function getSortedFiles_(folder) {
  var arr = [];
  var it = folder.getFiles();
  while (it.hasNext()) arr.push(it.next());
  return arr.sort(function (a, b) { return sortAlphaNumeric_(a.getName(), b.getName()); });
}
