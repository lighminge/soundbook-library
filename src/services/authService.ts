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
const PASSWORD_HASH_PREFIX = 'sha256$';
const PASSWORD_SALT_NAMESPACE = 'soundbook_v1_salt';

/**
 * 標準 FIPS 180-4 SHA-256 同步雜湊演算法（支援 HTTPS 與非 HTTPS 區網環境）
 */
function sha256Hex(asciiInput: string): string {
  const utf8 = unescape(encodeURIComponent(asciiInput));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const l = utf8.length * 8;
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[l >> 5] |= 0x80 << (24 - (l % 32));
  words[(((l + 64) >> 9) << 4) + 15] = l;

  const W = new Array<number>(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        W[t] = words[i + t] | 0;
      } else {
        const g0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
        const g1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + g0 + W[t - 7] + g1) | 0;
      }
      const s1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[t] + W[t]) | 0;
      const s0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * 判斷密碼字串是否已經過 SHA-256 雜湊處理
 */
export function isPasswordHashed(password?: string): boolean {
  return Boolean(
    password &&
      password.startsWith(PASSWORD_HASH_PREFIX) &&
      password.length === PASSWORD_HASH_PREFIX.length + 64
  );
}

/**
 * 將明文密碼搭配帳號名稱進行加鹽 SHA-256 雜湊（若已為雜湊值則原樣回傳）
 */
export function hashUserPassword(password: string, username: string): string {
  const trimmedPwd = password.trim();
  if (isPasswordHashed(trimmedPwd)) return trimmedPwd;
  const cleanUser = username.trim().toLowerCase();
  return `${PASSWORD_HASH_PREFIX}${sha256Hex(`${PASSWORD_SALT_NAMESPACE}:${cleanUser}:${trimmedPwd}`)}`;
}

/**
 * 比對使用者輸入的密碼與儲存的密碼（同時支援 SHA-256 雜湊值與舊版明文自動向下相容比對）
 */
export function verifyUserPassword(
  inputPassword: string,
  storedPassword: string,
  username: string
): boolean {
  const trimmedInput = inputPassword.trim();
  if (!trimmedInput || !storedPassword) return false;
  const hashedInput = hashUserPassword(trimmedInput, username);
  if (storedPassword === hashedInput) return true;
  if (!isPasswordHashed(storedPassword) && storedPassword === trimmedInput) return true;
  return false;
}

/**
 * 計算防竄改 Session 簽章（防止透過 F12 修改 localStorage 偽造 admin 角色）
 */
function computeSessionIntegritySig(user: {
  id: string;
  username: string;
  role: UserRole;
  isGuest?: boolean;
}): string {
  return sha256Hex(
    `soundbook_session_sig_v1:${user.id}:${user.username.toLowerCase()}:${user.role}:${Boolean(user.isGuest)}`
  ).slice(0, 32);
}

export const DEFAULT_ADMIN_USER: AppUser = {
  id: 'user_admin',
  username: 'admin',
  password: hashUserPassword('Avon5210', 'admin'),
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
  isSharedLink?: boolean;
  sharedAudioId?: string;
  sharedAudioTitle?: string;
}): Promise<LoginLogRecord> {
  const now = new Date().toISOString();
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isSharedFromUrl = urlParams ? (urlParams.get('shared') === '1' || urlParams.has('audioId')) : false;
  const isSharedLink = params.isSharedLink !== undefined ? params.isSharedLink : isSharedFromUrl;
  const sharedAudioId = (params.sharedAudioId || (urlParams?.get('audioId') || undefined))?.slice(0, 180);
  const sharedAudioTitle = params.sharedAudioTitle?.trim().slice(0, 280);

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
    ...(isSharedLink ? { isSharedLink: true } : {}),
    ...(sharedAudioId ? { sharedAudioId } : {}),
    ...(sharedAudioTitle ? { sharedAudioTitle } : {}),
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

  // 自動將舊版明文密碼無痛升級為 SHA-256 加鹽雜湊值，避免在 Firestore 與 localStorage 中留存明文密碼
  const usersToUpgradeInCloud: AppUser[] = [];
  loadedUsers = loadedUsers.map((u) => {
    if (u.password && !isPasswordHashed(u.password)) {
      const upgraded: AppUser = {
        ...u,
        password: hashUserPassword(u.password, u.username),
      };
      usersToUpgradeInCloud.push(upgraded);
      return upgraded;
    }
    return u;
  });

  if (db && usersToUpgradeInCloud.length > 0) {
    usersToUpgradeInCloud.forEach((u) => {
      setDoc(doc(db, 'systemUsers', u.id), u).catch(() => {});
    });
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

  // 若目前已登入非訪客帳號，強制以權威名冊校正 Session 中的顯示名稱与角色，防止透過 F12 修改 localStorage 偽造權限
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
      const authoritativeRole: UserRole =
        matchedSessionUser.username.toLowerCase() === 'admin'
          ? 'admin'
          : matchedSessionUser.role;
      if (
        currentSession.displayName !== latestDisplayName ||
        currentSession.role !== authoritativeRole ||
        currentSession.id !== matchedSessionUser.id
      ) {
        setCurrentSessionUser({
          ...currentSession,
          id: matchedSessionUser.id,
          username: matchedSessionUser.username,
          displayName: latestDisplayName,
          role: authoritativeRole,
        });
      }
    } else {
      // 若 Session 中的帳號已不存在於系統名冊，自動降級為訪客以確保安全
      setCurrentSessionUser(GUEST_USER);
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
 * 儲存（新增或修改）使用者帳號（自動以 SHA-256 加鹽雜湊保護密碼）
 */
export async function saveSystemUser(user: AppUser): Promise<AppUser> {
  const now = new Date().toISOString();
  const cleanUsername = user.username.trim();
  const cleaned: AppUser = {
    ...user,
    username: cleanUsername,
    password: hashUserPassword(user.password, cleanUsername),
    displayName: user.displayName.trim() || cleanUsername,
    role: cleanUsername.toLowerCase() === 'admin' ? 'admin' : user.role,
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
 * 登入驗證 (帳號密碼登入，含防暴力破解鎖定保護與分享連結進入來源記錄)
 */
export async function authenticate(
  usernameInput: string,
  passwordInput: string,
  options?: {
    isSharedLink?: boolean;
    sharedAudioId?: string;
    sharedAudioTitle?: string;
  }
): Promise<{ success: boolean; user?: CurrentUser; error?: string }> {
  const now = Date.now();
  const attemptRecord = getLoginAttemptRecord();

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isSharedFromUrl = urlParams ? (urlParams.get('shared') === '1' || urlParams.has('audioId')) : false;
  const isSharedLink = options?.isSharedLink !== undefined ? options.isSharedLink : isSharedFromUrl;
  const sharedAudioId = options?.sharedAudioId || (urlParams?.get('audioId') || undefined);
  const sharedAudioTitle = options?.sharedAudioTitle;

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
    (u) =>
      u.username.toLowerCase() === uTrim.toLowerCase() &&
      verifyUserPassword(pTrim, u.password, u.username)
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
        message: isSharedLink
          ? `[分享連結] 密碼錯誤達 ${MAX_LOGIN_ATTEMPTS} 次，觸發系統安全鎖定 60 秒`
          : `密碼錯誤達 ${MAX_LOGIN_ATTEMPTS} 次，觸發系統安全鎖定 60 秒`,
        isSharedLink,
        sharedAudioId,
        sharedAudioTitle,
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
      message: isSharedLink
        ? `[分享連結] ${existingAccount ? '登入失敗：密碼輸入錯誤' : '登入失敗：查無此登入帳號'}`
        : existingAccount
        ? '登入失敗：密碼輸入錯誤'
        : '登入失敗：查無此登入帳號',
      isSharedLink,
      sharedAudioId,
      sharedAudioTitle,
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
  const successMsg = isSharedLink
    ? `透過分享連結帳號驗證成功${sharedAudioTitle ? `《${sharedAudioTitle}》` : ''}`
    : '帳號密碼驗證登入成功';

  recordLoginLog({
    userId: currentUser.id,
    username: currentUser.username,
    displayName: currentUser.displayName,
    role: currentUser.role,
    status: 'success',
    message: successMsg,
    isSharedLink,
    sharedAudioId,
    sharedAudioTitle,
  }).catch(() => {});
  return { success: true, user: currentUser };
}

/**
 * 以訪客身份直接登入（免帳號密碼）
 */
export function loginAsGuest(options?: {
  isSharedLink?: boolean;
  sharedAudioId?: string;
  sharedAudioTitle?: string;
  message?: string;
}): CurrentUser {
  setCurrentSessionUser(GUEST_USER);
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isSharedFromUrl = urlParams ? (urlParams.get('shared') === '1' || urlParams.has('audioId')) : false;
  const isSharedLink = options?.isSharedLink !== undefined ? options.isSharedLink : isSharedFromUrl;
  const sharedAudioId = options?.sharedAudioId || (urlParams?.get('audioId') || undefined);
  const sharedAudioTitle = options?.sharedAudioTitle;
  const defaultMsg = isSharedLink
    ? `透過分享連結進入放映室（訪客模式）${sharedAudioTitle ? `《${sharedAudioTitle}》` : ''}`
    : '以訪客模式免密進入系統';

  recordLoginLog({
    userId: GUEST_USER.id,
    username: GUEST_USER.username,
    displayName: GUEST_USER.displayName,
    role: 'guest',
    status: 'success',
    message: options?.message || defaultMsg,
    isSharedLink,
    sharedAudioId,
    sharedAudioTitle,
  }).catch(() => {});
  return GUEST_USER;
}

/**
 * 取得目前已登入之使用者資訊（若未登入則回傳 null，含結構完整性與防竄改簽章校驗）
 */
export function getCurrentSessionUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (raw) {
      const parsed: CurrentUser & { sessionSig?: string } = JSON.parse(raw);
      if (parsed && parsed.role && parsed.id && parsed.username) {
        const expectedSig = computeSessionIntegritySig(parsed);
        if (parsed.sessionSig && parsed.sessionSig !== expectedSig) {
          console.warn('偵測到 Session 結構異常或遭竄改，已重置為訪客權限');
          localStorage.removeItem(SESSION_USER_KEY);
          return null;
        }
        // 與本機已快取的使用者名冊交叉核對角色，防止透過 DevTools 偽造 admin 權限
        if (!parsed.isGuest && parsed.role !== 'guest') {
          try {
            const rawUsers = localStorage.getItem(LOCAL_USERS_KEY);
            if (rawUsers) {
              const localList: AppUser[] = JSON.parse(rawUsers);
              if (Array.isArray(localList) && localList.length > 0) {
                const matchedLocal = localList.find(
                  (u) =>
                    u.id === parsed.id ||
                    u.username.toLowerCase() === parsed.username.toLowerCase()
                );
                if (matchedLocal) {
                  const trueRole: UserRole =
                    matchedLocal.username.toLowerCase() === 'admin'
                      ? 'admin'
                      : matchedLocal.role;
                  if (parsed.role !== trueRole) {
                    parsed.role = trueRole;
                  }
                }
              }
            }
          } catch {
            // ignore
          }
        }
        return {
          id: parsed.id,
          username: parsed.username,
          displayName: parsed.displayName,
          role: parsed.role,
          isGuest: parsed.isGuest,
        };
      }
    }
  } catch (err) {
    console.warn('讀取登入 Session 失敗:', err);
  }
  return null;
}

/**
 * 設定當前 Session 使用者（自動附加防竄改完整性簽章）
 */
export function setCurrentSessionUser(user: CurrentUser | null): void {
  try {
    if (user) {
      const signed = {
        ...user,
        sessionSig: computeSessionIntegritySig(user),
      };
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(signed));
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
