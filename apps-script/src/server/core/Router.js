/**
 * ROUTER + NAVIGATOR REGISTRY
 *
 * Muốn thêm tool mới:
 *   1. Tạo file server:  src/server/tools/<Tool>.js
 *   2. Tạo file giao diện: src/ui/pages/<Tool>.html (chỉ phần nội dung, không cần <html>/<head>)
 *   3. Thêm 1 entry vào PAGES bên dưới → tự động có route (?page=<id>), mục trên sidebar và card ở Home.
 */
const PAGES = [
  {
    id: 'home',
    title: 'Trang chủ',
    icon: '🏠',
    pageTitle: 'P.E.A.K Tool Portal',
    view: 'ui/pages/Home',
    showOnHome: false
  },
  {
    id: 'change_owner',
    title: 'Drive Ownership',
    icon: '🔄',
    pageTitle: 'Drive Ownership Transfer',
    desc: 'Kiểm tra và chuyển quyền sở hữu toàn bộ File/Folder trên Google Drive.',
    view: 'ui/pages/ChangeOwner'
  },
  {
    id: 'clone_folder',
    title: 'Clone Drive Folder',
    icon: '📑',
    pageTitle: 'Clone Drive Folder',
    desc: 'Sao chép toàn bộ cấu trúc thư mục và các tập tin con bên trong Google Drive.',
    view: 'ui/pages/CloneFolder'
  }
];

const DEFAULT_PAGE_ID = 'home';

function doGet(e) {
  const pageId = (e && e.parameter && e.parameter.page) || DEFAULT_PAGE_ID;
  const page = findPage(pageId);

  if (!page) {
    return HtmlService.createHtmlOutput('<h1>404 - Page not found</h1>');
  }

  const template = HtmlService.createTemplateFromFile('ui/layout/Layout');
  template.page = page;
  template.pages = PAGES;
  template.baseUrl = getScriptUrl();

  return template.evaluate()
    .setTitle(page.pageTitle || page.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function findPage(id) {
  return PAGES.find(function (p) { return p.id === id; }) || null;
}

/** Danh sách tool hiển thị dạng card ở trang Home. */
function getHomeTools() {
  return PAGES.filter(function (p) { return p.showOnHome !== false; });
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

function pageUrl(id) {
  return getScriptUrl() + '?page=' + id;
}

/** Dùng trong template: <?!= include('ui/layout/Styles') ?> */
function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
