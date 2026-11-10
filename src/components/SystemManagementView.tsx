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
  CalendarDays,
  ArrowUpDown,
  BarChart3,
  List,
  TrendingUp,
  Clock,
  PieChart,
  Activity,
  Award,
  Smartphone,
  Laptop,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { AppUser, AudioItem, Category, CloudConfig, LoginLogRecord, LoginScreenConfig } from '../types';
import { PaginationBar, dateInputToEndMs, dateInputToStartMs } from './PaginationBar';
import { PlayStatisticsPanel } from './PlayStatisticsPanel';
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

export type SystemSubTab = 'accounts' | 'loginScreen' | 'cloud' | 'statistics';

interface SystemManagementViewProps {
  currentUserId: string;
  loginConfig: LoginScreenConfig;
  onUpdateLoginConfig: (newConfig: LoginScreenConfig) => void;
  onCloudSaved: () => void;
  onUserUpdated?: () => void;
  initialSubTab?: SystemSubTab;
  audioItems?: AudioItem[];
  categories?: Category[];
}

export const SystemManagementView: React.FC<SystemManagementViewProps> = ({
  currentUserId,
  loginConfig,
  onUpdateLoginConfig,
  onCloudSaved,
  onUserUpdated,
  initialSubTab = 'accounts',
  audioItems = [],
  categories = [],
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
  const [logViewMode, setLogViewMode] = useState<'list' | 'chart'>('list');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [logSortField, setLogSortField] = useState<'loginAt' | 'username' | 'deviceInfo'>('loginAt');
  const [logSortDir, setLogSortDir] = useState<'asc' | 'desc'>('desc');
  const [logPageSize, setLogPageSize] = useState<number>(10);
  const [logPage, setLogPage] = useState<number>(1);
  // 24小時活躍時段分佈圖表之日期篩選（'all' 全部區間 | 'today' 僅今日 | 指定 YYYY-MM-DD）
  const [hourlyFilterDate, setHourlyFilterDate] = useState<'all' | 'today' | string>('all');
  // 圖表懸停即時分析提示（確保每日趨勢與 24 小時時段數據 100% 完整無裁切呈現）
  const [hoveredDaily, setHoveredDaily] = useState<{ day: string; total: number; success: number; failed: number } | null>(null);
  const [hoveredHourly, setHoveredHourly] = useState<{ hour: number; total: number; success: number; failed: number } | null>(null);

  // 篩選條件變更時回到第一頁
  useEffect(() => {
    setLogPage(1);
  }, [logSearchQuery, logStatusFilter, logDateFrom, logDateTo, logSortField, logSortDir, logPageSize]);

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

            <button
              type="button"
              onClick={() => setActiveSubTab('statistics')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeSubTab === 'statistics'
                  ? 'bg-[#8B5A2B] text-[#FFFDF9] shadow-md border border-[#D4A373]/40'
                  : 'text-[#C8B29B] hover:text-white hover:bg-[#3A271C]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>統計作業</span>
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
                    即時記錄並以清單或視覺化圖表分析所有人員帳號登入（含成功、失敗與訪客模式）的時間、身分與裝置資訊
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* 清單 / 圖表 顯示切換 */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#D5C5AE] shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setLogViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      logViewMode === 'list'
                        ? 'bg-[#8B5A2B] text-white shadow-xs'
                        : 'text-[#6E5D4F] hover:text-[#2C221E] hover:bg-[#F3ECE0]'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>清單</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogViewMode('chart')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      logViewMode === 'chart'
                        ? 'bg-[#8B5A2B] text-white shadow-xs'
                        : 'text-[#6E5D4F] hover:text-[#2C221E] hover:bg-[#F3ECE0]'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>圖表</span>
                  </button>
                </div>

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

              {/* 日期起迄、排序條件列 */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF4E8] border border-[#E5D9C5]">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C3A1B]">
                  <CalendarDays className="w-4 h-4 text-[#8B5A2B]" />
                  <span className="font-semibold">登入日期</span>
                  <input
                    type="date"
                    value={logDateFrom}
                    max={logDateTo || undefined}
                    onChange={(e) => setLogDateFrom(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
                  />
                  <span>至</span>
                  <input
                    type="date"
                    value={logDateTo}
                    min={logDateFrom || undefined}
                    onChange={(e) => setLogDateTo(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
                  />
                  {(logDateFrom || logDateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogDateFrom('');
                        setLogDateTo('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#EFE2C8] text-xs font-semibold cursor-pointer"
                    >
                      清除日期
                    </button>
                  )}
                </div>

                {logViewMode === 'chart' ? (
                  <div className="text-xs text-[#6E5D4F] flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-[#8B5A2B]" />
                    <span>圖表依當前關鍵字、狀態與日期篩選即時匯總統計</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C3A1B]">
                    <ArrowUpDown className="w-4 h-4 text-[#8B5A2B]" />
                    <span className="font-semibold">排序</span>
                    <select
                      value={logSortField}
                      onChange={(e) =>
                        setLogSortField(e.target.value as 'loginAt' | 'username' | 'deviceInfo')
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs font-semibold focus:outline-none focus:border-[#8B5A2B] cursor-pointer"
                    >
                      <option value="loginAt">登入時間</option>
                      <option value="username">登入帳號</option>
                      <option value="deviceInfo">裝置 / 瀏覽器</option>
                    </select>
                    <select
                      value={logSortDir}
                      onChange={(e) => setLogSortDir(e.target.value as 'asc' | 'desc')}
                      className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs font-semibold focus:outline-none focus:border-[#8B5A2B] cursor-pointer"
                    >
                      <option value="desc">由大到小</option>
                      <option value="asc">由小到大</option>
                    </select>
                  </div>
                )}
              </div>

              {/* 登入紀錄清單表格 */}
              {loadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center text-[#7A6855] gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#8B5A2B]" />
                  <span className="text-xs">正在載入人員登入紀錄...</span>
                </div>
              ) : (() => {
                  const q = logSearchQuery.trim().toLowerCase();
                  const fromMs = dateInputToStartMs(logDateFrom);
                  const toMs = dateInputToEndMs(logDateTo);

                  // 容錯解析各種格式之登入時間戳（ISO 字串、數值、物件時間戳等）
                  const parseLogDate = (raw: any): Date | null => {
                    if (!raw) return null;
                    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
                    if (typeof raw === 'object' && typeof raw.seconds === 'number') {
                      return new Date(raw.seconds * 1000);
                    }
                    if (typeof raw === 'number') {
                      const d = new Date(raw);
                      return isNaN(d.getTime()) ? null : d;
                    }
                    if (typeof raw === 'string') {
                      const d = new Date(raw);
                      return isNaN(d.getTime()) ? null : d;
                    }
                    return null;
                  };

                  const filteredLogs = loginLogs.filter((log) => {
                    if (logStatusFilter !== 'all' && log.status !== logStatusFilter) {
                      return false;
                    }
                    const d = parseLogDate(log.loginAt);
                    const ts = d ? d.getTime() : 0;
                    if (fromMs !== null && ts < fromMs) return false;
                    if (toMs !== null && ts > toMs) return false;
                    if (!q) return true;
                    return (
                      log.displayName.toLowerCase().includes(q) ||
                      log.username.toLowerCase().includes(q) ||
                      (log.deviceInfo || '').toLowerCase().includes(q) ||
                      (log.message || '').toLowerCase().includes(q)
                    );
                  });

                  const dirFactor = logSortDir === 'asc' ? 1 : -1;
                  filteredLogs.sort((a, b) => {
                    let cmp = 0;
                    if (logSortField === 'loginAt') {
                      const ta = parseLogDate(a.loginAt)?.getTime() || 0;
                      const tb = parseLogDate(b.loginAt)?.getTime() || 0;
                      cmp = ta - tb;
                    } else if (logSortField === 'username') {
                      cmp = (a.username || '').localeCompare(b.username || '', 'zh-Hant');
                    } else {
                      cmp = (a.deviceInfo || '').localeCompare(b.deviceInfo || '', 'zh-Hant');
                    }
                    if (cmp === 0 && logSortField !== 'loginAt') {
                      // 次要排序：登入時間由新到舊
                      const ta = parseLogDate(a.loginAt)?.getTime() || 0;
                      const tb = parseLogDate(b.loginAt)?.getTime() || 0;
                      cmp = (tb - ta) * dirFactor;
                    }
                    return cmp * dirFactor;
                  });

                  const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / logPageSize));
                  const safeLogPage = Math.min(logPage, logTotalPages);
                  const pageStart = (safeLogPage - 1) * logPageSize;
                  const pagedLogs = filteredLogs.slice(pageStart, pageStart + logPageSize);

                  if (filteredLogs.length === 0) {
                    return (
                      <div className="py-10 text-center border border-dashed border-[#D5C5AE] rounded-xl bg-[#FAF6EE]/60 text-[#7A6855] text-xs sm:text-sm">
                        目前尚無符合條件的人員登入紀錄
                      </div>
                    );
                  }

                  // 依檢視模式切換：圖表模式或清單模式
                  if (logViewMode === 'chart') {
                    // 1. 指標總計
                    const totalCount = filteredLogs.length;
                    const successLogs = filteredLogs.filter((l) => l.status === 'success');
                    const failedLogs = filteredLogs.filter((l) => l.status === 'failed');
                    const successCount = successLogs.length;
                    const failedCount = failedLogs.length;
                    const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0.0';
                    const failedRate = totalCount > 0 ? ((failedCount / totalCount) * 100).toFixed(1) : '0.0';

                    // 2. 角色分佈
                    const adminCount = filteredLogs.filter((l) => l.role === 'admin').length;
                    const userCount = filteredLogs.filter((l) => l.role === 'user').length;
                    const guestCount = filteredLogs.filter((l) => l.role === 'guest').length;

                    // 3. 人員聚合排行
                    const userAggMap = new Map<
                      string,
                      {
                        username: string;
                        displayName: string;
                        role: 'admin' | 'user' | 'guest';
                        total: number;
                        success: number;
                        failed: number;
                        lastLogin: string;
                      }
                    >();

                    filteredLogs.forEach((log) => {
                      const key = log.username || log.displayName || 'unknown';
                      const existing = userAggMap.get(key);
                      if (existing) {
                        existing.total += 1;
                        if (log.status === 'success') existing.success += 1;
                        else existing.failed += 1;
                        if (new Date(log.loginAt || 0) > new Date(existing.lastLogin || 0)) {
                          existing.lastLogin = log.loginAt;
                          existing.displayName = log.displayName || existing.displayName;
                        }
                      } else {
                        userAggMap.set(key, {
                          username: log.username,
                          displayName: log.displayName || log.username,
                          role: log.role,
                          total: 1,
                          success: log.status === 'success' ? 1 : 0,
                          failed: log.status === 'failed' ? 1 : 0,
                          lastLogin: log.loginAt,
                        });
                      }
                    });

                    const userRanking = Array.from(userAggMap.values()).sort((a, b) => b.total - a.total);
                    const maxUserLogCount = userRanking.length > 0 ? userRanking[0].total : 1;

                    // 4. 每日登入趨勢
                    const dailyAggMap = new Map<string, { total: number; success: number; failed: number }>();
                    filteredLogs.forEach((log) => {
                      const d = parseLogDate(log.loginAt);
                      if (!d) return;
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      const dateKey = `${y}-${m}-${day}`;
                      const existing = dailyAggMap.get(dateKey);
                      if (existing) {
                        existing.total += 1;
                        if (log.status === 'success') existing.success += 1;
                        else existing.failed += 1;
                      } else {
                        dailyAggMap.set(dateKey, {
                          total: 1,
                          success: log.status === 'success' ? 1 : 0,
                          failed: log.status === 'failed' ? 1 : 0,
                        });
                      }
                    });
                    const dailyTrend = Array.from(dailyAggMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                    const maxDailyTotal = dailyTrend.reduce((max, [, d]) => Math.max(max, d.total), 1);

                    // 5. 24小時時段分佈（支援切換「全部區間彙總」或「今日活躍時段」）
                    const now = new Date();
                    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const targetLogsForHourly = filteredLogs.filter((log) => {
                      if (hourlyFilterDate === 'all') return true;
                      const d = parseLogDate(log.loginAt);
                      if (!d) return false;
                      const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      if (hourlyFilterDate === 'today') return dKey === todayKey;
                      return dKey === hourlyFilterDate;
                    });

                    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
                      hour,
                      total: 0,
                      success: 0,
                      failed: 0,
                    }));
                    targetLogsForHourly.forEach((log) => {
                      const d = parseLogDate(log.loginAt);
                      if (!d) return;
                      const h = d.getHours();
                      if (h >= 0 && h < 24) {
                        hourlyDistribution[h].total += 1;
                        if (log.status === 'success') hourlyDistribution[h].success += 1;
                        else hourlyDistribution[h].failed += 1;
                      }
                    });
                    const maxHourlyTotal = hourlyDistribution.reduce((max, h) => Math.max(max, h.total), 1);
                    let peakHour = 0;
                    let peakHourCount = 0;
                    hourlyDistribution.forEach((h) => {
                      if (h.total > peakHourCount) {
                        peakHourCount = h.total;
                        peakHour = h.hour;
                      }
                    });

                    // 6. 常用裝置分佈
                    const deviceAggMap = new Map<string, number>();
                    filteredLogs.forEach((l) => {
                      const d = (l.deviceInfo || '未知裝置').trim();
                      deviceAggMap.set(d, (deviceAggMap.get(d) || 0) + 1);
                    });
                    const topDevices = Array.from(deviceAggMap.entries())
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5);

                    return (
                      <div className="space-y-6">
                        {/* 摘要統計卡片 */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          <div className="p-3.5 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs">
                            <div className="flex items-center gap-1.5 text-[#8B5A2B]">
                              <History className="w-4 h-4" />
                              <span className="text-xs font-semibold text-[#6E5D4F]">登入總次數</span>
                            </div>
                            <div className="mt-1.5 text-xl font-bold font-mono text-[#2C221E]">{totalCount} 次</div>
                            <div className="text-[11px] text-[#8C7A6B] mt-0.5">全區間共 {loginLogs.length} 筆</div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs">
                            <div className="flex items-center gap-1.5 text-emerald-700">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs font-semibold text-[#6E5D4F]">登入成功</span>
                            </div>
                            <div className="mt-1.5 text-xl font-bold font-mono text-emerald-800">{successCount} 次</div>
                            <div className="text-[11px] text-emerald-700 font-medium mt-0.5">成功率 {successRate}%</div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs">
                            <div className="flex items-center gap-1.5 text-rose-700">
                              <XCircle className="w-4 h-4 text-rose-600" />
                              <span className="text-xs font-semibold text-[#6E5D4F]">登入失敗</span>
                            </div>
                            <div className="mt-1.5 text-xl font-bold font-mono text-rose-700">{failedCount} 次</div>
                            <div className="text-[11px] text-rose-600 font-medium mt-0.5">失敗率 {failedRate}%</div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs">
                            <div className="flex items-center gap-1.5 text-[#8B5A2B]">
                              <Users className="w-4 h-4" />
                              <span className="text-xs font-semibold text-[#6E5D4F]">活躍帳號</span>
                            </div>
                            <div className="mt-1.5 text-xl font-bold font-mono text-[#2C221E]">{userRanking.length} 人</div>
                            <div className="text-[11px] text-[#8C7A6B] mt-0.5">曾登入之不同帳號</div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs">
                            <div className="flex items-center gap-1.5 text-stone-700">
                              <Compass className="w-4 h-4 text-stone-600" />
                              <span className="text-xs font-semibold text-[#6E5D4F]">訪客登入</span>
                            </div>
                            <div className="mt-1.5 text-xl font-bold font-mono text-stone-800">{guestCount} 次</div>
                            <div className="text-[11px] text-[#8C7A6B] mt-0.5">
                              佔比 {totalCount > 0 ? ((guestCount / totalCount) * 100).toFixed(1) : 0}%
                            </div>
                          </div>
                        </div>

                        {/* 圖表 1：每日登入次數趨勢長條圖（獨立全寬加大區塊，放大圖表與數據可視度） */}
                        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E5D9C5] flex flex-col shadow-xs space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F0E6D8]">
                            <div>
                              <div className="flex items-center gap-2 text-base font-bold text-[#3A2518]">
                                <TrendingUp className="w-5 h-5 text-[#8B5A2B]" />
                                <span>每日登入次數趨勢分析</span>
                                <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[#EFE6D5] text-[#5C3A1B]">
                                  共 {dailyTrend.length} 天紀錄
                                </span>
                              </div>
                              <p className="text-xs text-[#8C7A6B] mt-0.5">
                                統計所選查詢區間內每日的登入成功與失敗次數分佈趨勢，柱狀圖上方即時標示登入次數。
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-semibold text-[#5C3A1B] shrink-0">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-xs bg-emerald-600 shadow-2xs" />
                                <span>成功登入</span>
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-xs bg-rose-500 shadow-2xs" />
                                <span>失敗嘗試</span>
                              </span>
                            </div>
                          </div>

                          {dailyTrend.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center text-xs text-[#8C7A6B] gap-2">
                              <Calendar className="w-8 h-8 text-[#D5C5AE]" />
                              <span>查詢區間內尚無登入紀錄</span>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {/* 頂部即時懸停分析列（即便螢幕縮放或捲動，亦能 100% 完整無裁切呈現目前焦點數據） */}
                              <div className="flex flex-wrap items-center justify-between text-xs font-mono px-3 py-1.5 rounded-lg bg-[#FAF4E8] border border-[#D5C5AE] transition-colors">
                                {hoveredDaily ? (
                                  <div className="flex flex-wrap items-center gap-3 text-[#3A2518]">
                                    <span className="font-bold text-[#8B5A2B]">📅 {hoveredDaily.day}</span>
                                    <span>總登入：<strong>{hoveredDaily.total} 次</strong></span>
                                    <span className="text-emerald-700 font-semibold">✓ 成功：{hoveredDaily.success} 次</span>
                                    {hoveredDaily.failed > 0 && <span className="text-rose-600 font-semibold">✗ 失敗：{hoveredDaily.failed} 次</span>}
                                    <span className="text-[#8C7A6B]">（成功率 {hoveredDaily.total > 0 ? ((hoveredDaily.success / hoveredDaily.total) * 100).toFixed(1) : 0}%）</span>
                                  </div>
                                ) : (
                                  <div className="text-[#8C7A6B] flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>滑鼠懸停於各日期長條柱上，即可查看該日登入詳細成功與失敗次數</span>
                                  </div>
                                )}
                                <span className="text-[#8C7A6B] hidden sm:inline">單日最高：<strong className="text-[#8B5A2B]">{maxDailyTotal} 次</strong></span>
                              </div>

                              {/* 長條圖本體：加大至 h-88 (352px)，提供充足 pt-20 頂部空間，徹底解決懸停提示被裁切問題 */}
                              <div className="relative h-88 pt-20 pb-8 border-b-2 border-l-2 border-[#D5C5AE] px-3 overflow-x-auto">
                                {/* 背景水平虛線參考線 */}
                                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-25 px-2">
                                  <div className="border-b border-dashed border-[#8B735B] w-full" />
                                  <div className="border-b border-dashed border-[#8B735B] w-full" />
                                  <div className="border-b border-dashed border-[#8B735B] w-full" />
                                  <div className="border-b border-dashed border-[#8B735B] w-full" />
                                </div>

                                <div className="h-full flex items-end gap-3 sm:gap-4 min-w-full">
                                  {dailyTrend.map(([day, d], idx) => {
                                    const barHeightPx = Math.max(16, Math.round((d.total / maxDailyTotal) * 190));
                                    const successPct = d.total > 0 ? (d.success / d.total) * 100 : 0;
                                    const failedPct = d.total > 0 ? (d.failed / d.total) * 100 : 0;
                                    const isFirst = idx === 0;
                                    const isLast = idx === dailyTrend.length - 1;
                                    const alignClass = isFirst
                                      ? 'left-0 items-start'
                                      : isLast
                                      ? 'right-0 items-end'
                                      : 'left-1/2 -translate-x-1/2 items-center';
                                    const arrowClass = isFirst
                                      ? 'left-4'
                                      : isLast
                                      ? 'right-4'
                                      : 'left-1/2 -translate-x-1/2';

                                    return (
                                      <div
                                        key={day}
                                        onMouseEnter={() => setHoveredDaily({ day, total: d.total, success: d.success, failed: d.failed })}
                                        onMouseLeave={() => setHoveredDaily(null)}
                                        className="flex-1 min-w-[46px] h-full flex flex-col justify-end items-center group relative cursor-pointer"
                                      >
                                        {/* 柱狀圖上方數值標籤（免 hover 直接清晰呈現） */}
                                        <span className="text-[11px] font-mono font-bold text-[#5C3A1B] mb-1.5 group-hover:scale-110 transition-transform">
                                          {d.total}
                                        </span>

                                        {/* 長條圖條體 */}
                                        <div
                                          className="w-full max-w-[36px] rounded-t-md flex flex-col justify-end overflow-hidden transition-all duration-200 shadow-xs group-hover:brightness-110 group-hover:shadow-md"
                                          style={{ height: `${barHeightPx}px` }}
                                        >
                                          {d.failed > 0 && (
                                            <div
                                              className="w-full bg-rose-500"
                                              style={{ height: `${failedPct}%` }}
                                              title={`失敗 ${d.failed} 次`}
                                            />
                                          )}
                                          <div
                                            className="w-full bg-gradient-to-t from-emerald-700 to-emerald-500"
                                            style={{ height: `${successPct}%` }}
                                            title={`成功 ${d.success} 次`}
                                          />
                                        </div>

                                        {/* 下方日期標籤 */}
                                        <span className="text-[11px] font-mono text-[#5C3A1B] font-semibold mt-2.5 whitespace-nowrap">
                                          {day.slice(5)}
                                        </span>

                                        {/* 懸停詳細資訊卡片（精確內縮並置於 pt-20 安全區間內，杜絕任何文字被裁切） */}
                                        <div className={`absolute -top-15 hidden group-hover:flex flex-col whitespace-nowrap text-xs font-mono bg-[#2C221E] text-white px-3.5 py-1.5 rounded-lg shadow-xl z-30 pointer-events-none transition-all ${alignClass}`}>
                                          <span className="font-bold text-amber-300">{day}</span>
                                          <span className="mt-0.5 text-[11px]">
                                            總計 {d.total} 次（成功 {d.success} / 失敗 {d.failed}）
                                          </span>
                                          {/* 向下小箭頭 */}
                                          <div className={`absolute -bottom-1 w-2 h-2 bg-[#2C221E] rotate-45 ${arrowClass}`} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex justify-between text-xs font-mono text-[#8C7A6B] px-1 pt-1">
                                <span>起始日期：{dailyTrend[0][0]}</span>
                                <span>
                                  單日最高：<strong className="text-[#8B5A2B]">{maxDailyTotal} 次</strong>
                                </span>
                                <span>結束日期：{dailyTrend[dailyTrend.length - 1][0]}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 圖表 2：24 小時時段分佈圖（獨立全寬加大區塊，支援今日與全部切換，確保今日登入完全呈現） */}
                        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E5D9C5] flex flex-col shadow-xs space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F0E6D8]">
                            <div>
                              <div className="flex items-center gap-2 text-base font-bold text-[#3A2518]">
                                <Clock className="w-5 h-5 text-[#8B5A2B]" />
                                <span>24 小時登入活躍時段分佈</span>
                                {peakHourCount > 0 && (
                                  <span className="text-xs font-semibold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                                    🔥 活躍尖峰：{String(peakHour).padStart(2, '0')}:00 ~ {String(peakHour).padStart(2, '0')}:59 ({peakHourCount} 次)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#8C7A6B] mt-0.5">
                                橫跨 00:00 至 23:00 全日 24 個小時，可切換查看今日登入活躍情況或查詢區間總體彙總。
                              </p>
                            </div>

                            {/* 日期視圖切換器（提供全部彙總 vs 今日登入快捷切換） */}
                            <div className="flex items-center gap-1.5 bg-[#FAF4E8] p-1 rounded-xl border border-[#D5C5AE] shrink-0 text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => setHourlyFilterDate('all')}
                                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                                  hourlyFilterDate === 'all'
                                    ? 'bg-[#3A2518] text-white shadow-xs'
                                    : 'text-[#6E5D4F] hover:bg-[#EFE6D5]'
                                }`}
                              >
                                全部區間彙總 ({filteredLogs.length} 筆)
                              </button>
                              <button
                                type="button"
                                onClick={() => setHourlyFilterDate('today')}
                                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                                  hourlyFilterDate === 'today'
                                    ? 'bg-[#8B5A2B] text-white shadow-xs'
                                    : 'text-[#6E5D4F] hover:bg-[#EFE6D5]'
                                }`}
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>僅看今日 ({todayKey})</span>
                              </button>
                            </div>
                          </div>

                          {/* 24 小時全幅長條圖：加大至 h-88 (352px)，每小時獨立欄位並清楚標示次數，提供充足 pt-20 頂部空間避免被裁切 */}
                          <div className="space-y-2.5">
                            {/* 頂部即時懸停分析列（即便螢幕縮放或捲動，亦能 100% 完整無裁切呈現目前焦點數據） */}
                            <div className="flex flex-wrap items-center justify-between text-xs font-mono px-3 py-1.5 rounded-lg bg-[#FAF4E8] border border-[#D5C5AE] transition-colors">
                              {hoveredHourly ? (
                                <div className="flex flex-wrap items-center gap-3 text-[#3A2518]">
                                  <span className="font-bold text-[#8B5A2B]">⏰ {String(hoveredHourly.hour).padStart(2, '0')}:00 ~ {String(hoveredHourly.hour).padStart(2, '0')}:59</span>
                                  <span>時段登入：<strong>{hoveredHourly.total} 次</strong></span>
                                  <span className="text-emerald-700 font-semibold">✓ 成功：{hoveredHourly.success} 次</span>
                                  {hoveredHourly.failed > 0 && <span className="text-rose-600 font-semibold">✗ 失敗：{hoveredHourly.failed} 次</span>}
                                  <span className="text-[#8C7A6B]">（本視圖佔比 {targetLogsForHourly.length > 0 ? ((hoveredHourly.total / targetLogsForHourly.length) * 100).toFixed(1) : 0}%）</span>
                                </div>
                              ) : (
                                <div className="text-[#8C7A6B] flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                  <span>滑鼠懸停於 24 小時任一時段長條柱上，即可查看該時段登入詳細數據</span>
                                </div>
                              )}
                              <span className="text-[#8C7A6B] hidden sm:inline">
                                活躍尖峰：
                                <strong className="text-[#8B5A2B] ml-1">
                                  {peakHourCount > 0 ? `${String(peakHour).padStart(2, '0')}:00 (${peakHourCount} 次)` : '尚無'}
                                </strong>
                              </span>
                            </div>

                            <div className="relative h-88 pt-20 pb-8 border-b-2 border-l-2 border-[#D5C5AE] px-2 overflow-x-auto">
                              {/* 背景水平虛線參考線 */}
                              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-25 px-2">
                                <div className="border-b border-dashed border-[#8B735B] w-full" />
                                <div className="border-b border-dashed border-[#8B735B] w-full" />
                                <div className="border-b border-dashed border-[#8B735B] w-full" />
                                <div className="border-b border-dashed border-[#8B735B] w-full" />
                              </div>

                              <div className="h-full flex items-end gap-1 sm:gap-2 min-w-[700px]">
                                {hourlyDistribution.map((h, idx) => {
                                  const isPeak = h.total > 0 && h.total === peakHourCount;
                                  const barHeightPx =
                                    h.total > 0 ? Math.max(16, Math.round((h.total / maxHourlyTotal) * 190)) : 6;
                                  const isLeftEdge = idx <= 1;
                                  const isRightEdge = idx >= 22;
                                  const alignClass = isLeftEdge
                                    ? 'left-0 items-start'
                                    : isRightEdge
                                    ? 'right-0 items-end'
                                    : 'left-1/2 -translate-x-1/2 items-center';
                                  const arrowClass = isLeftEdge
                                    ? 'left-4'
                                    : isRightEdge
                                    ? 'right-4'
                                    : 'left-1/2 -translate-x-1/2';

                                  return (
                                    <div
                                      key={h.hour}
                                      onMouseEnter={() => setHoveredHourly({ hour: h.hour, total: h.total, success: h.success, failed: h.failed })}
                                      onMouseLeave={() => setHoveredHourly(null)}
                                      className="flex-1 min-w-[26px] h-full flex flex-col justify-end items-center group relative cursor-pointer"
                                    >
                                      {/* 若該小時有登入，上方即時標示登入次數 */}
                                      {h.total > 0 && (
                                        <span
                                          className={`text-[10px] font-mono font-bold px-1 rounded-sm mb-1 group-hover:scale-110 transition-transform ${
                                            isPeak
                                              ? 'bg-amber-400 text-amber-950 shadow-2xs'
                                              : 'bg-[#FAF4E8] text-[#5C3A1B] border border-[#D5C5AE]'
                                          }`}
                                        >
                                          {h.total}
                                        </span>
                                      )}

                                      {/* 時段長條柱（有登入顯示溫暖琥珀/古木漸層，尖峰時段高亮呈現） */}
                                      <div
                                        className={`w-full rounded-t-md transition-all duration-200 ${
                                          h.total === 0
                                            ? 'bg-[#EFE6D5]/80 hover:bg-[#E5D9C5]'
                                            : isPeak
                                            ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-md ring-2 ring-amber-300'
                                            : 'bg-gradient-to-t from-[#8B5A2B] to-[#D4A373] shadow-xs'
                                        } group-hover:brightness-110 group-hover:shadow-md`}
                                        style={{ height: `${barHeightPx}px` }}
                                      />

                                      {/* 下方時段標籤：清晰標示 24 個小時 */}
                                      <span
                                        className={`text-[10px] font-mono mt-2.5 whitespace-nowrap ${
                                          h.total > 0
                                            ? 'text-[#3A2518] font-bold'
                                            : 'text-[#8C7A6B]'
                                        }`}
                                      >
                                        {String(h.hour).padStart(2, '0')}:00
                                      </span>

                                      {/* 懸停詳細提示（精確內縮並置於 pt-20 安全區間內，杜絕任何文字被裁切） */}
                                      <div className={`absolute -top-15 hidden group-hover:flex flex-col whitespace-nowrap text-xs font-mono bg-[#2C221E] text-white px-3.5 py-1.5 rounded-lg shadow-xl z-30 pointer-events-none transition-all ${alignClass}`}>
                                        <span className="font-bold text-amber-300">
                                          {String(h.hour).padStart(2, '0')}:00 ~ {String(h.hour).padStart(2, '0')}:59
                                        </span>
                                        <span className="mt-0.5 text-[11px]">
                                          登入 {h.total} 次（成功 {h.success} / 失敗 {h.failed}）
                                        </span>
                                        {/* 向下小箭頭 */}
                                        <div className={`absolute -bottom-1 w-2 h-2 bg-[#2C221E] rotate-45 ${arrowClass}`} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between text-xs font-mono text-[#8C7A6B] px-1 pt-1">
                              <span>
                                目前視圖：
                                <strong className="text-[#3A2518] ml-1">
                                  {hourlyFilterDate === 'today'
                                    ? `今日 (${todayKey})`
                                    : hourlyFilterDate === 'all'
                                    ? '全部區間彙總'
                                    : hourlyFilterDate}
                                </strong>
                              </span>
                              <span>
                                本視圖登入總計：
                                <strong className="text-[#8B5A2B] ml-1">
                                  {targetLogsForHourly.length} 次
                                </strong>
                              </span>
                              <span>
                                最高時段登入量：
                                <strong className="text-[#8B5A2B] ml-1">{maxHourlyTotal} 次</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 第二組圖表：人員登入次數排行 + 狀態與角色分佈比例 */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                          {/* 人員登入次數排行 */}
                          <div className="lg:col-span-7 p-4 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 text-sm font-bold text-[#3A2518]">
                                <Award className="w-4 h-4 text-[#8B5A2B]" />
                                <span>人員登入次數排行（共 {userRanking.length} 位人員）</span>
                              </div>
                              <span className="text-[11px] text-[#6E5D4F]">
                                依總登入次數由高至低排列
                              </span>
                            </div>

                            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                              {userRanking.slice(0, 15).map((u, idx) => {
                                const pct = (u.total / maxUserLogCount) * 100;
                                return (
                                  <div
                                    key={u.username}
                                    className="p-2.5 rounded-xl bg-[#FAF6EE] border border-[#EFE2C8] hover:bg-[#F5EBD8] transition"
                                  >
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                                            idx === 0
                                              ? 'bg-amber-400 text-amber-950 shadow-xs'
                                              : idx === 1
                                              ? 'bg-stone-300 text-stone-900'
                                              : idx === 2
                                              ? 'bg-amber-700/70 text-white'
                                              : 'bg-white text-[#8C7A6B] border border-[#D5C5AE]'
                                          }`}
                                        >
                                          #{idx + 1}
                                        </span>
                                        <span className="font-bold text-xs sm:text-sm text-[#2C221E] truncate">
                                          {u.displayName}
                                        </span>
                                        <span className="font-mono text-[11px] text-[#6E5D4F] truncate">
                                          ({u.username})
                                        </span>
                                        {u.role === 'admin' ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                                            管理員
                                          </span>
                                        ) : u.role === 'guest' ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-700 border border-stone-300 shrink-0">
                                            訪客
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F0E6D8] text-[#5C3A1B] shrink-0">
                                            使用者
                                          </span>
                                        )}
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="font-mono text-xs font-bold text-[#8B5A2B]">
                                          {u.total} 次
                                        </span>
                                        <span className="text-[10px] text-[#8C7A6B] ml-1.5">
                                          (成功 {u.success} / 失敗 {u.failed})
                                        </span>
                                      </div>
                                    </div>

                                    {/* 水平長條圖 */}
                                    <div className="w-full h-2 rounded-full bg-[#E8DDD0] overflow-hidden flex">
                                      {u.failed > 0 && (
                                        <div
                                          className="h-full bg-rose-500"
                                          style={{ width: `${(u.failed / u.total) * pct}%` }}
                                        />
                                      )}
                                      <div
                                        className="h-full bg-gradient-to-r from-emerald-600 to-amber-600"
                                        style={{ width: `${(u.success / u.total) * pct}%` }}
                                      />
                                    </div>

                                    {u.lastLogin && (
                                      <div className="flex justify-end text-[10px] font-mono text-[#8C7A6B] mt-1">
                                        最近登入：{new Date(u.lastLogin).toLocaleString('zh-TW', { hour12: false })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 狀態、角色與裝置分佈 */}
                          <div className="lg:col-span-5 space-y-4">
                            {/* 登入狀態與角色權限比例 */}
                            <div className="p-4 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs space-y-3.5">
                              <div className="flex items-center gap-2 text-sm font-bold text-[#3A2518]">
                                <PieChart className="w-4 h-4 text-[#8B5A2B]" />
                                <span>登入狀態與角色分佈比例</span>
                              </div>

                              {/* 登入狀態條 */}
                              <div>
                                <div className="flex justify-between text-xs font-semibold text-[#5C3A1B] mb-1">
                                  <span>登入狀態分佈</span>
                                  <span className="font-mono text-[11px]">
                                    成功 {successRate}% / 失敗 {failedRate}%
                                  </span>
                                </div>
                                <div className="w-full h-3 rounded-full bg-stone-100 overflow-hidden flex shadow-2xs">
                                  <div
                                    className="h-full bg-emerald-600 transition-all duration-300"
                                    style={{ width: `${successRate}%` }}
                                    title={`成功 ${successCount} 次 (${successRate}%)`}
                                  />
                                  <div
                                    className="h-full bg-rose-500 transition-all duration-300"
                                    style={{ width: `${failedRate}%` }}
                                    title={`失敗 ${failedCount} 次 (${failedRate}%)`}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-[#6E5D4F] mt-1">
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                                    <span>成功：{successCount} 筆</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                                    <span>失敗：{failedCount} 筆</span>
                                  </span>
                                </div>
                              </div>

                              {/* 角色權限分佈 */}
                              <div className="pt-2 border-t border-[#F1E8D8]">
                                <div className="flex justify-between text-xs font-semibold text-[#5C3A1B] mb-1">
                                  <span>角色身分分佈</span>
                                  <span className="font-mono text-[11px]">共 3 類角色</span>
                                </div>
                                <div className="w-full h-3 rounded-full bg-stone-100 overflow-hidden flex shadow-2xs">
                                  <div
                                    className="h-full bg-amber-600"
                                    style={{ width: `${totalCount > 0 ? (adminCount / totalCount) * 100 : 0}%` }}
                                    title={`管理員 ${adminCount} 次`}
                                  />
                                  <div
                                    className="h-full bg-[#8B5A2B]"
                                    style={{ width: `${totalCount > 0 ? (userCount / totalCount) * 100 : 0}%` }}
                                    title={`一般使用者 ${userCount} 次`}
                                  />
                                  <div
                                    className="h-full bg-stone-400"
                                    style={{ width: `${totalCount > 0 ? (guestCount / totalCount) * 100 : 0}%` }}
                                    title={`訪客模式 ${guestCount} 次`}
                                  />
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#6E5D4F] mt-1">
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                                    <span>管理員：{adminCount}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#8B5A2B]" />
                                    <span>一般使用者：{userCount}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-stone-400" />
                                    <span>訪客：{guestCount}</span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 常用裝置與瀏覽器排行 */}
                            <div className="p-4 rounded-xl bg-white border border-[#E5D9C5] shadow-2xs space-y-2.5">
                              <div className="flex items-center gap-2 text-sm font-bold text-[#3A2518]">
                                <Monitor className="w-4 h-4 text-[#8B5A2B]" />
                                <span>常用登入裝置與瀏覽器</span>
                              </div>
                              <div className="divide-y divide-[#EFE6D5] text-xs">
                                {topDevices.map(([dev, cnt], dIdx) => (
                                  <div key={dev} className="py-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-mono text-[#8C7A6B] text-[11px]">#{dIdx + 1}</span>
                                      <span className="text-[#2C221E] font-medium truncate" title={dev}>
                                        {dev}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="font-mono font-bold text-[#8B5A2B]">{cnt} 次</span>
                                      <span className="text-[10px] text-[#8C7A6B]">
                                        ({((cnt / totalCount) * 100).toFixed(1)}%)
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                    <div className="border border-[#E5D9C5] rounded-xl overflow-x-auto">
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
                          {pagedLogs.map((log, idx) => (
                            <tr key={log.id} className="hover:bg-[#FAF6EE] transition-colors">
                              <td className="py-2.5 px-3.5 text-xs font-mono text-[#8C7A6B]">
                                {pageStart + idx + 1}
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
                    <PaginationBar
                      totalItems={filteredLogs.length}
                      page={safeLogPage}
                      pageSize={logPageSize}
                      onPageChange={setLogPage}
                      onPageSizeChange={setLogPageSize}
                    />
                    </div>
                  );
                })()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 新分頁：統計作業 */}
      {/* ========================================================= */}
      {activeSubTab === 'statistics' && (
        <PlayStatisticsPanel audioItems={audioItems} categories={categories} />
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
