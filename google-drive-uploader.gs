/**
 * ============================================================================
 * 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟上傳、串流讀取、改名、同步刪除與 >35MB 大型語音檔 100% 原始大小無損分段續傳腳本
 * ============================================================================
 * 【重要設定步驟】：
 * 1. 前往 https://script.google.com/ 開啟專案，將本程式碼完整貼上並按 Ctrl+S 儲存。
 * 2. 在上方工具列函式下拉選單選擇「testDrivePermission」，點擊「執行 (Run)」完成授權。
 * 3. 點擊右上角「部署」->「管理部署作業」(點擊右上角鉛筆圖示編輯，版本選「建立新版本」)
 *    或點「新增部署作業」：
 *    - 選取類型：「網頁應用程式 (Web App)」
 *    - 執行身分：「我 (Me)」
 *    - 誰可以存取：「所有人 (Anyone)」
 * 4. 複製部署後的「網頁應用程式網址 (結尾為 /exec)」，貼回聲書閣右上角「雲端連線設定」即可！
 */

function testDrivePermission() {
  const root = DriveApp.getRootFolder();
  const token = ScriptApp.getOAuthToken();
  try {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
  } catch (e) {}
  Logger.log('Google 雲端硬碟讀寫、刪除與大型檔案無損分段續傳權限授權成功！根目錄名稱：' + root.getName());
}

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

    // 1. 處理讀取雲端硬碟音訊/圖片資料流 (解決瀏覽器對 Google Drive 音檔跨域阻擋問題)
    if (payload.action === 'getFile') {
      const targetId = String(payload.fileId || '').trim();
      const targetFile = DriveApp.getFileById(targetId);
      const blob = targetFile.getBlob();
      const b64 = Utilities.base64Encode(blob.getBytes());
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          action: 'getFile',
          fileId: targetId,
          mimeType: blob.getContentType() || 'audio/mpeg',
          base64Data: b64
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 處理同步刪除雲端硬碟檔案 (移至垃圾桶)
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
          var targetFileToDel = DriveApp.getFileById(fId);
          targetFileToDel.setTrashed(true);
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

    // 3. 支援同步修改 Google 雲端硬碟中的檔案名稱 (語音檔或圖片)
    if (payload.action === 'rename') {
      var renameId = String(payload.fileId || '').trim();
      var newName = String(payload.newFileName || '').trim();
      if (!renameId || !newName) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: false,
            action: 'rename',
            error: '缺少 fileId 或 newFileName'
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var targetFileToRename = DriveApp.getFileById(renameId);
      var oldName = targetFileToRename.getName();
      var extMatch = oldName.match(/(\.[a-zA-Z0-9]{2,5})$/);
      if (extMatch && extMatch[1] && !/\.[a-zA-Z0-9]{2,5}$/.test(newName)) {
        newName = newName + extMatch[1];
      }
      targetFileToRename.setName(newName);
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          action: 'rename',
          fileId: renameId,
          oldFileName: oldName,
          fileName: newName
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. 大型檔案 (>24MB) 分段續傳初始化：突破 GAS 單次 35MB/50MB 限制（回傳 OAuth Token 與 Resumable Upload URL，100% 保留原始檔案大小不壓縮）
    if (payload.action === 'initChunkUpload') {
      var initFolderId = cleanFolderId(payload.folderId);
      var initFileName = payload.fileName || ('soundbook_' + new Date().getTime());
      var initMimeType = payload.mimeType || 'audio/mpeg';
      var initFileSize = Number(payload.fileSize) || 0;
      var oauthToken = ScriptApp.getOAuthToken();
      if (initFileSize <= 0) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            action: 'initChunkUpload',
            mode: 'probe',
            accessToken: oauthToken
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      try {
        var meta = { name: initFileName, mimeType: initMimeType };
        if (initFolderId) meta.parents = [initFolderId];
        var initHeaders = {
          Authorization: 'Bearer ' + oauthToken,
          'X-Upload-Content-Type': initMimeType
        };
        if (initFileSize > 0) {
          initHeaders['X-Upload-Content-Length'] = String(initFileSize);
        }
        if (payload.origin) {
          initHeaders['Origin'] = String(payload.origin);
        }
        var initRes = UrlFetchApp.fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
          {
            method: 'post',
            contentType: 'application/json; charset=UTF-8',
            headers: initHeaders,
            payload: JSON.stringify(meta),
            muteHttpExceptions: true
          }
        );
        var resHeaders = initRes.getAllHeaders();
        var locationUrl = resHeaders['Location'] || resHeaders['location'];
        if (locationUrl) {
          return ContentService.createTextOutput(
            JSON.stringify({
              success: true,
              action: 'initChunkUpload',
              mode: 'resumable',
              accessToken: oauthToken,
              uploadUrl: String(locationUrl)
            })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      } catch (resumableErr) {
        // 若尚未授權 UrlFetchApp，仍回傳 accessToken 讓瀏覽器直接對 Google Drive API 進行分段續傳
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          action: 'initChunkUpload',
          mode: 'direct_oauth',
          accessToken: oauthToken,
          uploadId: 'up_' + new Date().getTime()
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 4.5 瀏覽器直傳完成後設定 Google 雲端硬碟檔案共享權限
    if (payload.action === 'setFilePublic') {
      var pubFileId = String(payload.fileId || '').trim();
      var pubMime = String(payload.mimeType || 'audio/mpeg');
      var pubFile = DriveApp.getFileById(pubFileId);
      pubFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var isPubImg = pubMime.indexOf('image/') === 0;
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          action: 'setFilePublic',
          fileId: pubFileId,
          viewUrl: pubFile.getUrl(),
          directUrl: isPubImg
            ? 'https://lh3.googleusercontent.com/d/' + pubFileId
            : 'https://docs.google.com/uc?export=download&id=' + pubFileId
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. 大型檔案 (>24MB) 分段續傳接收與合併 (每段 5MB，符合 Google Drive Resumable Upload 256KB 倍數與 UrlFetchApp 10MB 內限制)
    if (payload.action === 'uploadChunk') {
      var chunkBytes = Utilities.base64Decode(payload.base64Data);
      var cMime = payload.mimeType || 'audio/mpeg';
      var cFileName = payload.fileName || ('soundbook_' + new Date().getTime());
      var cFolderId = cleanFolderId(payload.folderId);

      if (payload.mode === 'resumable' && payload.uploadUrl) {
        var startByte = Number(payload.start) || 0;
        var endByte = Number(payload.end) || (startByte + chunkBytes.length - 1);
        var totalBytes = Number(payload.total) || (endByte + 1);
        var putRes = UrlFetchApp.fetch(payload.uploadUrl, {
          method: 'put',
          contentType: cMime,
          headers: {
            'Content-Range': 'bytes ' + startByte + '-' + endByte + '/' + totalBytes
          },
          payload: chunkBytes,
          muteHttpExceptions: true
        });
        var code = putRes.getResponseCode();
        if (code === 308) {
          return ContentService.createTextOutput(
            JSON.stringify({
              success: true,
              action: 'uploadChunk',
              completed: false
            })
          ).setMimeType(ContentService.MimeType.JSON);
        }
        if (code === 200 || code === 201) {
          var createdObj = JSON.parse(putRes.getContentText());
          var createdId = createdObj.id;
          var createdFile = DriveApp.getFileById(createdId);
          createdFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          var isImg = cMime.indexOf('image/') === 0;
          return ContentService.createTextOutput(
            JSON.stringify({
              success: true,
              action: 'uploadChunk',
              completed: true,
              fileId: createdId,
              viewUrl: createdFile.getUrl(),
              directUrl: isImg
                ? 'https://lh3.googleusercontent.com/d/' + createdId
                : 'https://docs.google.com/uc?export=download&id=' + createdId
            })
          ).setMimeType(ContentService.MimeType.JSON);
        }
        throw new Error('Resumable chunk HTTP ' + code + ': ' + putRes.getContentText());
      }

      // 純 DriveApp 分段暫存與最終合併模式
      var targetFolder = cFolderId ? DriveApp.getFolderById(cFolderId) : DriveApp.getRootFolder();
      var chunkIdx = Number(payload.chunkIndex) || 0;
      var totalChunks = Number(payload.totalChunks) || 1;
      if (chunkIdx < totalChunks - 1) {
        var tempBlob = Utilities.newBlob(
          chunkBytes,
          'application/octet-stream',
          '.soundbook_tmp_' + (payload.uploadId || 'part') + '_' + chunkIdx
        );
        var tempFile = targetFolder.createFile(tempBlob);
        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            action: 'uploadChunk',
            completed: false,
            tempFileId: tempFile.getId()
          })
        ).setMimeType(ContentService.MimeType.JSON);
      } else {
        var tempIds = payload.tempFileIds || [];
        var allBytes = [];
        for (var t = 0; t < tempIds.length; t++) {
          var tf = DriveApp.getFileById(tempIds[t]);
          var tb = tf.getBlob().getBytes();
          allBytes = allBytes.concat(tb);
        }
        allBytes = allBytes.concat(chunkBytes);
        var finalBlob = Utilities.newBlob(allBytes, cMime, cFileName);
        var finalFile = targetFolder.createFile(finalBlob);
        finalFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        for (var d = 0; d < tempIds.length; d++) {
          try {
            DriveApp.getFileById(tempIds[d]).setTrashed(true);
          } catch (e2) {}
        }
        var finalId = finalFile.getId();
        var isImg2 = cMime.indexOf('image/') === 0;
        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            action: 'uploadChunk',
            completed: true,
            fileId: finalId,
            viewUrl: finalFile.getUrl(),
            directUrl: isImg2
              ? 'https://lh3.googleusercontent.com/d/' + finalId
              : 'https://docs.google.com/uc?export=download&id=' + finalId
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // 6. 處理一般大小檔案 (<= 24MB) 單次上傳至雲端硬碟
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
