import React, { useState } from 'react';
import { BookOpen, ShieldCheck, Lock, User, Eye, EyeOff, ArrowRight, Compass, Sparkles, AlertCircle } from 'lucide-react';
import { authenticate, loginAsGuest } from '../services/authService';
import { CurrentUser } from '../types';

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

  const fillAdminCredentials = () => {
    setUsername('admin');
    setPassword('Avon5210');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Background Decorative Texture */}
      <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#d97706_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card */}
      <div className="relative w-full max-w-md bg-stone-850 border border-stone-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-md z-10">
        {/* Header Icon & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 shadow-lg shadow-amber-900/40 mb-4 ring-4 ring-amber-500/20">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-amber-100 tracking-wide">
            有聲書樓放映閣
          </h1>
          <p className="text-xs sm:text-sm text-stone-400 mt-1 font-mono tracking-wider">
            SOUNDBOOK PAVILION • 安全存取驗證
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-red-200 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1.5 font-mono">
              使用者帳號 / USERNAME
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入帳號 (例如: admin)"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-900/90 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm transition"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-300 mb-1.5 font-mono">
              登入密碼 / PASSWORD
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="w-full pl-10 pr-10 py-2.5 bg-stone-900/90 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm transition"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-200 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 hover:from-amber-500 to-amber-700 hover:to-amber-600 text-stone-950 font-bold rounded-xl shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 transition duration-150 disabled:opacity-50 text-sm mt-2"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
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

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-700/80"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-stone-850 px-3 text-stone-400 font-mono">或免密碼進入</span>
          </div>
        </div>

        {/* Guest Entry Button */}
        <div>
          <button
            type="button"
            onClick={handleGuestEntry}
            className="w-full py-2.5 px-4 bg-stone-800/90 hover:bg-stone-750 text-amber-200 border border-amber-600/40 hover:border-amber-500/70 rounded-xl transition flex items-center justify-center gap-2 text-sm group shadow-md"
          >
            <Compass className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition duration-300" />
            <span className="font-semibold">以訪客身份直接進入</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-normal">
              免帳密
            </span>
          </button>
          <p className="text-[11px] text-stone-400 text-center mt-2 px-2 leading-relaxed">
            訪客模式可自由瀏覽「館藏總覽」與「放映室」語音播放，受保護的編輯與管理功能將自動停用。
          </p>
        </div>

        {/* Quick Hint & Test Helper */}
        <div className="mt-6 pt-4 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>預設管理者：<code className="text-amber-300 font-mono">admin</code></span>
          </div>
          <button
            type="button"
            onClick={fillAdminCredentials}
            className="text-amber-400/90 hover:text-amber-300 underline underline-offset-2 hover:bg-amber-950/30 px-1.5 py-0.5 rounded transition"
            title="點擊自動帶入 admin 與預設密碼"
          >
            帶入管理者帳密
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-center text-xs text-stone-500 font-mono">
        &copy; {new Date().getFullYear()} 有聲書樓放映閣 • SoundBook Pavilion
      </div>
    </div>
  );
};
