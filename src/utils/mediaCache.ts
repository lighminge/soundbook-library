import { useEffect, useState } from 'react';

const DB_NAME = 'soundbook_media_cache_v1';
const STORE_NAME = 'files';

// 記憶體快取：fileId -> blobUrl
const memoryBlobUrls = new Map<string, string>();

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 將上傳或下載的音訊/圖片 Blob 存入 IndexedDB 與記憶體快取
 */
export async function cacheMediaBlob(key: string, blob: Blob): Promise<string> {
  if (!key) return URL.createObjectURL(blob);

  let blobUrl = memoryBlobUrls.get(key);
  if (!blobUrl) {
    blobUrl = URL.createObjectURL(blob);
    memoryBlobUrls.set(key, blobUrl);
  }

  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB 媒體快取寫入略過:', e);
  }

  return blobUrl;
}

/**
 * 從記憶體或 IndexedDB 取出已快取的 Blob URL
 */
export async function getCachedMediaBlobUrl(key: string): Promise<string | null> {
  if (!key) return null;

  const mem = memoryBlobUrls.get(key);
  if (mem) return mem;

  try {
    const db = await openMediaDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });

    if (blob instanceof Blob && blob.size > 0) {
      const url = URL.createObjectURL(blob);
      memoryBlobUrls.set(key, url);
      return url;
    }
  } catch (e) {
    console.warn('讀取 IndexedDB 媒體快取失敗:', e);
  }

  return null;
}

/**
 * 將 Base64 字串轉為 Blob
 */
export function base64ToBlob(base64: string, mimeType: string = 'audio/mpeg'): Blob {
  const byteCharacters = atob(base64);
  const byteArrays: Uint8Array[] = [];
  const sliceSize = 8192;

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays as BlobPart[], { type: mimeType });
}

/**
 * 從網址或欄位解析出 Google Drive File ID
 */
export function parseDriveId(url?: string, explicitId?: string): string | null {
  if (
    explicitId &&
    explicitId.length >= 15 &&
    !explicitId.startsWith('demo_') &&
    !explicitId.startsWith('gdrive_local_')
  ) {
    return explicitId.trim();
  }
  if (!url) return null;
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (idMatch && idMatch[1]) return idMatch[1];
  const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]{15,})/);
  if (dMatch && dMatch[1]) return dMatch[1];
  return null;
}

/**
 * React Hook：自動將 Google Drive 音訊轉換為瀏覽器 100% 可播放的本地 Blob URL 或 Data URL
 * 解決 Chrome/Edge/Safari 對 docs.google.com/uc 音訊串流的 ORB/CORS 阻擋問題
 */
export function usePlayableAudioUrl(
  rawAudioUrl: string,
  audioDriveFileId?: string,
  fetchFromDriveFn?: (fileId: string) => Promise<string | null>
): { playableUrl: string; isLoadingAudio: boolean } {
  const [playableUrl, setPlayableUrl] = useState<string>(rawAudioUrl);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveAudio() {
      if (!rawAudioUrl && !audioDriveFileId) {
        setPlayableUrl('');
        return;
      }

      // 1. 若本身已經是 data: 或 blob:，可立即播放
      if (rawAudioUrl.startsWith('data:') || rawAudioUrl.startsWith('blob:')) {
        setPlayableUrl(rawAudioUrl);
        return;
      }

      const driveId = parseDriveId(rawAudioUrl, audioDriveFileId);

      // 2. 先檢查 IndexedDB / 記憶體快取（例如剛從本機上傳的音檔）
      if (driveId) {
        const cachedUrl = await getCachedMediaBlobUrl(driveId);
        if (cachedUrl) {
          if (!cancelled) setPlayableUrl(cachedUrl);
          return;
        }
      }

      const cachedByRawUrl = await getCachedMediaBlobUrl(rawAudioUrl);
      if (cachedByRawUrl) {
        if (!cancelled) setPlayableUrl(cachedByRawUrl);
        return;
      }

      // 3. 若為 Google Drive 音檔且尚未快取於本機，透過 Google Apps Script 取得音訊資料流轉為 Blob
      if (driveId && fetchFromDriveFn) {
        if (!cancelled) setIsLoadingAudio(true);
        try {
          const fetchedBlobUrl = await fetchFromDriveFn(driveId);
          if (!cancelled && fetchedBlobUrl) {
            setPlayableUrl(fetchedBlobUrl);
            setIsLoadingAudio(false);
            return;
          }
        } catch (e) {
          console.warn('透過 GAS 讀取雲端音檔失敗:', e);
        }
        if (!cancelled) setIsLoadingAudio(false);
      }

      // 4. 最終退回原始網址
      if (!cancelled) {
        setPlayableUrl(rawAudioUrl);
      }
    }

    resolveAudio();

    return () => {
      cancelled = true;
    };
  }, [rawAudioUrl, audioDriveFileId]);

  return { playableUrl, isLoadingAudio };
}
