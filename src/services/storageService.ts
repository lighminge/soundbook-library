import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc,
  Firestore,
} from 'firebase/firestore';
import { AudioItem, Category, CloudConfig } from '../types';
import { INITIAL_AUDIO_ITEMS, INITIAL_CATEGORIES } from '../data/initialData';
import {
  base64ToBlob,
  cacheMediaBlob,
  getCachedMediaBlobUrl,
  setMemoryBase64Payload,
} from '../utils/mediaCache';

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

/**
 * 自動從使用者貼上的完整 Google Drive 網址或字串中擷取純粹的 Folder ID
 */
export function extractDriveFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }
  return trimmed.split('?')[0].split('/')[0].trim();
}

export function getCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CLOUD_CONFIG,
        ...parsed,
        googleDriveScriptUrl: (parsed.googleDriveScriptUrl || DEFAULT_CLOUD_CONFIG.googleDriveScriptUrl).trim(),
        googleDriveFolderId: extractDriveFolderId(parsed.googleDriveFolderId || DEFAULT_CLOUD_CONFIG.googleDriveFolderId),
      };
    }
  } catch (e) {
    console.warn('無法讀取雲端設定:', e);
  }
  return DEFAULT_CLOUD_CONFIG;
}

export async function saveCloudConfig(config: CloudConfig): Promise<void> {
  const cleaned: CloudConfig = {
    ...config,
    googleDriveScriptUrl: (config.googleDriveScriptUrl || '').trim(),
    googleDriveFolderId: extractDriveFolderId(config.googleDriveFolderId || ''),
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cleaned));
  firestoreDb = null; // 重新初始化

  // 同步將 Google Drive 設定儲存至 Firebase Firestore，讓手機與電腦跨裝置自動共用！
  const db = getDbInstance();
  if (db) {
    try {
      await setDoc(doc(db, 'categories', '__system_cloud_config__'), {
        id: '__system_cloud_config__',
        name: '__system_cloud_config__',
        code: 'SYS-CFG',
        description: JSON.stringify({
          googleDriveScriptUrl: cleaned.googleDriveScriptUrl,
          googleDriveFolderId: cleaned.googleDriveFolderId,
        }),
        themeColor: '#000000',
        icon: 'Settings',
        order: 9999,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('同步雲端硬碟設定至 Firestore 略過:', e);
    }
  }
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
      catSnap.forEach((d) => {
        const data = d.data() as Category;
        if (data.id === '__system_cloud_config__') {
          // 自動從 Firestore 同步 Google 雲端硬碟連線設定至當前裝置
          try {
            const remoteCfg = JSON.parse(data.description || '{}');
            if (remoteCfg.googleDriveScriptUrl) {
              const currentCfg = getCloudConfig();
              if (!currentCfg.googleDriveScriptUrl) {
                localStorage.setItem(
                  CONFIG_STORAGE_KEY,
                  JSON.stringify({
                    ...currentCfg,
                    googleDriveScriptUrl: remoteCfg.googleDriveScriptUrl,
                    googleDriveFolderId: extractDriveFolderId(remoteCfg.googleDriveFolderId || ''),
                  })
                );
              }
            }
          } catch {
            // ignore parse error
          }
        } else {
          categories.push(data);
        }
      });

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

      // 背景自動檢查：若電腦端 IndexedDB 有已快取的語音檔尚未同步至 Firestore audioChunks，自動補齊分片以供手機播放
      backfillLocalBlobsToFirestoreChunks(audioItems).catch(() => {});

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

const CHUNK_STR_LIMIT = 720000; // 每個分片 720KB，完全符合 Firestore 1MB 限制

/**
 * 自動檢查本機 IndexedDB 快取的音檔，若雲端 audioChunks 尚無分片則自動補齊上傳（讓先前在電腦上傳的音檔，手機也能立即播放）
 */
async function backfillLocalBlobsToFirestoreChunks(items: AudioItem[]): Promise<void> {
  const db = getDbInstance();
  if (!db) return;

  for (const item of items) {
    const fileId = item.audioDriveFileId || extractDriveFileIdFromUrl(item.audioUrl);
    if (!fileId || fileId.startsWith('demo_') || fileId.startsWith('gdrive_local_')) {
      continue;
    }
    if (item.audioUrl.startsWith('data:')) continue;

    try {
      const existingChunk = await getDoc(doc(db, 'audioChunks', `${fileId}_chunk_0`));
      if (existingChunk.exists()) continue;

      const localBlobUrl =
        (await getCachedMediaBlobUrl(fileId)) ||
        (await getCachedMediaBlobUrl(item.audioUrl));
      if (!localBlobUrl) continue;

      const res = await fetch(localBlobUrl);
      const blob = await res.blob();
      if (blob.size > 0) {
        const { base64 } = await fileToDataUrl(
          new File([blob], item.title || 'audio.mp3', {
            type: item.mimeType || blob.type || 'audio/mpeg',
          })
        );
        await saveAudioChunksToFirestore(
          fileId,
          base64,
          item.mimeType || blob.type || 'audio/mpeg'
        );
      }
    } catch {
      // ignore background backfill error
    }
  }
}

/**
 * 將大型語音檔的 Base64 分片寫入 Firestore audioChunks，讓手機跨裝置打開時不需額外設定即可秒速串流播放
 */
async function saveAudioChunksToFirestore(
  fileId: string,
  base64: string,
  mimeType: string
): Promise<void> {
  const db = getDbInstance();
  if (!db || !fileId || !base64) return;

  const total = Math.ceil(base64.length / CHUNK_STR_LIMIT);
  if (total > 60) return; // 超過約 32MB 則僅透過 GAS 串流

  const now = new Date().toISOString();
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < total; i++) {
    const chunkData = base64.slice(i * CHUNK_STR_LIMIT, (i + 1) * CHUNK_STR_LIMIT);
    const chunkDocId = `${fileId}_chunk_${i}`;
    tasks.push(
      setDoc(doc(db, 'audioChunks', chunkDocId), {
        id: chunkDocId,
        audioId: fileId,
        index: i,
        total,
        mimeType: mimeType || 'audio/mpeg',
        data: chunkData,
        createdAt: now,
      })
    );
  }

  await Promise.all(tasks);
}

/**
 * 從 Firestore audioChunks 讀取並重組語音檔 Blob（讓手機端可跨裝置直接播放）
 */
async function loadAudioBlobFromFirestoreChunks(fileId: string): Promise<Blob | null> {
  const db = getDbInstance();
  if (!db || !fileId) return null;

  try {
    const firstChunkSnap = await getDoc(doc(db, 'audioChunks', `${fileId}_chunk_0`));
    if (!firstChunkSnap.exists()) return null;

    const firstData = firstChunkSnap.data();
    const total = Number(firstData.total) || 1;
    const mimeType = firstData.mimeType || 'audio/mpeg';

    if (total === 1) {
      return base64ToBlob(firstData.data, mimeType);
    }

    const restPromises = [];
    for (let i = 1; i < total; i++) {
      restPromises.push(getDoc(doc(db, 'audioChunks', `${fileId}_chunk_${i}`)));
    }
    const restSnaps = await Promise.all(restPromises);

    let fullBase64 = firstData.data || '';
    for (const snap of restSnaps) {
      if (!snap.exists()) return null;
      fullBase64 += snap.data().data || '';
    }

    return base64ToBlob(fullBase64, mimeType);
  } catch (e) {
    console.warn('從 Firestore audioChunks 讀取音訊分片失敗:', e);
    return null;
  }
}

/**
 * 刪除語音檔時，一併清理 Firestore 中的 audioChunks 分片
 */
async function deleteAudioChunksFromFirestore(fileIds: string[]): Promise<void> {
  const db = getDbInstance();
  if (!db || !fileIds.length) return;

  for (const fileId of fileIds) {
    try {
      const firstSnap = await getDoc(doc(db, 'audioChunks', `${fileId}_chunk_0`));
      if (firstSnap.exists()) {
        const total = Number(firstSnap.data().total) || 1;
        const delTasks: Promise<void>[] = [];
        for (let i = 0; i < total; i++) {
          delTasks.push(deleteDoc(doc(db, 'audioChunks', `${fileId}_chunk_${i}`)));
        }
        await Promise.all(delTasks);
      }
    } catch {
      // ignore cleanup error
    }
  }
}
/**
 * 從 Google Drive 串流網址或圖片網址中嘗試解析出 File ID
 */
function extractDriveFileIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const idParam = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idParam && idParam[1]) return idParam[1];
  const dPath = url.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (dPath && dPath[1]) return dPath[1];
  return null;
}

/**
 * 收集單一 AudioItem 關聯的所有真實 Google Drive File IDs (語音檔、封面圖、播放插圖)
 */
export function collectDriveFileIdsFromItem(item: AudioItem): string[] {
  const rawIds = new Set<string>();

  const addIfValid = (id?: string | null) => {
    if (!id) return;
    const trimmed = id.trim();
    if (
      trimmed.length >= 15 &&
      !trimmed.startsWith('demo_') &&
      !trimmed.startsWith('gdrive_local_')
    ) {
      rawIds.add(trimmed);
    }
  };

  addIfValid(item.audioDriveFileId);
  addIfValid(extractDriveFileIdFromUrl(item.audioUrl));
  addIfValid(item.coverImageDriveId);
  addIfValid(extractDriveFileIdFromUrl(item.coverImageUrl));

  if (item.playbackDisplay?.slides) {
    for (const sl of item.playbackDisplay.slides) {
      addIfValid(sl.imageDriveId);
      addIfValid(extractDriveFileIdFromUrl(sl.imageUrl));
    }
  }

  return Array.from(rawIds);
}

/**
 * 呼叫 Google Apps Script 將指定的 Google 雲端硬碟檔案移至垃圾桶刪除
 */
export async function deleteFilesFromGoogleDrive(fileIds: string[]): Promise<{
  deletedOnDrive: boolean;
  deletedCount: number;
  message?: string;
}> {
  if (!fileIds || fileIds.length === 0) {
    return { deletedOnDrive: false, deletedCount: 0 };
  }

  const config = getCloudConfig();
  if (!isGoogleDriveConfigured(config)) {
    return {
      deletedOnDrive: false,
      deletedCount: 0,
      message: '尚未設定 Google Apps Script 網址，僅刪除系統資料庫紀錄',
    };
  }

  try {
    const response = await fetch(config.googleDriveScriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'delete',
        fileIds,
      }),
    });

    const result = await response.json();
    if (result && result.success && result.action === 'delete') {
      return {
        deletedOnDrive: true,
        deletedCount: Array.isArray(result.deletedIds) ? result.deletedIds.length : fileIds.length,
      };
    }

    if (result && String(result.error || '').includes('base64Decode')) {
      return {
        deletedOnDrive: false,
        deletedCount: 0,
        message:
          '已刪除系統資料！但您的 Google Apps Script 尚為舊版，請點右上角「雲端連線設定」複製最新版 GAS 腳本並更新部署，即可支援同步刪除雲端硬碟檔案。',
      };
    }

    return {
      deletedOnDrive: false,
      deletedCount: 0,
      message: result?.error || '雲端硬碟檔案刪除未成功回應',
    };
  } catch (err: any) {
    console.warn('刪除 Google 雲端硬碟檔案失敗:', err);
    return {
      deletedOnDrive: false,
      deletedCount: 0,
      message: err?.message || String(err),
    };
  }
}

export async function removeAudioItem(
  itemId: string,
  remainingItems: AudioItem[],
  targetItem?: AudioItem
): Promise<{
  deletedOnDrive: boolean;
  deletedCount: number;
  message?: string;
}> {
  try {
    localStorage.setItem(LOCAL_AUDIO_ITEMS_KEY, JSON.stringify(remainingItems));
  } catch (e) {
    console.warn('本地刪除音檔失敗:', e);
  }

  const db = getDbInstance();
  if (db) {
    await deleteDoc(doc(db, 'audioItems', itemId));
  }

  if (targetItem) {
    const driveFileIds = collectDriveFileIdsFromItem(targetItem);
    if (driveFileIds.length > 0) {
      await deleteAudioChunksFromFirestore(driveFileIds);
      return await deleteFilesFromGoogleDrive(driveFileIds);
    }
  }

  return { deletedOnDrive: false, deletedCount: 0 };
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
  errorReason?: string;
}> {
  const config = getCloudConfig();
  onProgress?.(15, `正在讀取檔案 ${file.name}...`);
  const { dataUrl, base64 } = await fileToDataUrl(file);

  let errorReason: string | undefined;

  if (!isGoogleDriveConfigured(config)) {
    errorReason = '尚未在右上角「雲端連線設定」填入 Google Apps Script 部署網址 (Web App URL)';
  } else {
    try {
      onProgress?.(45, '正在上傳至系統 Google 雲端硬碟...');
      const cleanFolderId = extractDriveFolderId(config.googleDriveFolderId);
      const response = await fetch(config.googleDriveScriptUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          folderId: cleanFolderId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64Data: base64,
        }),
      });

      onProgress?.(85, '正在確認雲端硬碟寫入結果...');
      const text = await response.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(
          'Google Apps Script 未回傳正確格式。請確認部署時「執行身分」為「我」，且「誰可以存取」已設為「所有人 (Anyone)」，並已完成 Google 帳號授權核准。'
        );
      }

      if (result && result.success) {
        // 立即將原始檔案存入瀏覽器 IndexedDB 與記憶體快取
        await cacheMediaBlob(result.fileId, file);
        setMemoryBase64Payload(result.fileId, base64, file.type || 'audio/mpeg');
        if (result.directUrl) {
          await cacheMediaBlob(result.directUrl, file);
        }

        const isAudio = (file.type || '').startsWith('audio/');
        // 若音檔 Base64 小於 850KB，直接內嵌 dataUrl；若大於 850KB，自動分片存入 Firestore audioChunks 讓手機端也能秒速跨裝置播放！
        if (isAudio && dataUrl.length > 850000) {
          onProgress?.(92, '正在建立手機跨裝置音訊串流快取...');
          try {
            await saveAudioChunksToFirestore(
              result.fileId,
              base64,
              file.type || 'audio/mpeg'
            );
          } catch (chunkErr) {
            console.warn('建立跨裝置音訊分片略過:', chunkErr);
          }
        }

        onProgress?.(100, 'Google 雲端硬碟上傳完成！');

        const safeDirectUrl =
          isAudio && dataUrl.length <= 850000 ? dataUrl : result.directUrl;

        return {
          fileId: result.fileId,
          directUrl: safeDirectUrl,
          viewUrl: result.viewUrl,
          mode: 'google_drive',
        };
      } else {
        throw new Error(result?.error || 'Google Drive 回傳失敗');
      }
    } catch (err: any) {
      errorReason = err?.message || String(err);
      console.warn('Google 雲端硬碟 API 上傳失敗原因:', errorReason);
    }
  }

  // 模擬雲端上傳進度並回傳可用於播放與顯示的 URL
  onProgress?.(65, '正在處理媒體串流封裝...');
  await new Promise((r) => setTimeout(r, 350));
  onProgress?.(100, '檔案就緒！');

  const localId = `gdrive_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const blobUrl = await cacheMediaBlob(localId, file);
  const finalUrl = dataUrl.length <= 900000 ? dataUrl : blobUrl;

  return {
    fileId: localId,
    directUrl: finalUrl,
    mode: 'local_preview',
    errorReason,
  };
}

/**
 * 透過 Firestore 跨裝置分片庫 (audioChunks) 或 Google Apps Script 讀取雲端硬碟中的音訊檔案並轉為手機/電腦皆可播放的本地 Blob URL
 */
export async function fetchAudioBlobFromGoogleDrive(
  fileId: string | null,
  itemId?: string
): Promise<string | null> {
  const lookupId =
    fileId && !fileId.startsWith('demo_') && !fileId.startsWith('gdrive_local_')
      ? fileId.trim()
      : null;

  // 1. 先檢查本地快取
  if (lookupId) {
    const cached = await getCachedMediaBlobUrl(lookupId);
    if (cached) return cached;
  }
  if (itemId) {
    const cachedItem = await getCachedMediaBlobUrl(itemId);
    if (cachedItem) return cachedItem;
  }

  // 2. 優先從 Firebase Firestore audioChunks 跨裝置分片庫載入（手機無須設定 GAS 也能直接串流播放！）
  if (lookupId) {
    const firestoreBlob = await loadAudioBlobFromFirestoreChunks(lookupId);
    if (firestoreBlob) {
      return await cacheMediaBlob(lookupId, firestoreBlob);
    }
  }
  if (itemId) {
    const firestoreBlobByItem = await loadAudioBlobFromFirestoreChunks(itemId);
    if (firestoreBlobByItem) {
      return await cacheMediaBlob(itemId, firestoreBlobByItem);
    }
  }

  // 3. 若為早期上傳、尚未建立分片的檔案，透過 Google Apps Script (action: 'getFile') 從雲端硬碟取回音訊串流
  if (!lookupId) return null;

  const config = getCloudConfig();
  if (!isGoogleDriveConfigured(config)) return null;

  try {
    const response = await fetch(config.googleDriveScriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'getFile',
        fileId: lookupId,
      }),
    });

    const result = await response.json();
    if (result && result.success && result.base64Data) {
      const blob = base64ToBlob(result.base64Data, result.mimeType || 'audio/mpeg');
      // 順便自動補齊寫入 Firestore audioChunks，讓下次手機或其他裝置開啟秒速載入！
      saveAudioChunksToFirestore(
        lookupId,
        result.base64Data,
        result.mimeType || 'audio/mpeg'
      ).catch(() => {});
      return await cacheMediaBlob(lookupId, blob);
    }
  } catch (e) {
    console.warn('從 Google 雲端硬碟讀取音訊資料流失敗:', e);
  }

  return null;
}

/**
 * 測試 Google Apps Script 與 Google 雲端硬碟資料夾是否可正常寫入檔案
 */
export async function testGoogleDriveConnection(
  scriptUrl: string,
  folderIdInput: string
): Promise<{
  success: boolean;
  message: string;
  viewUrl?: string;
}> {
  const cleanUrl = (scriptUrl || '').trim();
  const cleanFolderId = extractDriveFolderId(folderIdInput || '');

  if (!cleanUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      message: '請填入正確的 Google Apps Script 網頁應用程式網址（開頭為 https://script.google.com/macros/s/.../exec）',
    };
  }

  try {
    const sampleText = `聲書閣 (SoundBook Pavilion) 雲端硬碟連線測試成功！\n建立時間：${new Date().toLocaleString('zh-TW')}`;
    const base64Data = btoa(unescape(encodeURIComponent(sampleText)));

    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        folderId: cleanFolderId,
        fileName: '聲書閣_雲端硬碟連線測試成功.txt',
        mimeType: 'text/plain',
        base64Data,
      }),
    });

    const rawText = await response.text();
    let result: any;
    try {
      result = JSON.parse(rawText);
    } catch {
      return {
        success: false,
        message:
          '連線被拒絕或未授權！請確認在 Google Apps Script 中：1. 已先點選上方「執行 (testDrivePermission)」完成授權核准；2. 部署時「誰可以存取」已選取「所有人 (Anyone)」。',
      };
    }

    if (result && result.success) {
      return {
        success: true,
        message: '測試成功！已在您的 Google 雲端硬碟資料夾建立「聲書閣_雲端硬碟連線測試成功.txt」檔案。',
        viewUrl: result.viewUrl,
      };
    } else {
      return {
        success: false,
        message: `Google Apps Script 回傳錯誤：${result?.error || '未知錯誤'}（請檢查資料夾 ID 是否正確）`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `連線發生網路或權限錯誤：${err?.message || String(err)}。請確認部署網址結尾為 /exec 且權限設為「所有人」。`,
    };
  }
}
