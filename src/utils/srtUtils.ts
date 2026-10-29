export interface SrtSegment {
  id: string;
  index: number; // 1-based 序號
  startSec: number; // 起始秒數 (可含小數，例如 5.5)
  endSec: number; // 結束秒數
  text: string;
}

/**
 * 將秒數轉為標準 SRT 時間字串：HH:MM:SS,mmm (例如 00:01:05,000)
 */
export function secondsToSrtTime(totalSeconds: number): string {
  const clamped = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const wholeSecs = Math.floor(clamped);
  const ms = Math.round((clamped - wholeSecs) * 1000);

  const hours = Math.floor(wholeSecs / 3600);
  const mins = Math.floor((wholeSecs % 3600) / 60);
  const secs = wholeSecs % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
    secs
  ).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

/**
 * 將秒數轉為簡潔顯示時間：MM:SS (或 HH:MM:SS)
 */
export function secondsToShortTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 將 SRT 時間字串 (HH:MM:SS,mmm 或 MM:SS 或純秒數) 解析為秒數
 */
export function srtTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().replace('.', ',');

  // HH:MM:SS,mmm 或 HH:MM:SS
  const fullMatch = cleaned.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:,(\d{1,3}))?$/);
  if (fullMatch) {
    const h = parseInt(fullMatch[1], 10) || 0;
    const m = parseInt(fullMatch[2], 10) || 0;
    const s = parseInt(fullMatch[3], 10) || 0;
    const msStr = (fullMatch[4] || '0').padEnd(3, '0');
    const ms = parseInt(msStr, 10) || 0;
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  // MM:SS,mmm 或 MM:SS
  const shortMatch = cleaned.match(/^(\d{1,2}):(\d{1,2})(?:,(\d{1,3}))?$/);
  if (shortMatch) {
    const m = parseInt(shortMatch[1], 10) || 0;
    const s = parseInt(shortMatch[2], 10) || 0;
    const msStr = (shortMatch[3] || '0').padEnd(3, '0');
    const ms = parseInt(msStr, 10) || 0;
    return m * 60 + s + ms / 1000;
  }

  const num = parseFloat(cleaned.replace(',', '.'));
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

/**
 * 解析標準 SRT 檔案內容或既有 [MM:SS] 段落文字為 SrtSegment[]
 */
export function parseSrtContent(rawText: string, defaultDuration = 20): SrtSegment[] {
  if (!rawText || !rawText.trim()) return [];

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n/).filter((b) => b.trim().length > 0);

  const segments: SrtSegment[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i]
      .trim()
      .split('\n')
      .map((l) => l.trim());

    // 檢查是否為標準 SRT 格式 (第一行可能為序號，第二行為 00:00:00,000 --> 00:00:05,000，或第一行直接是時間軸)
    let timeLineIdx = -1;
    if (lines[0] && lines[0].includes('-->')) {
      timeLineIdx = 0;
    } else if (lines[1] && lines[1].includes('-->')) {
      timeLineIdx = 1;
    }

    if (timeLineIdx !== -1) {
      const timeParts = lines[timeLineIdx].split('-->');
      const startSec = srtTimeToSeconds(timeParts[0] || '0');
      const endSec = Math.max(startSec + 1, srtTimeToSeconds(timeParts[1] || String(startSec + 5)));
      const contentLines = lines.slice(timeLineIdx + 1);
      segments.push({
        id: `srt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        index: segments.length + 1,
        startSec: Math.round(startSec * 1000) / 1000,
        endSec: Math.round(endSec * 1000) / 1000,
        text: contentLines.join('\n').trim(),
      });
      continue;
    }

    // 相容舊版 [MM:SS] 格式
    const legacyMatch = blocks[i].trim().match(/^\[(\d{1,2}):(\d{2})\]\s*([\s\S]*)$/);
    if (legacyMatch) {
      const startSec = parseInt(legacyMatch[1], 10) * 60 + parseInt(legacyMatch[2], 10);
      segments.push({
        id: `srt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        index: segments.length + 1,
        startSec,
        endSec: startSec + 6, // 稍後會依下一段起始時間自動校正
        text: legacyMatch[3].trim(),
      });
      continue;
    }

    // 一般純文字段落
    const fallbackStart = segments.length > 0 ? segments[segments.length - 1].endSec : 0;
    segments.push({
      id: `srt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      index: segments.length + 1,
      startSec: fallbackStart,
      endSec: fallbackStart + 6,
      text: blocks[i].trim(),
    });
  }

  // 若是由舊版 [MM:SS] 轉換而來，將每一段的 endSec 對齊下一段的 startSec
  const wasLegacy = !normalized.includes('-->');
  if (wasLegacy && segments.length > 0) {
    for (let i = 0; i < segments.length; i++) {
      if (i < segments.length - 1 && segments[i + 1].startSec > segments[i].startSec) {
        segments[i].endSec = segments[i + 1].startSec;
      } else if (i === segments.length - 1) {
        segments[i].endSec = Math.max(segments[i].startSec + 5, defaultDuration);
      }
    }
  }

  return reindexSegments(segments);
}

/**
 * 重新為所有 SRT 段落編號 (1, 2, 3...)
 */
export function reindexSegments(segments: SrtSegment[]): SrtSegment[] {
  return segments.map((seg, idx) => ({
    ...seg,
    index: idx + 1,
  }));
}

/**
 * 將 SrtSegment[] 序列化為標準 SRT 格式字串
 */
export function serializeSrtSegments(segments: SrtSegment[]): string {
  return reindexSegments(segments)
    .map(
      (seg) =>
        `${seg.index}\n${secondsToSrtTime(seg.startSec)} --> ${secondsToSrtTime(seg.endSec)}\n${
          seg.text || ''
        }`
    )
    .join('\n\n');
}

/**
 * 產生預設的 SRT 格式範本區段
 */
export function createSampleSrtSegments(title?: string): SrtSegment[] {
  return [
    {
      id: `srt_sample_1_${Date.now()}`,
      index: 1,
      startSec: 0,
      endSec: 6,
      text: `【第一幕：開場導讀】\n歡迎聆聽「${title || '有聲書典藏'}」，請跟隨聲音進入故事的世界。`,
    },
    {
      id: `srt_sample_2_${Date.now()}`,
      index: 2,
      startSec: 6,
      endSec: 13,
      text: `【第二幕：核心篇章】\n在這裡輸入第二段時間區間要同步顯示的講稿、詩詞或對話字幕。`,
    },
    {
      id: `srt_sample_3_${Date.now()}`,
      index: 3,
      startSec: 13,
      endSec: 20,
      text: `【第三幕：尾聲與餘韻】\n當語音播放至此時間區段時，放映室將自動高亮顯示本段內容。`,
    },
  ];
}

/**
 * 當使用者修改第 targetIndex 個區段的起迄秒數 (newStartSec, newEndSec) 時，
 * 自動計算時間差並「同步推移修改後方所有受影響的區段時間」！
 */
export function updateSegmentAndCascade(
  segments: SrtSegment[],
  targetIndex: number,
  newStartSec: number,
  newEndSec: number,
  newText?: string
): { updatedSegments: SrtSegment[]; deltaSec: number; oldStartSec: number } {
  const list = segments.map((s) => ({ ...s }));
  const current = list[targetIndex];
  if (!current) {
    return { updatedSegments: list, deltaSec: 0, oldStartSec: 0 };
  }

  const oldStartSec = current.startSec;
  const oldEndSec = current.endSec;

  const validStart = Math.max(0, Math.round(newStartSec * 1000) / 1000);
  // 若使用者只改大起始時間導致 start >= end，自動維持原本的段落長度
  const originalDuration = Math.max(1, oldEndSec - oldStartSec);
  const validEnd =
    newEndSec > validStart
      ? Math.round(newEndSec * 1000) / 1000
      : Math.round((validStart + originalDuration) * 1000) / 1000;

  // 計算結束時間的推移量 (deltaSec)，用來同步更新後方所有區段
  const deltaSec = Math.round((validEnd - oldEndSec) * 1000) / 1000;

  list[targetIndex] = {
    ...current,
    startSec: validStart,
    endSec: validEnd,
    text: newText !== undefined ? newText : current.text,
  };

  if (deltaSec !== 0) {
    for (let j = targetIndex + 1; j < list.length; j++) {
      const seg = list[j];
      const segDur = Math.max(0.5, seg.endSec - seg.startSec);
      const shiftedStart = Math.max(0, Math.round((seg.startSec + deltaSec) * 1000) / 1000);
      const shiftedEnd = Math.round((shiftedStart + segDur) * 1000) / 1000;
      list[j] = {
        ...seg,
        startSec: shiftedStart,
        endSec: shiftedEnd,
      };
    }
  }

  return {
    updatedSegments: reindexSegments(list),
    deltaSec,
    oldStartSec,
  };
}

/**
 * 在指定位置 (insertAtIndex, 0..segments.length) 插入一個新的時間段落，
 * 並自動將後方所有區段往後推移新段落的時長！
 */
export function insertSegmentAt(
  segments: SrtSegment[],
  insertAtIndex: number,
  defaultNewDurationSec = 5
): SrtSegment[] {
  const list = segments.map((s) => ({ ...s }));
  const clampedIdx = Math.max(0, Math.min(list.length, insertAtIndex));

  const startSec =
    clampedIdx === 0
      ? 0
      : list[clampedIdx - 1].endSec;
  const endSec = Math.round((startSec + defaultNewDurationSec) * 1000) / 1000;

  const newSeg: SrtSegment = {
    id: `srt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    index: clampedIdx + 1,
    startSec,
    endSec,
    text: '請輸入此時間區段要顯示的文字內容...',
  };

  // 將插入點之後的所有既有段落往後順延 defaultNewDurationSec 秒
  for (let j = clampedIdx; j < list.length; j++) {
    const seg = list[j];
    const dur = Math.max(0.5, seg.endSec - seg.startSec);
    const nextStart = Math.round((seg.startSec + defaultNewDurationSec) * 1000) / 1000;
    list[j] = {
      ...seg,
      startSec: nextStart,
      endSec: Math.round((nextStart + dur) * 1000) / 1000,
    };
  }

  list.splice(clampedIdx, 0, newSeg);
  return reindexSegments(list);
}
