import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  LayoutTemplate,
} from 'lucide-react';
import { LoginScreenConfig } from '../types';
import {
  DEFAULT_LOGIN_SCREEN_CONFIG,
  getLocalLoginScreenConfig,
  loadLoginScreenConfig,
  saveLoginScreenConfig,
} from '../services/storageService';
import { ICON_OPTIONS, getCategoryIcon } from './DashboardView';

interface LoginScreenSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: LoginScreenConfig) => void;
}

export const LoginScreenSettingsModal: React.FC<LoginScreenSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [selectedIcon, setSelectedIcon] = useState<string>(DEFAULT_LOGIN_SCREEN_CONFIG.icon);
  const [titleText, setTitleText] = useState<string>(DEFAULT_LOGIN_SCREEN_CONFIG.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const localCfg = getLocalLoginScreenConfig();
      setSelectedIcon(localCfg.icon);
      setTitleText(localCfg.title);
      setError(null);
      setSuccessMsg(null);

      loadLoginScreenConfig().then((remoteCfg) => {
        setSelectedIcon(remoteCfg.icon);
        setTitleText(remoteCfg.title);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleResetDefault = () => {
    setSelectedIcon(DEFAULT_LOGIN_SCREEN_CONFIG.icon);
    setTitleText(DEFAULT_LOGIN_SCREEN_CONFIG.title);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = titleText.trim();
    if (!trimmedTitle) {
      setError('請輸入上方圖示下的文字內容（例如：有聲書樓放映閣）！');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const saved = await saveLoginScreenConfig({
        icon: selectedIcon || DEFAULT_LOGIN_SCREEN_CONFIG.icon,
        title: trimmedTitle,
      });
      setSuccessMsg('已成功儲存系統登入畫面設定，並同步至雲端！');
      if (onSaved) {
        onSaved(saved);
      }
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || '儲存登入畫面設定失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const currentIconLabel =
    ICON_OPTIONS.find((opt) => opt.value === selectedIcon)?.label || selectedIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#FFFDF9] border border-[#D8C8B0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E5D9C5] bg-[#F8F3E8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#8B5A2B]/15 text-[#8B5A2B] border border-[#8B5A2B]/20">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif-tc font-bold text-[#2C221E] flex items-center gap-2">
                系統登入畫面維護
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF4E8] text-[#8B5A2B] border border-[#DFCEB4] font-semibold">
                  管理員專屬
                </span>
              </h2>
              <p className="text-xs text-[#7A6855]">
                自訂系統登入畫面最上方的圖示（50 種典藏圖示）與圖示下方的標題文字
              </p>
            </div>
          </div>
          <button
            type="button"
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-5 bg-[#FFFDF9]">
          {/* 即時預覽區塊 */}
          <div className="p-5 rounded-2xl bg-[#F6F1E7] border border-[#DFCEB4] relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#5C3A1B] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#8B5A2B]" />
                登入畫面頂部即時預覽
              </span>
              <span className="text-[11px] text-[#8B5A2B] font-mono bg-white/80 px-2 py-0.5 rounded-md border border-[#DFCEB4]">
                圖示：{currentIconLabel}
              </span>
            </div>

            <div className="bg-[#FFFDF9] border border-[#D8C8B0] rounded-2xl p-6 text-center shadow-md max-w-sm mx-auto">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8B5A2B] to-[#5C3A1B] text-[#FAF5EC] shadow-lg shadow-[#5C3A1B]/30 mb-3.5 ring-4 ring-[#D4A373]/30">
                {getCategoryIcon(selectedIcon, 'w-8 h-8 stroke-[2.2]')}
              </div>
              <h3 className="text-xl sm:text-2xl font-serif-tc font-bold text-[#2C221E] tracking-wide break-words">
                {titleText.trim() || '有聲書樓放映閣'}
              </h3>
              <p className="text-xs text-[#8B5A2B] mt-1.5 font-mono tracking-wider font-semibold">
                SOUNDBOOK PAVILION • 安全存取驗證
              </p>
            </div>
          </div>

          {/* 設定項目 a：最上方圖示下拉選單 (50個選項) */}
          <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#E2D5C1] space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs sm:text-sm font-bold text-[#2C221E]">
                1. 登入畫面最上方的圖示（下拉選取）
              </label>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#8B5A2B]/15 text-[#5C3A1B] font-mono font-semibold">
                共 {ICON_OPTIONS.length} 個圖示選項
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#8B5A2B] to-[#5C3A1B] text-[#FAF5EC] flex items-center justify-center shrink-0 shadow-sm ring-2 ring-[#D4A373]/40">
                {getCategoryIcon(selectedIcon, 'w-5 h-5 stroke-[2.2]')}
              </div>
              <select
                value={selectedIcon}
                onChange={(e) => setSelectedIcon(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] text-sm font-medium focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/20 cursor-pointer shadow-2xs"
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-[#7A6855]">
              💡 請從下拉選單中選取要在系統登入畫面最上方顯示的主題圖示（共提供 50 種典藏圖示）。
            </p>
          </div>

          {/* 設定項目 b：上方圖示下的文字內容 */}
          <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#E2D5C1] space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs sm:text-sm font-bold text-[#2C221E]">
                2. 上方圖示下的文字內容（登入主標題）
              </label>
              <span className="text-[11px] text-[#7A6855] font-mono">
                預設：有聲書樓放映閣
              </span>
            </div>

            <input
              type="text"
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              maxLength={60}
              placeholder="請輸入登入畫面主標題（例如：有聲書樓放映閣）"
              className="w-full px-3.5 py-2.5 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] placeholder-[#A89885] text-sm font-serif-tc font-bold focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/20 shadow-2xs"
              required
            />
            <p className="text-[11px] text-[#7A6855]">
              💡 修改後將立即套用至登入畫面圖示正下方的主標題文字，並同步至雲端資料庫供所有裝置顯示。
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5D9C5]">
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-[#F5ECE0] hover:bg-[#EBDDC8] text-[#5C3A1B] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="恢復為預設圖示 (BookOpen) 與預設標題 (有聲書樓放映閣)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>恢復預設值</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#EFE6D5] text-xs sm:text-sm font-medium text-[#5C3A1B] transition cursor-pointer"
              >
                關閉
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? '儲存同步中...' : '儲存並同步至雲端'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
