import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, User, Eye, EyeOff, ArrowRight, Compass, AlertCircle } from 'lucide-react';
import { authenticate, loginAsGuest } from '../services/authService';
import { getLocalLoginScreenConfig, loadLoginScreenConfig } from '../services/storageService';
import { CurrentUser, LoginScreenConfig } from '../types';
import { getCategoryIcon } from './DashboardView';

interface LoginViewProps {
  onLoginSuccess: (user: CurrentUser) => void;
  onGuestLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onGuestLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loginConfig, setLoginConfig] = useState<LoginScreenConfig>(() =>
    getLocalLoginScreenConfig()
  );

  // 畫面載入時清空輸入框（防止瀏覽器記憶自動帶入帳號密碼），並同步載入雲端登入畫面設定
  useEffect(() => {
    setUsername('');
    setPassword('');
    let isMounted = true;
    loadLoginScreenConfig().then((cfg) => {
      if (isMounted) {
        setLoginConfig(cfg);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('請輸入帳號與密碼');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await authenticate(username, password);
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || '帳號或密碼錯誤，請重新確認！');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '登入失敗，請稍候再試');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestEntry = () => {
    loginAsGuest();
    onGuestLogin();
  };

  return (
    <div className="min-h-screen bg-[#F6F1E7] flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* 典藏雅緻背景紋理 */}
      <div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(#8B5A2B_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#D4A373]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#8B5A2B]/15 rounded-full blur-3xl pointer-events-none" />

      {/* 主登入羊皮紙卡片 */}
      <div className="relative w-full max-w-md bg-[#FFFDF9] border border-[#D8C8B0] rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-md z-10 ring-1 ring-[#8B5A2B]/10">
        {/* 卡片頂部圖標與標題 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8B5A2B] to-[#5C3A1B] text-[#FAF5EC] shadow-lg shadow-[#5C3A1B]/30 mb-4 ring-4 ring-[#D4A373]/30">
            {getCategoryIcon(loginConfig.icon, 'w-8 h-8 stroke-[2.2]')}
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif-tc font-bold text-[#2C221E] tracking-wide">
            {loginConfig.title || '有聲書樓放映閣'}
          </h1>
          <p className="text-xs sm:text-sm text-[#8B5A2B] mt-1.5 font-mono tracking-wider font-semibold">
            SOUNDBOOK PAVILION • 安全存取驗證
          </p>
        </div>

        {/* 錯誤警示訊息 */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </div>
        )}

        {/* 登入表單 */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-xs font-bold text-[#5C3A1B] mb-1.5 font-mono">
              使用者帳號 / USERNAME
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8B5A2B]">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                name="soundbook_user_id"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] placeholder-[#A89885] focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/20 text-sm transition shadow-2xs font-medium"
                autoComplete="off"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5C3A1B] mb-1.5 font-mono">
              登入密碼 / PASSWORD
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8B5A2B]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                name="soundbook_user_credential"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#D5C5AE] rounded-xl text-[#2C221E] placeholder-[#A89885] focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/20 text-sm transition shadow-2xs font-medium"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#8B5A2B] hover:text-[#5C3A1B] transition cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 登入按鈕 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-[#8B5A2B] hover:from-[#734720] to-[#5C3A1B] text-[#FAF5EC] font-bold rounded-xl shadow-md shadow-[#8B5A2B]/25 flex items-center justify-center gap-2 transition duration-150 disabled:opacity-50 text-sm mt-2 cursor-pointer"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-[#FAF5EC] border-t-transparent rounded-full animate-spin" />
                正在驗證登入...
              </span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                登入系統
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* 分隔線 */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E5D9C5]"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#FFFDF9] px-3 text-[#8B5A2B] font-mono font-medium">或免密碼進入</span>
          </div>
        </div>

        {/* 訪客直接進入按鈕 */}
        <div>
          <button
            type="button"
            onClick={handleGuestEntry}
            className="w-full py-2.5 px-4 bg-[#F5ECE0] hover:bg-[#EBDDC8] text-[#5C3A1B] border border-[#D8C8B0] rounded-xl transition flex items-center justify-center gap-2 text-sm group shadow-xs cursor-pointer font-semibold"
          >
            <Compass className="w-4 h-4 text-[#8B5A2B] group-hover:rotate-45 transition duration-300" />
            <span>以訪客身份直接進入</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#8B5A2B]/15 text-[#5C3A1B] font-semibold">
              免帳密
            </span>
          </button>
          <p className="text-[11px] text-[#7A6855] text-center mt-2.5 px-2 leading-relaxed">
            訪客模式可自由瀏覽「館藏總覽」與「放映室」語音播放，受保護的編輯與管理功能將自動停用。
          </p>
        </div>
      </div>

      {/* 底部版權宣告 */}
      <div className="mt-6 text-center text-xs text-[#8B5A2B]/75 font-mono">
        &copy; {new Date().getFullYear()} {loginConfig.title || '有聲書樓放映閣'} • SoundBook Pavilion
      </div>
    </div>
  );
};
