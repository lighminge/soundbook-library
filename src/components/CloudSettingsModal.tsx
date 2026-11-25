import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  X,
  Copy,
  Check,
  Save,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { CloudConfig } from '../types';
import {
  extractDriveFolderId,
  getCloudConfig,
  saveCloudConfig,
  testGoogleDriveConnection,
  isAppCheckActive,
} from '../services/storageService';

interface CloudSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const GAS_SCRIPT_CODE = `/**
 * ============================================================================
 * 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟上傳、串流讀取、改名、同步刪除與 >35MB 大型語音檔 100% 原始大小無損分段續傳腳本 (資安強化版)
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
  const match = str.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return str.split('?')[0].split('/')[0].trim();
}

// 資安防護：驗證目標檔案是否位於聲書閣指定的雲端硬碟資料夾內，防止誤操作雲端硬碟其他私人檔案
function isFileInAllowedFolder(file, allowedFolderId) {
  if (!allowedFolderId) return true;
  try {
    var parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === allowedFolderId) {
        return true;
      }
    }
  } catch (e) {}
  return false;
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

    // 2. 處理同步刪除雲端硬碟檔案 (移至垃圾桶，含資料夾範圍資安檢查)
    if (payload.action === 'delete') {
      const rawIds = payload.fileIds || (payload.fileId ? [payload.fileId] : []);
      const delFolderId = cleanFolderId(payload.folderId);
      const deletedIds = [];
      const errors = [];

      for (var i = 0; i < rawIds.length; i++) {
        var fId = String(rawIds[i] || '').trim();
        if (!fId || fId.indexOf('demo_') === 0 || fId.indexOf('gdrive_local_') === 0) {
          continue;
        }
        try {
          var targetFileToDel = DriveApp.getFileById(fId);
          if (delFolderId && !isFileInAllowedFolder(targetFileToDel, delFolderId)) {
            errors.push({ fileId: fId, error: '目標檔案不在指定的聲書閣資料夾內，已拒絕刪除保護私人檔案' });
            continue;
          }
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

    // 3. 支援同步修改 Google 雲端硬碟中的檔案名稱 (語音檔或圖片，含資料夾範圍資安檢查)
    if (payload.action === 'rename') {
      var renameId = String(payload.fileId || '').trim();
      var newName = String(payload.newFileName || '').trim();
      var renFolderId = cleanFolderId(payload.folderId);
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
      if (renFolderId && !isFileInAllowedFolder(targetFileToRename, renFolderId)) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: false,
            action: 'rename',
            error: '目標檔案不在指定的聲書閣資料夾內，已拒絕修改名稱'
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var oldName = targetFileToRename.getName();
      var extMatch = oldName.match(/(\\.[a-zA-Z0-9]{2,5})$/);
      if (extMatch && extMatch[1] && !/\\.[a-zA-Z0-9]{2,5}$/.test(newName)) {
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

    // 4. 大型檔案 (>24MB) 分段續傳初始化：突破 GAS 單次 35MB/50MB 限制（僅回傳單檔專用 Resumable Upload URL，絕不外露 OAuth accessToken）
    if (payload.action === 'initChunkUpload') {
      var initFolderId = cleanFolderId(payload.folderId);
      var initFileName = payload.fileName || ('soundbook_' + new Date().getTime());
      var initMimeType = payload.mimeType || 'audio/mpeg';
      var initFileSize = Number(payload.fileSize) || 0;
      if (initFileSize <= 0) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: true,
            action: 'initChunkUpload',
            mode: 'probe'
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var oauthToken = ScriptApp.getOAuthToken();
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
              uploadUrl: String(locationUrl)
            })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      } catch (resumableErr) {
        // 若尚未授權 UrlFetchApp，退回 DriveApp 分段暫存模式
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          action: 'initChunkUpload',
          mode: 'driveapp',
          uploadId: 'up_' + new Date().getTime()
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 4.5 瀏覽器直傳完成後設定 Google 雲端硬碟檔案共享權限（含資料夾範圍資安檢查）
    if (payload.action === 'setFilePublic') {
      var pubFileId = String(payload.fileId || '').trim();
      var pubMime = String(payload.mimeType || 'audio/mpeg');
      var pubFolderId = cleanFolderId(payload.folderId);
      var pubFile = DriveApp.getFileById(pubFileId);
      if (pubFolderId && !isFileInAllowedFolder(pubFile, pubFolderId)) {
        return ContentService.createTextOutput(
          JSON.stringify({
            success: false,
            action: 'setFilePublic',
            error: '目標檔案不在指定的聲書閣資料夾內，已拒絕變更權限'
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
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
}`;

export const CloudSettingsModal: React.FC<CloudSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [config, setConfig] = useState<CloudConfig>(getCloudConfig());
  const [copiedGas, setCopiedGas] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    viewUrl?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const prevKey = getCloudConfig().recaptchaEnterpriseSiteKey;
    await saveCloudConfig(config);
    onSaved();
    onClose();
    if (prevKey !== config.recaptchaEnterpriseSiteKey) {
      window.location.reload();
    }
  };

  const handleCopyGas = () => {
    navigator.clipboard.writeText(GAS_SCRIPT_CODE);
    setCopiedGas(true);
    setTimeout(() => setCopiedGas(false), 2500);
  };

  const handleTestDrive = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testGoogleDriveConnection(
      config.googleDriveScriptUrl,
      config.googleDriveFolderId
    );
    setTestResult(res);
    setIsTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#FFFDF9] border border-[#D8C8B0] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#E5D9C5] pb-3">
          <div>
            <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
              雲端資料庫與 Google 雲端硬碟連線設定
            </h3>
            <p className="text-xs text-[#7A6855]">
              預設專案名稱：GitHub <code>soundbook-library</code> · Firebase <code>soundbook-library-db</code>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#EFE6D5] text-[#5C3A1B] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Google 雲端硬碟設定 */}
          <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#2B4C7E] font-bold text-sm">
                <HardDrive className="w-4 h-4" />
                <span>1. Google 雲端硬碟上傳儲存空間設定 (Google Drive)</span>
              </div>
              <a
                href="https://script.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2B4C7E] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>前往 Google Apps Script</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="text-xs text-[#5C4938] space-y-1 bg-white/80 p-3 rounded-lg border border-[#E2D5C1]">
              <p className="font-bold text-[#2C221E]">為什麼檔案沒有進到雲端硬碟？請確認以下 3 步驟已完成：</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  點擊下方「複製 GAS 腳本」貼到 Google Apps Script 後，<strong>先按上方「執行 (testDrivePermission)」完成 Google 雲端硬碟權限核准</strong>（點「進階」➔「前往專案」➔「允許」）。
                </li>
                <li>
                  點擊右上角「部署 ➔ 新增部署作業」，類型選「網頁應用程式」，<strong>「誰可以存取」務必選「所有人 (Anyone)」</strong>。
                </li>
                <li>
                  將部署產生的「網頁應用程式網址 (`https://script.google.com/macros/s/.../exec`)」與「雲端硬碟資料夾網址或 ID」貼在下方欄位，並點擊<strong>「測試寫入雲端硬碟」</strong>確認！
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-between bg-[#2C221E] text-[#F3D5B5] px-3 py-2 rounded-lg text-xs">
              <span className="font-mono truncate">google-drive-uploader.gs (含授權檢測函式)</span>
              <button
                type="button"
                onClick={handleCopyGas}
                className="px-2.5 py-1 rounded bg-[#8B5A2B] hover:bg-[#A46B35] text-white flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copiedGas ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedGas ? '已複製腳本！' : '複製 GAS 腳本'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  Google Apps Script 部署網址 (Web App URL) *
                </label>
                <input
                  type="url"
                  value={config.googleDriveScriptUrl}
                  onChange={(e) =>
                    setConfig({ ...config, googleDriveScriptUrl: e.target.value })
                  }
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  Google 雲端硬碟資料夾 ID (可直接貼上資料夾網址)
                </label>
                <input
                  type="text"
                  value={config.googleDriveFolderId}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      googleDriveFolderId: extractDriveFolderId(e.target.value),
                    })
                  }
                  placeholder="貼上資料夾網址或 ID 皆可自動擷取"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono"
                />
              </div>
            </div>

            {/* 測試連線按鈕與結果顯示 */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestDrive}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2B4C7E] hover:bg-[#1E385F] disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在測試寫入您的 Google 雲端硬碟...</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-4 h-4" />
                    <span>點此測試寫入 Google 雲端硬碟（會在您的資料夾建立測試檔）</span>
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-red-50 border-red-300 text-red-900'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-medium leading-relaxed">{testResult.message}</p>
                    {testResult.viewUrl && /^https?:\/\//i.test(testResult.viewUrl) && (
                      <a
                        href={testResult.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 font-bold underline"
                      >
                        <span>點此直接打開雲端硬碟查看剛建立的測試檔案</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Firebase Firestore 設定 */}
          <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#E2D5C1] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#8B5A2B] font-bold text-sm">
                <Database className="w-4 h-4" />
                <span>2. Firebase Firestore 資料庫設定 (已自動綁定 soundbook-library-db)</span>
              </div>
              <a
                href="https://console.firebase.google.com/project/soundbook-library-db/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8B5A2B] hover:underline flex items-center gap-1"
              >
                <span>開啟 Firebase Console</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  Firebase Project ID
                </label>
                <input
                  type="text"
                  value={config.firebaseProjectId}
                  onChange={(e) =>
                    setConfig({ ...config, firebaseProjectId: e.target.value })
                  }
                  placeholder="soundbook-library-db"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  Firebase API Key
                </label>
                <input
                  type="text"
                  value={config.firebaseApiKey}
                  onChange={(e) =>
                    setConfig({ ...config, firebaseApiKey: e.target.value })
                  }
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Firebase App Check (reCAPTCHA Enterprise) 防護設定 */}
          <div className="p-4 rounded-xl bg-[#F2F7F4] border border-[#CDE3D5] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-[#1B5E20] font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
                <span>3. Firebase App Check (reCAPTCHA Enterprise) 雲端防護</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                    config.recaptchaEnterpriseSiteKey
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {config.recaptchaEnterpriseSiteKey ? '🛡️ 已設定金鑰 (安全保護中)' : '尚未設定金鑰'}
                </span>
              </div>
              <a
                href="https://console.firebase.google.com/project/soundbook-library-db/appcheck"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2E7D32] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>開啟 App Check 控制台</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="text-xs text-[#35523A] space-y-1.5 bg-white/80 p-3 rounded-lg border border-[#CDE3D5]">
              <p className="font-bold text-[#1B5E20]">🛡️ 如何啟用 reCAPTCHA Enterprise 雲端防護？</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  前往 Firebase 控制台 ➔ <strong>App Check</strong> ➔ 在 Web 應用程式 (<code>soundbook-library-db</code>) 點擊 <strong>「註冊 (Register)」</strong>。
                </li>
                <li>
                  提供者請選擇 <strong>reCAPTCHA Enterprise</strong>，依提示建立或綁定 Google Cloud 金鑰（授權網域請包含 <code>lighminge.github.io</code>、<code>soundbook-library-db.web.app</code> 與 <code>localhost</code>）。
                </li>
                <li>
                  將產生的 <strong>網站金鑰 (Site Key)</strong> 貼在下方欄位後點擊儲存，聲書閣將自動為每次 Firestore 讀寫附加安全權杖，徹底阻絕惡意爬蟲與未授權寫入。
                </li>
              </ol>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1B5E20] mb-1">
                reCAPTCHA Enterprise 網站金鑰 (Site Key)
              </label>
              <input
                type="text"
                value={config.recaptchaEnterpriseSiteKey || ''}
                onChange={(e) =>
                  setConfig({ ...config, recaptchaEnterpriseSiteKey: e.target.value.trim() })
                }
                placeholder="例如：6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg border border-[#BBD9C5] bg-white text-xs font-mono focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
              />
              <p className="text-[11px] text-[#6A8270] mt-1">
                💡 說明：若未填寫此金鑰，系統將以原先設定的 Firestore 安全性規則正常運作；填入後將立即啟用 App Check 雙層驗證防護。
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>儲存並同步至所有裝置</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
