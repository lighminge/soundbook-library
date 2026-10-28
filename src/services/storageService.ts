import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  Firestore,
} from 'firebase/firestore';
import { AudioItem, Category, CloudConfig } from '../types';
import { INITIAL_AUDIO_ITEMS, INITIAL_CATEGORIES } from '../data/initialData';

const CONFIG_STORAGE_KEY = 'soundbook_cloud_config_v1';
const LOCAL_CATEGORIES_KEY = 'soundbook_categories_v1';
const LOCAL_AUDIO_ITEMS_KEY = 'soundbook_audio_items_v1';

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB1MHVQ_CnTOxl2LSwoaPAZQogWtjrb-Ls',
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'soundbook-library-db.firebaseapp.com',
  firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'soundbook-library-db',
  firebaseStorageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'soundbook-library-db.firebasestorage.app',
  firebaseMessagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '528102320989',
  firebaseAppId: import.meta.env.VITE_FIREBASE_APP_ID || '1:528102320989:web:8dede1f2aebeabf814d6b4',
  googleDriveScriptUrl: import.meta.env.VITE_GOOGLE_DRIVE_SCRIPT_URL || '',
  googleDriveFolderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '',
};

let firestoreDb: Firestore | null = null;

export function getCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CLOUD_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('無法讀取雲端設定:', e);
  }
  return DEFAULT_CLOUD_CONFIG;
}

export function saveCloudConfig(config: CloudConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  firestoreDb = null; // 重新初始化
}

export function isFirebaseConfigured(config: CloudConfig = getCloudConfig()): boolean {
  return Boolean(config.firebaseApiKey && config.firebaseProjectId);
}

export function isGoogleDriveConfigured(config: CloudConfig = getCloudConfig()): boolean {
  return Boolean(config.googleDriveScriptUrl && config.googleDriveScriptUrl.startsWith('http'));
}

function getDbInstance(): Firestore | null {
  const config = getCloudConfig();
  if (!isFirebaseConfigured(config)) return null;

  if (firestoreDb) return firestoreDb;

  try {
    let app: FirebaseApp;
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0];
    } else {
      app = initializeApp({
        apiKey: config.firebaseApiKey,
        authDomain: config.firebaseAuthDomain,
        projectId: config.firebaseProjectId,
        storageBucket: config.firebaseStorageBucket,
        messagingSenderId: config.firebaseMessagingSenderId,
        appId: config.firebaseAppId,
      });
    }
    firestoreDb = getFirestore(app);
    return firestoreDb;
  } catch (err) {
    console.error('Firebase 初始化失敗:', err);
    return null;
  }
}

/**
 * 讀取館藏分類与語音項目 (優先從 Firebase Firestore 讀取，若未設定則使用本地持久化儲存)
 */
export async function loadLibraryData(): Promise<{
  categories: Category[];
  audioItems: AudioItem[];
  source: 'firebase' | 'local';
}> {
  const db = getDbInstance();
  if (db) {
    try {
      const [catSnap, audioSnap] = await Promise.all([
        getDocs(collection(db, 'categories')),
        getDocs(collection(db, 'audioItems')),
      ]);

      let categories: Category[] = [];
      catSnap.forEach((d) => categories.push(d.data() as Category));

      let audioItems: AudioItem[] = [];
      audioSnap.forEach((d) => audioItems.push(d.data() as AudioItem));

      // 若 Firebase 為全新空資料庫，自動寫入預設館藏分類與範例資料
      if (categories.length === 0) {
        categories = INITIAL_CATEGORIES;
        for (const cat of categories) {
          await setDoc(doc(db, 'categories', cat.id), cat);
        }
      }
      if (audioItems.length === 0) {
        audioItems = INITIAL_AUDIO_ITEMS;
        for (const item of audioItems) {
          await setDoc(doc(db, 'audioItems', item.id), item);
        }
      }

      categories.sort((a, b) => a.order - b.order);
      audioItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { categories, audioItems, source: 'firebase' };
    } catch (err) {
      console.warn('從 Firebase 載入失敗，切換為本地儲存模式:', err);
    }
  }

  // 本地持久化模式
  let categories: Category[] = INITIAL_CATEGORIES;
  let audioItems: AudioItem[] = INITIAL_AUDIO_ITEMS;

  try {
    const savedCats = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    if (savedCats) categories = JSON.parse(savedCats);
    else localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(INITIAL_CATEGORIES));

    const savedAudio = localStorage.getItem(LOCAL_AUDIO_ITEMS_KEY);
    if (savedAudio) audioItems = JSON.parse(savedAudio);
    else localStorage.setItem(LOCAL_AUDIO_ITEMS_KEY, JSON.stringify(INITIAL_AUDIO_ITEMS));
  } catch (e) {
    console.warn('讀取 localStorage 失敗:', e);
  }

  return { categories, audioItems, source: 'local' };
}

export async function saveCategoryItem(category: Category, allCategories: Category[]): Promise<void> {
  try {
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(allCategories));
  } catch (e) {
    console.warn('本地儲存分類失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    await setDoc(doc(db, 'categories', category.id), category);
  }
}

export async function deleteCategoryItem(categoryId: string, remainingCategories: Category[]): Promise<void> {
  try {
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(remainingCategories));
  } catch (e) {
    console.warn('本地刪除分類失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    await deleteDoc(doc(db, 'categories', categoryId));
  }
}

export async function saveAudioItem(item: AudioItem, allItems: AudioItem[]): Promise<void> {
  try {
    localStorage.setItem(LOCAL_AUDIO_ITEMS_KEY, JSON.stringify(allItems));
  } catch (e) {
    console.warn('本地儲存音檔容量超過限制或失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    await setDoc(doc(db, 'audioItems', item.id), item);
  }
}

export async function removeAudioItem(itemId: string, remainingItems: AudioItem[]): Promise<void> {
  try {
    localStorage.setItem(LOCAL_AUDIO_ITEMS_KEY, JSON.stringify(remainingItems));
  } catch (e) {
    console.warn('本地刪除音檔失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    await deleteDoc(doc(db, 'audioItems', itemId));
  }
}

/**
 * 將檔案轉為 Base64 字串或 Data URL
 */
function fileToDataUrl(file: File): Promise<{ dataUrl: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ dataUrl, base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 讀取音訊檔案的實際秒數 (Duration)
 */
export function getAudioFileDuration(fileOrUrl: File | string): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const isFile = typeof fileOrUrl !== 'string';
    const src = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
    audio.preload = 'metadata';

    const cleanup = () => {
      if (isFile) URL.revokeObjectURL(src);
    };

    audio.onloadedmetadata = () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d) : 30);
    };

    audio.onerror = () => {
      cleanup();
      resolve(30);
    };

    audio.src = src;
  });
}

/**
 * 上傳檔案（語音檔或圖片）至系統的 Google 雲端硬碟
 * 若已設定 Google Drive GAS URL，將真實上傳至 Google 雲端硬碟並回傳 fileId 與串流連結；
 * 若尚未填入金鑰，自動採用瀏覽器即時 DataURL/Blob 儲存，讓使用者在電腦與手機上能立即上傳、播放與預覽！
 */
export async function uploadFileToGoogleDrive(
  file: File,
  onProgress?: (percent: number, statusText: string) => void
): Promise<{
  fileId: string;
  directUrl: string;
  viewUrl?: string;
  mode: 'google_drive' | 'local_preview';
}> {
  const config = getCloudConfig();
  onProgress?.(15, `正在讀取檔案 ${file.name}...`);
  const { dataUrl, base64 } = await fileToDataUrl(file);

  if (isGoogleDriveConfigured(config)) {
    try {
      onProgress?.(45, '正在上傳至系統 Google 雲端硬碟...');
      const response = await fetch(config.googleDriveScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          folderId: config.googleDriveFolderId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64Data: base64,
        }),
      });

      onProgress?.(85, '正在取得雲端硬碟公開串流連結...');
      const result = await response.json();
      if (result && result.success) {
        onProgress?.(100, 'Google 雲端硬碟上傳完成！');
        return {
          fileId: result.fileId,
          directUrl: result.directUrl,
          viewUrl: result.viewUrl,
          mode: 'google_drive',
        };
      } else {
        throw new Error(result?.error || 'Google Drive 回傳失敗');
      }
    } catch (err) {
      console.warn('Google 雲端硬碟 API 上傳發生例外，已自動轉為本地預覽串流:', err);
    }
  }

  // 模擬雲端上傳進度並回傳可用於播放與顯示的 URL
  onProgress?.(65, '正在處理媒體串流封裝...');
  await new Promise((r) => setTimeout(r, 350));
  onProgress?.(100, '檔案就緒！');

  // 若檔案較大（> 2.5MB），使用 ObjectURL 確保播放流暢不爆 localStorage；小檔案則保留 DataURL
  const finalUrl = file.size > 2.5 * 1024 * 1024 ? URL.createObjectURL(file) : dataUrl;

  return {
    fileId: `gdrive_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    directUrl: finalUrl,
    mode: 'local_preview',
  };
}
