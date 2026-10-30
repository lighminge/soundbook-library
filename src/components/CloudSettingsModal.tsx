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
} from 'lucide-react';
import { CloudConfig } from '../types';
import {
  extractDriveFolderId,
  getCloudConfig,
  saveCloudConfig,
  testGoogleDriveConnection,
} from '../services/storageService';

interface CloudSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const GAS_SCRIPT_CODE = `// 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟自動上傳代理腳本
// 貼上後請先選取「testDrivePermission」按上方「執行」完成授權，再點右上角「部署 -> 新增部署作業 (網頁應用程式 / 所有人)」
function testDrivePermission() {
  const root = DriveApp.getRootFolder();
  Logger.log('授權成功：' + root.getName());
}

function cleanFolderId(rawId) {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const match = str.match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return str.split('?')[0].split('/')[0].trim();
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 1. 支援跨裝置讀取雲端硬碟音訊串流
    if (payload.action === 'getFile') {
      const targetId = String(payload.fileId || '').trim();
      const blob = DriveApp.getFileById(targetId).getBlob();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'getFile',
        fileId: targetId,
        mimeType: blob.getContentType() || 'audio/mpeg',
        base64Data: Utilities.base64Encode(blob.getBytes())
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. 支援同步刪除 Google 雲端硬碟中的語音檔與圖片
    if (payload.action === 'delete') {
      const rawIds = payload.fileIds || (payload.fileId ? [payload.fileId] : []);
      const deletedIds = [];
      const errors = [];
      for (var i = 0; i < rawIds.length; i++) {
        var fId = String(rawIds[i] || '').trim();
        if (!fId || fId.indexOf('demo_') === 0 || fId.indexOf('gdrive_local_') === 0) continue;
        try {
          DriveApp.getFileById(fId).setTrashed(true);
          deletedIds.push(fId);
        } catch (delErr) {
          errors.push({ fileId: fId, error: delErr.toString() });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'delete',
        deletedIds: deletedIds,
        errors: errors
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. 支援同步修改 Google 雲端硬碟中的檔案名稱 (語音檔或圖片)
    if (payload.action === 'rename') {
      var renameId = String(payload.fileId || '').trim();
      var newName = String(payload.newFileName || '').trim();
      if (!renameId || !newName) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          action: 'rename',
          error: '缺少 fileId 或 newFileName'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var targetFile = DriveApp.getFileById(renameId);
      var oldName = targetFile.getName();
      var extMatch = oldName.match(/(\\.[a-zA-Z0-9]{2,5})$/);
      if (extMatch && extMatch[1] && !/\\.[a-zA-Z0-9]{2,5}$/.test(newName)) {
        newName = newName + extMatch[1];
      }
      targetFile.setName(newName);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'rename',
        fileId: renameId,
        oldFileName: oldName,
        fileName: newName
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const folderId = cleanFolderId(payload.folderId);
    const fileName = payload.fileName || ('soundbook_' + new Date().getTime());
    const mimeType = payload.mimeType || 'application/octet-stream';
    const base64Data = payload.base64Data;

    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();
    const isImage = mimeType.indexOf('image/') === 0;
    const directUrl = isImage
      ? 'https://lh3.googleusercontent.com/d/' + fileId
      : 'https://docs.google.com/uc?export=download&id=' + fileId;

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      action: 'upload',
      fileId: fileId,
      viewUrl: file.getUrl(),
      directUrl: directUrl
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
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
    await saveCloudConfig(config);
    onSaved();
    onClose();
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
                rel="noreferrer"
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
                    {testResult.viewUrl && (
                      <a
                        href={testResult.viewUrl}
                        target="_blank"
                        rel="noreferrer"
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
                rel="noreferrer"
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
