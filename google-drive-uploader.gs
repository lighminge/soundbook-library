/**
 * ============================================================================
 * 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟上傳代理腳本 (Google Apps Script)
 * ============================================================================
 * 使用方式：
 * 1. 前往 https://script.google.com/ 建立新專案，貼上本檔案全部程式碼。
 * 2. 將下方 FOLDER_ID 替換為您 Google 雲端硬碟目標資料夾的 ID（或由前端設定傳入）。
 * 3. 點擊右上角「部署」->「新增部署作業」：
 *    - 選取類型：「網頁應用程式 (Web App)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」
 * 4. 複製部署後的「網頁應用程式網址 (Web App URL)」，貼回本系統的「雲端連線設定」即可！
 */

const DEFAULT_FOLDER_ID = '請填入您的_Google_Drive_資料夾_ID';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const folderId = payload.folderId || DEFAULT_FOLDER_ID;
    const fileName = payload.fileName || ('soundbook_' + new Date().getTime());
    const mimeType = payload.mimeType || 'application/octet-stream';
    const base64Data = payload.base64Data;

    const folder = folderId && folderId !== '請填入您的_Google_Drive_資料夾_ID'
      ? DriveApp.getFolderById(folderId)
      : DriveApp.getRootFolder();

    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);

    // 設定為「知道連結的任何人都能檢視」，以便前端直接播放語音與顯示圖片
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
