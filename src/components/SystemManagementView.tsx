import React, { useEffect, useState } from 'react';
import {
  Users,
  Shield,
  Plus,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  KeyRound,
  UserCheck,
  Lock,
  LayoutTemplate,
  RotateCcw,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  Settings,
  Database,
  HardDrive,
  Copy,
  ExternalLink,
  ShieldCheck,
  Cloud,
  History,
  RefreshCw,
  Search,
  Compass,
  XCircle,
  Monitor,
} from 'lucide-react';
import { AppUser, CloudConfig, LoginLogRecord, LoginScreenConfig } from '../types';
import {
  loadSystemUsers,
  saveSystemUser,
  deleteSystemUser,
  loadLoginLogs,
  deleteLoginLog,
  clearAllLoginLogs,
} from '../services/authService';
import {
  DEFAULT_LOGIN_SCREEN_CONFIG,
  extractDriveFolderId,
  getCloudConfig,
  saveCloudConfig,
  saveLoginScreenConfig,
  testGoogleDriveConnection,
} from '../services/storageService';
import { getCategoryIcon, ICON_OPTIONS } from './DashboardView';

const PROTECTED_ADMIN_ID = 'user_admin';
const PROTECTED_ADMIN_USERNAME = 'admin';

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

export type SystemSubTab = 'accounts' | 'loginScreen' | 'cloud';

interface SystemManagementViewProps {
  currentUserId: string;
  loginConfig: LoginScreenConfig;
  onUpdateLoginConfig: (newConfig: LoginScreenConfig) => void;
  onCloudSaved: () => void;
  onUserUpdated?: () => void;
  initialSubTab?: SystemSubTab;
}

export const SystemManagementView: React.FC<SystemManagementViewProps> = ({
  currentUserId,
  loginConfig,
  onUpdateLoginConfig,
  onCloudSaved,
  onUserUpdated,
  initialSubTab = 'accounts',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SystemSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ==========================================
  // 第一分頁：帳號管理 狀態
  // ==========================================
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userError, setUserError] = useState('');
  const [userSuccessMsg, setUserSuccessMsg] = useState('');

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');

  // 刪除確認對話框狀態
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AppUser | null>(null);

  // 人員登入情況紀錄狀態
  const [loginLogs, setLoginLogs] = useState<LoginLogRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);

  const fetchLoginLogs = async () => {
    setLoadingLogs(true);
    try {
      const list = await loadLoginLogs();
      setLoginLogs(list);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteLoginLog(logId);
      setLoginLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch {
      // ignore
    }
  };

  const handleClearAllLogs = async () => {
    setConfirmClearLogs(false);
    setLoadingLogs(true);
    try {
      await clearAllLoginLogs();
      setLoginLogs([]);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setUserError('');
    try {
      const list = await loadSystemUsers();
      setUsers(list);
    } catch (err: any) {
      setUserError(err?.message || '載入使用者清單失敗');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLoginLogs();
  }, []);

  const isEditingProtectedAdmin =
    editingUser?.id === PROTECTED_ADMIN_ID ||
    editingUser?.username.toLowerCase() === PROTECTED_ADMIN_USERNAME;

  const startCreateUser = () => {
    setEditingUser(null);
    setIsCreatingUser(true);
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setDisplayName('');
    setRole('user');
    setUserError('');
    setUserSuccessMsg('');
  };

  const startEditUser = (user: AppUser) => {
    setEditingUser(user);
    setIsCreatingUser(false);
    setUsername(user.username);
    setPassword(user.password);
    setShowPassword(false);
    setDisplayName(user.displayName);
    setRole(user.role);
    setUserError('');
    setUserSuccessMsg('');
  };

  const cancelUserForm = () => {
    setEditingUser(null);
    setIsCreatingUser(false);
    setUserError('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    setUserSuccessMsg('');

    const cleanUsername = isEditingProtectedAdmin
      ? PROTECTED_ADMIN_USERNAME
      : username.trim();
    const cleanPassword = password.trim();
    const cleanDisplayName = displayName.trim() || cleanUsername;
    const finalRole: 'admin' | 'user' = isEditingProtectedAdmin ? 'admin' : role;

    if (!cleanUsername || !cleanPassword) {
      setUserError('請填寫帳號與密碼');
      return;
    }

    if (cleanUsername.toLowerCase() === 'guest') {
      setUserError('「guest」為系統保留訪客帳號，無法使用！');
      return;
    }

    const duplicate = users.find(
      (u) =>
        u.username.toLowerCase() === cleanUsername.toLowerCase() &&
        u.id !== editingUser?.id
    );
    if (duplicate) {
      setUserError(`帳號「${cleanUsername}」已存在，請使用其他帳號名稱`);
      return;
    }

    setSavingUser(true);
    try {
      const targetUser: AppUser = {
        id: isEditingProtectedAdmin
          ? PROTECTED_ADMIN_ID
          : editingUser?.id || `user_${Date.now()}`,
        username: cleanUsername,
        password: cleanPassword,
        displayName: cleanDisplayName,
        role: finalRole,
        createdAt: editingUser?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveSystemUser(targetUser);
      await fetchUsers();
      onUserUpdated?.();
      setUserSuccessMsg(
        editingUser
          ? `已成功更新「${cleanDisplayName} (${cleanUsername})」的帳號資料！`
          : `已成功新增「${cleanDisplayName} (${cleanUsername})」帳號！`
      );
      setEditingUser(null);
      setIsCreatingUser(false);
    } catch (err: any) {
      setUserError(err?.message || '儲存使用者時發生錯誤');
    } finally {
      setSavingUser(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    const user = pendingDeleteUser;
    setPendingDeleteUser(null);

    if (
      user.id === PROTECTED_ADMIN_ID ||
      user.username.toLowerCase() === PROTECTED_ADMIN_USERNAME
    ) {
      setUserError('預設系統管理員帳號 (admin) 受系統保護，禁止刪除！');
      return;
    }
    if (user.id === currentUserId) {
      setUserError('無法刪除您目前正在登入使用的帳號！');
      return;
    }

    setSavingUser(true);
    setUserError('');
    setUserSuccessMsg('');
    try {
      await deleteSystemUser(user.id);
      await fetchUsers();
      setUserSuccessMsg(`已刪除帳號「${user.displayName} (${user.username})」`);
    } catch (err: any) {
      setUserError(err?.message || '刪除失敗');
    } finally {
      setSavingUser(false);
    }
  };

  // ==========================================
  // 第二分頁：系統登入畫面維護 狀態
  // ==========================================
  const [selectedIcon, setSelectedIcon] = useState<string>(
    loginConfig.icon || DEFAULT_LOGIN_SCREEN_CONFIG.icon
  );
  const [titleText, setTitleText] = useState<string>(
    loginConfig.title || DEFAULT_LOGIN_SCREEN_CONFIG.title
  );
  const [savingLoginScreen, setSavingLoginScreen] = useState(false);
  const [loginScreenMsg, setLoginScreenMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setSelectedIcon(loginConfig.icon || DEFAULT_LOGIN_SCREEN_CONFIG.icon);
    setTitleText(loginConfig.title || DEFAULT_LOGIN_SCREEN_CONFIG.title);
  }, [loginConfig]);

  const handleSaveLoginScreen = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedTitle = titleText.trim();
    if (!cleanedTitle) {
      setLoginScreenMsg({
        type: 'error',
        text: '請輸入登入畫面上方圖示下的文字內容（不可為空白）',
      });
      return;
    }

    setSavingLoginScreen(true);
    setLoginScreenMsg(null);
    try {
      const saved = await saveLoginScreenConfig({
        icon: selectedIcon || DEFAULT_LOGIN_SCREEN_CONFIG.icon,
        title: cleanedTitle,
      });
      onUpdateLoginConfig(saved);
      setLoginScreenMsg({
        type: 'success',
        text: '已成功儲存並同步「系統登入畫面設定」！下次開啟登入畫面即會顯示最新圖示與標題文字。',
      });
    } catch {
      setLoginScreenMsg({
        type: 'error',
        text: '儲存設定失敗，請稍後再試。',
      });
    } finally {
      setSavingLoginScreen(false);
    }
  };

  const handleResetLoginScreenDefault = () => {
    setSelectedIcon(DEFAULT_LOGIN_SCREEN_CONFIG.icon);
    setTitleText(DEFAULT_LOGIN_SCREEN_CONFIG.title);
    setLoginScreenMsg(null);
  };

  // ==========================================
  // 第三分頁：雲端連線 狀態
  // ==========================================
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(() => getCloudConfig());
  const [copiedGas, setCopiedGas] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const [cloudSaveMsg, setCloudSaveMsg] = useState<string | null>(null);
  const [driveTestResult, setDriveTestResult] = useState<{
    success: boolean;
    message: string;
    viewUrl?: string;
  } | null>(null);

  const handleCopyGas = () => {
    navigator.clipboard.writeText(GAS_SCRIPT_CODE);
    setCopiedGas(true);
    setTimeout(() => setCopiedGas(false), 2500);
  };

  const handleTestDrive = async () => {
    setIsTestingDrive(true);
    setDriveTestResult(null);
    const res = await testGoogleDriveConnection(
      cloudConfig.googleDriveScriptUrl,
      cloudConfig.googleDriveFolderId
    );
    setDriveTestResult(res);
    setIsTestingDrive(false);
  };

  const handleSaveCloudConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCloud(true);
    setCloudSaveMsg(null);
    try {
      const prevKey = getCloudConfig().recaptchaEnterpriseSiteKey;
      await saveCloudConfig(cloudConfig);
      onCloudSaved();
      setCloudSaveMsg('✅ 已成功儲存雲端連線設定並同步至所有裝置！');
      if (prevKey !== cloudConfig.recaptchaEnterpriseSiteKey) {
        window.location.reload();
      }
    } finally {
      setSavingCloud(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 頁面頂部橫幅標題 */}
      <div className="rounded-2xl bg-gradient-to-r from-[#261A13] via-[#3A271C] to-[#4E3526] text-[#F6E6D2] p-6 shadow-lg border border-[#5C402D]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4A373] to-[#8B5A2B] flex items-center justify-center shadow-md border border-[#E6C594]/40 shrink-0">
              <Settings className="w-6 h-6 text-[#1E140E]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[11px] font-semibold mb-1">
                <Shield className="w-3 h-3" />
                <span>SYSTEM ADMINISTRATION · 系統管理員專區</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-serif-tc tracking-wide text-[#FAF5EC]">
                系統管理
              </h2>
              <p className="text-xs sm:text-sm text-[#C8B29B] mt-0.5">
                整合「帳號管理」、「系統登入畫面維護」與「雲端連線」功能，所有變更皆即時同步至雲端資料庫
              </p>
            </div>
          </div>

          {/* 三個分頁 (Tab) 切換按鈕列 */}
          <div className="flex flex-wrap items-center gap-2 bg-[#1A110C]/80 p-1.5 rounded-xl border border-[#4E3629] self-start lg:self-center">
            <button
              type="button"
              onClick={() => setActiveSubTab('accounts')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeSubTab === 'accounts'
                  ? 'bg-[#8B5A2B] text-[#FFFDF9] shadow-md border border-[#D4A373]/40'
                  : 'text-[#C8B29B] hover:text-white hover:bg-[#3A271C]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>帳號管理</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeSubTab === 'accounts'
                    ? 'bg-black/30 text-amber-200'
                    : 'bg-white/10 text-[#C8B29B]'
                }`}
              >
                {users.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('loginScreen')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeSubTab === 'loginScreen'
                  ? 'bg-[#8B5A2B] text-[#FFFDF9] shadow-md border border-[#D4A373]/40'
                  : 'text-[#C8B29B] hover:text-white hover:bg-[#3A271C]'
              }`}
            >
              <LayoutTemplate className="w-4 h-4" />
              <span>系統登入畫面維護</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('cloud')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeSubTab === 'cloud'
                  ? 'bg-[#8B5A2B] text-[#FFFDF9] shadow-md border border-[#D4A373]/40'
                  : 'text-[#C8B29B] hover:text-white hover:bg-[#3A271C]'
              }`}
            >
              <Cloud className="w-4 h-4" />
              <span>雲端連線</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 第一分頁：帳號管理 */}
      {/* ========================================================= */}
      {activeSubTab === 'accounts' && (
        <div className="space-y-6">
          <div className="bg-[#FFFDF9] border border-[#DECGB4] rounded-2xl shadow-md overflow-hidden">
          {/* 分頁標頭 */}
          <div className="px-6 py-4 bg-[#FAF4E8] border-b border-[#E5D9C5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center border border-[#8B5A2B]/30">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold font-serif-tc text-[#2C221E]">
                  帳號管理
                </h3>
                <p className="text-xs text-[#6E5D4F]">
                  管理可登入系統的使用者帳號、密碼與角色權限（預設系統管理員 admin 帳號受系統保護）
                </p>
              </div>
            </div>

            {!isCreatingUser && !editingUser && (
              <button
                type="button"
                onClick={startCreateUser}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs sm:text-sm font-semibold shadow-sm transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>新增使用者帳號</span>
              </button>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* 錯誤訊息 */}
            {userError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{userError}</span>
              </div>
            )}

            {/* 成功訊息 */}
            {userSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{userSuccessMsg}</span>
              </div>
            )}

            {/* 新增 / 編輯表單 */}
            {(isCreatingUser || editingUser) && (
              <form
                onSubmit={handleSaveUser}
                className="p-5 rounded-xl bg-[#FAF4E8] border-2 border-[#D4A373] space-y-4 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-[#E5D9C5] pb-3">
                  <h4 className="text-sm sm:text-base font-bold text-[#3A2518] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#8B5A2B]" />
                    <span>
                      {editingUser
                        ? `修改使用者：${editingUser.displayName} (${editingUser.username})`
                        : '建立新使用者帳號'}
                    </span>
                  </h4>
                  {isEditingProtectedAdmin && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold">
                      <Lock className="w-3 h-3" />
                      預設管理員保護中（僅可修改密碼與顯示名稱）
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      登入帳號 (Username) *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={isEditingProtectedAdmin}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="例如：teacher01"
                      className={`w-full px-3.5 py-2 rounded-lg border text-sm focus:outline-none ${
                        isEditingProtectedAdmin
                          ? 'border-[#D5C5AE] bg-[#EFE6D5] text-[#7A6855] cursor-not-allowed font-mono font-bold'
                          : 'border-[#D5C5AE] bg-white focus:border-[#8B5A2B]'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      登入密碼 (Password) *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="請輸入登入密碼"
                        className="w-full pl-3.5 pr-9 py-2 rounded-lg border border-[#D5C5AE] bg-white text-sm font-mono focus:outline-none focus:border-[#8B5A2B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A6855] hover:text-[#2C221E] cursor-pointer"
                        title={showPassword ? '隱藏密碼' : '顯示密碼'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      顯示名稱 / 姓名
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="例如：王老師、李同學"
                      className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-sm focus:outline-none focus:border-[#8B5A2B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      角色權限
                    </label>
                    <select
                      value={isEditingProtectedAdmin ? 'admin' : role}
                      disabled={isEditingProtectedAdmin}
                      onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
                      className={`w-full px-3.5 py-2 rounded-lg border text-sm focus:outline-none ${
                        isEditingProtectedAdmin
                          ? 'border-[#D5C5AE] bg-[#EFE6D5] text-[#7A6855] cursor-not-allowed font-semibold'
                          : 'border-[#D5C5AE] bg-white focus:border-[#8B5A2B]'
                      }`}
                    >
                      <option value="user">一般使用者 (可聽書、新增與編輯館藏)</option>
                      <option value="admin">系統管理員 (具備系統管理與完整權限)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cancelUserForm}
                    className="px-4 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-semibold text-[#5C3A1B] hover:bg-[#EFE6D5] transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="px-5 py-2 rounded-lg bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {savingUser ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{editingUser ? '儲存變更並同步雲端' : '確認新增帳號'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* 刪除確認對話框 */}
            {pendingDeleteUser && (
              <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs sm:text-sm text-red-900">
                  確定要刪除使用者帳號「
                  <span className="font-bold">
                    {pendingDeleteUser.displayName} ({pendingDeleteUser.username})
                  </span>
                  」嗎？刪除後該帳號將無法再登入系統。
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteUser(null)}
                    className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteUser}
                    className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    確認刪除
                  </button>
                </div>
              </div>
            )}

            {/* 使用者列表表格 */}
            {loadingUsers ? (
              <div className="py-12 flex flex-col items-center justify-center text-[#7A6855] gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#8B5A2B]" />
                <span className="text-xs">正在載入使用者名單...</span>
              </div>
            ) : (
              <div className="border border-[#E5D9C5] rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-[#F3ECE0] text-[#5C3A1B] text-xs border-b border-[#E5D9C5]">
                      <th className="py-3 px-4 font-semibold">顯示名稱</th>
                      <th className="py-3 px-4 font-semibold">登入帳號</th>
                      <th className="py-3 px-4 font-semibold">密碼</th>
                      <th className="py-3 px-4 font-semibold">角色權限</th>
                      <th className="py-3 px-4 font-semibold">建立日期</th>
                      <th className="py-3 px-4 font-semibold text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE6D5] text-sm bg-white">
                    {users.map((u) => {
                      const isProtectedAdmin =
                        u.id === PROTECTED_ADMIN_ID ||
                        u.username.toLowerCase() === PROTECTED_ADMIN_USERNAME;
                      const isCurrentUser = u.id === currentUserId;
                      return (
                        <tr key={u.id} className="hover:bg-[#FAF6EE] transition-colors">
                          <td className="py-3 px-4 font-medium text-[#2C221E]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{u.displayName}</span>
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                                  目前登入
                                </span>
                              )}
                              {isProtectedAdmin && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                                  <Lock className="w-2.5 h-2.5" />
                                  系統保護
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#4A3728] font-bold">
                            {u.username}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-[#7A6855]">
                            {u.password}
                          </td>
                          <td className="py-3 px-4">
                            {u.role === 'admin' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                                <Shield className="w-3 h-3" />
                                系統管理員
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F0E6D8] text-[#5C3A1B]">
                                <UserCheck className="w-3 h-3" />
                                一般使用者
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-[#7A6855] font-mono">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString('zh-TW') : '-'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditUser(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E5D9C5] bg-[#FAF4E8] hover:bg-[#EFE2C8] text-[#5C3A1B] text-xs font-semibold transition cursor-pointer"
                                title={
                                  isProtectedAdmin
                                    ? '修改 admin 密碼與顯示名稱'
                                    : '修改帳號或密碼'
                                }
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>編輯</span>
                              </button>
                              {isProtectedAdmin ? (
                                <span
                                  className="p-1.5 rounded-lg text-[#C4B5A3] cursor-not-allowed"
                                  title="預設系統管理員帳號受系統保護，不可刪除"
                                >
                                  <Lock className="w-4 h-4" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteUser(u)}
                                  disabled={isCurrentUser}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={
                                    isCurrentUser
                                      ? '無法刪除目前登入中的帳號'
                                      : '刪除此帳號'
                                  }
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>刪除</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>

          {/* ========================================================= */}
          {/* 新增區塊：人員登入情況紀錄清單 */}
          {/* ========================================================= */}
          <div className="bg-[#FFFDF9] border border-[#DECGB4] rounded-2xl shadow-md overflow-hidden">
            {/* 區塊標頭 */}
            <div className="px-6 py-4 bg-[#FAF4E8] border-b border-[#E5D9C5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center border border-[#8B5A2B]/30">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold font-serif-tc text-[#2C221E]">
                      人員登入情況紀錄
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#8B5A2B]/15 text-[#5C3A1B] border border-[#8B5A2B]/25">
                      共 {loginLogs.length} 筆
                    </span>
                  </div>
                  <p className="text-xs text-[#6E5D4F]">
                    以清單方式即時記錄所有人員帳號登入（含成功、密碼錯誤失敗與訪客模式）的時間、身分與裝置資訊
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={fetchLoginLogs}
                  disabled={loadingLogs}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F3ECE0] text-[#5C3A1B] text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>重新整理</span>
                </button>
                {loginLogs.length > 0 && !confirmClearLogs && (
                  <button
                    type="button"
                    onClick={() => setConfirmClearLogs(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空全部紀錄</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* 清空全部紀錄確認對話框 */}
              {confirmClearLogs && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm text-red-900 font-medium">
                    確定要清空全部 <span className="font-bold">{loginLogs.length}</span> 筆人員登入紀錄嗎？清空後無法復原。
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmClearLogs(false)}
                      className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllLogs}
                      className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      確認清空
                    </button>
                  </div>
                </div>
              )}

              {/* 搜尋與狀態篩選列 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#8B5A2B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="搜尋顯示名稱、登入帳號、裝置或狀態說明..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs sm:text-sm focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'all', label: `全部 (${loginLogs.length})` },
                      {
                        key: 'success',
                        label: `登入成功 (${loginLogs.filter((l) => l.status === 'success').length})`,
                      },
                      {
                        key: 'failed',
                        label: `登入失敗 (${loginLogs.filter((l) => l.status === 'failed').length})`,
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setLogStatusFilter(item.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        logStatusFilter === item.key
                          ? 'bg-[#8B5A2B] text-white border-[#8B5A2B]'
                          : 'bg-[#FAF4E8] text-[#5C3A1B] border-[#E5D9C5] hover:bg-[#EFE2C8]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 登入紀錄清單表格 */}
              {loadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center text-[#7A6855] gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#8B5A2B]" />
                  <span className="text-xs">正在載入人員登入紀錄...</span>
                </div>
              ) : (() => {
                  const q = logSearchQuery.trim().toLowerCase();
                  const filteredLogs = loginLogs.filter((log) => {
                    if (logStatusFilter !== 'all' && log.status !== logStatusFilter) {
                      return false;
                    }
                    if (!q) return true;
                    return (
                      log.displayName.toLowerCase().includes(q) ||
                      log.username.toLowerCase().includes(q) ||
                      (log.deviceInfo || '').toLowerCase().includes(q) ||
                      (log.message || '').toLowerCase().includes(q)
                    );
                  });

                  if (filteredLogs.length === 0) {
                    return (
                      <div className="py-10 text-center border border-dashed border-[#D5C5AE] rounded-xl bg-[#FAF6EE]/60 text-[#7A6855] text-xs sm:text-sm">
                        目前尚無符合條件的人員登入紀錄
                      </div>
                    );
                  }

                  return (
                    <div className="border border-[#E5D9C5] rounded-xl overflow-x-auto max-h-[480px] overflow-y-auto">
                      <table className="w-full text-left border-collapse min-w-[760px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-[#F3ECE0] text-[#5C3A1B] text-xs border-b border-[#E5D9C5]">
                            <th className="py-3 px-3.5 font-semibold w-14">#</th>
                            <th className="py-3 px-3.5 font-semibold">登入時間</th>
                            <th className="py-3 px-3.5 font-semibold">顯示名稱</th>
                            <th className="py-3 px-3.5 font-semibold">登入帳號</th>
                            <th className="py-3 px-3.5 font-semibold">角色權限</th>
                            <th className="py-3 px-3.5 font-semibold">登入狀態</th>
                            <th className="py-3 px-3.5 font-semibold">裝置 / 瀏覽器</th>
                            <th className="py-3 px-3.5 font-semibold text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFE6D5] text-sm bg-white">
                          {filteredLogs.map((log, idx) => (
                            <tr key={log.id} className="hover:bg-[#FAF6EE] transition-colors">
                              <td className="py-2.5 px-3.5 text-xs font-mono text-[#8C7A6B]">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3.5 text-xs font-mono text-[#4A3728] whitespace-nowrap">
                                {log.loginAt
                                  ? new Date(log.loginAt).toLocaleString('zh-TW', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                      hour12: false,
                                    })
                                  : '-'}
                              </td>
                              <td className="py-2.5 px-3.5 font-semibold text-[#2C221E]">
                                {log.displayName}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono text-xs text-[#4A3728] font-bold">
                                {log.username}
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                {log.role === 'admin' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                                    <Shield className="w-3 h-3" />
                                    系統管理員
                                  </span>
                                ) : log.role === 'guest' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 border border-stone-300">
                                    <Compass className="w-3 h-3" />
                                    訪客模式
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F0E6D8] text-[#5C3A1B]">
                                    <UserCheck className="w-3 h-3" />
                                    一般使用者
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5">
                                <div className="flex flex-col gap-0.5">
                                  {log.status === 'success' ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                      <span>{log.message || '登入成功'}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                                      <XCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                                      <span>{log.message || '登入失敗'}</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 text-xs text-[#6E5D4F] whitespace-nowrap">
                                <span className="inline-flex items-center gap-1">
                                  <Monitor className="w-3.5 h-3.5 text-[#8B5A2B]" />
                                  <span>{log.deviceInfo || '-'}</span>
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition cursor-pointer"
                                  title="刪除此筆登入紀錄"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>刪除</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 第二分頁：系統登入畫面維護 */}
      {/* ========================================================= */}
      {activeSubTab === 'loginScreen' && (
        <div className="bg-[#FFFDF9] border border-[#DECGB4] rounded-2xl shadow-md overflow-hidden">
          {/* 分頁標頭 */}
          <div className="px-6 py-4 bg-[#FAF4E8] border-b border-[#E5D9C5] flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center border border-[#8B5A2B]/30">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-serif-tc text-[#2C221E]">
                系統登入畫面維護
              </h3>
              <p className="text-xs text-[#6E5D4F]">
                自訂登入畫面最上方的館藏代表圖示（提供 {ICON_OPTIONS.length} 款圖示下拉選取）與下方主標題文字
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveLoginScreen} className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 左側：登入畫面即時預覽區塊（與首頁登入畫面 LoginView 完全一致的底色與羊皮紙卡片樣式） */}
              <div className="lg:col-span-5 relative overflow-hidden rounded-2xl bg-[#F6F1E7] p-6 border border-[#D8C8B0] shadow-inner">
                {/* 與首頁相同的典藏雅緻背景紋理 */}
                <div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(#8B5A2B_1px,transparent_1px)] [background-size:24px_24px]" />
                <div className="relative z-10 text-center">
                  <div className="inline-block px-3 py-0.5 rounded-full bg-[#8B5A2B]/15 text-[#5C3A1B] text-[11px] font-bold tracking-wider mb-3">
                    登入畫面即時預覽（與首頁底色一致）
                  </div>
                  <div className="bg-[#FFFDF9] border border-[#D8C8B0] rounded-3xl shadow-xl p-6 ring-1 ring-[#8B5A2B]/10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8B5A2B] to-[#5C3A1B] text-[#FAF5EC] shadow-lg shadow-[#5C3A1B]/30 mb-4 ring-4 ring-[#D4A373]/30">
                      {getCategoryIcon(selectedIcon, 'w-8 h-8 stroke-[2.2]')}
                    </div>
                    <div className="text-2xl font-serif-tc font-bold text-[#2C221E] tracking-wide break-words">
                      {titleText.trim() || '（請輸入標題文字）'}
                    </div>
                    <p className="text-xs text-[#8B5A2B] mt-1.5 font-mono tracking-wider font-semibold">
                      SOUNDBOOK PAVILION • 安全存取驗證
                    </p>
                  </div>
                </div>
              </div>

              {/* 右側：表單設定區 */}
              <div className="lg:col-span-7 space-y-5">
                {/* a. 下拉選取登入畫面最上方的圖示（共 100 個選項） */}
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-[#4A3322] mb-1.5">
                    1. 登入畫面最上方的圖示（下拉選單共 {ICON_OPTIONS.length} 款圖示）
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#8B5A2B] to-[#5C3A1B] text-[#FAF5EC] border border-[#D4A373]/40 flex items-center justify-center shrink-0 shadow-xs">
                      {getCategoryIcon(selectedIcon, 'w-6 h-6')}
                    </div>
                    <select
                      value={selectedIcon}
                      onChange={(e) => {
                        setSelectedIcon(e.target.value);
                        setLoginScreenMsg(null);
                      }}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm text-[#2C221E] font-medium focus:outline-none focus:border-[#8B5A2B] cursor-pointer"
                    >
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-[#7A6855] mt-1">
                    從 {ICON_OPTIONS.length} 款精選典藏圖示中選擇最符合館藏風格的標誌，選取後左側預覽會立即更新。
                  </p>
                </div>

                {/* b. 維護登入畫面上方圖示下的文字內容 */}
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-[#4A3322] mb-1.5">
                    2. 登入畫面上方圖示下的文字內容
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={titleText}
                    onChange={(e) => {
                      setTitleText(e.target.value);
                      setLoginScreenMsg(null);
                    }}
                    placeholder="例如：有聲書樓放映閣"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm text-[#2C221E] font-medium focus:outline-none focus:border-[#8B5A2B]"
                  />
                  <p className="text-[11px] text-[#7A6855] mt-1">
                    預設顯示為「{DEFAULT_LOGIN_SCREEN_CONFIG.title}」，可自由修改為您專屬的系統名稱。
                  </p>
                </div>

                {/* 狀態提示訊息 */}
                {loginScreenMsg && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-medium flex items-start gap-2 border ${
                      loginScreenMsg.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {loginScreenMsg.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <span>{loginScreenMsg.text}</span>
                  </div>
                )}

                {/* 底部按鈕列 */}
                <div className="pt-3 border-t border-[#EFE6D5] flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleResetLoginScreenDefault}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-[#FAF4E8] hover:bg-[#EFE2C8] text-[#5C3A1B] text-xs font-semibold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>恢復預設值</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingLoginScreen}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs sm:text-sm font-semibold shadow-md transition cursor-pointer disabled:opacity-60"
                  >
                    {savingLoginScreen ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>儲存同步中...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>儲存設定並同步雲端</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* 第三分頁：雲端連線 */}
      {/* ========================================================= */}
      {activeSubTab === 'cloud' && (
        <div className="bg-[#FFFDF9] border border-[#DECGB4] rounded-2xl shadow-md overflow-hidden">
          {/* 分頁標頭 */}
          <div className="px-6 py-4 bg-[#FAF4E8] border-b border-[#E5D9C5] flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center border border-[#8B5A2B]/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold font-serif-tc text-[#2C221E]">
                雲端資料庫與 Google 雲端硬碟連線設定
              </h3>
              <p className="text-xs text-[#6E5D4F]">
                預設專案名稱：GitHub <code>soundbook-library</code> · Firebase <code>soundbook-library-db</code>
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveCloudConfig} className="p-6 space-y-6">
            {cloudSaveMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs sm:text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cloudSaveMsg}</span>
              </div>
            )}

            {/* 1. Google 雲端硬碟設定 */}
            <div className="p-5 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
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

              <div className="text-xs text-[#5C4938] space-y-1 bg-white/80 p-3.5 rounded-lg border border-[#E2D5C1]">
                <p className="font-bold text-[#2C221E]">
                  為什麼檔案沒有進到雲端硬碟？請確認以下 3 步驟已完成：
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    點擊下方「複製 GAS 腳本」貼到 Google Apps Script 後，
                    <strong>先按上方「執行 (testDrivePermission)」完成 Google 雲端硬碟權限核准</strong>
                    （點「進階」➔「前往專案」➔「允許」）。
                  </li>
                  <li>
                    點擊右上角「部署 ➔ 新增部署作業」，類型選「網頁應用程式」，
                    <strong>「誰可以存取」務必選「所有人 (Anyone)」</strong>。
                  </li>
                  <li>
                    將部署產生的「網頁應用程式網址 (<code>https://script.google.com/macros/s/.../exec</code>)」與「雲端硬碟資料夾網址或 ID」貼在下方欄位，並點擊
                    <strong>「測試寫入雲端硬碟」</strong>確認！
                  </li>
                </ol>
              </div>

              <div className="flex items-center justify-between bg-[#2C221E] text-[#F3D5B5] px-3.5 py-2.5 rounded-lg text-xs">
                <span className="font-mono truncate">google-drive-uploader.gs (含授權檢測函式)</span>
                <button
                  type="button"
                  onClick={handleCopyGas}
                  className="px-3 py-1 rounded bg-[#8B5A2B] hover:bg-[#A46B35] text-white flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedGas ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedGas ? '已複製腳本！' : '複製 GAS 腳本'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    Google Apps Script 部署網址 (Web App URL) *
                  </label>
                  <input
                    type="url"
                    value={cloudConfig.googleDriveScriptUrl}
                    onChange={(e) =>
                      setCloudConfig({ ...cloudConfig, googleDriveScriptUrl: e.target.value })
                    }
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    Google 雲端硬碟資料夾 ID (可直接貼上資料夾網址)
                  </label>
                  <input
                    type="text"
                    value={cloudConfig.googleDriveFolderId}
                    onChange={(e) =>
                      setCloudConfig({
                        ...cloudConfig,
                        googleDriveFolderId: extractDriveFolderId(e.target.value),
                      })
                    }
                    placeholder="貼上資料夾網址或 ID 皆可自動擷取"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>
              </div>

              {/* 測試連線按鈕與結果顯示 */}
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  disabled={isTestingDrive}
                  onClick={handleTestDrive}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#2B4C7E] hover:bg-[#1E385F] disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  {isTestingDrive ? (
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

                {driveTestResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      driveTestResult.success
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-red-50 border-red-300 text-red-900'
                    }`}
                  >
                    {driveTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium leading-relaxed">{driveTestResult.message}</p>
                      {driveTestResult.viewUrl && /^https?:\/\//i.test(driveTestResult.viewUrl) && (
                        <a
                          href={driveTestResult.viewUrl}
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

            {/* 2. Firebase Firestore 設定 */}
            <div className="p-5 rounded-xl bg-[#FAF4E8] border border-[#E2D5C1] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-[#8B5A2B] font-bold text-sm">
                  <Database className="w-4 h-4" />
                  <span>2. Firebase Firestore 資料庫設定 (已自動綁定 soundbook-library-db)</span>
                </div>
                <a
                  href="https://console.firebase.google.com/project/soundbook-library-db/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#8B5A2B] hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>開啟 Firebase Console</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    Firebase Project ID
                  </label>
                  <input
                    type="text"
                    value={cloudConfig.firebaseProjectId}
                    onChange={(e) =>
                      setCloudConfig({ ...cloudConfig, firebaseProjectId: e.target.value })
                    }
                    placeholder="soundbook-library-db"
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    Firebase API Key
                  </label>
                  <input
                    type="text"
                    value={cloudConfig.firebaseApiKey}
                    onChange={(e) =>
                      setCloudConfig({ ...cloudConfig, firebaseApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>
              </div>
            </div>

            {/* 3. Firebase App Check (reCAPTCHA Enterprise) 防護設定 */}
            <div className="p-5 rounded-xl bg-[#F2F7F4] border border-[#CDE3D5] space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-[#1B5E20] font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#2E7D32]" />
                  <span>3. Firebase App Check (reCAPTCHA Enterprise) 雲端防護</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                      cloudConfig.recaptchaEnterpriseSiteKey
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {cloudConfig.recaptchaEnterpriseSiteKey
                      ? '🛡️ 已設定金鑰 (安全保護中)'
                      : '尚未設定金鑰'}
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

              <div className="text-xs text-[#35523A] space-y-1.5 bg-white/80 p-3.5 rounded-lg border border-[#CDE3D5]">
                <p className="font-bold text-[#1B5E20]">
                  🛡️ 如何啟用 reCAPTCHA Enterprise 雲端防護？
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>
                    前往 Firebase 控制台 ➔ <strong>App Check</strong> ➔ 在 Web 應用程式 (
                    <code>soundbook-library-db</code>) 點擊 <strong>「註冊 (Register)」</strong>。
                  </li>
                  <li>
                    提供者請選擇 <strong>reCAPTCHA Enterprise</strong>，依提示建立或綁定 Google Cloud
                    金鑰（授權網域請包含 <code>lighminge.github.io</code>、
                    <code>soundbook-library-db.web.app</code> 與 <code>localhost</code>）。
                  </li>
                  <li>
                    將產生的 <strong>網站金鑰 (Site Key)</strong>{' '}
                    貼在下方欄位後點擊儲存，聲書閣將自動為每次 Firestore
                    讀寫附加安全權杖，徹底阻絕惡意爬蟲與未授權寫入。
                  </li>
                </ol>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1B5E20] mb-1">
                  reCAPTCHA Enterprise 網站金鑰 (Site Key)
                </label>
                <input
                  type="text"
                  value={cloudConfig.recaptchaEnterpriseSiteKey || ''}
                  onChange={(e) =>
                    setCloudConfig({
                      ...cloudConfig,
                      recaptchaEnterpriseSiteKey: e.target.value.trim(),
                    })
                  }
                  placeholder="例如：6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3.5 py-2 rounded-lg border border-[#BBD9C5] bg-white text-xs font-mono focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none"
                />
                <p className="text-[11px] text-[#6A8270] mt-1">
                  💡 說明：若未填寫此金鑰，系統將以原先設定的 Firestore
                  安全性規則正常運作；填入後將立即啟用 App Check 雙層驗證防護。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#EFE6D5]">
              <button
                type="submit"
                disabled={savingCloud}
                className="px-5 py-2.5 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-60"
              >
                {savingCloud ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>儲存並同步至所有裝置</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
