import { AudioItem, Category } from '../types';

/**
 * 語音檔案選取相容性工具（特別針對 iPhone / iPad Safari）
 *
 * iOS 的 <input accept="audio/*"> 會依 UTI 類型過濾檔案，
 * 導致「錄音備忘錄」匯出的 .m4a / .qta（QuickTime 音訊）或「檔案」App 內的部分錄音檔
 * 被反灰而無法選取。因此在 iOS 上改為不限制 accept，選取後再以副檔名 / MIME 自行驗證。
 */

/** 支援的語音副檔名與對應 MIME 類型 */
const AUDIO_EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
  caf: 'audio/x-caf',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  amr: 'audio/amr',
  '3gp': 'audio/3gpp',
  qta: 'audio/mp4', // iOS 17+ 錄音備忘錄（QuickTime Audio，內容為 AAC）
  wma: 'audio/x-ms-wma',
};

/** 是否為 iOS / iPadOS 裝置（含新版 iPad 以 Mac UA 呈現的情況） */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document)
  );
}

/**
 * 取得語音檔 <input type="file"> 應使用的 accept 屬性
 * - iOS：回傳 undefined（不限制），避免錄音備忘錄 / 檔案 App 的錄音檔被反灰
 * - 其他裝置：audio/* 加上明確副檔名
 */
export function getAudioInputAccept(): string | undefined {
  if (isIOSDevice()) return undefined;
  const exts = Object.keys(AUDIO_EXT_MIME)
    .map((e) => `.${e}`)
    .join(',');
  return `audio/*,${exts}`;
}

function getExt(name: string): string {
  const m = /\.([^./\\]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** 判斷選取的檔案是否為支援的語音檔 */
export function isSupportedAudioFile(file: File): boolean {
  if ((file.type || '').startsWith('audio/')) return true;
  return getExt(file.name) in AUDIO_EXT_MIME;
}

/**
 * 修正 iOS 上 MIME 類型為空字串或 video/quicktime 等情況，
 * 回傳帶有正確 audio/* MIME 的 File，確保後續上傳、雲端存檔與播放正常
 */
export function normalizeAudioFile(file: File): File {
  const type = file.type || '';
  if (type.startsWith('audio/')) return file;
  const ext = getExt(file.name);
  const mime = AUDIO_EXT_MIME[ext] || 'audio/mp4';
  // .qta 在 Google 雲端硬碟與瀏覽器較難辨識，轉為 .m4a 副檔名（內容同為 AAC/MP4 容器）
  const name = ext === 'qta' ? file.name.replace(/\.[^.]+$/, '.m4a') : file.name;
  try {
    return new File([file], name, { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/**
 * 取得全館所有語音檔案之獨立館藏編號對照表
 * 編碼規格：館藏分類編號 + 流水號 (號碼從 1 開始，依語音檔案上傳順序編號)
 * 例如：LIT-100-1, LIT-100-2, HIS-200-1
 */
export function getAudioItemCallNumberMap(
  audioItems: AudioItem[],
  categories: Category[]
): Map<string, string> {
  const categoryMap = new Map<string, Category>();
  categories.forEach((c) => categoryMap.set(c.id, c));

  // 依 categoryId 將語音檔案分組
  const itemsByCat = new Map<string, AudioItem[]>();
  audioItems.forEach((item) => {
    const catId = item.categoryId || '__UNCAT__';
    const list = itemsByCat.get(catId) || [];
    list.push(item);
    itemsByCat.set(catId, list);
  });

  const callNumberMap = new Map<string, string>();

  // 針對各分類內的語音檔案，依照上傳時間（createdAt）由舊到新排序，流水號從 1 開始
  itemsByCat.forEach((items, catId) => {
    const cat = categoryMap.get(catId);
    const catCode = (cat?.code || 'CAT-000').trim();

    const sortedItems = [...items].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    sortedItems.forEach((item, index) => {
      const codePrefix = catCode.endsWith('-') ? catCode : `${catCode}-`;
      const callNumber = `${codePrefix}${index + 1}`;
      callNumberMap.set(item.id, callNumber);
    });
  });

  return callNumberMap;
}

/**
 * 取得全館所有語音檔案之標準固定序號對照表（以館藏資料管理預設依檔案名稱升冪排序為基準，確保跨頁面編號完全一致）
 */
export function getAudioItemSequenceMap(audioItems: AudioItem[]): Map<string, number> {
  const sorted = [...audioItems].sort((a, b) => {
    const cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant');
    if (cmp !== 0) return cmp;
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, number>();
  sorted.forEach((item, idx) => {
    map.set(item.id, idx + 1);
  });
  return map;
}
