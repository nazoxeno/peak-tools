const CHANGE_OWNER_CONFIG = {
  template: {
    gameId: "0000",
    gameName: "GameName"
  },
  // newOwnerEmail / permissions: cấu hình trong Google Sheet (bản web)
};

const TYPE_RULE = ["Static", "Spine", "Cocos", "FBF", "Bitmap Font", "PSD"];
const TYPE_COLORS = {
  "Static": "#fce8b2",
  "Spine": "#9fc5e8",
  "Cocos": "#b6d7a8",
  "FBF": "#d9d2e9",
  "Bitmap Font": "#ffffff",
  "PSD": "#f4cccc"
};

const STATUS_RULE = ["DONE", "Not yet", "N/A", "New", "Update", "Optimize"];
const STATUS_COLORS = {
  "DONE": "#b7e1cd",
  "Not yet": "#f4cccc",
  "N/A": "#e8eaed",
  "New": "#ffff00",
  "Update": "#f6b26b",
  "Optimize": "#fff2cc",
};