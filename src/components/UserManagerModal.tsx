import React, { useState, useEffect } from 'react';
import { X, UserPlus, Edit2, Trash2, Shield, User, Lock, AlertCircle, CheckCircle2, ShieldAlert, LayoutTemplate } from 'lucide-react';
import { AppUser } from '../types';
import { loadSystemUsers, saveSystemUser, deleteSystemUser } from '../services/authService';

interface UserManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onOpenLoginSettings?: () => void;
}

export const UserManagerModal: React.FC<UserManagerModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  onOpenLoginSettings,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user'>('user');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadSystemUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || '載入使用者列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormPassword('');
    setFormRole('user');
    setError(null);
    setIsEditing(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormDisplayName(user.displayName);
    setFormPassword(user.password);
    setFormRole(user.role);
    setError(null);
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setEditingUser(null);
    setError(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const uName = formUsername.trim();
    const dName = formDisplayName.trim();
    const pwd = formPassword.trim();

    if (!uName) {
      setError('請輸入使用者帳號');
      return;
    }
    if (uName.toLowerCase() === 'guest') {
      setError('「guest」為系統保留訪客帳號，無法使用！');
      return;
    }
    if (!pwd) {
      setError('請輸入使用者密碼');
      return;
    }

    // Check duplicate username if adding new
    if (!editingUser) {
      const exists = users.some((u) => u.username.toLowerCase() === uName.toLowerCase());
      if (exists) {
        setError(`帳號「${uName}」已存在，請使用不同帳號！`);
        return;
      }
    } else {
      const exists = users.some(
        (u) => u.id !== editingUser.id && u.username.toLowerCase() === uName.toLowerCase()
      );
      if (exists) {
        setError(`帳號「${uName}」已被其他使用者使用！`);
        return;
      }
    }

    setFormSubmitting(true);
    setError(null);

    try {
      const userToSave: AppUser = {
        id: editingUser ? editingUser.id : `user_${Date.now()}`,
        username: uName,
        displayName: dName || uName,
        password: pwd,
        role: editingUser && editingUser.username.toLowerCase() === 'admin' ? 'admin' : formRole,
        createdAt: editingUser ? editingUser.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveSystemUser(userToSave);
      await fetchUsers();
      showSuccess(editingUser ? `已成功修改使用者「${uName}」！` : `已成功新增使用者「${uName}」！`);
      handleCloseForm();
    } catch (err: any) {
      setError(err.message || '儲存使用者失敗');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.username.toLowerCase() === 'admin' || deleteTarget.id === 'user_admin') {
      setError('⚠️ 預設系統管理者帳號 (admin) 受到保護，無法被刪除！');
      setDeleteTarget(null);
      return;
    }

    try {
      await deleteSystemUser(deleteTarget.id);
      await fetchUsers();
      showSuccess(`已成功刪除使用者「${deleteTarget.username}」！`);
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message || '刪除使用者失敗');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#FFFDF9] border border-[#D8C8B0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E5D9C5] bg-[#F8F3E8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#8B5A2B]/15 text-[#8B5A2B] border border-[#8B5A2B]/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif-tc font-bold text-[#2C221E] flex items-center gap-2">
                系統使用者帳號管理
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF4E8] text-[#5C3A1B] border border-[#DFCEB4] font-normal font-mono">
                  共 {users.length} 位使用者
                </span>
              </h2>
              <p className="text-xs text-[#7A6855] font-mono">
                管理系統登入帳號、權限角色與密碼
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5C3A1B] hover:text-[#2C221E] hover:bg-[#EFE6D5] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs sm:text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1 font-medium">{successMsg}</div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-[#FFFDF9]">
          {!isEditing ? (
            <>
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-[#7A6855]">
                  系統預設管理員（<code className="text-[#8B5A2B] font-bold font-mono">admin</code>）具備最高權限且受不可刪除保護。
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {onOpenLoginSettings && (
                    <button
                      type="button"
                      onClick={onOpenLoginSettings}
                      className="px-3.5 py-2 bg-[#F5ECE0] hover:bg-[#EBDDC8] text-[#5C3A1B] border border-[#D8C8B0] font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer shrink-0"
                    >
                      <LayoutTemplate className="w-4 h-4 text-[#8B5A2B]" />
                      系統登入畫面維護
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="px-3.5 py-2 bg-[#8B5A2B] hover:bg-[#70461F] text-white font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    新增使用者帳號
                  </button>
                </div>
              </div>

              {/* Users Table / List */}
              <div className="border border-[#E5D9C5] rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[#F8F3E8] text-[#5C3A1B] text-xs font-mono border-b border-[#E5D9C5]">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">序號</th>
                      <th className="py-3 px-4">帳號 / 顯示名稱</th>
                      <th className="py-3 px-4">角色權限</th>
                      <th className="py-3 px-4 hidden sm:table-cell">建立時間</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE6D5] text-[#2C221E]">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#A89885]">
                          載入使用者列表中...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#A89885]">
                          尚無自訂使用者
                        </td>
                      </tr>
                    ) : (
                      users.map((user, idx) => {
                        const isAdminUser = user.username.toLowerCase() === 'admin' || user.id === 'user_admin';
                        const isSelf = user.id === currentUserId;

                        return (
                          <tr key={user.id} className="hover:bg-[#FAF4E8] transition">
                            <td className="py-3.5 px-4 text-center font-mono text-[#A89885]">
                              {String(idx + 1).padStart(2, '0')}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-[#2C221E]">{user.username}</span>
                                {isSelf && (
                                  <span className="text-[10px] bg-[#8B5A2B]/15 text-[#5C3A1B] px-1.5 py-0.5 rounded border border-[#8B5A2B]/30 font-medium">
                                    當前登入
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#7A6855] mt-0.5">
                                {user.displayName}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              {user.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#8B5A2B]/15 text-[#5C3A1B] border border-[#8B5A2B]/30">
                                  <Shield className="w-3 h-3 text-[#8B5A2B]" />
                                  系統管理者
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F5ECE0] text-[#7A6855] border border-[#D5C5AE]">
                                  <User className="w-3 h-3 text-[#7A6855]" />
                                  一般使用者
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 hidden sm:table-cell font-mono text-xs text-[#7A6855]">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-TW') : '-'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(user)}
                                  className="p-1.5 text-[#7A6855] hover:text-[#8B5A2B] hover:bg-[#FAF4E8] rounded-lg transition cursor-pointer"
                                  title="修改使用者資料"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                {isAdminUser ? (
                                  <span
                                    className="p-1.5 text-[#C8B5A0] cursor-not-allowed inline-flex items-center"
                                    title="預設管理者帳號受保護，不可刪除"
                                  >
                                    <ShieldAlert className="w-4 h-4" />
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(user)}
                                    className="p-1.5 text-[#7A6855] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                    title="刪除使用者"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Add / Edit Form */
            <form onSubmit={handleSaveUser} className="bg-[#FAF4E8] p-5 rounded-xl border border-[#DFCEB4] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#DFCEB4]">
                <h3 className="font-serif-tc font-bold text-[#2C221E] flex items-center gap-2 text-base">
                  {editingUser ? '修改使用者帳號' : '新增使用者帳號'}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="text-xs text-[#7A6855] hover:text-[#2C221E] cursor-pointer"
                >
                  取消返回
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1 font-mono">
                    使用者帳號 / Username *
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    disabled={editingUser?.username.toLowerCase() === 'admin'}
                    placeholder="例如: editor1"
                    className="w-full px-3 py-2 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] text-sm focus:outline-none focus:border-[#8B5A2B] disabled:opacity-50"
                    required
                  />
                  {editingUser?.username.toLowerCase() === 'admin' && (
                    <p className="text-[11px] text-[#8B5A2B] mt-1 font-mono font-medium">admin 帳號名稱固定不可變更</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1 font-mono">
                    顯示名稱 / 職稱 *
                  </label>
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder="例如: 總編 淑芬"
                    className="w-full px-3 py-2 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] text-sm focus:outline-none focus:border-[#8B5A2B]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1 font-mono">
                    登入密碼 / Password *
                  </label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="請設定密碼"
                    className="w-full px-3 py-2 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] text-sm focus:outline-none focus:border-[#8B5A2B] font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1 font-mono">
                    系統角色 / Role
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as 'admin' | 'user')}
                    disabled={editingUser?.username.toLowerCase() === 'admin'}
                    className="w-full px-3 py-2 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] text-sm focus:outline-none focus:border-[#8B5A2B] disabled:opacity-50"
                  >
                    <option value="user">一般使用者（可上傳與維護館藏）</option>
                    <option value="admin">系統管理者（具備所有最高權限與帳號管理）</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#DFCEB4]">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 bg-white hover:bg-[#EFE6D5] text-[#5C3A1B] border border-[#D5C5AE] rounded-xl text-xs sm:text-sm transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-[#8B5A2B] hover:bg-[#70461F] text-white font-bold rounded-xl text-xs sm:text-sm transition disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {formSubmitting ? '儲存中...' : editingUser ? '儲存修改' : '建立帳號'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {deleteTarget && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-[#FFFDF9] border border-[#D8C8B0] p-6 rounded-2xl max-w-sm w-full space-y-4 text-center shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 border border-rose-300 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#2C221E] font-serif-tc">
                  確定要刪除使用者？
                </h4>
                <p className="text-xs text-[#7A6855] mt-1">
                  帳號：<span className="text-rose-600 font-semibold">{deleteTarget.username}</span>（{deleteTarget.displayName}）
                </p>
                <p className="text-xs text-[#A89885] mt-2">
                  刪除後該使用者將無法再登入系統。此動作無法復原。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 bg-white hover:bg-[#EFE6D5] text-[#5C3A1B] border border-[#D5C5AE] rounded-xl text-xs font-semibold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  確認刪除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-[#E5D9C5] bg-[#F8F3E8] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white hover:bg-[#EFE6D5] text-[#5C3A1B] border border-[#D5C5AE] rounded-xl text-xs sm:text-sm transition cursor-pointer"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};
