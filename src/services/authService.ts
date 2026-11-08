import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { AppUser, CurrentUser, LoginLogRecord, UserRole } from '../types';
import { getDbInstance } from './storageService';

const LOCAL_USERS_KEY = 'soundbook_system_users_v1';
const SESSION_USER_KEY = 'soundbook_current_session_v1';
const LOGIN_ATTEMPTS_KEY = 'soundbook_login_attempts_v1';
const LOCAL_LOGIN_LOGS_KEY = 'soundbook_login_logs_v1';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 連續失敗 5 次鎖定 60 秒
const MAX_STORED_LOGIN_LOGS = 1000; // 最多保留最近 1000 筆登入紀錄

export const DEFAULT_ADMIN_USER: AppUser = {
  id: 'user_admin',
  username: 'admin',
  password: 'Avon5210',
  displayName: '系統管理者',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const GUEST_USER: CurrentUser = {
  id: 'guest',
  username: 'guest',
  displayName: '訪客',
  role: 'guest',
  isGuest: true,
};

/**
 * 偵測目前登入者的作業系統與瀏覽器摘要資訊
 */
function getDeviceAndBrowserInfo(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  let os = '未知裝置';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS (iPhone/iPad)';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '瀏覽器';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  return `${os} · ${browser}`;
}

/**
 * 新增一筆人員登入紀錄（同步寫入本地 LocalStorage 與雲端 Firestore）
 */
export async function recordLoginLog(params: {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: 'success' | 'failed';
  message?: string;
}): Promise<LoginLogRecord> {
  const now = new Date().toISOString();
  const logEntry: LoginLogRecord = {
    id: `login_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: (params.userId || 'unknown').slice(0, 120),
    username: (params.username || 'unknown').trim().slice(0, 50),
    displayName: (params.displayName || params.username || '未知使用者').trim().slice(0, 50),
    role: params.role || 'user',
    status: params.status,
    message: (params.message || '').trim().slice(0, 280),
    deviceInfo: getDeviceAndBrowserInfo().slice(0, 280),
    loginAt: now,
  };

  try {
    const raw = localStorage.getItem(LOCAL_LOGIN_LOGS_KEY);
    let currentLogs: LoginLogRecord[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(currentLogs)) currentLogs = [];
    currentLogs = [logEntry, ...currentLogs].slice(0, MAX_STORED_LOGIN_LOGS);
    localStorage.setItem(LOCAL_LOGIN_LOGS_KEY, JSON.stringify(currentLogs));
  } catch (e) {
    console.warn('儲存本機登入紀錄失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    try {
      await setDoc(doc(db, 'loginLogs', logEntry.id), logEntry);
    } catch (e) {
      console.warn('儲存登入紀錄至 Firestore 失敗，已保存在本機:', e);
    }
  }

  return logEntry;
}

/**
 * 載入人員登入紀錄清單（合併雲端 Firestore 與本機紀錄，依登入時間由新到舊排列）
 */
export async function loadLoginLogs(): Promise<LoginLogRecord[]> {
  let localLogs: LoginLogRecord[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_LOGIN_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) localLogs = parsed;
    }
  } catch (e) {
    console.warn('讀取本機登入紀錄失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'loginLogs'));
      if (!snap.empty) {
        const remoteLogs: LoginLogRecord[] = snap.docs.map((d) => d.data() as LoginLogRecord);
        const byId = new Map<string, LoginLogRecord>();
        localLogs.forEach((l) => {
          if (l && l.id) byId.set(l.id, l);
        });
        remoteLogs.forEach((r) => {
          if (r && r.id) byId.set(r.id, r);
        });
        const merged = Array.from(byId.values())
          .sort((a, b) => new Date(b.loginAt || 0).getTime() - new Date(a.loginAt || 0).getTime())
          .slice(0, MAX_STORED_LOGIN_LOGS);
        try {
          localStorage.setItem(LOCAL_LOGIN_LOGS_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      }
    } catch (e) {
      console.warn('從 Firestore 讀取登入紀錄受限或失敗，使用本地紀錄:', e);
    }
  }

  // 若尚無任何登入紀錄但目前已有登入中的使用者，自動建立一筆當前登入紀錄
  if (localLogs.length === 0) {
    const currentSession = getCurrentSessionUser();
    if (currentSession) {
      const initialLog = await recordLoginLog({
        userId: currentSession.id,
        username: currentSession.username,
        displayName: currentSession.displayName || currentSession.username,
        role: currentSession.role,
        status: 'success',
        message: currentSession.isGuest ? '訪客模式登入系統' : '帳號密碼驗證登入成功（目前線上階段）',
      });
      return [initialLog];
    }
  }

  return localLogs.sort(
    (a, b) => new Date(b.loginAt || 0).getTime() - new Date(a.loginAt || 0).getTime()
  );
}

/**
 * 刪除單筆人員登入紀錄
 */
export async function deleteLoginLog(logId: string): Promise<void> {
  try {
    const raw = localStorage.getItem(LOCAL_LOGIN_LOGS_KEY);
    let currentLogs: LoginLogRecord[] = raw ? JSON.parse(raw) : [];
    if (Array.isArray(currentLogs)) {
      currentLogs = currentLogs.filter((l) => l.id !== logId);
      localStorage.setItem(LOCAL_LOGIN_LOGS_KEY, JSON.stringify(currentLogs));
    }
  } catch (e) {
    console.warn('本機刪除單筆登入紀錄失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    try {
      await deleteDoc(doc(db, 'loginLogs', logId));
    } catch (e) {
      console.warn('Firestore 刪除單筆登入紀錄失敗:', e);
    }
  }
}

/**
 * 清空所有人員登入紀錄
 */
export async function clearAllLoginLogs(): Promise<void> {
  let idsToDelete: string[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_LOGIN_LOGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      idsToDelete = parsed.map((l: LoginLogRecord) => l.id).filter(Boolean);
    }
    localStorage.removeItem(LOCAL_LOGIN_LOGS_KEY);
  } catch (e) {
    console.warn('清空本機登入紀錄失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'loginLogs'));
      const remoteIds = snap.docs.map((d) => d.id);
      const allIds = Array.from(new Set([...idsToDelete, ...remoteIds]));
      await Promise.all(allIds.map((id) => deleteDoc(doc(db, 'loginLogs', id)).catch(() => {})));
    } catch (e) {
      console.warn('清空 Firestore 登入紀錄失敗:', e);
    }
  }
}

/**
 * 讀取本機快取的系統使用者名冊
 */
export function getLocalUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed: AppUser[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return ensureAdminPresent(parsed);
      }
    }
  } catch (err) {
    console.warn('讀取本地使用者資料失敗:', err);
  }
  return [DEFAULT_ADMIN_USER];
}

/**
 * 確保名冊中一定包含預設的 admin 帳號
 */
function ensureAdminPresent(users: AppUser[]): AppUser[] {
  const hasAdmin = users.some((u) => u.username.toLowerCase() === 'admin');
  if (!hasAdmin) {
    return [DEFAULT_ADMIN_USER, ...users];
  }
  return users;
}

/**
 * 儲存名冊至本機快取
 */
export function setLocalUsers(users: AppUser[]): void {
  try {
    const safeUsers = ensureAdminPresent(users);
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(safeUsers));
  } catch (err) {
    console.warn('儲存本機使用者失敗:', err);
  }
}

/**
 * 載入所有系統帳號（優先自 Firebase Firestore 讀取，並自動補齊/同步預設 admin 帳號）
 */
export async function loadSystemUsers(): Promise<AppUser[]> {
  const db = getDbInstance();
  let loadedUsers: AppUser[] = [];

  if (db) {
    try {
      const snap = await getDocs(collection(db, 'systemUsers'));
      snap.forEach((d) => {
        const u = d.data() as AppUser;
        if (u && u.id && u.username) {
          loadedUsers.push(u);
        }
      });
    } catch (err) {
      console.warn('從 Firestore 讀取使用者失敗，將使用本機快取:', err);
    }
  }

  if (loadedUsers.length === 0) {
    loadedUsers = getLocalUsers();
  }

  // 確保 admin 存在，若 Firestore 尚未寫入 admin 則自動初始化寫入
  const adminExists = loadedUsers.some((u) => u.username.toLowerCase() === 'admin');
  if (!adminExists) {
    loadedUsers = [DEFAULT_ADMIN_USER, ...loadedUsers];
    if (db) {
      try {
        await setDoc(doc(db, 'systemUsers', DEFAULT_ADMIN_USER.id), DEFAULT_ADMIN_USER);
      } catch (err) {
        console.warn('初始化 admin 至 Firestore 失敗:', err);
      }
    }
  }

  // 同步快取至本機
  setLocalUsers(loadedUsers);

  // 若目前已登入非訪客帳號，同步更新 Session 中的顯示名稱 (displayName) 與角色，確保上方工具列永遠顯示最新的「顯示名稱」
  const currentSession = getCurrentSessionUser();
  if (currentSession && !currentSession.isGuest && currentSession.role !== 'guest') {
    const matchedSessionUser = loadedUsers.find(
      (u) =>
        u.id === currentSession.id ||
        u.username.toLowerCase() === currentSession.username.toLowerCase()
    );
    if (matchedSessionUser) {
      const latestDisplayName =
        matchedSessionUser.displayName?.trim() || matchedSessionUser.username;
      if (
        currentSession.displayName !== latestDisplayName ||
        currentSession.role !== matchedSessionUser.role
      ) {
        setCurrentSessionUser({
          ...currentSession,
          id: matchedSessionUser.id,
          username: matchedSessionUser.username,
          displayName: latestDisplayName,
          role: matchedSessionUser.role,
        });
      }
    }
  }

  // 排序：admin 排首位，其餘依建立日期排序
  return loadedUsers.sort((a, b) => {
    if (a.username === 'admin') return -1;
    if (b.username === 'admin') return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

/**
 * 儲存（新增或修改）使用者帳號
 */
export async function saveSystemUser(user: AppUser): Promise<AppUser> {
  const now = new Date().toISOString();
  const cleaned: AppUser = {
    ...user,
    username: user.username.trim(),
    displayName: user.displayName.trim() || user.username.trim(),
    role: user.username.trim().toLowerCase() === 'admin' ? 'admin' : user.role,
    updatedAt: now,
    createdAt: user.createdAt || now,
  };

  const users = await loadSystemUsers();
  const existsIndex = users.findIndex(
    (u) => u.id === cleaned.id || u.username.toLowerCase() === cleaned.username.toLowerCase()
  );

  let nextUsers: AppUser[];
  if (existsIndex >= 0) {
    nextUsers = [...users];
    nextUsers[existsIndex] = cleaned;
  } else {
    nextUsers = [...users, cleaned];
  }

  setLocalUsers(nextUsers);

  const db = getDbInstance();
  if (db) {
    try {
      await setDoc(doc(db, 'systemUsers', cleaned.id), cleaned);
    } catch (err) {
      console.error('儲存使用者至 Firestore 失敗:', err);
    }
  }

  // 若修改的是目前正在登入中的帳號，立即同步更新 Session 中的 displayName 與 role
  const currentSession = getCurrentSessionUser();
  if (
    currentSession &&
    !currentSession.isGuest &&
    (currentSession.id === cleaned.id ||
      currentSession.username.toLowerCase() === cleaned.username.toLowerCase())
  ) {
    setCurrentSessionUser({
      ...currentSession,
      id: cleaned.id,
      username: cleaned.username,
      displayName: cleaned.displayName,
      role: cleaned.role,
    });
  }

  return cleaned;
}

/**
 * 刪除使用者帳號（嚴格保護 admin，無法被刪除）
 */
export async function deleteSystemUser(userId: string): Promise<void> {
  const users = await loadSystemUsers();
  const target = users.find((u) => u.id === userId);

  if (!target) return;

  if (target.username.toLowerCase() === 'admin' || target.id === 'user_admin') {
    throw new Error('⚠️ 預設系統管理者帳號 (admin) 受到嚴格保護，無法被刪除！');
  }

  const nextUsers = users.filter((u) => u.id !== userId);
  setLocalUsers(nextUsers);

  const db = getDbInstance();
  if (db) {
    try {
      await deleteDoc(doc(db, 'systemUsers', userId));
    } catch (err) {
      console.error('從 Firestore 刪除使用者失敗:', err);
    }
  }
}

interface LoginAttemptRecord {
  count: number;
  lockedUntil: number;
}

function getLoginAttemptRecord(): LoginAttemptRecord {
  try {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.count === 'number' && typeof parsed?.lockedUntil === 'number') {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { count: 0, lockedUntil: 0 };
}

function saveLoginAttemptRecord(record: LoginAttemptRecord): void {
  try {
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(record));
  } catch {
    // ignore
  }
}

/**
 * 登入驗證 (帳號密碼登入，含防暴力破解鎖定保護)
 */
export async function authenticate(
  usernameInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: CurrentUser; error?: string }> {
  const now = Date.now();
  const attemptRecord = getLoginAttemptRecord();

  if (attemptRecord.lockedUntil > now) {
    const remainSec = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
    return {
      success: false,
      error: `連續登入失敗次數過多，系統已暫時鎖定保護，請於 ${remainSec} 秒後再試！`,
    };
  }

  const uTrim = usernameInput.trim();
  const pTrim = passwordInput.trim();

  if (!uTrim || !pTrim) {
    return { success: false, error: '請輸入使用者帳號與密碼！' };
  }

  const users = await loadSystemUsers();
  const matched = users.find(
    (u) => u.username.toLowerCase() === uTrim.toLowerCase() && u.password === pTrim
  );

  if (!matched) {
    const existingAccount = users.find(
      (u) => u.username.toLowerCase() === uTrim.toLowerCase()
    );
    const nextCount =
      (attemptRecord.lockedUntil > 0 && attemptRecord.lockedUntil <= now ? 0 : attemptRecord.count) +
      1;
    if (nextCount >= MAX_LOGIN_ATTEMPTS) {
      saveLoginAttemptRecord({ count: 0, lockedUntil: now + LOCKOUT_DURATION_MS });
      recordLoginLog({
        userId: existingAccount?.id || 'unknown',
        username: existingAccount?.username || uTrim,
        displayName: existingAccount?.displayName || uTrim,
        role: existingAccount?.role || 'user',
        status: 'failed',
        message: `密碼錯誤達 ${MAX_LOGIN_ATTEMPTS} 次，觸發系統安全鎖定 60 秒`,
      }).catch(() => {});
      return {
        success: false,
        error: `帳號或密碼連續錯誤達 ${MAX_LOGIN_ATTEMPTS} 次，為保護帳號安全，已暫時鎖定 60 秒！`,
      };
    }
    saveLoginAttemptRecord({ count: nextCount, lockedUntil: 0 });
    recordLoginLog({
      userId: existingAccount?.id || 'unknown',
      username: existingAccount?.username || uTrim,
      displayName: existingAccount?.displayName || uTrim,
      role: existingAccount?.role || 'user',
      status: 'failed',
      message: existingAccount ? '登入失敗：密碼輸入錯誤' : '登入失敗：查無此登入帳號',
    }).catch(() => {});
    return {
      success: false,
      error: `帳號或密碼輸入錯誤，請重新確認！（剩餘嘗試次數：${MAX_LOGIN_ATTEMPTS - nextCount} 次）`,
    };
  }

  // 登入成功，重置錯誤計數
  saveLoginAttemptRecord({ count: 0, lockedUntil: 0 });

  const currentUser: CurrentUser = {
    id: matched.id,
    username: matched.username,
    displayName: matched.displayName || matched.username,
    role: matched.role || (matched.username === 'admin' ? 'admin' : 'user'),
    isGuest: false,
  };

  setCurrentSessionUser(currentUser);
  recordLoginLog({
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName,
    role: currentUser.role,
    status: 'success',
    message: '帳號密碼驗證登入成功',
  }).catch(() => {});
  return { success: true, user: currentUser };
}

/**
 * 以訪客身份直接登入（免帳號密碼）
 */
export function loginAsGuest(): CurrentUser {
  setCurrentSessionUser(GUEST_USER);
  recordLoginLog({
    userId: GUEST_USER.id,
    username: GUEST_USER.username,
    displayName: GUEST_USER.displayName,
    role: 'guest',
    status: 'success',
    message: '以訪客模式免密進入系統',
  }).catch(() => {});
  return GUEST_USER;
}

/**
 * 取得目前已登入之使用者資訊（若未登入則回傳 null，含結構完整性校驗）
 */
export function getCurrentSessionUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (raw) {
      const parsed: CurrentUser = JSON.parse(raw);
      if (parsed && parsed.role) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('讀取登入 Session 失敗:', err);
  }
  return null;
}

/**
 * 設定當前 Session 使用者
 */
export function setCurrentSessionUser(user: CurrentUser | null): void {
  try {
    if (user) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
    }
  } catch (err) {
    console.warn('儲存登入 Session 失敗:', err);
  }
}

/**
 * 登出系統
 */
export function logout(): void {
  setCurrentSessionUser(null);
}
