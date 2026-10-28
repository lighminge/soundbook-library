import { useEffect, useState } from 'react';

const DB_NAME = 'soundbook_media_cache_v1';
const STORE_NAME = 'files';

// 記憶體快取：key -> blobUrl
const memoryBlobUrls = new Map<string, string>();

// 暫存剛讀取檔案的原始 Base64 與 MIME，供同步寫入 Firestore audioChunks 跨裝置給手機播放
const memoryBase64Payloads = new Map<string, { base64: string; mimeType: string }>();

export function setMemoryBase64Payload(key: string, base64: string, mimeType: string) {
  if (!key || !base64) return;
  memoryBase64Payloads.set(key, { base64, mimeType });
}

export function getMemoryBase64Payload(
  key: string
): { base64: string; mimeType: string } | undefined {
  return memoryBase64Payloads.get(key);
}

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
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(cleanBase64);
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

  return new Blob(byteArrays as BlobPart[], { type: mimeType || 'audio/mpeg' });
}

/**
 * 將 data:audio/...;base64,... 轉換為手機瀏覽器 (iOS Safari / Android Chrome) 相容性最佳的 Blob URL
 */
function dataUrlToBlobUrl(dataUrl: string, cacheKey?: string): string {
  if (cacheKey && memoryBlobUrls.has(cacheKey)) {
    return memoryBlobUrls.get(cacheKey)!;
  }
  try {
    const [header, b64] = dataUrl.split(',');
    if (!b64) return dataUrl;
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'audio/mpeg';
    const blob = base64ToBlob(b64, mime);
    const url = URL.createObjectURL(blob);
    if (cacheKey) memoryBlobUrls.set(cacheKey, url);
    return url;
  } catch {
    return dataUrl;
  }
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
 * React Hook：自動將雲端音訊轉換為手機與電腦瀏覽器 100% 可播放的本地 Blob URL
 */
export function usePlayableAudioUrl(
  rawAudioUrl: string,
  audioDriveFileId?: string,
  fetchFromCloudFn?: (driveFileId: string | null, itemId?: string) => Promise<string | null>,
  itemId?: string
): { playableUrl: string; isLoadingAudio: boolean; loadError: boolean } {
  const [playableUrl, setPlayableUrl] = useState<string>('');
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);

    async function resolveAudio() {
      if (!rawAudioUrl && !audioDriveFileId && !itemId) {
        setPlayableUrl('');
        return;
      }

      // 1. 若本身已經是 blob:，直接播放
      if (rawAudioUrl.startsWith('blob:')) {
        setPlayableUrl(rawAudioUrl);
        return;
      }

      // 2. 若本身是 data:audio/...，轉為原生 Blob URL 以確保手機 iOS Safari / Android Chrome 可順暢播放與拖曳時間軸
      if (rawAudioUrl.startsWith('data:')) {
        const blobUrl = dataUrlToBlobUrl(rawAudioUrl, itemId || audioDriveFileId || rawAudioUrl.slice(0, 64));
        if (!cancelled) setPlayableUrl(blobUrl);
        return;
      }

      const driveId = parseDriveId(rawAudioUrl, audioDriveFileId);

      // 3. 先檢查本機 IndexedDB / 記憶體快取
      if (driveId) {
        const cachedByDriveId = await getCachedMediaBlobUrl(driveId);
        if (cachedByDriveId) {
          if (!cancelled) setPlayableUrl(cachedByDriveId);
          return;
        }
      }

      if (itemId) {
        const cachedByItemId = await getCachedMediaBlobUrl(itemId);
        if (cachedByItemId) {
          if (!cancelled) setPlayableUrl(cachedByItemId);
          return;
        }
      }

      const cachedByRawUrl = await getCachedMediaBlobUrl(rawAudioUrl);
      if (cachedByRawUrl) {
        if (!cancelled) setPlayableUrl(cachedByRawUrl);
        return;
      }

      // 4. 若手機尚未快取此音檔，從 Firebase 雲端音訊分片庫 (audioChunks) 或 Google Drive GAS 串流載入
      if (fetchFromCloudFn && (driveId || itemId)) {
        if (!cancelled) setIsLoadingAudio(true);
        try {
          const fetchedBlobUrl = await fetchFromCloudFn(driveId, itemId);
          if (!cancelled && fetchedBlobUrl) {
            setPlayableUrl(fetchedBlobUrl);
            setIsLoadingAudio(false);
            return;
          }
        } catch (e) {
          console.warn('從雲端載入音訊串流失敗:', e);
        }
        if (!cancelled) setIsLoadingAudio(false);
      }

      // 5. 若皆無快取，退回原始網址並標記可能需要注意
      if (!cancelled) {
        setPlayableUrl(rawAudioUrl);
      }
    }

    resolveAudio();

    return () => {
      cancelled = true;
    };
  }, [rawAudioUrl, audioDriveFileId, itemId]);

  return { playableUrl, isLoadingAudio, loadError };
}
