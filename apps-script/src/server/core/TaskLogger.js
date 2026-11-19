/**
 * LIVE LOG dùng chung cho mọi tool.
 * Server ghi log vào CacheService theo taskId, client poll getLiveLogs(taskId) mỗi giây.
 */
var fullLogs = [];
var lastCacheWriteTime = 0;

function resetTaskLog(taskId) {
  fullLogs = [];
  lastCacheWriteTime = 0;
  CacheService.getUserCache().remove(taskId);
}

function writeLog(taskId, msg, forceWrite) {
  fullLogs.push(msg);

  var now = Date.now();
  if (forceWrite || (now - lastCacheWriteTime > 1000)) {
    try {
      CacheService.getUserCache().put(taskId, JSON.stringify(fullLogs), 1800);
      lastCacheWriteTime = now;
    } catch (e) { }
  }
}

function getLiveLogs(taskId) {
  var data = CacheService.getUserCache().get(taskId);
  return data ? JSON.parse(data) : [];
}
