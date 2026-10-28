/**
 * ============================================================================
 * 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟自動上傳代理腳本
 * ============================================================================
 * 【重要設定步驟（只需做一次）】：
 * 1. 前往 https://script.google.com/ 建立新專案，將本程式碼完整貼上並按 Ctrl+S 儲存。
 * 2. 在上方工具列函式下拉選單選擇「testDrivePermission」，然後點擊「執行 (Run)」，
 *    此時 Google 會跳出「需要授權」視窗 -> 點選「審查權限」-> 選擇您的帳號 ->
 *    點左下角「進階」->「前往未命名專案 (不安全)」->「允許」(這一步能確保腳本獲得寫入雲端硬碟的權限！)。
 * 3. 點擊右上角「部署」->「新增部署作業」：
 *    - 選取類型：「網頁應用程式 (Web App)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」(務必選所有人，否則網頁無法傳送檔案！)
 * 4. 複製部署後的「網頁應用程式網址 (結尾為 /exec)」，貼回聲書閣右上角「雲端連線設定」即可！
 */

// 步驟 2 授權專用函式：在編輯器點擊「執行」此函式即可觸發 Google Drive 讀寫權限視窗
function testDrivePermission() {
  const root = DriveApp.getRootFolder();
  Logger.log('Google 雲端硬碟讀寫權限授權成功！根目錄名稱：' + root.getName());
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
