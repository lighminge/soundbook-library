import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { AudioItem, PlayLogRecord } from '../types';
import { getDbInstance } from './storageService';
import { getCurrentSessionUser } from './authService';

const LOCAL_PLAY_LOGS_KEY = 'soundbook_play_logs_v1';
const MAX_STORED_PLAY_LOGS = 5000; // 本機最多保留最近 5000 筆播放紀錄
const MIN_RECORD_SECONDS = 1; // 少於 1 秒的播放不列入統計

function readLocalPlayLogs(): PlayLogRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_PLAY_LOGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPlayLogs(logs: PlayLogRecord[]) {
  try {
    localStorage.setItem(LOCAL_PLAY_LOGS_KEY, JSON.stringify(logs.slice(0, MAX_STORED_PLAY_LOGS)));
  } catch (e) {
    console.warn('儲存本機播放紀錄失敗:', e);
  }
}

/**
 * 新增一筆語音檔播放紀錄（同步寫入本機 LocalStorage 與雲端 Firestore）
 */
export async function recordPlayLog(
  item: Pick<AudioItem, 'id' | 'title' | 'categoryId' | 'speaker' | 'tags'>,
  playedSeconds: number
): Promise<PlayLogRecord | null> {
  if (!item || !item.id) return null;
  const seconds = Math.min(86400, Math.max(0, Math.round(playedSeconds * 10) / 10));
  if (!Number.isFinite(seconds) || seconds < MIN_RECORD_SECONDS) return null;

  const user = getCurrentSessionUser();
  const entry: PlayLogRecord = {
    id: `play_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    audioId: String(item.id).slice(0, 200),
    audioTitle: String(item.title || '').slice(0, 300),
    categoryId: String(item.categoryId || '').slice(0, 200),
    speaker: String(item.speaker || '').slice(0, 100),
    tags: (item.tags || []).map((t) => String(t)).slice(0, 50),
    userId: (user?.id || 'unknown').slice(0, 120),
    username: (user?.username || 'unknown').slice(0, 50),
    playedSeconds: seconds,
    playedAt: new Date().toISOString(),
  };

  writeLocalPlayLogs([entry, ...readLocalPlayLogs()]);

  const db = getDbInstance();
  if (db) {
    try {
      await setDoc(doc(db, 'playLogs', entry.id), entry);
    } catch (e) {
      console.warn('儲存播放紀錄至 Firestore 失敗，已保存在本機:', e);
    }
  }
  return entry;
}

/**
 * 載入所有播放紀錄（合併雲端 Firestore 與本機紀錄，依播放時間由新到舊）
 */
export async function loadPlayLogs(): Promise<PlayLogRecord[]> {
  const localLogs = readLocalPlayLogs();
  const db = getDbInstance();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'playLogs'));
      const byId = new Map<string, PlayLogRecord>();
      localLogs.forEach((l) => l && l.id && byId.set(l.id, l));
      snap.docs.forEach((d) => {
        const r = d.data() as PlayLogRecord;
        if (r && r.id) byId.set(r.id, r);
      });
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime()
      );
      writeLocalPlayLogs(merged);
      return merged;
    } catch (e) {
      console.warn('從 Firestore 讀取播放紀錄失敗，使用本機紀錄:', e);
    }
  }
  return localLogs.sort(
    (a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime()
  );
}

/**
 * 清空所有播放統計紀錄
 */
export async function clearAllPlayLogs(): Promise<void> {
  const ids = new Set<string>(readLocalPlayLogs().map((l) => l.id).filter(Boolean));
  try {
    localStorage.removeItem(LOCAL_PLAY_LOGS_KEY);
  } catch {
    // ignore
  }
  const db = getDbInstance();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'playLogs'));
      snap.docs.forEach((d) => ids.add(d.id));
    } catch (e) {
      console.warn('讀取雲端播放紀錄失敗:', e);
    }
    await Promise.all(
      Array.from(ids).map((id) =>
        deleteDoc(doc(db, 'playLogs', id)).catch((e) =>
          console.warn('Firestore 刪除播放紀錄失敗:', e)
        )
      )
    );
  }
}
