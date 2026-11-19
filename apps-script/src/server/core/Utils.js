function applyDropdownColors(sheet, range, colorMap) {
  const rules = sheet.getConditionalFormatRules();

  for (const [text, color] of Object.entries(colorMap)) {
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(text)
      .setBackground(color)
      .setRanges([range])
      .build();
    rules.push(rule);
  }

  sheet.setConditionalFormatRules(rules);
}

function extractIdFromUrl(urlOrId) {
  if (!urlOrId) return null;

  if (urlOrId.indexOf('/') === -1) {
    return urlOrId.trim();
  }

  const matches = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/) || urlOrId.match(/\/folders\/([a-zA-Z0-9-_]+)/);

  if (matches && matches[1]) {
    return matches[1];
  }

  return null;
}

function renameString(originalName, oldGameId, oldGameName, newGameId, newGameName) {
  const steppedName = originalName.split(oldGameName).join(newGameName);
  const finalName = steppedName.split(oldGameId).join(newGameId);
  return finalName;
}

function extractFolderId(input) {
  if (input.indexOf("folders/") !== -1) {
    const parts = input.split("folders/");
    const idPart = parts[1].split("?")[0];
    return idPart.trim();
  }
  else if (input.indexOf("id=") !== -1) {
    const parts = input.split("id=");
    const idPart = parts[1].split("&")[0];
    return idPart.trim();
  }
  return input;
}

function getSortedFolders(folder) {
  const arr = [];
  const iter = folder.getFolders();
  while (iter.hasNext()) arr.push(iter.next());
  return arr.sort((a, b) => sortAlphaNumeric(a.getName(), b.getName()));
}

function getSortedFiles(folder) {
  const arr = [];
  const iter = folder.getFiles();
  while (iter.hasNext()) arr.push(iter.next());
  return arr.sort((a, b) => sortAlphaNumeric(a.getName(), b.getName()));
}

function sortAlphaNumeric(a, b) {
  return a.toString().localeCompare(b.toString(), undefined, { numeric: true, sensitivity: 'base' });
}