import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  X,
  Copy,
  Check,
  Save,
  ExternalLink,
} from 'lucide-react';
import { CloudConfig } from '../types';
import { getCloudConfig, saveCloudConfig } from '../services/storageService';

interface CloudSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const GAS_SCRIPT_CODE = `// 聲書閣 (SoundBook Pavilion) — Google 雲端硬碟自動上傳代理腳本
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const folderId = payload.folderId;
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

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveCloudConfig(config);
    onSaved();
    onClose();
  };

  const handleCopyGas = () => {
    navigator.clipboard.writeText(GAS_SCRIPT_CODE);
    setCopiedGas(true);
    setTimeout(() => setCopiedGas(false), 2500);
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
                className="text-xs text-[#2B4C7E] hover:underline flex items-center gap-1"
              >
                <span>前往 Google Apps Script</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-xs text-[#5C4938] leading-relaxed">
              將下方腳本複製貼到您的 Google Apps Script 並部署為「網頁應用程式 (誰可以存取：所有人)」，即可讓手機與電腦直接上傳語音檔與圖片至您的 Google 雲端硬碟：
            </p>

            <div className="flex items-center justify-between bg-[#2C221E] text-[#F3D5B5] px-3 py-2 rounded-lg text-xs">
              <span className="font-mono truncate">google-drive-uploader.gs (點擊右側一鍵複製腳本)</span>
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
                  Google Apps Script 部署網址 (Web App URL)
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
                  Google 雲端硬碟目標資料夾 ID (選填)
                </label>
                <input
                  type="text"
                  value={config.googleDriveFolderId}
                  onChange={(e) =>
                    setConfig({ ...config, googleDriveFolderId: e.target.value })
                  }
                  placeholder="例如：1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Firebase Firestore 設定 */}
          <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#E2D5C1] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#8B5A2B] font-bold text-sm">
                <Database className="w-4 h-4" />
                <span>2. Firebase Firestore 資料庫設定 (soundbook-library-db)</span>
              </div>
              <a
                href="https://console.firebase.google.com/"
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
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  Auth Domain
                </label>
                <input
                  type="text"
                  value={config.firebaseAuthDomain}
                  onChange={(e) =>
                    setConfig({ ...config, firebaseAuthDomain: e.target.value })
                  }
                  placeholder="soundbook-library-db.firebaseapp.com"
                  className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  App ID
                </label>
                <input
                  type="text"
                  value={config.firebaseAppId}
                  onChange={(e) =>
                    setConfig({ ...config, firebaseAppId: e.target.value })
                  }
                  placeholder="1:123456789:web:abcdef"
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
              <span>儲存並套用連線設定</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
