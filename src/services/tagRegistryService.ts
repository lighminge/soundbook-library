import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { AudioItem, AudioTag } from '../types';
import { getDbInstance } from './storageService';

const LOCAL_AUDIO_TAGS_KEY = 'soundbook_audio_tags_v1';
export const AUDIO_TAGS_CHANGED_EVENT = 'soundbook-audio-tags-changed';

function readLocal(): AudioTag[] {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIO_TAGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => t && t.id && t.name) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: AudioTag[]) {
  try {
    localStorage.setItem(LOCAL_AUDIO_TAGS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function notifyChanged(list: AudioTag[]) {
  try {
    window.dispatchEvent(new CustomEvent(AUDIO_TAGS_CHANGED_EVENT, { detail: list }));
  } catch {
    // ignore
  }
}

function sortTags(list: AudioTag[]): AudioTag[] {
  return [...list].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0) ||
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
}

function makeTag(name: string, order: number): AudioTag {
  const now = new Date().toISOString();
  return {
    id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim().slice(0, 50),
    order,
    createdAt: now,
    updatedAt: now,
  };
}

async function persistTag(tag: AudioTag) {
  const db = getDbInstance();
  if (!db) return;
  try {
    await setDoc(doc(db, 'audioTags', tag.id), tag);
  } catch (e) {
    console.warn('儲存類別標籤至 Firestore 失敗，已保存在本機:', e);
  }
}

/** 收集所有語音檔目前已使用的類別標籤（依首次出現順序） */
function collectUsedTags(audioItems: AudioItem[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  audioItems.forEach((a) =>
    (a.tags || []).forEach((t) => {
      const clean = (t || '').trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    })
  );
  return result;
}

/**
 * 載入類別標籤名冊（雲端 Firestore + 本機），並自動補登錄語音檔上已使用、但尚未登錄的標籤。
 * 不會自行加入使用者沒有登錄或使用過的預設標籤。
 */
export async function loadAudioTags(audioItems: AudioItem[]): Promise<AudioTag[]> {
  const local = readLocal();
  let remote: AudioTag[] = [];
  let remoteOk = false;
  const db = getDbInstance();
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'audioTags'));
      remote = snap.docs.map((d) => d.data() as AudioTag).filter((t) => t && t.id && t.name);
      remoteOk = true;
    } catch (e) {
      console.warn('從 Firestore 讀取類別標籤失敗，使用本機名冊:', e);
    }
  }

  // 以名稱合併（雲端優先），並移除重複名稱的多餘文件
  const byName = new Map<string, AudioTag>();
  const duplicateIds: string[] = [];
  [...sortTags(remote), ...sortTags(local)].forEach((t) => {
    const key = t.name.trim();
    if (!key) return;
    if (byName.has(key)) {
      if (byName.get(key)!.id !== t.id && remote.some((r) => r.id === t.id)) duplicateIds.push(t.id);
      return;
    }
    byName.set(key, { ...t, name: key });
  });
  let list = sortTags(Array.from(byName.values()));
  const toPersist: AudioTag[] = [];

  const usedTags = collectUsedTags(audioItems);

  // 補登錄語音檔上已使用但尚未登錄的標籤（皆為使用者曾經輸入過並設定於語音檔的標籤）
  usedTags.forEach((name) => {
    if (byName.has(name)) return;
    const maxOrder = list.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
    const tag = makeTag(name, maxOrder + 1);
    list.push(tag);
    byName.set(name, tag);
    toPersist.push(tag);
  });

  list = sortTags(list);
  writeLocal(list);

  if (db) {
    // 雲端缺少的本機標籤一併補上
    const remoteIds = new Set(remote.map((r) => r.id));
    list.forEach((t) => {
      if (!remoteIds.has(t.id) && !toPersist.includes(t)) toPersist.push(t);
    });
    duplicateIds.forEach((id) => deleteDoc(doc(db, 'audioTags', id)).catch(() => {}));
  }
  await Promise.all(toPersist.map((t) => persistTag(t)));
  return list;
}

/** 新增類別標籤（名稱重複時直接回傳既有名冊） */
export async function addAudioTag(name: string, currentList: AudioTag[]): Promise<AudioTag[]> {
  const clean = name.trim().slice(0, 50);
  if (!clean || currentList.some((t) => t.name === clean)) return currentList;
  const maxOrder = currentList.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
  const tag = makeTag(clean, maxOrder + 1);
  const next = sortTags([...currentList, tag]);
  writeLocal(next);
  notifyChanged(next);
  await persistTag(tag);
  return next;
}

/** 一次新增多個類別標籤 */
export async function addAudioTags(names: string[], currentList: AudioTag[]): Promise<AudioTag[]> {
  let next = currentList;
  for (const n of names) {
    next = await addAudioTag(n, next);
  }
  return next;
}

/** 修改類別標籤名稱 */
export async function renameAudioTag(
  tagId: string,
  newName: string,
  currentList: AudioTag[]
): Promise<AudioTag[]> {
  const clean = newName.trim().slice(0, 50);
  const target = currentList.find((t) => t.id === tagId);
  if (!target || !clean) return currentList;
  const updated: AudioTag = { ...target, name: clean, updatedAt: new Date().toISOString() };
  const next = sortTags(currentList.map((t) => (t.id === tagId ? updated : t)));
  writeLocal(next);
  notifyChanged(next);
  await persistTag(updated);
  return next;
}

/** 刪除類別標籤 */
export async function deleteAudioTag(tagId: string, currentList: AudioTag[]): Promise<AudioTag[]> {
  const next = currentList.filter((t) => t.id !== tagId);
  writeLocal(next);
  notifyChanged(next);
  const db = getDbInstance();
  if (db) {
    try {
      await deleteDoc(doc(db, 'audioTags', tagId));
    } catch (e) {
      console.warn('Firestore 刪除類別標籤失敗:', e);
    }
  }
  return next;
}

/** 依傳入順序重新儲存類別標籤排序 */
export async function saveAudioTagsOrder(orderedList: AudioTag[]): Promise<AudioTag[]> {
  const now = new Date().toISOString();
  const next = orderedList.map((t, idx) =>
    t.order === idx ? t : { ...t, order: idx, updatedAt: now }
  );
  const changed = next.filter((t, idx) => orderedList[idx].order !== idx);
  writeLocal(next);
  notifyChanged(next);
  await Promise.all(changed.map((t) => persistTag(t)));
  return next;
}
