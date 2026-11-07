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
} from 'lucide-react';
import { AppUser, LoginScreenConfig } from '../types';
import {
  loadSystemUsers,
  saveSystemUser,
  deleteSystemUser,
} from '../services/authService';
import {
  DEFAULT_LOGIN_SCREEN_CONFIG,
  saveLoginScreenConfig,
} from '../services/storageService';
import { getCategoryIcon, ICON_OPTIONS } from './DashboardView';

const PROTECTED_ADMIN_ID = 'user_admin';
const PROTECTED_ADMIN_USERNAME = 'admin';

interface SystemManagementViewProps {
  currentUserId: string;
  loginConfig: LoginScreenConfig;
  onUpdateLoginConfig: (newConfig: LoginScreenConfig) => void;
}

type SystemSubTab = 'accounts' | 'loginScreen';

export const SystemManagementView: React.FC<SystemManagementViewProps> = ({
  currentUserId,
  loginConfig,
  onUpdateLoginConfig,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SystemSubTab>('accounts');

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

  return (
    <div className="space-y-6 pb-12">
      {/* 頁面頂部橫幅標題 */}
      <div className="rounded-2xl bg-gradient-to-r from-[#261A13] via-[#3A271C] to-[#4E3526] text-[#F6E6D2] p-6 shadow-lg border border-[#5C402D]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
                整合「帳號管理」與「系統登入畫面維護」功能，所有變更皆即時同步至 Firebase 雲端資料庫
              </p>
            </div>
          </div>

          {/* 二個分頁 (Tab) 切換按鈕列 */}
          <div className="flex items-center gap-2 bg-[#1A110C]/80 p-1.5 rounded-xl border border-[#4E3629] self-start md:self-center">
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
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 第一分頁：帳號管理 */}
      {/* ========================================================= */}
      {activeSubTab === 'accounts' && (
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
                自訂登入畫面最上方的館藏代表圖示（提供 50 款圖示下拉選取）與下方主標題文字
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveLoginScreen} className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* 左側：即時預覽區塊 */}
              <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-[#1E140E] via-[#2B1D14] to-[#170F0A] p-6 text-center border border-[#5C3A1B] shadow-inner">
                <div className="text-[11px] font-semibold tracking-wider text-[#D4A373] uppercase mb-3">
                  登入畫面頂部即時預覽
                </div>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4A373] to-[#8B5A2B] flex items-center justify-center shadow-lg border border-[#E6C594]/40 mx-auto mb-3">
                  {getCategoryIcon(selectedIcon, 'w-8 h-8 text-[#1E140E]')}
                </div>
                <div className="text-xl sm:text-2xl font-bold font-serif-tc text-[#FAF5EC] tracking-wider break-words">
                  {titleText.trim() || '（請輸入標題文字）'}
                </div>
                <p className="text-xs text-[#C8B29B] mt-1">
                  DIGITAL SOUNDBOOK PAVILION
                </p>
              </div>

              {/* 右側：表單設定區 */}
              <div className="lg:col-span-7 space-y-5">
                {/* a. 下拉選取登入畫面最上方的圖示（共 50 個選項） */}
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-[#4A3322] mb-1.5">
                    1. 登入畫面最上方的圖示（下拉選單共 {ICON_OPTIONS.length} 款圖示）
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#FAF4E8] border border-[#D5C5AE] flex items-center justify-center text-[#8B5A2B] shrink-0 shadow-2xs">
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
                    從 50 款精選典藏圖示中選擇最符合館藏風格的標誌，選取後左側預覽會立即更新。
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
    </div>
  );
};
