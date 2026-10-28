/**
 * ============================================================================
 * 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟自動上傳與同步刪除代理腳本
 * ============================================================================
 * 【重要設定步驟】：
 * 1. 前往 https://script.google.com/ 開啟專案，將本程式碼完整貼上並按 Ctrl+S 儲存。
 * 2. 若為首次建立：在上方工具列函式下拉選單選擇「testDrivePermission」，點擊「執行 (Run)」完成授權。
 * 3. 點擊右上角「部署」->「管理部署作業」(點擊右上角鉛筆圖示編輯，版本選「建立新版本」)
 *    或點「新增部署作業」：
 *    - 選取類型：「網頁應用程式 (Web App)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」
 * 4. 複製部署後的「網頁應用程式網址 (結尾為 /exec)」，貼回聲書閣右上角「雲端連線設定」即可！
 */

// 授權專用函式：在編輯器點擊「執行」此函式即可觸發 Google Drive 讀寫與刪除權限視窗
function testDrivePermission() {
  const root = DriveApp.getRootFolder();
  Logger.log('Google 雲端硬碟讀寫與刪除權限授權成功！根目錄名稱：' + root.getName());
}

// 自動從完整網址擷取資料夾 ID
function cleanFolderId(rawId) {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const match = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return str.split('?')[0].split('/')[0].trim();
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 1. 處理同步刪除雲端硬碟檔案 (移至垃圾桶)
    if (payload.action === 'delete') {
      const rawIds = payload.fileIds || (payload.fileId ? [payload.fileId] : []);
      const deletedIds = [];
      const errors = [];

      for (var i = 0; i < rawIds.length; i++) {
        var fId = String(rawIds[i] || '').trim();
        if (!fId || fId.indexOf('demo_') === 0 || fId.indexOf('gdrive_local_') === 0) {
          continue;
        }
        try {
          var targetFile = DriveApp.getFileById(fId);
          targetFile.setTrashed(true);
          deletedIds.push(fId);
        } catch (delErr) {
          errors.push({ fileId: fId, error: delErr.toString() });
        }
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          action: 'delete',
          deletedIds: deletedIds,
          errors: errors
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 處理上傳檔案至雲端硬碟
    const folderId = cleanFolderId(payload.folderId);
    const fileName = payload.fileName || ('soundbook_' + new Date().getTime());
    const mimeType = payload.mimeType || 'application/octet-stream';
    const base64Data = payload.base64Data;

    const folder = folderId
      ? DriveApp.getFolderById(folderId)
      : DriveApp.getRootFolder();

    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);

    // 設定為「知道連結的任何人都能檢視」，讓網頁可直接串流播放語音與顯示圖片
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const isImage = mimeType.indexOf('image/') === 0;
    const directUrl = isImage
      ? 'https://lh3.googleusercontent.com/d/' + fileId
      : 'https://docs.google.com/uc?export=download&id=' + fileId;

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        action: 'upload',
        fileId: fileId,
        fileName: file.getName(),
        mimeType: mimeType,
        viewUrl: file.getUrl(),
        directUrl: directUrl
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: err.toString()
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
