import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Mic,
  Square,
  Edit3,
  Trash2,
  Play,
  Plus,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  HardDrive,
  Clock,
  FolderOpen,
  X,
  AlertTriangle,
  Loader2,
  FileUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  SlidersHorizontal,
  ArrowUpDown,
  Search,
  Tag,
  Tags,
  Scale,
} from 'lucide-react';
import { AudioItem, AudioTag, Category, PlaybackSlide, Speaker } from '../types';
import {
  getAudioFileDuration,
  uploadFileToGoogleDrive,
  fetchAudioBlobFromGoogleDrive,
  deleteFilesFromGoogleDrive,
  extractDriveFileIdFromSlide,
  extractDriveFileIdFromCover,
  extractDriveFileIdFromUrl,
  renameFileInGoogleDrive,
  loadSavedSpeakers,
  saveSavedSpeaker,
} from '../services/storageService';
import { usePlayableAudioUrl } from '../utils/mediaCache';
import {
  loadAudioTags,
  addAudioTag,
  AUDIO_TAGS_CHANGED_EVENT,
} from '../services/tagRegistryService';
import {
  getAudioInputAccept,
  isSupportedAudioFile,
  normalizeAudioFile,
  getAudioItemCallNumberMap,
} from '../utils/audioFileUtils';
import {
  SrtSegment,
  parseSrtContent,
  serializeSrtSegments,
  createSampleSrtSegments,
  secondsToSrtTime,
  srtTimeToSeconds,
  updateSegmentAndCascade,
  insertSegmentAt,
  reindexSegments,
  batchModifySegments,
  getCaptionForSegmentRange,
  syncSlidesWithSrtSegments,
  sortSlidesBySegmentRange,
} from '../utils/srtUtils';
import { formatDuration } from './DashboardView';

interface AudioLibraryViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  editingItem: AudioItem | null;
  defaultUploadCategoryId?: string;
  onSaveAudioItem: (item: AudioItem) => Promise<void>;
  onDeleteAudioItem: (itemId: string) => Promise<{
    deletedOnDrive: boolean;
    deletedCount: number;
    message?: string;
  }>;
  onPlayInScreeningRoom: (item: AudioItem) => void;
  onClearEditing: () => void;
}

const DEFAULT_COVER_IMAGES = [
  'https://images.unsplash.com/photo-1507842229356-51c61504d3ab?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=800&q=80',
];

export const AudioLibraryView: React.FC<AudioLibraryViewProps> = ({
  categories,
  audioItems,
  editingItem,
  defaultUploadCategoryId,
  onSaveAudioItem,
  onDeleteAudioItem,
  onPlayInScreeningRoom,
  onClearEditing,
}) => {
  // 決定目前開啟的分頁：'list' (館藏列表與上傳) 或 'editor' (編輯/新建語音檔詳細設定)
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'editor'>('list');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');

  // 上傳進度狀態
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 手機/電腦麥克風即時錄音狀態
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // 編輯器基本表單狀態 (包含原始 createdAt / fileSize / mimeType 以確保自動儲存至 Firebase 完整無誤)
  const [formId, setFormId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>(
    defaultUploadCategoryId || categories[0]?.id || 'cat_literature'
  );
  const [description, setDescription] = useState<string>('');
  const [duration, setDuration] = useState<number>(20);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioDriveFileId, setAudioDriveFileId] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string>(DEFAULT_COVER_IMAGES[0]);
  const [coverImageDriveId, setCoverImageDriveId] = useState<string>('');
  const [itemCreatedAt, setItemCreatedAt] = useState<string>('');
  const [itemFileSize, setItemFileSize] = useState<number | undefined>(undefined);
  const [itemMimeType, setItemMimeType] = useState<string | undefined>(undefined);
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [speaker, setSpeaker] = useState<string>('');

  // 主講人名冊狀態與行內新增主講人狀態
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [isAddingNewSpeaker, setIsAddingNewSpeaker] = useState<boolean>(false);
  const [inlineNewSpeakerName, setInlineNewSpeakerName] = useState<string>('');

  // 類別標籤設定（與館藏資料管理同步共用類別標籤名冊，不自行加入未登錄的標籤）
  const [audioTags, setAudioTags] = useState<AudioTag[]>([]);
  const availableQuickTags = useMemo(() => audioTags.map((t) => t.name), [audioTags]);
  const [customEditorTagInput, setCustomEditorTagInput] = useState<string>('');

  useEffect(() => {
    let alive = true;
    loadAudioTags(audioItems)
      .then((list) => {
        if (alive) setAudioTags(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [audioItems]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AudioTag[]>).detail;
      if (Array.isArray(detail)) setAudioTags(detail);
    };
    window.addEventListener(AUDIO_TAGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUDIO_TAGS_CHANGED_EVENT, handler);
  }, []);

  // ============================================================================
  // 區塊 3：播放時的文字顯示 (SRT 結構化時間區段編輯器 + 批次修改時間區段 + 播放秒數即時同步)
  // ============================================================================
  const [srtSegments, setSrtSegments] = useState<SrtSegment[]>([]);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editSegStartSec, setEditSegStartSec] = useState<number>(0);
  const [editSegEndSec, setEditSegEndSec] = useState<number>(5);
  const [editSegStartSrt, setEditSegStartSrt] = useState<string>('00:00:00,000');
  const [editSegEndSrt, setEditSegEndSrt] = useState<string>('00:00:05,000');
  const [editSegText, setEditSegText] = useState<string>('');

  // 編輯器內語音播放秒數與 SRT 時間區段自動切換同步狀態
  const editorAudioRef = useRef<HTMLAudioElement | null>(null);
  const srtListContainerRef = useRef<HTMLDivElement | null>(null);
  const srtSegmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [editorCurrentTime, setEditorCurrentTime] = useState<number>(0);
  const [isEditorPlaying, setIsEditorPlaying] = useState<boolean>(false);
  const [autoFollowSrt, setAutoFollowSrt] = useState<boolean>(true);

  // 「批次修改時間區段」Modal 狀態
  const [showBatchTimeModal, setShowBatchTimeModal] = useState<boolean>(false);
  const [batchMode, setBatchMode] = useState<'add' | 'subtract' | 'insert_gap'>('add');
  const [batchSeconds, setBatchSeconds] = useState<number>(2);

  // 「刪除所有時間區段」確認視窗 Modal 狀態
  const [showDeleteAllSegmentsModal, setShowDeleteAllSegmentsModal] = useState<boolean>(false);

  // ============================================================================
  // 區塊 4：播放時的圖片顯示
  // (1a: 先選取圖片 -> 再選取起迄 SRT 時間區段範圍；1b: 新增後立即寫入 Firebase；1c: 圖說文字即為 SRT 內容)
  // ============================================================================
  const [slides, setSlides] = useState<PlaybackSlide[]>([]);
  const [pendingSlideFile, setPendingSlideFile] = useState<File | null>(null);
  const [pendingSlidePreviewUrl, setPendingSlidePreviewUrl] = useState<string>('');
  const [newSlideUrlInput, setNewSlideUrlInput] = useState<string>('');
  const [newSlideStartSegIdx, setNewSlideStartSegIdx] = useState<number>(1);
  const [newSlideEndSegIdx, setNewSlideEndSegIdx] = useState<number>(1);

  // 單筆播放圖片的「修改」模式狀態
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editSlideStartSegIdx, setEditSlideStartSegIdx] = useState<number>(1);
  const [editSlideEndSegIdx, setEditSlideEndSegIdx] = useState<number>(1);
  const [editSlideImageUrl, setEditSlideImageUrl] = useState<string>('');
  const [editSlideImageDriveId, setEditSlideImageDriveId] = useState<string | undefined>(
    undefined
  );
  const [editSlideFileName, setEditSlideFileName] = useState<string>('');
  const [isRenamingSlide, setIsRenamingSlide] = useState<boolean>(false);
  const lastSyncedTitleRef = useRef<string>('');

  // 單筆播放圖片的「刪除確認視窗」狀態
  const [slidePendingDelete, setSlidePendingDelete] = useState<{
    slide: PlaybackSlide;
    seqNumber: number;
  } | null>(null);
  const [isDeletingSlide, setIsDeletingSlide] = useState(false);

  // 播放圖片列表「分頁」狀態 (以 5 的倍數選取)
  const [slidePageSize, setSlidePageSize] = useState<number>(5);
  const [slideCurrentPage, setSlideCurrentPage] = useState<number>(1);

  // 「語音檔案編輯與館藏管理」查詢狀態 (語音檔案名稱、類別標籤、說明內容)
  const [audioSearchTitle, setAudioSearchTitle] = useState('');
  const [audioSearchTag, setAudioSearchTag] = useState('');
  const [audioSearchDesc, setAudioSearchDesc] = useState('');

  // 「語音檔案編輯與館藏管理」清單排序狀態 (依檔案名稱、上傳日期、館藏分類；由小到大、由大到小)
  const [audioSortBy, setAudioSortBy] = useState<'title' | 'createdAt' | 'category'>('title');
  const [audioSortOrder, setAudioSortOrder] = useState<'asc' | 'desc'>('asc');

  // 「語音檔案編輯與館藏管理」清單分頁狀態 (以 10 的倍數選取)
  const [audioListPageSize, setAudioListPageSize] = useState<number>(10);
  const [audioListPage, setAudioListPage] = useState<number>(1);

  // 依據「館藏分類編號 + 流水號 (號碼從 1 開始，依語音檔案上傳順序)」建立每筆語音檔之獨立編號
  const audioCallNumberMap = useMemo(
    () => getAudioItemCallNumberMap(audioItems, categories),
    [audioItems, categories]
  );

  // 圖書館風格「刪除整筆語音館藏確認視窗」狀態
  const [itemPendingDelete, setItemPendingDelete] = useState<AudioItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // 即時儲存狀態指示器 ('idle' | 'saving' | 'saved')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('saved');
  const autoSaveTimerRef = useRef<number | null>(null);

  // 將編輯器中的 Google Drive 語音檔自動解析為瀏覽器 100% 可直接播放的 Blob/Data URL
  const { playableUrl: playableEditorAudioUrl, isLoadingAudio: isEditorAudioLoading } =
    usePlayableAudioUrl(audioUrl, audioDriveFileId, fetchAudioBlobFromGoogleDrive, formId);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string, durationMs = 4000) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), durationMs);
  };

  // 當離開語音檔案庫頁面時，清除 editingItem，確保下次再回到語音檔案庫時畫面為首頁
  useEffect(() => {
    return () => {
      onClearEditing?.();
    };
  }, [onClearEditing]);

  // 當外部傳入 editingItem 時，自動載入至編輯器
  useEffect(() => {
    if (editingItem) {
      loadItemIntoEditor(editingItem);
      setActiveSubTab('editor');
    }
  }, [editingItem]);

  useEffect(() => {
    if (defaultUploadCategoryId) {
      setCategoryId(defaultUploadCategoryId);
    }
  }, [defaultUploadCategoryId]);

  // 主講人名冊載入與自動統計既有語音檔中的主講人
  useEffect(() => {
    let isMounted = true;
    loadSavedSpeakers().then((saved) => {
      if (!isMounted) return;
      const usedSpeakers = new Set<string>();
      audioItems.forEach((a) => {
        if (a.speaker && a.speaker.trim()) {
          usedSpeakers.add(a.speaker.trim());
        }
      });

      const existingNames = new Set(saved.map((s) => s.name.trim()));
      const newlyDiscovered: Speaker[] = [];
      const now = new Date().toISOString();
      usedSpeakers.forEach((name) => {
        if (!existingNames.has(name)) {
          newlyDiscovered.push({
            id: `speaker_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

      const byName = new Map<string, Speaker>();
      [...saved, ...newlyDiscovered].forEach((sp) => {
        const clean = sp.name.trim();
        if (clean && !byName.has(clean)) {
          byName.set(clean, { ...sp, name: clean });
        }
      });
      const combined = Array.from(byName.values());
      setSpeakers(combined);
      newlyDiscovered.forEach((sp) => saveSavedSpeaker(sp).catch(() => {}));
    });
    return () => {
      isMounted = false;
    };
  }, [audioItems]);

  /**
   * 取得目前已設定的播放圖片所佔用的所有 SRT 時間區段序號集合
   */
  const getUsedSegmentIndicesSet = (currentSlides: PlaybackSlide[]): Set<number> => {
    const used = new Set<number>();
    for (const sl of currentSlides) {
      const s = sl.startSegmentIndex || 1;
      const e = sl.endSegmentIndex || s;
      const low = Math.min(s, e);
      const high = Math.max(s, e);
      for (let idx = low; idx <= high; idx++) {
        used.add(idx);
      }
    }
    return used;
  };

  /**
   * 找出目前尚未被任何圖片選取使用的 SRT 時間區段中，序號最小的那一個
   */
  const getSmallestUnusedSegmentIndex = (
    segments: SrtSegment[],
    currentSlides: PlaybackSlide[]
  ): number => {
    if (segments.length === 0) return 1;
    const used = getUsedSegmentIndicesSet(currentSlides);
    for (const seg of segments) {
      if (!used.has(seg.index)) {
        return seg.index;
      }
    }
    // 若所有時間區段都已被選取使用，則預設選取最後一個區段（或第 1 區段）
    return segments[segments.length - 1]?.index || 1;
  };

  // 當 SRT 時間區段或已設定的圖片清單變動時，步驟 2 自動選取「尚未被選取的時間區段中最小的那一個」
  useEffect(() => {
    const smallestUnused = getSmallestUnusedSegmentIndex(srtSegments, slides);
    setNewSlideStartSegIdx(smallestUnused);
    setNewSlideEndSegIdx(smallestUnused);
  }, [srtSegments, slides]);

  // 依據目前語音播放秒數，自動計算當前對應的單一 SRT 時間區段（一次只顯示一個時間區段）
  const activePlayingSrtSegment = useMemo(() => {
    if (srtSegments.length === 0) return null;
    if (editingSegmentId) {
      const editingSeg = srtSegments.find((s) => s.id === editingSegmentId);
      if (editingSeg) return editingSeg;
    }
    const exactMatch = srtSegments.find(
      (seg) => editorCurrentTime >= seg.startSec && editorCurrentTime < seg.endSec
    );
    if (exactMatch) return exactMatch;
    const inclusiveMatch = srtSegments.find(
      (seg) => editorCurrentTime >= seg.startSec && editorCurrentTime <= seg.endSec
    );
    if (inclusiveMatch) return inclusiveMatch;
    const previousSeg = [...srtSegments]
      .reverse()
      .find((seg) => editorCurrentTime >= seg.startSec);
    return previousSeg || srtSegments[0];
  }, [srtSegments, editorCurrentTime, editingSegmentId]);

  // 當播放秒數進入新的 SRT 時間區段時，自動在下方完整清單捲動切換至該區段
  useEffect(() => {
    if (!autoFollowSrt || !activePlayingSrtSegment || editingSegmentId) return;
    if (!isEditorPlaying && editorCurrentTime <= 0) return;
    const container = srtListContainerRef.current;
    const targetEl = srtSegmentRefs.current[activePlayingSrtSegment.id];
    if (container && targetEl) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
      const desiredScrollTop = Math.max(
        0,
        relativeTop - container.clientHeight / 2 + targetRect.height / 2
      );
      container.scrollTo({
        top: desiredScrollTop,
        behavior: 'smooth',
      });
    }
  }, [activePlayingSrtSegment?.id, autoFollowSrt, editingSegmentId, isEditorPlaying, editorCurrentTime]);

  // 同步定位語音播放秒數至指定 SRT 區段（可選擇是否同時開始播放）
  const handleSeekToSegment = (seg: SrtSegment, autoPlay = false) => {
    const audioEl = editorAudioRef.current;
    setEditorCurrentTime(seg.startSec);
    if (audioEl) {
      audioEl.currentTime = seg.startSec;
      if (autoPlay) {
        audioEl.play().catch(() => {});
      }
    }
  };

  // 點擊任一 SRT 區段跳轉語音播放秒數並開始播放
  const handleSeekAndPlaySegment = (seg: SrtSegment) => {
    handleSeekToSegment(seg, true);
  };

  const loadItemIntoEditor = (item: AudioItem) => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setFormId(item.id);
    setTitle(item.title);
    lastSyncedTitleRef.current = item.title;
    setCategoryId(item.categoryId);
    setDescription(item.description);
    setDuration(item.duration);
    setAudioUrl(item.audioUrl);
    setAudioDriveFileId(item.audioDriveFileId || '');
    setCoverImageUrl(item.coverImageUrl);
    setCoverImageDriveId(item.coverImageDriveId || '');
    setItemCreatedAt(item.createdAt || new Date().toISOString());
    setItemFileSize(item.fileSize);
    setItemMimeType(item.mimeType);
    setItemTags(item.tags || []);
    setCustomEditorTagInput('');
    setSpeaker(item.speaker || '');
    setIsAddingNewSpeaker(false);
    setInlineNewSpeakerName('');
    setAutoSaveStatus('saved');

    const parsedSegments = parseSrtContent(
      item.playbackDisplay.textContent || '',
      item.duration || 20
    );
    const initialSegments =
      parsedSegments.length > 0 ? parsedSegments : createSampleSrtSegments(item.title);
    setSrtSegments(initialSegments);
    setEditingSegmentId(null);
    setEditorCurrentTime(0);
    setIsEditorPlaying(false);

    const syncedSlides = sortSlidesBySegmentRange(
      syncSlidesWithSrtSegments(
        item.playbackDisplay.slides || [],
        initialSegments
      )
    );
    setSlides(syncedSlides);
    setEditingSlideId(null);
    setSlideCurrentPage(1);
    setPendingSlideFile(null);
    setPendingSlidePreviewUrl('');
    setNewSlideUrlInput('');

    const smallestUnused = getSmallestUnusedSegmentIndex(initialSegments, syncedSlides);
    setNewSlideStartSegIdx(smallestUnused);
    setNewSlideEndSegIdx(smallestUnused);
  };

  /**
   * 立即將目前編輯器中的變更寫入 Firebase Firestore (每個區域單獨修改後皆即時儲存)
   */
  const autoPersistToFirebase = async (
    overrideSegments?: SrtSegment[],
    overrideSlides?: PlaybackSlide[],
    overrideCoverUrl?: string,
    overrideCoverDriveId?: string,
    overrideAudioUrl?: string,
    overrideAudioDriveId?: string,
    overrideDuration?: number,
    overrideMeta?: {
      title?: string;
      categoryId?: string;
      description?: string;
      speaker?: string;
      tags?: string[];
    }
  ) => {
    if (!formId) return;
    setAutoSaveStatus('saving');
    const finalSegments = overrideSegments ?? srtSegments;
    const finalSlides = syncSlidesWithSrtSegments(
      overrideSlides ?? slides,
      finalSegments
    );
    const finalTitle = (overrideMeta?.title ?? title).trim() || '未命名語音館藏';
    const finalCategoryId = overrideMeta?.categoryId ?? categoryId;
    const finalDescription = (overrideMeta?.description ?? description).trim();
    const finalSpeaker =
      overrideMeta?.speaker !== undefined
        ? overrideMeta.speaker
        : speaker;
    const finalTags =
      overrideMeta?.tags !== undefined
        ? overrideMeta.tags
        : itemTags;

    const itemToSave: AudioItem = {
      id: formId,
      title: finalTitle,
      categoryId: finalCategoryId,
      description: finalDescription,
      ...(finalSpeaker?.trim() ? { speaker: finalSpeaker.trim() } : {}),
      ...(finalTags.length > 0 ? { tags: finalTags } : {}),
      duration: overrideDuration ?? (Number(duration) || 20),
      ...(itemFileSize !== undefined ? { fileSize: itemFileSize } : {}),
      ...(itemMimeType ? { mimeType: itemMimeType } : {}),
      ...(overrideAudioDriveId ?? audioDriveFileId
        ? { audioDriveFileId: overrideAudioDriveId ?? audioDriveFileId }
        : {}),
      audioUrl: overrideAudioUrl ?? audioUrl,
      ...(overrideCoverDriveId !== undefined
        ? (overrideCoverDriveId ? { coverImageDriveId: overrideCoverDriveId } : {})
        : (overrideCoverUrl !== undefined
            ? (extractDriveFileIdFromCover(overrideCoverUrl) ? { coverImageDriveId: extractDriveFileIdFromCover(overrideCoverUrl)! } : {})
            : (coverImageDriveId ? { coverImageDriveId } : {}))),
      coverImageUrl: (overrideCoverUrl ?? coverImageUrl) || DEFAULT_COVER_IMAGES[0],
      playbackDisplay: {
        textContent: serializeSrtSegments(finalSegments),
        slides: finalSlides,
      },
      createdAt: itemCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveAudioItem(itemToSave);
    setAutoSaveStatus('saved');
  };

  /**
   * 在「編輯語音檔」更換主講人（立即自動儲存至 Firebase）
   */
  const handleSpeakerChange = async (newVal: string) => {
    if (newVal === '__ACTION_ADD__') {
      setIsAddingNewSpeaker(true);
      setInlineNewSpeakerName('');
      return;
    }
    const targetSpeaker = newVal.trim();
    setSpeaker(targetSpeaker);
    setIsAddingNewSpeaker(false);
    await autoPersistToFirebase(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { speaker: targetSpeaker }
    );
    showToast(
      targetSpeaker
        ? `✅ 已指定主講人為「${targetSpeaker}」！`
        : '✅ 已清除此語音檔的主講人指定！'
    );
  };

  /**
   * 在「編輯語音檔」快速建立新主講人並直接指定給當前語音檔
   */
  const handleAddNewSpeakerInline = async () => {
    const trimmed = inlineNewSpeakerName.trim();
    if (!trimmed) {
      showToast('⚠️ 請輸入主講人姓名');
      return;
    }

    // 檢查名冊中是否已有相同姓名
    const existing = speakers.find(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (existing) {
      setSpeaker(existing.name);
      setIsAddingNewSpeaker(false);
      setInlineNewSpeakerName('');
      await autoPersistToFirebase(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { speaker: existing.name }
      );
      showToast(`✅ 已選取現有主講人「${existing.name}」！`);
      return;
    }

    // 建立新主講人
    const now = new Date().toISOString();
    const newSp: Speaker = {
      id: `speaker_${Date.now()}`,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await saveSavedSpeaker(newSp);
      const updatedSpeakers = [...speakers, newSp];
      setSpeakers(updatedSpeakers);
      setSpeaker(trimmed);
      setIsAddingNewSpeaker(false);
      setInlineNewSpeakerName('');
      await autoPersistToFirebase(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { speaker: trimmed }
      );
      showToast(`✅ 已建立新主講人並指派「${trimmed}」！`);
    } catch (e) {
      console.error('儲存新主講人失敗:', e);
      showToast('❌ 儲存主講人失敗，請稍候重試');
    }
  };

  /**
   * 在「編輯語音檔」點選或取消某個類別標籤（立即自動儲存至 Firebase）
   */
  const handleToggleEditorTag = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const exists = itemTags.includes(trimmed);
    const nextTags = exists
      ? itemTags.filter((t) => t !== trimmed)
      : [...itemTags, trimmed];
    setItemTags(nextTags);
    await autoPersistToFirebase(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { tags: nextTags }
    );
    showToast(
      exists
        ? `ℹ️ 已取消標記類別標籤「${trimmed}」`
        : `✅ 已標記類別標籤「${trimmed}」！`
    );
  };

  /**
   * 在「編輯語音檔」新增自訂類別標籤並自動登錄至類別標籤名冊與當前語音檔
   */
  const handleAddCustomEditorTag = async () => {
    const trimmed = customEditorTagInput.trim().replace(/^#/, '');
    if (!trimmed) {
      showToast('⚠️ 請先輸入要新增的類別標籤名稱');
      return;
    }
    if (!availableQuickTags.includes(trimmed)) {
      addAudioTag(trimmed, audioTags)
        .then((list) => setAudioTags(list))
        .catch(() => {});
    }
    const nextTags = itemTags.includes(trimmed) ? itemTags : [...itemTags, trimmed];
    setItemTags(nextTags);
    setCustomEditorTagInput('');
    await autoPersistToFirebase(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { tags: nextTags }
    );
    showToast(`✅ 已新增並標記類別標籤「${trimmed}」！`);
  };

  /**
   * 當使用者在區塊 1 (標題/說明) 或區塊 2 (封面圖網址) 輸入時，防抖動 (600ms) 自動即時儲存至 Firebase
   */
  const scheduleMetaAutoSave = (
    nextMeta: {
      title?: string;
      categoryId?: string;
      description?: string;
      coverImageUrl?: string;
    }
  ) => {
    if (!formId) return;
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoPersistToFirebase(
        undefined,
        undefined,
        nextMeta.coverImageUrl,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          title: nextMeta.title,
          categoryId: nextMeta.categoryId,
          description: nextMeta.description,
        }
      );
    }, 600);
  };

  /**
   * 啟動某一個 SRT 時間區段的「修改」模式
   */
  const startEditSrtSegment = (seg: SrtSegment) => {
    if (editorAudioRef.current && !editorAudioRef.current.paused) {
      editorAudioRef.current.pause();
    }
    setEditorCurrentTime(seg.startSec);
    if (editorAudioRef.current) {
      editorAudioRef.current.currentTime = seg.startSec;
    }
    setEditingSegmentId(seg.id);
    setEditSegStartSec(seg.startSec);
    setEditSegEndSec(seg.endSec);
    setEditSegStartSrt(secondsToSrtTime(seg.startSec));
    setEditSegEndSrt(secondsToSrtTime(seg.endSec));
    setEditSegText(seg.text);
  };

  /**
   * 確認儲存某一個 SRT 時間區段的修改，同步修改受影響的所有時間區段，並自動同步圖片圖說文字與時間至 Firebase
   */
  const confirmEditSrtSegment = async (targetIdx: number) => {
    const oldSeg = srtSegments[targetIdx];
    if (!oldSeg) return;

    const prevSegChanged =
      targetIdx > 0 && Number(editSegStartSec) !== oldSeg.startSec;

    const { updatedSegments, deltaSec } = updateSegmentAndCascade(
      srtSegments,
      targetIdx,
      editSegStartSec,
      editSegEndSec,
      editSegText
    );

    const syncedSlides = syncSlidesWithSrtSegments(slides, updatedSegments);
    setSrtSegments(updatedSegments);
    setSlides(syncedSlides);
    setEditingSegmentId(null);

    const updatedTarget = updatedSegments[targetIdx];
    if (updatedTarget) {
      setEditorCurrentTime(updatedTarget.startSec);
      if (editorAudioRef.current && editorAudioRef.current.paused) {
        editorAudioRef.current.currentTime = updatedTarget.startSec;
      }
    }

    await autoPersistToFirebase(updatedSegments, syncedSlides);

    const affectedAfterCount = deltaSec !== 0 ? Math.max(0, updatedSegments.length - 1 - targetIdx) : 0;
    const totalAffected = affectedAfterCount + (prevSegChanged ? 1 : 0);
    if (totalAffected > 0) {
      showToast(
        `✅ 已更新第 #${targetIdx + 1} 區段與圖說文字，並已同步修改受影響的 ${totalAffected} 個時間區段${
          deltaSec !== 0 ? `（後方推移 ${deltaSec > 0 ? `+${deltaSec}` : deltaSec} 秒）` : ''
        }，已同步儲存至 Firebase！`
      );
    } else {
      showToast(`✅ 已更新第 #${targetIdx + 1} 時間區段與對應圖說文字，並已儲存至 Firebase！`);
    }
  };

  /**
   * 執行「批次修改時間區段」（全部增加 xx 秒 / 全部減少 xx 秒 / 每個時間區段中間加入 xx 秒空白）
   */
  const handleConfirmBatchModify = async () => {
    const val = Number(batchSeconds) || 0;
    if (val <= 0) {
      showToast('請輸入大於 0 的秒數！');
      return;
    }

    const updatedSegments = batchModifySegments(srtSegments, batchMode, val);
    const syncedSlides = syncSlidesWithSrtSegments(slides, updatedSegments);

    setSrtSegments(updatedSegments);
    setSlides(syncedSlides);
    setShowBatchTimeModal(false);

    await autoPersistToFirebase(updatedSegments, syncedSlides);

    const modeDesc =
      batchMode === 'add'
        ? `全部區段增加 ${val} 秒`
        : batchMode === 'subtract'
        ? `全部區段減少 ${val} 秒`
        : `在每個時間區段中間加入 ${val} 秒空白`;

    showToast(`✅ 已完成批次修改（${modeDesc}），並已同步更新圖片區段與儲存至 Firebase！`);
  };

  /**
   * 在任一指定區段位置新增一個 SRT 時間段落
   */
  const handleInsertSrtAt = async (insertIndex: number) => {
    const nextSegments = insertSegmentAt(srtSegments, insertIndex, 5);
    const syncedSlides = syncSlidesWithSrtSegments(slides, nextSegments);
    setSrtSegments(nextSegments);
    setSlides(syncedSlides);
    const created = nextSegments[insertIndex];
    if (created) {
      startEditSrtSegment(created);
    }
    await autoPersistToFirebase(nextSegments, syncedSlides);
    showToast(`✅ 已於第 #${insertIndex + 1} 區段插入新時間段落，後方區段已自動順延！`);
  };

  /**
   * 刪除某一個 SRT 時間區段
   */
  const handleDeleteSrtSegment = async (targetIdx: number) => {
    const seg = srtSegments[targetIdx];
    if (!seg) return;
    const remaining = reindexSegments(srtSegments.filter((_, i) => i !== targetIdx));
    const syncedSlides = syncSlidesWithSrtSegments(slides, remaining);
    setSrtSegments(remaining);
    setSlides(syncedSlides);
    if (editingSegmentId === seg.id) {
      setEditingSegmentId(null);
    }
    await autoPersistToFirebase(remaining, syncedSlides);
    showToast(`已移除第 #${targetIdx + 1} 時間區段，並已同步更新至 Firebase。`);
  };

  /**
   * 確認一次刪除所有 SRT 時間區段，並即時同步儲存至 Firebase
   */
  const handleConfirmDeleteAllSegments = async () => {
    const count = srtSegments.length;
    const syncedSlides = syncSlidesWithSrtSegments(slides, []);
    setSrtSegments([]);
    setSlides(syncedSlides);
    setEditingSegmentId(null);
    setNewSlideStartSegIdx(1);
    setNewSlideEndSegIdx(1);
    setShowDeleteAllSegmentsModal(false);

    await autoPersistToFirebase([], syncedSlides);
    showToast(`✅ 已刪除全部 ${count} 個時間區段，並已即時同步儲存至 Firebase！`);
  };

  /**
   * 匯入使用者電腦/手機中的 .srt 字幕檔案
   * (2a: 匯入 SRT 檔案的內容後，每個時間區段的文字內容，就是圖說文字裡要顯示的內容)
   */
  const handleImportSrtFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || '');
      const parsed = parseSrtContent(content, duration);
      if (parsed.length === 0) {
        showToast('⚠️ 無法從檔案中解析出有效的 SRT 段落，請檢查檔案內容格式。');
        return;
      }
      const syncedSlides = syncSlidesWithSrtSegments(slides, parsed);
      setSrtSegments(parsed);
      setSlides(syncedSlides);
      setEditingSegmentId(null);
      const smallestUnused = getSmallestUnusedSegmentIndex(parsed, syncedSlides);
      setNewSlideStartSegIdx(smallestUnused);
      setNewSlideEndSegIdx(smallestUnused);

      await autoPersistToFirebase(parsed, syncedSlides);
      showToast(
        `✅ 成功匯入 SRT 檔案「${file.name}」（共 ${parsed.length} 個時間區段），已同步帶入圖說文字並儲存至 Firebase！`
      );
    };
    reader.readAsText(file, 'utf-8');
  };

  /**
   * 自動平均時間區段：
   * 依據匯入/現有的 SRT 時間區段數量，將語音檔總時長「平均分給所有時段」，
   * 讓每個時段秒數一致；如無法整除，把多餘的秒數分配給最後一個時間區段。
   */
  const handleAutoDistributeSrtTimes = async () => {
    if (srtSegments.length === 0) {
      showToast('⚠️ 目前尚無任何時間區段，請先匯入 SRT 或新增時間區段！');
      return;
    }

    const totalSec = Math.round(Number(duration) || 0);
    if (totalSec <= 0) {
      showToast('⚠️ 語音檔總時長為 0，請確認語音檔案是否已正確載入！');
      return;
    }

    const count = srtSegments.length;
    // 每個時段基礎秒數（整數商）
    const perSegSec = Math.max(1, Math.floor(totalSec / count));
    const remainder = Math.max(0, totalSec - perSegSec * count);

    const updatedSegments: SrtSegment[] = srtSegments.map((seg, idx) => {
      const startSec = idx * perSegSec;
      // 若為最後一個時間區段，承接剩餘秒數（含整除餘數），確保總長度與語音檔一致
      const isLast = idx === count - 1;
      const endSec = isLast ? Math.max(startSec + perSegSec, totalSec) : (idx + 1) * perSegSec;

      return {
        ...seg,
        index: idx + 1,
        startSec,
        endSec,
      };
    });

    const syncedSlides = syncSlidesWithSrtSegments(slides, updatedSegments);
    setSrtSegments(updatedSegments);
    setSlides(syncedSlides);
    if (editingSegmentId) {
      setEditingSegmentId(null);
    }

    await autoPersistToFirebase(updatedSegments, syncedSlides);

    if (remainder > 0) {
      showToast(
        `✅ 已自動平均時間區段！總時長 ${totalSec} 秒平均分給 ${count} 個時段：第 1~${count - 1} 段各 ${perSegSec} 秒，多餘的 ${remainder} 秒分配給最後第 #${count} 區段（共 ${perSegSec + remainder} 秒）。`
      );
    } else {
      showToast(
        `✅ 已自動平均時間區段！總時長 ${totalSec} 秒平均分給 ${count} 個時段，每個時段均為 ${perSegSec} 秒。`
      );
    }
  };

  /**
   * 處理電腦或手機選取語音檔案上傳至 Google 雲端硬碟
   */
  const handleAudioFileUpload = async (rawFile: File) => {
    if (!isSupportedAudioFile(rawFile)) {
      showToast(
        `⚠️ 「${rawFile.name}」不是支援的語音檔格式，請選取 MP3 / M4A / WAV / AAC / OGG 等語音檔。`
      );
      return;
    }
    const file = normalizeAudioFile(rawFile);
    setIsUploading(true);
    setUploadProgress(5);
    setUploadStatusText(`準備上傳語音檔：${file.name}`);

    try {
      const [uploadRes, detectedDuration] = await Promise.all([
        uploadFileToGoogleDrive(file, (pct, text) => {
          setUploadProgress(pct);
          setUploadStatusText(text);
        }),
        getAudioFileDuration(file),
      ]);

      // 未真正寫入 Google 雲端硬碟時，不建立館藏資料，避免出現「顯示成功但雲端沒有檔案」的情況
      if (uploadRes.mode !== 'google_drive') {
        showToast(
          `❌ 語音檔「${file.name}」未能上傳至 Google 雲端硬碟，系統未建立此筆資料。原因：${
            uploadRes.errorReason || '尚未完成雲端硬碟連線設定'
          }`,
          10000
        );
        return;
      }

      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const randomCover =
        DEFAULT_COVER_IMAGES[Math.floor(Math.random() * DEFAULT_COVER_IMAGES.length)];
      const sampleSegments = createSampleSrtSegments(cleanName);
      const firstRange = getCaptionForSegmentRange(sampleSegments, 1, 1);

      const newItem: AudioItem = {
        id: `audio_${Date.now()}`,
        title: cleanName,
        categoryId:
          defaultUploadCategoryId || categoryId || categories[0]?.id || 'cat_literature',
        description: `由裝置上傳之語音檔案（原始檔名：${file.name}）`,
        duration: detectedDuration,
        fileSize: file.size,
        mimeType: file.type || 'audio/mpeg',
        audioDriveFileId: uploadRes.fileId,
        audioUrl: uploadRes.directUrl,
        coverImageUrl: randomCover,
        playbackDisplay: {
          textContent: serializeSrtSegments(sampleSegments),
          slides: [
            {
              id: `slide_${Date.now()}`,
              imageUrl: randomCover,
              caption: firstRange.caption,
              timestampSec: firstRange.startSec,
              endTimestampSec: firstRange.endSec,
              startSegmentIndex: 1,
              endSegmentIndex: 1,
            },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveAudioItem(newItem);
      loadItemIntoEditor(newItem);
      setActiveSubTab('editor');
      showToast(
        uploadRes.savedToRootFolder
          ? '✅ 語音檔已寫入 Google 雲端硬碟（注意：尚未設定資料夾 ID，檔案位於「我的雲端硬碟」根目錄）與 Firebase！'
          : '✅ 語音檔已成功寫入您的 Google 雲端硬碟資料夾與 Firebase！現在可設定 SRT 時間段落與播放圖片。',
        6000
      );
    } catch (err: any) {
      console.error('上傳語音檔失敗:', err);
      showToast(`❌ 上傳發生錯誤：${err?.message || '請確認檔案格式與網路連線'}`, 10000);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 手機 / 電腦直接麥克風錄音並轉成語音檔上傳
   */
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        // iPhone Safari 的 MediaRecorder 產生 audio/mp4（AAC），其他瀏覽器多為 audio/webm
        const recMime = (recorder.mimeType || 'audio/webm').split(';')[0];
        const recExt = recMime.includes('mp4') ? 'm4a' : recMime.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordedChunksRef.current, { type: recMime });
        const file = new File(
          [blob],
          `現場錄音_${new Date()
            .toLocaleTimeString('zh-TW', { hour12: false })
            .replace(/:/g, '-')}.${recExt}`,
          { type: recMime }
        );
        await handleAudioFileUpload(file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      alert(
        '無法啟動麥克風錄音，請確認瀏覽器已授權麥克風權限，或直接使用「選取語音檔案上傳」。'
      );
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  /**
   * 編輯器內：更換語音檔案本身
   */
  const handleReplaceAudioInEditor = async (rawFile: File) => {
    if (!isSupportedAudioFile(rawFile)) {
      showToast(
        `⚠️ 「${rawFile.name}」不是支援的語音檔格式，請選取 MP3 / M4A / WAV / AAC / OGG 等語音檔。`
      );
      return;
    }
    const oldAudioDriveId = audioDriveFileId || extractDriveFileIdFromUrl(audioUrl);
    const file = normalizeAudioFile(rawFile);
    setIsUploading(true);
    try {
      const [uploadRes, detectedDuration] = await Promise.all([
        uploadFileToGoogleDrive(file, (pct, text) => {
          setUploadProgress(pct);
          setUploadStatusText(text);
        }),
        getAudioFileDuration(file),
      ]);
      if (uploadRes.mode !== 'google_drive') {
        showToast(
          `❌ 替換語音檔未能上傳至 Google 雲端硬碟，已保留原本的語音檔。原因：${
            uploadRes.errorReason || '尚未完成雲端硬碟連線設定'
          }`,
          10000
        );
        return;
      }
      setAudioUrl(uploadRes.directUrl);
      setAudioDriveFileId(uploadRes.fileId);
      setDuration(detectedDuration);
      await autoPersistToFirebase(
        srtSegments,
        slides,
        coverImageUrl,
        coverImageDriveId,
        uploadRes.directUrl,
        uploadRes.fileId,
        detectedDuration
      );

      // 若有舊的 Google Drive 語音檔，且未被其他地方共用，自動清理舊檔
      let deletedOldMsg = '';
      if (
        oldAudioDriveId &&
        oldAudioDriveId !== uploadRes.fileId &&
        !oldAudioDriveId.startsWith('demo_') &&
        !oldAudioDriveId.startsWith('gdrive_local_')
      ) {
        const stillUsed =
          coverImageDriveId === oldAudioDriveId ||
          slides.some((s) => extractDriveFileIdFromSlide(s) === oldAudioDriveId);
        if (!stillUsed) {
          try {
            const delRes = await deleteFilesFromGoogleDrive([oldAudioDriveId]);
            if (delRes.deletedOnDrive) {
              deletedOldMsg = '（已自動刪除雲端硬碟舊語音檔）';
            }
          } catch {
            /* ignore */
          }
        }
      }

      showToast(`✅ 已更新語音檔案${deletedOldMsg}，並同步儲存至 Google 雲端硬碟與 Firebase！`);
    } catch (err: any) {
      console.error('替換語音檔失敗:', err);
      showToast(`❌ 替換語音檔失敗：${err?.message || '請確認檔案格式與網路連線'}`, 10000);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 編輯器內：修改/更換「封面圖」至 Google 雲端硬碟並同步儲存至 Firebase，自動刪除舊封面檔案
   */
  const handleCoverImageUpload = async (file: File) => {
    // 記錄更換前的舊 Google 雲端硬碟封面 ID
    const oldDriveFileId = extractDriveFileIdFromCover(coverImageUrl, coverImageDriveId);

    setIsUploading(true);
    setUploadProgress(5);
    setUploadStatusText(
      oldDriveFileId
        ? '正在上傳新封面圖片至 Google 雲端硬碟...'
        : '正在上傳封面圖片至 Google 雲端硬碟...'
    );
    try {
      const res = await uploadFileToGoogleDrive(file, (pct, text) => {
        setUploadProgress(pct);
        setUploadStatusText(text);
      });

      const newDriveId = res.fileId;
      const newCoverUrl = res.directUrl;

      setCoverImageUrl(newCoverUrl);
      setCoverImageDriveId(newDriveId);

      // 1. 同步儲存至 Firebase Firestore
      await autoPersistToFirebase(
        srtSegments,
        slides,
        newCoverUrl,
        newDriveId
      );

      // 2. 若原本有舊的 Google 雲端硬碟封面檔案，且不同於新檔案，且未被目前語音檔或播放圖片共用，自動從雲端硬碟刪除舊封面
      let deletedOldMsg = '';
      if (oldDriveFileId && oldDriveFileId !== newDriveId) {
        const stillUsedElsewhere =
          audioDriveFileId === oldDriveFileId ||
          slides.some((s) => extractDriveFileIdFromSlide(s) === oldDriveFileId);

        if (!stillUsedElsewhere) {
          try {
            setUploadStatusText('正在清理 Google 雲端硬碟中的舊封面圖片...');
            const delRes = await deleteFilesFromGoogleDrive([oldDriveFileId]);
            if (delRes.deletedOnDrive) {
              deletedOldMsg = '（已自動刪除雲端硬碟舊封面檔案）';
            }
          } catch (delErr) {
            console.warn('自動刪除雲端硬碟舊封面失敗 (非致命):', delErr);
          }
        }
      }

      showToast(`✅ 封面圖片已成功修改${deletedOldMsg}，並同步儲存至雲端硬碟與 Firebase！`);
    } catch (err: any) {
      console.error('修改封面圖片失敗:', err);
      showToast(`❌ 修改封面圖片失敗：${err?.message || '請確認檔案格式與網路連線'}`, 10000);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 取得單筆播放圖片的「使用圖片檔案名稱」（若尚未設定則自動給予定義檔名）
   */
  const getSlideDisplayFileName = (sl: PlaybackSlide, seqNumber = 1): string => {
    if (sl.imageFileName && sl.imageFileName.trim()) {
      return sl.imageFileName.trim();
    }
    const driveId = extractDriveFileIdFromSlide(sl);
    if (driveId) {
      return `${title || '播放圖片'}_圖片_${seqNumber}.jpg`;
    }
    try {
      const cleanPath = (sl.imageUrl || '').split('?')[0];
      const lastSeg = cleanPath.split('/').pop() || '';
      if (lastSeg && /\.[a-zA-Z0-9]{2,5}$/.test(lastSeg)) {
        return decodeURIComponent(lastSeg);
      }
    } catch {
      // ignore URI decode error
    }
    return `${title || '播放圖片'}_圖片_${seqNumber}.jpg`;
  };

  /**
   * 1a, 1b, 1c：使用者先選取好要上傳的圖片，再選取起迄 SRT 時間區段範圍後，
   * 點擊確認按鈕：上傳圖片至 Google 雲端硬碟 + 自動帶入 SRT 區段文字作為圖說 + 立即儲存至 Firebase！
   */
  const handleConfirmAddSlideWithRange = async () => {
    if (!pendingSlideFile && !newSlideUrlInput.trim()) {
      showToast('請先在「步驟 1」選取要上傳的圖片檔案（或輸入圖片網址）！');
      return;
    }

    const rangeInfo = getCaptionForSegmentRange(
      srtSegments,
      newSlideStartSegIdx,
      newSlideEndSegIdx
    );

    setIsUploading(true);
    try {
      let finalImageUrl = newSlideUrlInput.trim();
      let finalImageDriveId: string | undefined = undefined;
      let finalImageFileName = pendingSlideFile
        ? pendingSlideFile.name
        : `${title || '播放圖片'}_圖片_${slides.length + 1}.jpg`;

      if (pendingSlideFile) {
        const res = await uploadFileToGoogleDrive(pendingSlideFile, (pct, text) => {
          setUploadProgress(pct);
          setUploadStatusText(text);
        });
        finalImageUrl = res.directUrl;
        finalImageDriveId = res.fileId;
      }

      const newSlide: PlaybackSlide = {
        id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        ...(finalImageDriveId ? { imageDriveId: finalImageDriveId } : {}),
        imageFileName: finalImageFileName,
        imageUrl: finalImageUrl,
        caption: rangeInfo.caption || title || '播放展示圖片',
        timestampSec: rangeInfo.startSec,
        endTimestampSec: rangeInfo.endSec,
        startSegmentIndex: rangeInfo.startIdx,
        endSegmentIndex: rangeInfo.endIdx,
      };

      const nextSlides = sortSlidesBySegmentRange([...slides, newSlide]);
      setSlides(nextSlides);

      // 清理暫存選取的圖片
      if (pendingSlidePreviewUrl) URL.revokeObjectURL(pendingSlidePreviewUrl);
      setPendingSlideFile(null);
      setPendingSlidePreviewUrl('');
      setNewSlideUrlInput('');

      // 1b: 立即將新增的圖片與時間區段設定寫入 Firebase Firestore！
      await autoPersistToFirebase(srtSegments, nextSlides);

      showToast(
        `✅ 圖片「${finalImageFileName}」已上傳至雲端硬碟，並已綁定 SRT 區段 #${rangeInfo.startIdx} ~ #${rangeInfo.endIdx} 同步儲存至 Firebase！`
      );
    } catch (err) {
      console.error('儲存播放圖片至 Firebase 失敗:', err);
      showToast('⚠️ 儲存播放圖片時發生錯誤，請再試一次。');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 啟動單筆「播放時圖片」的修改模式（包含顯示與修改「使用圖片的檔案名稱」）
   */
  const startEditSlide = (sl: PlaybackSlide, seqNumber = 1) => {
    setEditingSlideId(sl.id);
    setEditSlideImageUrl(sl.imageUrl);
    setEditSlideImageDriveId(sl.imageDriveId);
    setEditSlideFileName(getSlideDisplayFileName(sl, seqNumber));

    const sIdx = sl.startSegmentIndex || 1;
    const eIdx = sl.endSegmentIndex || sIdx;
    setEditSlideStartSegIdx(Math.min(Math.max(1, sIdx), Math.max(1, srtSegments.length)));
    setEditSlideEndSegIdx(Math.min(Math.max(sIdx, eIdx), Math.max(1, srtSegments.length)));
  };

  /**
   * 儲存單筆「播放時圖片」的修改（立即更新畫面與 Firebase，並在背景同步 Google 雲端硬碟檔案名稱，完全不需等待！）
   */
  const confirmEditSlide = async (slideId: string, seqNumber = 1) => {
    const targetSlide = slides.find((s) => s.id === slideId);
    if (!targetSlide) return;

    const rangeInfo = getCaptionForSegmentRange(
      srtSegments,
      editSlideStartSegIdx,
      editSlideEndSegIdx
    );

    const oldFileName = getSlideDisplayFileName(targetSlide, seqNumber);
    const requestedFileName = editSlideFileName.trim() || oldFileName;
    const candidateDriveId =
      editSlideImageDriveId || extractDriveFileIdFromSlide(targetSlide);
    const initialDriveId = editSlideImageDriveId ?? targetSlide.imageDriveId;
    const initialImageUrl = editSlideImageUrl.trim() || targetSlide.imageUrl;

    // 步驟 1：立即更新前端清單並寫入 Firebase（0.1 秒內極速完成，不阻塞畫面）
    const immediateSlides = sortSlidesBySegmentRange(
      slides.map((sl) =>
        sl.id === slideId
          ? {
              ...sl,
              imageUrl: initialImageUrl,
              imageFileName: requestedFileName,
              ...(initialDriveId ? { imageDriveId: initialDriveId } : {}),
              timestampSec: rangeInfo.startSec,
              endTimestampSec: rangeInfo.endSec,
              startSegmentIndex: rangeInfo.startIdx,
              endSegmentIndex: rangeInfo.endIdx,
              caption: rangeInfo.caption || sl.caption,
            }
          : sl
      )
    );

    setSlides(immediateSlides);
    setEditingSlideId(null);
    await autoPersistToFirebase(srtSegments, immediateSlides);

    // 步驟 2：若綁定了雲端硬碟檔案，在背景非同步同步修改 Google 雲端硬碟中的圖片檔案名稱
    if (candidateDriveId && requestedFileName) {
      showToast(
        `✅ 已更新圖片檔名「${requestedFileName}」與時間區段（#${rangeInfo.startIdx} ~ #${rangeInfo.endIdx}），雲端硬碟檔名正在背景同步...`
      );
      setIsRenamingSlide(true);
      renameFileInGoogleDrive(candidateDriveId, requestedFileName, {
        fallbackUrl: initialImageUrl,
        mimeType: 'image/jpeg',
        isAudio: false,
      })
        .then(async (renameRes) => {
          if (
            renameRes.renamedOnDrive &&
            renameRes.finalFileName &&
            renameRes.finalFileName !== requestedFileName
          ) {
            // 雲端硬碟自動補上副檔名時，同步更新系統中顯示的圖片檔名
            const driveSyncedSlides = immediateSlides.map((sl) =>
              sl.id === slideId
                ? { ...sl, imageFileName: renameRes.finalFileName }
                : sl
            );
            setSlides(driveSyncedSlides);
            await autoPersistToFirebase(srtSegments, driveSyncedSlides);
          }
          if (renameRes.renamedOnDrive) {
            showToast(
              `✅ Google 雲端硬碟圖片檔案名稱已同步更新為「${renameRes.finalFileName}」！`
            );
          } else if (renameRes.message) {
            showToast(`⚠️ ${renameRes.message}`, 10000);
          }
        })
        .finally(() => {
          setIsRenamingSlide(false);
        });
    } else {
      showToast(
        `✅ 已更新圖片檔案名稱「${requestedFileName}」與時間區段（#${rangeInfo.startIdx} ~ #${rangeInfo.endIdx}）並同步儲存至 Firebase！`
      );
    }
  };

  /**
   * 在單筆播放圖片的「修改」模式中重新上傳圖片
   */
  const handleReplaceSlideImageInEdit = async (file: File) => {
    setIsUploading(true);
    try {
      const res = await uploadFileToGoogleDrive(file, (pct, text) => {
        setUploadProgress(pct);
        setUploadStatusText(text);
      });
      setEditSlideImageUrl(res.directUrl);
      setEditSlideImageDriveId(res.fileId);
      setEditSlideFileName(file.name);
      showToast(`已上傳新圖片「${file.name}」，請點擊「確認修改」完成套用！`);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 根據圖片綁定的起迄 SRT 區段顯示範圍標籤
   */
  const formatSlideRangeBadge = (sl: PlaybackSlide): string => {
    const sIdx = sl.startSegmentIndex || 1;
    const eIdx = sl.endSegmentIndex || sIdx;
    const endSec = sl.endTimestampSec ?? sl.timestampSec + 5;
    if (sIdx === eIdx) {
      return `SRT 區段 #${sIdx} [${secondsToSrtTime(sl.timestampSec)} --> ${secondsToSrtTime(
        endSec
      )}]`;
    }
    return `SRT 區段 #${sIdx} ~ #${eIdx} [${secondsToSrtTime(
      sl.timestampSec
    )} --> ${secondsToSrtTime(endSec)}]`;
  };

  // 「語音檔案編輯與館藏管理」可用的類別標籤（含該分類下的筆數統計）
  const availableAudioTags = useMemo(() => {
    const tagCountMap = new Map<string, number>();
    for (const item of audioItems) {
      if (filterCategoryId !== 'all' && item.categoryId !== filterCategoryId) {
        continue;
      }
      if (item.tags && Array.isArray(item.tags)) {
        for (const t of item.tags) {
          const clean = (t || '').trim();
          if (clean) {
            tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
          }
        }
      }
    }
    return Array.from(tagCountMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hant'));
  }, [audioItems, filterCategoryId]);

  // 若切換分類後，原先選取的類別標籤已不存在，自動重置
  useEffect(() => {
    if (audioSearchTag && !availableAudioTags.some((t) => t.tag === audioSearchTag)) {
      setAudioSearchTag('');
    }
  }, [availableAudioTags, audioSearchTag]);

  // 依所選分類與查詢條件（語音檔案名稱、館藏分類、類別標籤、說明內容）過濾語音檔案
  const filteredAudioList = audioItems.filter((item) => {
    // 1. 館藏分類
    const matchCategory =
      filterCategoryId === 'all' || item.categoryId === filterCategoryId;

    // 2. 語音檔案名稱
    const qTitle = audioSearchTitle.trim().toLowerCase();
    const matchTitle = !qTitle || (item.title || '').toLowerCase().includes(qTitle);

    // 3. 類別標籤 (下拉選單選取)
    const qTag = audioSearchTag.trim().toLowerCase();
    const itemTags = item.tags || [];
    const matchTag =
      !qTag || itemTags.some((tag) => (tag || '').toLowerCase().includes(qTag));

    // 4. 說明內容
    const qDesc = audioSearchDesc.trim().toLowerCase();
    const matchDesc = !qDesc || (item.description || '').toLowerCase().includes(qDesc);

    return matchCategory && matchTitle && matchTag && matchDesc;
  });

  // 「語音檔案編輯與館藏管理」排序計算：依檔案名稱、上傳日期、館藏分類；由小到大、由大到小
  const sortedAudioList = useMemo(() => {
    return [...filteredAudioList].sort((a, b) => {
      let cmp = 0;
      if (audioSortBy === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      } else if (audioSortBy === 'createdAt') {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        cmp = timeA - timeB;
      } else if (audioSortBy === 'category') {
        const catA = categories.find((c) => c.id === a.categoryId);
        const catB = categories.find((c) => c.id === b.categoryId);
        const labelA = catA ? `${catA.code} ${catA.name}` : a.categoryId;
        const labelB = catB ? `${catB.code} ${catB.name}` : b.categoryId;
        cmp = labelA.localeCompare(labelB, 'zh-Hant');
      }

      if (cmp === 0) {
        cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      }

      return audioSortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredAudioList, audioSortBy, audioSortOrder, categories]);

  // 「語音檔案編輯與館藏管理」分頁計算 (以 10 的倍數選取)
  const totalAudioCount = sortedAudioList.length;
  const totalAudioPages = Math.max(1, Math.ceil(totalAudioCount / audioListPageSize));
  const safeAudioPage = Math.min(audioListPage, totalAudioPages);
  const audioStartIndex = (safeAudioPage - 1) * audioListPageSize;
  const paginatedAudioList = sortedAudioList.slice(
    audioStartIndex,
    audioStartIndex + audioListPageSize
  );

  // 當分類篩選、查詢關鍵字、類別標籤、排序條件或每頁筆數變更時，自動回到第 1 頁
  useEffect(() => {
    setAudioListPage(1);
  }, [
    filterCategoryId,
    audioSearchTitle,
    audioSearchTag,
    audioSearchDesc,
    audioSortBy,
    audioSortOrder,
    audioListPageSize,
  ]);

  // 依「時間區段」由小到大排序播放展示圖片清單 (PlaybackSlide[])
  const sortedSlides = useMemo(() => sortSlidesBySegmentRange(slides), [slides]);

  // 播放圖片分頁計算 (以 5 的倍數分頁，嚴格依時間區段由小到大排序呈現)
  const totalSlidesCount = sortedSlides.length;
  const totalSlidePages = Math.max(1, Math.ceil(totalSlidesCount / slidePageSize));
  const safeSlidePage = Math.min(slideCurrentPage, totalSlidePages);
  const slideStartIndex = (safeSlidePage - 1) * slidePageSize;
  const paginatedSlides = sortedSlides.slice(slideStartIndex, slideStartIndex + slidePageSize);

  // 目前在「新增圖片」面板中所選取起迄 SRT 區段的自動預覽圖說文字
  const previewNewSlideRange = getCaptionForSegmentRange(
    srtSegments,
    newSlideStartSegIdx,
    newSlideEndSegIdx
  );

  // 目前在「修改圖片」面板中所選取起迄 SRT 區段的自動預覽圖說文字
  const previewEditSlideRange = getCaptionForSegmentRange(
    srtSegments,
    editSlideStartSegIdx,
    editSlideEndSegIdx
  );

  // 計算目前已被圖片選取使用的 SRT 區段集合，以及尚未被選取的最小區段序號
  const usedSegmentIndicesSet = getUsedSegmentIndicesSet(slides);
  const smallestUnusedSegIdx = getSmallestUnusedSegmentIndex(srtSegments, slides);
  const hasUnusedSegment = srtSegments.some((seg) => !usedSegmentIndicesSet.has(seg.index));

  return (
    <div className="space-y-6 pb-12">
      {/* 儲存成功提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#2E5A44] text-white shadow-2xl border border-emerald-400/30 animate-bounce max-w-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 2b. 固定於當前畫面正中央的上傳檔案進度條視窗 Modal */}
      {isUploading && (
        <div className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full p-6 border-2 border-[#8B5A2B] shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#8B5A2B]/15 border border-[#8B5A2B]/30 flex items-center justify-center shrink-0">
                <HardDrive className="w-6 h-6 animate-spin text-[#8B5A2B]" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold font-serif-tc text-base text-[#2C221E]">
                  雲端檔案上傳與同步中
                </h4>
                <p className="text-xs text-[#6E5D4F] truncate mt-0.5">
                  {uploadStatusText || '正在上傳檔案至 Google 雲端硬碟...'}
                </p>
              </div>
              <span className="font-mono text-lg font-bold text-[#8B5A2B] shrink-0">
                {uploadProgress}%
              </span>
            </div>

            <div className="w-full h-3.5 rounded-full bg-[#E5D9C5] overflow-hidden p-0.5 border border-[#D5C5AE]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8B5A2B] to-[#2E5A44] transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>

            <p className="text-[11px] text-center text-[#7A6855]">
              請稍候，上傳完成後系統將自動即時儲存至雲端硬碟與 Firebase 資料庫
            </p>
          </div>
        </div>
      )}

      {/* 頂部切換列：館藏管理 & 上傳 vs 語音檔案詳細編輯器 */}
      <div className="parchment-card rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif-tc text-[#2C221E]">
            語音檔案庫 (Audio Library & Studio)
          </h2>
          <p className="text-xs text-[#7A6855] mt-0.5">
            支援電腦或手機上傳語音檔案至 Google 雲端硬碟，並以標準 SRT 時間區段編輯播放文字與圖片
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => {
              onClearEditing();
              setActiveSubTab('list');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'list'
                ? 'bg-[#3A2518] text-white shadow-sm'
                : 'bg-[#EFE6D5] text-[#5C3A1B] hover:bg-[#E2D4BC]'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>語音上傳與館藏清單 ({audioItems.length})</span>
          </button>

          {formId && (
            <button
              onClick={() => setActiveSubTab('editor')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'editor'
                  ? 'bg-[#8B5A2B] text-white shadow-sm'
                  : 'bg-[#EFE6D5] text-[#5C3A1B] hover:bg-[#E2D4BC]'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span>正在編輯：{title || '語音館藏'}</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'list' ? (
        <div className="space-y-8">
          {/* 功能 b-(1)：語音檔案上傳區 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 parchment-card rounded-2xl p-6 shadow-md border-2 border-dashed border-[#C8B294] hover:border-[#8B5A2B] transition flex flex-col justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#8B5A2B]/15 text-[#8B5A2B] text-xs font-semibold">
                  <Upload className="w-3.5 h-3.5" />
                  <span>(1) 語音檔案上傳 · 支援電腦與手機跨裝置</span>
                </div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  上傳語音檔案至系統 Google 雲端硬碟
                </h3>
                <p className="text-xs text-[#6E5D4F] leading-relaxed">
                  您可以先選擇要歸檔的「圖書館分類」，接著點擊下方按鈕從電腦或手機選取語音檔（支援 MP3, WAV, M4A, AAC, OGG, WebM），上傳完成後將自動開啟編輯器讓您設定封面圖、SRT 時間段落與播放圖片。
                </p>
              </div>

              <div className="my-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="text-xs font-semibold text-[#5C3A1B] shrink-0">
                  預先指定館藏分類：
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-white text-sm font-medium text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      [{cat.code}] {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="w-full py-8 px-4 rounded-xl bg-[#FAF4E8] hover:bg-[#F3E9D6] border border-[#DFCEB4] flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center">
                <div className="w-12 h-12 rounded-full bg-[#8B5A2B] text-white flex items-center justify-center shadow-md">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-bold font-serif-tc text-base text-[#2C221E]">
                  點擊從電腦或手機選取語音檔案上傳
                </span>
                <span className="text-xs text-[#7A6855]">
                  支援 MP3 / M4A / WAV / AAC / OGG（iPhone 可從「檔案」App、錄音備忘錄匯出的錄音檔直接選取）
                </span>
                <input
                  type="file"
                  accept={getAudioInputAccept()}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioFileUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* 手機 / 電腦即時錄音上傳卡 */}
            <div className="lg:col-span-4 parchment-card rounded-2xl p-6 shadow-md flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#2E5A44]/15 text-[#2E5A44] text-xs font-semibold">
                  <Mic className="w-3.5 h-3.5" />
                  <span>行動端快速收錄</span>
                </div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  手機 / 電腦直接錄音上傳
                </h3>
                <p className="text-xs text-[#6E5D4F] leading-relaxed">
                  除了上傳現有音檔外，您也可以直接使用手機或電腦麥克風錄製口述故事或語音筆記，錄製完成後自動上傳至雲端硬碟並進入圖文編輯器。
                </p>
              </div>

              <div className="p-5 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] flex flex-col items-center justify-center gap-3">
                {isRecording ? (
                  <>
                    <div className="flex items-center gap-2 text-red-600 font-mono text-lg font-bold animate-pulse">
                      <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                      <span>錄音中 {formatDuration(recordingSeconds)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>停止錄音並上傳至雲端硬碟</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="w-full py-3.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>開始現場錄音</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 已上傳語音檔案列表 */}
          <div className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5D9C5] pb-4">
              <div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  (2) 語音檔案編輯與館藏管理
                </h3>
                <p className="text-xs text-[#7A6855]">
                  點擊任一語音檔的「編輯檔名與播放圖文」即可修改檔名、說明內容、封面圖、SRT 時間段落文字與播放圖片
                </p>
              </div>

              {/* 分類過濾 */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setFilterCategoryId('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    filterCategoryId === 'all'
                      ? 'bg-[#3A2518] text-white'
                      : 'bg-[#EFE6D5] text-[#5C3A1B]'
                  }`}
                >
                  全部 ({audioItems.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      filterCategoryId === cat.id
                        ? 'text-white'
                        : 'bg-[#EFE6D5] text-[#5C3A1B]'
                    }`}
                    style={
                      filterCategoryId === cat.id
                        ? { backgroundColor: cat.themeColor }
                        : undefined
                    }
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 查詢功能列：語音檔案名稱、館藏分類、類別標籤、說明內容 */}
            <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#E2D5C1] space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-[#5C3A1B]">
                  <Search className="w-4 h-4 text-[#8B5A2B]" />
                  <span>語音館藏多欄位查詢：</span>
                </div>
                {(audioSearchTitle || audioSearchTag || audioSearchDesc || filterCategoryId !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setAudioSearchTitle('');
                      setAudioSearchTag('');
                      setAudioSearchDesc('');
                      setFilterCategoryId('all');
                    }}
                    className="text-[11px] text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-1 cursor-pointer font-medium bg-[#EFE6D5] hover:bg-[#E5D7C2] px-2 py-0.5 rounded-md transition"
                  >
                    <X className="w-3 h-3" />
                    <span>清空查詢條件</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. 語音檔案名稱查詢 */}
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="查詢語音檔案名稱..."
                    value={audioSearchTitle}
                    onChange={(e) => setAudioSearchTitle(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>

                {/* 2. 館藏分類查詢 (下拉選單) */}
                <div className="relative">
                  <Tags className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={filterCategoryId}
                    onChange={(e) => setFilterCategoryId(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate"
                  >
                    <option value="all">全部分類 (不限)</option>
                    {categories.map((cat) => {
                      const count = audioItems.filter((i) => i.categoryId === cat.id).length;
                      return (
                        <option key={cat.id} value={cat.id}>
                          [{cat.code}] {cat.name} ({count} 筆)
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8B735B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* 3. 類別標籤查詢 (下拉選單) */}
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={audioSearchTag}
                    onChange={(e) => setAudioSearchTag(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate"
                  >
                    <option value="">
                      🏷️ 全部類別標籤 {availableAudioTags.length === 0 ? '(尚無標籤)' : '(不限)'}
                    </option>
                    {availableAudioTags.map(({ tag, count }) => (
                      <option key={tag} value={tag}>
                        🏷️ #{tag} ({count} 筆)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8B735B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* 4. 說明內容查詢 */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="查詢說明內容關鍵字..."
                    value={audioSearchDesc}
                    onChange={(e) => setAudioSearchDesc(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>
              </div>
            </div>

            {/* 排序功能與分頁控制列 (以 10 的倍數選取；依檔案名稱、上傳日期、館藏分類排序) */}
            <div className="p-3.5 rounded-xl bg-[#EFE6D5] border border-[#D8C7AE] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-[#3A2518]">
                <span className="font-bold">
                  共 <strong className="text-[#8B5A2B] font-mono text-sm">{totalAudioCount}</strong> 筆語音檔案
                </span>
                {totalAudioCount > 0 && (
                  <span className="text-[#6E5D4F]">
                    （顯示第{' '}
                    <strong className="font-mono text-[#2C221E]">{audioStartIndex + 1}</strong> -{' '}
                    <strong className="font-mono text-[#2C221E]">
                      {Math.min(audioStartIndex + audioListPageSize, totalAudioCount)}
                    </strong>{' '}
                    筆）
                  </span>
                )}

                {/* 每頁顯示筆數 (以 10 的倍數做選取) */}
                <div className="flex items-center gap-1.5">
                  <label className="font-semibold text-[#5C3A1B]">每頁顯示：</label>
                  <select
                    value={audioListPageSize}
                    onChange={(e) => setAudioListPageSize(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white text-xs font-mono font-bold text-[#2C221E] cursor-pointer"
                  >
                    {[10, 20, 30, 40, 50].map((size) => (
                      <option key={size} value={size}>
                        {size} 筆 / 頁
                      </option>
                    ))}
                  </select>
                </div>

                {/* 排序功能：條件（依檔案名稱、上傳日期、館藏分類）與方向（由小到大、由大到小） */}
                <div className="flex items-center gap-1.5 bg-[#FAF6EE] px-2.5 py-1 rounded-lg border border-[#DFCEB4]">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#8B5A2B]" />
                  <label className="font-semibold text-[#5C3A1B]">排序：</label>
                  <select
                    value={audioSortBy}
                    onChange={(e) => setAudioSortBy(e.target.value as any)}
                    className="px-2 py-0.5 rounded border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer"
                  >
                    <option value="title">依檔案名稱</option>
                    <option value="createdAt">依上傳日期</option>
                    <option value="category">依館藏分類</option>
                  </select>

                  <select
                    value={audioSortOrder}
                    onChange={(e) => setAudioSortOrder(e.target.value as any)}
                    className="px-2 py-0.5 rounded border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer"
                  >
                    <option value="asc">由小到大</option>
                    <option value="desc">由大到小</option>
                  </select>
                </div>
              </div>

              {/* 頁碼切換按鈕 */}
              {totalAudioPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeAudioPage <= 1}
                    onClick={() => setAudioListPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 text-xs font-semibold text-[#3A2518] flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>上一頁</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalAudioPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setAudioListPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                          pageNum === safeAudioPage
                            ? 'bg-[#8B5A2B] text-white shadow-xs'
                            : 'bg-white text-[#5C3A1B] border border-[#D5C5AE] hover:bg-[#FAF4E8]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={safeAudioPage >= totalAudioPages}
                    onClick={() => setAudioListPage((p) => Math.min(totalAudioPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 text-xs font-semibold text-[#3A2518] flex items-center gap-1 cursor-pointer"
                  >
                    <span>下一頁</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedAudioList.length === 0 ? (
                <div className="col-span-full p-8 text-center rounded-xl border border-dashed border-[#D5C5AE] bg-white/60 text-xs text-[#7A6855]">
                  目前查無相符的語音檔案。
                </div>
              ) : (
                paginatedAudioList.map((item, idxInPage) => {
                  const globalSeq = audioStartIndex + idxInPage + 1;
                  const cat = categories.find((c) => c.id === item.categoryId);
                  const callNumber =
                    audioCallNumberMap.get(item.id) || (cat ? `${cat.code}-1` : 'CAT-1');
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 p-4 rounded-xl bg-white border border-[#E2D5C1] hover:border-[#8B5A2B] transition shadow-xs"
                    >
                      {/* 上方：標籤、序號與操作功能按鈕列 (預覽播放、編輯檔名與播放圖文、刪除) */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#F0E6D8]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* 每個語音檔區塊清單序號：依照查詢條件從 1 開始 */}
                          <span
                            className="px-2 py-0.5 rounded bg-[#3A2518] text-white font-mono text-xs font-bold shrink-0"
                            title={`清單序號：第 ${globalSeq} 筆`}
                          >
                            #{globalSeq}
                          </span>
                          {/* 獨立語音檔編號（館藏分類編號 + 上傳順序流水號） */}
                          <span
                            className="px-2 py-0.5 rounded bg-[#FAF4E8] border border-[#D5C5AE] text-[#5C3A1B] font-mono text-xs font-bold shadow-xs shrink-0"
                            title="語音檔獨立編號（館藏分類編號 + 上傳順序流水號）"
                          >
                            {callNumber}
                          </span>
                          {cat && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-semibold text-white shrink-0"
                              style={{ backgroundColor: cat.themeColor }}
                            >
                              [{cat.code}] {cat.name}
                            </span>
                          )}
                          <span className="text-xs font-mono text-[#7A6855] flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration)}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-[#F3ECE0] text-[#6E5641] shrink-0">
                            播放圖片 {item.playbackDisplay.slides.length} 張
                          </span>
                          {item.speaker && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF8EE] text-[#8B5A2B] border border-[#E5D2BA] text-[11px] font-semibold shrink-0"
                              title={`主講人：${item.speaker}`}
                            >
                              <Mic className="w-3 h-3 text-[#8B5A2B]" />
                              <span>{item.speaker}</span>
                            </span>
                          )}
                        </div>

                        {/* 上移的操作按鈕：預覽播放、編輯檔名與播放圖文、刪除 */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                          <button
                            onClick={() => onPlayInScreeningRoom(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#EFE6D5] hover:bg-[#E2D4BC] text-[#3A2518] text-xs font-medium flex items-center gap-1 cursor-pointer transition"
                            title="在放映室播放"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>預覽播放</span>
                          </button>
                          <button
                            onClick={() => {
                              loadItemIntoEditor(item);
                              setActiveSubTab('editor');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>編輯檔名與播放圖文</span>
                          </button>
                          <button
                            onClick={() => setItemPendingDelete(item)}
                            className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                            title="刪除此語音檔與雲端硬碟檔案"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* 下方：封面圖片與可橫向完全伸展的語音檔案名稱與文字說明 */}
                      <div className="flex items-start gap-3.5 min-w-0">
                        <img
                          src={item.coverImageUrl}
                          alt={item.title}
                          className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg object-cover shrink-0 border border-[#D5C5AE] shadow-xs"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* 完整顯示語音檔名稱 (不受按鈕擠壓，橫向寬廣好閱讀) */}
                          <h4 className="font-bold font-serif-tc text-sm sm:text-base text-[#2C221E] break-words break-all leading-snug">
                            {item.title}
                          </h4>
                          {/* 文字說明橫向展開，更容易完整閱讀 */}
                          <p className="text-xs text-[#6E5D4F] leading-relaxed break-words break-all line-clamp-3">
                            {item.description || '（無說明內容）'}
                          </p>
                          {item.tags && item.tags.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {item.tags.map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() =>
                                    setAudioSearchTag((prev) => (prev === t ? '' : t))
                                  }
                                  title={`點擊篩選標籤 #${t}`}
                                  className={`text-[10px] px-2 py-0.5 rounded-md border transition cursor-pointer ${
                                    audioSearchTag === t
                                      ? 'bg-[#8B5A2B] text-white border-[#8B5A2B] font-bold shadow-xs'
                                      : 'bg-[#FAF4E8] text-[#8B5A2B] border-[#E5D9C5] hover:bg-[#EFE6D5]'
                                  }`}
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部翻頁控制列 (頁數大於 1 時呈現) */}
            {totalAudioPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[#E5D9C5] text-xs">
                <span className="text-[#7A6855]">
                  第 <strong>{safeAudioPage}</strong> / <strong>{totalAudioPages}</strong> 頁（共{' '}
                  {totalAudioCount} 筆語音檔）
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeAudioPage <= 1}
                    onClick={() => setAudioListPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>上一頁</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalAudioPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setAudioListPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                          pageNum === safeAudioPage
                            ? 'bg-[#8B5A2B] text-white shadow-xs'
                            : 'bg-white text-[#5C3A1B] border border-[#D5C5AE] hover:bg-[#FAF4E8]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={safeAudioPage >= totalAudioPages}
                    onClick={() => setAudioListPage((p) => Math.min(totalAudioPages, p + 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <span>下一頁</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 功能 b-(2)：語音檔案完整編輯器 (2a: 每個區域修改皆即時儲存，無須儲存全部變更按鈕) */
        <div className="space-y-6">
          <div className="parchment-card rounded-2xl p-6 shadow-lg space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5D9C5] pb-4">
              <div>
                <span className="text-xs font-semibold text-[#8B5A2B] uppercase tracking-wider">
                  AUDIO ITEM EDITOR · 館藏語音全功能編輯器（各區塊獨立即時儲存）
                </span>
                <h3 className="text-xl font-bold font-serif-tc text-[#2C221E] mt-0.5">
                  編輯語音檔：{title || '未命名語音'}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* 即時儲存狀態標章 */}
                <div
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border ${
                    autoSaveStatus === 'saving'
                      ? 'bg-amber-50 text-[#8B5A2B] border-amber-300'
                      : 'bg-emerald-50 text-[#2E5A44] border-emerald-200'
                  }`}
                >
                  {autoSaveStatus === 'saving' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8B5A2B]" />
                      <span>正在即時儲存變更至雲端...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2E5A44]" />
                      <span>所有區塊修改皆已即時儲存</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClearEditing();
                    setActiveSubTab('list');
                  }}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  <span>返回館藏列表</span>
                </button>
              </div>
            </div>

            {/* 第一與第二區塊：基本資訊 & 封面圖 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#8B5A2B] pl-3">
                    1. 語音檔名、分類與說明內容
                  </h4>
                  <span className="text-[11px] text-[#2E5A44] font-medium">
                    ✓ 修改後自動即時儲存
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      語音檔案名稱 / 標題（修改後自動同步雲端硬碟檔案名稱）*
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => {
                        const nextTitle = e.target.value;
                        setTitle(nextTitle);
                        scheduleMetaAutoSave({ title: nextTitle });
                      }}
                      onBlur={async () => {
                        if (autoSaveTimerRef.current) {
                          window.clearTimeout(autoSaveTimerRef.current);
                          autoSaveTimerRef.current = null;
                        }
                        const trimmedTitle = title.trim();
                        await autoPersistToFirebase(
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          { title: trimmedTitle || title }
                        );

                        if (
                          trimmedTitle &&
                          trimmedTitle !== lastSyncedTitleRef.current
                        ) {
                          lastSyncedTitleRef.current = trimmedTitle;
                          renameFileInGoogleDrive(
                            audioDriveFileId,
                            trimmedTitle,
                            {
                              fallbackUrl: audioUrl,
                              mimeType: itemMimeType || 'audio/mpeg',
                              isAudio: true,
                              itemId: formId,
                            }
                          ).then((renameRes) => {
                            // 原位改名不會變更雲端硬碟檔案 ID，無需再覆寫資料
                            if (renameRes.renamedOnDrive) {
                              showToast(
                                `✅ Google 雲端硬碟語音檔案名稱已同步更新為「${renameRes.finalFileName}」！`
                              );
                            } else if (renameRes.message) {
                              // 改名失敗時允許下次離開欄位時再次嘗試同步
                              lastSyncedTitleRef.current = '';
                              showToast(`⚠️ ${renameRes.message}`, 10000);
                            }
                          });
                        }
                      }}
                      placeholder="請輸入語音檔案名稱..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm font-medium focus:outline-none focus:border-[#8B5A2B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      所屬圖書館分類 *
                    </label>
                    <select
                      value={categoryId}
                      onChange={async (e) => {
                        const nextCatId = e.target.value;
                        setCategoryId(nextCatId);
                        await autoPersistToFirebase(
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          { categoryId: nextCatId }
                        );
                        showToast('✅ 已即時更新所屬圖書館分類！');
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm font-medium focus:outline-none focus:border-[#8B5A2B]"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          [{cat.code}] {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    館藏說明內容（顯示於書架卡片與放映室簡介）
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => {
                      const nextDesc = e.target.value;
                      setDescription(nextDesc);
                      scheduleMetaAutoSave({ description: nextDesc });
                    }}
                    onBlur={() => {
                      if (autoSaveTimerRef.current) {
                        window.clearTimeout(autoSaveTimerRef.current);
                        autoSaveTimerRef.current = null;
                      }
                      autoPersistToFirebase(
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        { description }
                      );
                    }}
                    placeholder="輸入這段語音的背景說明、錄製者或摘要介紹..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>

                {/* 音訊預覽與重新上傳音檔 */}
                <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#5C3A1B]">
                      目前綁定語音檔（時長：{formatDuration(duration)}）
                      {isEditorAudioLoading && (
                        <span className="ml-2 text-[#8B5A2B] animate-pulse">
                          正在從雲端硬碟載入音訊串流...
                        </span>
                      )}
                    </span>
                    <label className="px-3 py-1 rounded-lg bg-white border border-[#C8B598] hover:border-[#8B5A2B] text-xs font-medium text-[#5C3A1B] cursor-pointer flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>重新上傳替換語音檔</span>
                      <input
                        type="file"
                        accept={getAudioInputAccept()}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleReplaceAudioInEditor(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <audio
                    ref={editorAudioRef}
                    key={playableEditorAudioUrl}
                    controls
                    src={playableEditorAudioUrl}
                    onTimeUpdate={(e) => setEditorCurrentTime(e.currentTarget.currentTime)}
                    onSeeking={(e) => setEditorCurrentTime(e.currentTarget.currentTime)}
                    onSeeked={(e) => setEditorCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setEditorCurrentTime(e.currentTarget.currentTime)}
                    onPlay={() => setIsEditorPlaying(true)}
                    onPause={() => setIsEditorPlaying(false)}
                    onEnded={() => setIsEditorPlaying(false)}
                    className="w-full h-9"
                  />
                  {srtSegments.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[#5C4938]">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#8B5A2B]" />
                        <span>
                          目前播放秒數：<strong className="font-mono">{formatDuration(editorCurrentTime)}</strong> ({editorCurrentTime.toFixed(1)}s)
                        </span>
                        {activePlayingSrtSegment && (
                          <span className="px-2 py-0.5 rounded-full bg-[#2E5A44] text-white font-semibold">
                            同步對應 SRT 區段 #{activePlayingSrtSegment.index}
                          </span>
                        )}
                      </span>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none font-semibold text-[#2E5A44]">
                        <input
                          type="checkbox"
                          checked={autoFollowSrt}
                          onChange={(e) => setAutoFollowSrt(e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-[#2E5A44] cursor-pointer"
                        />
                        <span>播放時自動切換並捲動至對應 SRT 時間區段</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* 目前綁定語音檔下方：播放時的文字顯示（單一時間區段自動切換 + 語音操作同步 + 修改並同步所有受影響時間區段） */}
                <div className="p-4 rounded-xl bg-[#FAF4E8] border-2 border-[#2E5A44]/35 shadow-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E2D5C1]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold font-serif-tc text-[#2E5A44]">
                        <FileText className="w-4 h-4 text-[#2E5A44]" />
                        <span>播放時的文字顯示</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#2E5A44]/10 text-[#2E5A44] text-[11px] font-semibold">
                        一次顯示單一時間區段 · 隨語音播放與操作即時同步
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2E5A44] text-white font-mono text-xs font-bold shadow-2xs">
                        <Clock className="w-3 h-3 text-amber-300" />
                        <span>
                          目前秒數：{formatDuration(editorCurrentTime)} ({editorCurrentTime.toFixed(1)}s)
                        </span>
                      </span>
                    </div>

                    {srtSegments.length > 0 && activePlayingSrtSegment && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const currentIdx = srtSegments.findIndex(
                            (s) => s.id === activePlayingSrtSegment.id
                          );
                          const prevSeg = currentIdx > 0 ? srtSegments[currentIdx - 1] : null;
                          const nextSeg =
                            currentIdx >= 0 && currentIdx < srtSegments.length - 1
                              ? srtSegments[currentIdx + 1]
                              : null;
                          return (
                            <>
                              <button
                                type="button"
                                disabled={!prevSeg}
                                onClick={() => {
                                  if (prevSeg) {
                                    setEditingSegmentId(null);
                                    handleSeekToSegment(prevSeg, isEditorPlaying);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-white border border-[#C8B598] hover:border-[#2E5A44] text-[#3A2518] disabled:opacity-40 text-xs font-semibold flex items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed"
                                title="切換至上一個時間區段並同步語音位置"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                                <span>上一段</span>
                              </button>

                              <select
                                value={activePlayingSrtSegment.id}
                                onChange={(e) => {
                                  const target = srtSegments.find((s) => s.id === e.target.value);
                                  if (target) {
                                    setEditingSegmentId(null);
                                    handleSeekToSegment(target, isEditorPlaying);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-white border border-[#C8B598] text-xs font-mono font-semibold text-[#3A2518] focus:outline-none focus:border-[#2E5A44]"
                                title="直接選擇任一時間區段並同步語音播放秒數"
                              >
                                {srtSegments.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    #{s.index} ({secondsToSrtTime(s.startSec)} ~{' '}
                                    {secondsToSrtTime(s.endSec)})
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                disabled={!nextSeg}
                                onClick={() => {
                                  if (nextSeg) {
                                    setEditingSegmentId(null);
                                    handleSeekToSegment(nextSeg, isEditorPlaying);
                                  }
                                }}
                                className="px-2 py-1 rounded-lg bg-white border border-[#C8B598] hover:border-[#2E5A44] text-[#3A2518] disabled:opacity-40 text-xs font-semibold flex items-center gap-0.5 cursor-pointer disabled:cursor-not-allowed"
                                title="切換至下一個時間區段並同步語音位置"
                              >
                                <span>下一段</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {srtSegments.length === 0 || !activePlayingSrtSegment ? (
                    <div className="p-5 text-center rounded-xl border border-dashed border-[#D5C5AE] bg-white/70 space-y-2">
                      <p className="text-xs text-[#7A6855]">
                        目前尚無 SRT 時間區段。請於下方匯入 SRT 檔案或直接新增第一個時間區段：
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInsertSrtAt(0)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#2E5A44] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>新增第 #1 個時間區段</span>
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const currentSeg = activePlayingSrtSegment;
                      const currentSegIdx = srtSegments.findIndex((s) => s.id === currentSeg.id);
                      const isEditingCurrent = editingSegmentId === currentSeg.id;

                      return (
                        <div className="rounded-xl bg-white border-2 border-[#2E5A44] p-3.5 shadow-sm space-y-3">
                          {/* 單一時間區段頂部資訊與修改操作列 */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#EFE6D5]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-md bg-[#2E5A44] text-white font-mono text-xs font-bold">
                                #{currentSeg.index} / 共 {srtSegments.length} 段
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  isEditorPlaying
                                    ? 'bg-emerald-600 text-white animate-pulse'
                                    : 'bg-amber-100 text-[#8B5A2B] border border-amber-300'
                                }`}
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>{isEditorPlaying ? '播放自動切換中' : '目前同步時間區段'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSeekAndPlaySegment(currentSeg)}
                                title="點擊從此時間區段起點開始播放語音"
                                className="px-2.5 py-0.5 rounded-md bg-[#2E5A44]/10 hover:bg-[#2E5A44] text-[#2E5A44] hover:text-white font-mono text-xs font-semibold border border-[#2E5A44]/25 transition cursor-pointer flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>
                                  {secondsToSrtTime(currentSeg.startSec)} {'-->'}{' '}
                                  {secondsToSrtTime(currentSeg.endSec)}
                                </span>
                              </button>
                              <span className="text-[11px] text-[#7A6855] font-mono">
                                ({currentSeg.startSec}s ~ {currentSeg.endSec}s)
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#3A2518] text-amber-200 font-mono text-[11px] font-bold">
                                <Clock className="w-3 h-3 text-amber-300" />
                                <span>
                                  目前秒數：{formatDuration(editorCurrentTime)} ({editorCurrentTime.toFixed(1)}s)
                                </span>
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {!isEditingCurrent && (
                                <button
                                  type="button"
                                  onClick={() => startEditSrtSegment(currentSeg)}
                                  className="px-2.5 py-1 rounded-lg bg-[#8B5A2B] hover:bg-[#6E451F] text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-xs"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>修改時間區段</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleInsertSrtAt(currentSegIdx + 1)}
                                className="px-2.5 py-1 rounded-lg bg-[#2E5A44]/15 hover:bg-[#2E5A44] text-[#2E5A44] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                title="在此時間區段後方插入一個新區段，並自動順延後續時間"
                              >
                                <Plus className="w-3 h-3" />
                                <span>在此後新增</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSrtSegment(currentSegIdx)}
                                className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                                title="刪除此時間區段"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* 單一時間區段內容：檢視模式 vs 修改模式 */}
                          {isEditingCurrent ? (
                            <div className="pt-1 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[#F4ECE0] border border-[#E2D5C1]">
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                    起始時間 (秒數 / SRT 格式，修改後同步銜接前段)
                                  </label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.5}
                                      value={editSegStartSec}
                                      onChange={(e) => {
                                        const val = Math.max(0, Number(e.target.value) || 0);
                                        const dur = Math.max(1, editSegEndSec - editSegStartSec);
                                        setEditSegStartSec(val);
                                        setEditSegStartSrt(secondsToSrtTime(val));
                                        if (val >= editSegEndSec) {
                                          setEditSegEndSec(val + dur);
                                          setEditSegEndSrt(secondsToSrtTime(val + dur));
                                        }
                                      }}
                                      className="w-20 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                    />
                                    <span className="text-xs text-[#7A6855]">秒</span>
                                    <input
                                      type="text"
                                      value={editSegStartSrt}
                                      onChange={(e) => {
                                        setEditSegStartSrt(e.target.value);
                                        const parsed = srtTimeToSeconds(e.target.value);
                                        setEditSegStartSec(parsed);
                                      }}
                                      className="flex-1 min-w-0 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                      placeholder="00:00:00,000"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                    結束時間 (修改後自動同步推移所有受影響區段)
                                  </label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0.5}
                                      step={0.5}
                                      value={editSegEndSec}
                                      onChange={(e) => {
                                        const val = Math.max(0.5, Number(e.target.value) || 0);
                                        setEditSegEndSec(val);
                                        setEditSegEndSrt(secondsToSrtTime(val));
                                      }}
                                      className="w-20 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                    />
                                    <span className="text-xs text-[#7A6855]">秒</span>
                                    <input
                                      type="text"
                                      value={editSegEndSrt}
                                      onChange={(e) => {
                                        setEditSegEndSrt(e.target.value);
                                        const parsed = srtTimeToSeconds(e.target.value);
                                        setEditSegEndSec(parsed);
                                      }}
                                      className="flex-1 min-w-0 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                      placeholder="00:00:05,000"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                  本區段文字內容（同時作為對應圖片的「圖說文字」）：
                                </label>
                                <textarea
                                  rows={3}
                                  value={editSegText}
                                  onChange={(e) => setEditSegText(e.target.value)}
                                  className="w-full p-2.5 rounded-lg border border-[#C8B598] bg-white text-sm font-serif-tc focus:outline-none focus:border-[#2E5A44]"
                                  placeholder="請輸入此時間區段要顯示的文字與圖說內容..."
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingSegmentId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer"
                                >
                                  取消
                                </button>
                                <button
                                  type="button"
                                  onClick={() => confirmEditSrtSegment(currentSegIdx)}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>確認修改並同步影響區段</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg bg-[#FAF5EC] border border-[#E2D5C1]">
                              <p className="text-sm sm:text-base text-[#2C1E14] font-serif-tc font-medium leading-relaxed whitespace-pre-wrap">
                                {currentSeg.text || (
                                  <span className="italic text-[#9C8974]">
                                    （此時間區段尚未填寫文字，請點擊右上角「修改時間區段」輸入圖說內容）
                                  </span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>

              {/* 第二區塊：封面圖設定 */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#8B5A2B] pl-3">
                    2. 語音檔案封面圖 (Cover Image)
                  </h4>
                  <span className="text-[11px] text-[#2E5A44] font-medium">
                    ✓ 修改後自動即時儲存
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center p-4 rounded-xl bg-white border border-[#E2D5C1]">
                  <div className="relative group shrink-0">
                    <img
                      src={coverImageUrl}
                      alt="封面預覽"
                      className="w-32 h-40 rounded-lg object-cover shadow-md border border-[#D5C5AE]"
                    />
                    <label className="absolute inset-0 rounded-lg bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition p-2 text-center">
                      <Edit3 className="w-5 h-5 mb-1 text-white" />
                      <span className="text-xs font-semibold">點此更換封面</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleCoverImageUpload(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div className="space-y-3 flex-1 w-full">
                    {/* 雲端硬碟同步狀態 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {extractDriveFileIdFromCover(coverImageUrl, coverImageDriveId) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>已同步 Google 雲端硬碟</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                          <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                          <span>使用預設/外部圖片</span>
                        </span>
                      )}
                    </div>

                    {/* 修改封面圖片按鈕 */}
                    <label className="w-full py-2.5 px-3 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition">
                      <Edit3 className="w-4 h-4" />
                      <span>修改封面圖片（選取新圖更換）</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleCoverImageUpload(f);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <p className="text-[11px] text-[#7A6855] leading-relaxed">
                      💡 說明：點選「修改封面圖片」更換圖片後，系統將自動上傳新圖片並<strong>刪除雲端硬碟舊封面</strong>，避免雲端重複堆積檔案。
                    </p>

                    <div>
                      <label className="block text-[11px] text-[#7A6855] mb-1">
                        或直接貼上封面圖片網址（輸入後自動即時儲存）：
                      </label>
                      <input
                        type="url"
                        value={coverImageUrl}
                        onChange={(e) => {
                          const nextUrl = e.target.value;
                          setCoverImageUrl(nextUrl);
                          scheduleMetaAutoSave({ coverImageUrl: nextUrl });
                        }}
                        onBlur={() => {
                          if (autoSaveTimerRef.current) {
                            window.clearTimeout(autoSaveTimerRef.current);
                            autoSaveTimerRef.current = null;
                          }
                          autoPersistToFirebase(
                            undefined,
                            undefined,
                            coverImageUrl
                          );
                        }}
                        placeholder="https://..."
                        className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs focus:outline-none focus:border-[#8B5A2B]"
                      />
                    </div>
                  </div>
                </div>

                {/* 封面圖下方的「選取主講人」下拉功能區塊 */}
                <div className="p-4 rounded-xl bg-white border border-[#E2D5C1] space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold font-serif-tc text-[#3A2518] flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-[#8B5A2B]" />
                      <span>選取主講人 (Speaker)</span>
                    </label>
                    {speaker ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFF8EE] text-[#8B5A2B] border border-[#E5D2BA] text-[11px] font-semibold">
                        🎙️ {speaker}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#A08C75] italic">尚未指定主講人</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={speaker || ''}
                      onChange={(e) => handleSpeakerChange(e.target.value)}
                      className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition focus:outline-none ${
                        speaker
                          ? 'border-[#8B5A2B] bg-[#FFFBF5] text-[#4A2F13] focus:border-[#70461F]'
                          : 'border-[#D5C5AE] bg-white text-[#6B5A4B] focus:border-[#8B5A2B]'
                      }`}
                    >
                      <option value="">-- 未指定主講人 (點此選取) --</option>
                      {speaker && !speakers.some((s) => s.name === speaker) && (
                        <optgroup label="目前設定之主講人">
                          <option value={speaker}>🎙️ {speaker}</option>
                        </optgroup>
                      )}
                      {speakers.length > 0 && (
                        <optgroup label="現有主講人名冊">
                          {speakers.map((sp) => (
                            <option key={sp.id} value={sp.name}>
                              🎙️ {sp.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="── 主講人管理 ──">
                        <option value="__ACTION_ADD__">➕ 新增其他主講人...</option>
                      </optgroup>
                    </select>

                    {/* 快捷新增按鈕 */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewSpeaker((prev) => !prev);
                        setInlineNewSpeakerName('');
                      }}
                      className="px-2.5 py-2 rounded-xl border border-[#D5C5AE] hover:border-[#8B5A2B] bg-[#FAF5ED] hover:bg-[#F3EAD9] text-[#5C3A1B] text-xs font-semibold flex items-center gap-1 shrink-0 transition cursor-pointer"
                      title="快速新增主講人"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#8B5A2B]" />
                      <span>新增</span>
                    </button>

                    {/* 若已有主講人，提供快速清除按鈕 */}
                    {speaker && (
                      <button
                        type="button"
                        onClick={() => handleSpeakerChange('')}
                        className="p-2 rounded-xl border border-[#D5C5AE] hover:border-red-300 bg-white hover:bg-red-50 text-[#7A6855] hover:text-red-700 transition cursor-pointer"
                        title="清除此語音檔的主講人"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 快速新增主講人輸入框 (展開時顯示) */}
                  {isAddingNewSpeaker && (
                    <div className="p-2.5 rounded-lg bg-[#FAF5ED] border border-[#E5D2BA] space-y-2 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#5C3A1B]">
                          ➕ 新增主講人姓名
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingNewSpeaker(false);
                            setInlineNewSpeakerName('');
                          }}
                          className="text-[#9C8267] hover:text-[#5C3A1B] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={inlineNewSpeakerName}
                          onChange={(e) => setInlineNewSpeakerName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewSpeakerInline();
                            }
                          }}
                          placeholder="請輸入主講人姓名 (例如：林良)"
                          className="flex-1 px-2.5 py-1.5 rounded-md border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleAddNewSpeakerInline}
                          className="px-3 py-1.5 rounded-md bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold shrink-0 cursor-pointer transition shadow-2xs"
                        >
                          確定新增
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-[#8C7A67] leading-relaxed">
                    💡 說明：選取主講人後會自動即時儲存至雲端，並於館藏卡片、放映室與檢索系統中同步顯示與提供篩選。
                  </p>
                </div>

                {/* 「選取主講人」下方的「類別標籤設定」功能區塊 */}
                <div className="p-4 rounded-xl bg-white border border-[#E2D5C1] space-y-3 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold font-serif-tc text-[#2E5A44] flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-[#2E5A44]" />
                      <span>
                        類別標籤設定（目前已標記 {itemTags.length} 個類別）
                      </span>
                    </label>
                    <span className="text-[11px] text-[#2E5A44] font-medium">
                      ✓ 點選後自動即時儲存
                    </span>
                  </div>

                  {/* 目前已標記在此語音檔上的類別標籤 */}
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[28px] p-2.5 rounded-lg bg-[#FAF6EE] border border-[#E5D9C5]">
                    {itemTags.length === 0 ? (
                      <span className="text-xs text-[#9C8B7A] italic">
                        尚未標記類別標籤（請點擊下方「+ 繪本」、「+ 小說」快速選取，或自行輸入新增）
                      </span>
                    ) : (
                      <>
                        {itemTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2E5A44] text-white text-xs font-semibold shadow-2xs"
                          >
                            <Tag className="w-3 h-3" />
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleEditorTag(tag)}
                              className="ml-0.5 p-0.5 rounded hover:bg-white/20 text-white/90 cursor-pointer"
                              title={`從此語音檔移除「${tag}」標籤`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={async () => {
                            setItemTags([]);
                            await autoPersistToFirebase(
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              undefined,
                              { tags: [] }
                            );
                            showToast('ℹ️ 已清空此語音檔的所有類別標籤');
                          }}
                          className="ml-auto px-2 py-0.5 rounded text-[11px] font-medium text-red-700 hover:bg-red-50 transition cursor-pointer"
                          title="清空此語音檔目前已標記的所有類別標籤"
                        >
                          清除全部
                        </button>
                      </>
                    )}
                  </div>

                  {/* 快速標記類別標籤列（支援點選標記 / 取消 + 刪除快速標記按鈕） */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-[#6E5D4F]">
                      <span className="font-semibold">快速標記（點選即可套用或取消）：</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {availableQuickTags.length === 0 && (
                        <span className="text-[11px] text-[#9C8B7A] italic">
                          尚未登錄任何類別標籤，可由下方自行輸入新增
                        </span>
                      )}
                      {availableQuickTags.map((presetTag) => {
                        const isTagged = itemTags.includes(presetTag);
                        return (
                          <button
                            key={presetTag}
                            type="button"
                            onClick={() => handleToggleEditorTag(presetTag)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold transition border cursor-pointer ${
                              isTagged
                                ? 'bg-[#2E5A44]/20 text-[#2E5A44] border-[#2E5A44]'
                                : 'bg-[#FAF6EE] text-[#5C3A1B] border-[#D5C5AE] hover:border-[#8B5A2B]'
                            }`}
                            title={
                              isTagged
                                ? `點擊取消標記「${presetTag}」`
                                : `點擊為此語音檔標記「${presetTag}」`
                            }
                          >
                            {isTagged ? `✓ ${presetTag}` : `+ ${presetTag}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 自訂類別標籤輸入框（新增後自動登錄至標籤名冊並標記於此語音檔） */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[#E5D9C5]">
                    <input
                      type="text"
                      value={customEditorTagInput}
                      onChange={(e) => setCustomEditorTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomEditorTag();
                        }
                      }}
                      placeholder="輸入自訂類別（新增後將自動登錄至名冊與快速標記）"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#2E5A44]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomEditorTag}
                      className="px-3 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新增類別</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-[#E5D9C5]" />

            {/* 第三與第四區塊：播放時的文字顯示 (SRT 區段編輯器) & 播放時的圖片顯示 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* ====================================================================
                  3. 播放時的文字顯示 (SRT 格式時間區段獨立編輯區塊 + 批次修改時間區段)
                 ==================================================================== */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#2E5A44] pl-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#2E5A44]" />
                    <span>3. 播放時的文字顯示 (SRT 時間區段與圖說內容)</span>
                  </h4>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* 自動平均時間區段按鈕 */}
                    <button
                      type="button"
                      onClick={handleAutoDistributeSrtTimes}
                      className="px-3 py-1.5 rounded-lg bg-[#2B4C7E] hover:bg-[#1E375B] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                      title="依據時間區段數量，將語音檔總時長平均分給所有時段；無法整除時，將多餘秒數全部分配給最後一個時間區段"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>自動平均時間區段</span>
                    </button>

                    {/* 2b. 批次修改時間區段按鈕 */}
                    <button
                      type="button"
                      onClick={() => setShowBatchTimeModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>批次修改時間區段</span>
                    </button>

                    {/* 匯入 SRT 格式範本內容 */}
                    <button
                      type="button"
                      onClick={async () => {
                        const samples = createSampleSrtSegments(title);
                        const synced = syncSlidesWithSrtSegments(slides, samples);
                        setSrtSegments(samples);
                        setSlides(synced);
                        setEditingSegmentId(null);
                        await autoPersistToFirebase(samples, synced);
                        showToast('✅ 已匯入標準 SRT 格式範本，並已同步更新圖說文字！');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#2E5A44]/15 text-[#2E5A44] hover:bg-[#2E5A44]/25 text-xs font-semibold cursor-pointer transition"
                    >
                      + 匯入 SRT 格式範本
                    </button>

                    {/* 匯入SRT檔案按鈕 */}
                    <label className="px-3 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-xs transition">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>匯入SRT檔案</span>
                      <input
                        type="file"
                        accept=".srt,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImportSrtFile(f);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {/* 刪除所有時間區段按鈕 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (srtSegments.length === 0) {
                          showToast('目前尚無任何時間區段可刪除！');
                          return;
                        }
                        setShowDeleteAllSegmentsModal(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-700/15 hover:bg-red-700 text-red-800 hover:text-white border border-red-700/30 text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>刪除所有時間區段</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C4938]">
                  <span>
                    共 <strong>{srtSegments.length}</strong> 個 SRT 時間區段 · 每個區段的文字內容即為對應播放圖片的「圖說文字」
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInsertSrtAt(0)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#C8B598] hover:border-[#2E5A44] text-[#2E5A44] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>在開頭新增第 #1 區段</span>
                  </button>
                </div>

                {/* 即時同步顯示目前語音播放秒數所對應的 SRT 時間區段看板 */}
                {srtSegments.length > 0 && (
                  <div
                    className={`p-3.5 rounded-xl border transition-all ${
                      activePlayingSrtSegment
                        ? 'bg-gradient-to-r from-[#2E5A44] to-[#1E3F2E] text-white border-[#2E5A44] shadow-md'
                        : 'bg-[#FAF4E8] text-[#5C4938] border-[#DFCEB4]'
                    }`}
                  >
                    {activePlayingSrtSegment ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-300 text-[#1E3F2E] font-bold text-[11px]">
                              <Play className="w-3 h-3 fill-current" />
                              <span>{isEditorPlaying ? '播放同步中' : '目前定位區段'}</span>
                            </span>
                            <span className="font-mono font-bold text-amber-200">
                              區段 #{activePlayingSrtSegment.index}
                            </span>
                            <span className="font-mono text-[11px] text-white/85">
                              ({secondsToSrtTime(activePlayingSrtSegment.startSec)} {'-->'}{' '}
                              {secondsToSrtTime(activePlayingSrtSegment.endSec)})
                            </span>
                          </div>
                          <span className="font-mono text-xs bg-black/25 px-2.5 py-0.5 rounded-full text-amber-200">
                            目前秒數：{formatDuration(editorCurrentTime)} ({editorCurrentTime.toFixed(1)}s)
                          </span>
                        </div>
                        <p className="text-sm font-serif-tc font-bold text-[#FAF5EC] leading-relaxed">
                          {activePlayingSrtSegment.text || '（本區段尚無文字內容）'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Play className="w-3.5 h-3.5 text-[#2E5A44]" />
                          <span>
                            按下上方語音檔的「播放」按鈕（或點擊下方任一區段的「跳至此段播放」），此處將依播放秒數自動切換顯示對應的 SRT 時間區段！
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* SRT 每個時間段落的小編輯區塊清單 */}
                <div
                  ref={srtListContainerRef}
                  className="space-y-3 max-h-[680px] overflow-y-auto pr-1 scroll-smooth"
                >
                  {srtSegments.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border-2 border-dashed border-[#D5C5AE] bg-white/60 space-y-3">
                      <p className="text-xs text-[#7A6855]">
                        目前尚無時間區段，您可以點擊上方「匯入 SRT 格式範本」、「匯入SRT檔案」或直接新增第一段：
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInsertSrtAt(0)}
                        className="px-4 py-2 rounded-xl bg-[#2E5A44] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>新增第 #1 個時間區段</span>
                      </button>
                    </div>
                  ) : (
                    srtSegments.map((seg, idx) => {
                      const isEditingThis = editingSegmentId === seg.id;
                      const isPlayingThis = activePlayingSrtSegment?.id === seg.id;

                      return (
                        <div
                          key={seg.id}
                          ref={(el) => {
                            srtSegmentRefs.current[seg.id] = el;
                          }}
                          className="space-y-2"
                        >
                          <div
                            className={`rounded-xl border transition-all p-3.5 ${
                              isEditingThis
                                ? 'bg-[#FFFDF7] border-2 border-[#2E5A44] shadow-md'
                                : isPlayingThis
                                ? 'bg-[#F1F8F4] border-2 border-[#2E5A44] shadow-md ring-2 ring-[#2E5A44]/20'
                                : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                            }`}
                          >
                            {/* 區塊頂部：序號 + SRT 起迄時間 + 修改/刪除/在後方新增按鈕 */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#EFE6D5]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-2.5 py-0.5 rounded-md font-mono text-xs font-bold ${
                                    isPlayingThis
                                      ? 'bg-[#2E5A44] text-white'
                                      : 'bg-[#3A2518] text-[#FAF5EC]'
                                  }`}
                                >
                                  #{seg.index}
                                </span>
                                {isPlayingThis && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold animate-pulse">
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                    <span>目前播放區段</span>
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleSeekAndPlaySegment(seg)}
                                  title="點擊直接跳至此時間區段開始播放語音"
                                  className="px-2.5 py-0.5 rounded-md bg-[#2E5A44]/10 hover:bg-[#2E5A44] text-[#2E5A44] hover:text-white font-mono text-xs font-semibold border border-[#2E5A44]/25 transition cursor-pointer flex items-center gap-1"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>
                                    {secondsToSrtTime(seg.startSec)} {'-->'}{' '}
                                    {secondsToSrtTime(seg.endSec)}
                                  </span>
                                </button>
                                <span className="text-[11px] text-[#7A6855] font-mono">
                                  ({seg.startSec}s ~ {seg.endSec}s)
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {!isEditingThis && (
                                  <button
                                    type="button"
                                    onClick={() => startEditSrtSegment(seg)}
                                    className="px-2.5 py-1 rounded-lg bg-[#8B5A2B]/15 hover:bg-[#8B5A2B] text-[#8B5A2B] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>修改</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleInsertSrtAt(idx + 1)}
                                  className="px-2.5 py-1 rounded-lg bg-[#2E5A44]/15 hover:bg-[#2E5A44] text-[#2E5A44] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                  title="在此時間區段後方插入一個新區段，並自動順延後續時間"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>在此後新增</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSrtSegment(idx)}
                                  className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                                  title="刪除此時間區段"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* 區塊內容：檢視模式 vs 修改模式 */}
                            {isEditingThis ? (
                              <div className="pt-3 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[#F4ECE0] border border-[#E2D5C1]">
                                  <div>
                                    <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                      起始時間 (秒數 / SRT 格式)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        value={editSegStartSec}
                                        onChange={(e) => {
                                          const val = Math.max(0, Number(e.target.value) || 0);
                                          const dur = Math.max(1, editSegEndSec - editSegStartSec);
                                          setEditSegStartSec(val);
                                          setEditSegStartSrt(secondsToSrtTime(val));
                                          if (val >= editSegEndSec) {
                                            setEditSegEndSec(val + dur);
                                            setEditSegEndSrt(secondsToSrtTime(val + dur));
                                          }
                                        }}
                                        className="w-20 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                      />
                                      <span className="text-xs text-[#7A6855]">秒</span>
                                      <input
                                        type="text"
                                        value={editSegStartSrt}
                                        onChange={(e) => {
                                          setEditSegStartSrt(e.target.value);
                                          const parsed = srtTimeToSeconds(e.target.value);
                                          setEditSegStartSec(parsed);
                                        }}
                                        className="flex-1 min-w-0 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                        placeholder="00:00:00,000"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                      結束時間 (修改後自動推移後方區段)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0.5}
                                        step={0.5}
                                        value={editSegEndSec}
                                        onChange={(e) => {
                                          const val = Math.max(0.5, Number(e.target.value) || 0);
                                          setEditSegEndSec(val);
                                          setEditSegEndSrt(secondsToSrtTime(val));
                                        }}
                                        className="w-20 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                      />
                                      <span className="text-xs text-[#7A6855]">秒</span>
                                      <input
                                        type="text"
                                        value={editSegEndSrt}
                                        onChange={(e) => {
                                          setEditSegEndSrt(e.target.value);
                                          const parsed = srtTimeToSeconds(e.target.value);
                                          setEditSegEndSec(parsed);
                                        }}
                                        className="flex-1 min-w-0 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                        placeholder="00:00:05,000"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                    本區段文字內容（同時作為對應圖片的「圖說文字」）：
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={editSegText}
                                    onChange={(e) => setEditSegText(e.target.value)}
                                    className="w-full p-2.5 rounded-lg border border-[#C8B598] bg-white text-sm font-serif-tc focus:outline-none focus:border-[#2E5A44]"
                                    placeholder="請輸入此時間區段要顯示的文字與圖說內容..."
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingSegmentId(null)}
                                    className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer"
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => confirmEditSrtSegment(idx)}
                                    className="px-3.5 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>確認修改並同步後方時間</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-2.5">
                                <p className="text-sm text-[#2C221E] whitespace-pre-line font-serif-tc leading-relaxed">
                                  {seg.text || '（尚無文字內容，請點右上角「修改」輸入）'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ====================================================================
                  4. 播放時的圖片顯示
                  (1a: 先選取圖片 -> 再選取起迄時間區段範圍；1b: 新增後立即存入 Firebase；1c: 圖說文字就是 SRT 時間區段內容)
                 ==================================================================== */}
              <div className="lg:col-span-6 space-y-4">
                <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#2B4C7E] pl-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#2B4C7E]" />
                  <span>4. 播放時的圖片顯示 (選取圖片與起迄 SRT 時間區段範圍)</span>
                </h4>

                {/* 新增播放圖片控制盒 */}
                <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-4">
                  {/* 步驟 1：先選取要上傳的圖片檔案 */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#2B4C7E]">
                      步驟 1：先選取要上傳的圖片檔案（支援電腦或手機）*
                    </label>

                    {pendingSlideFile ? (
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border-2 border-[#2B4C7E]">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={pendingSlidePreviewUrl}
                            alt="已選取圖片預覽"
                            className="w-20 h-14 rounded-lg object-cover border border-[#D5C5AE] shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold mb-0.5">
                              已選取圖片，請於下方步驟 2 選擇時間區段範圍
                            </span>
                            <p className="text-xs font-bold text-[#2C221E] truncate">
                              {pendingSlideFile.name}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (pendingSlidePreviewUrl)
                              URL.revokeObjectURL(pendingSlidePreviewUrl);
                            setPendingSlideFile(null);
                            setPendingSlidePreviewUrl('');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-[#D5C5AE] text-xs text-[#5C3A1B] hover:bg-[#EFE6D5] shrink-0 cursor-pointer"
                        >
                          重選圖片
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="w-full py-3 px-4 rounded-xl bg-white hover:bg-[#FAF6EE] border-2 border-dashed border-[#2B4C7E]/50 hover:border-[#2B4C7E] text-[#2B4C7E] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition">
                          <Upload className="w-4 h-4" />
                          <span>點此從電腦或手機選取要上傳的播放圖片</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                if (pendingSlidePreviewUrl)
                                  URL.revokeObjectURL(pendingSlidePreviewUrl);
                                setPendingSlideFile(f);
                                setPendingSlidePreviewUrl(URL.createObjectURL(f));
                                const nextSmallest = getSmallestUnusedSegmentIndex(
                                  srtSegments,
                                  slides
                                );
                                setNewSlideStartSegIdx(nextSmallest);
                                setNewSlideEndSegIdx(nextSmallest);
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>

                        <input
                          type="url"
                          value={newSlideUrlInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewSlideUrlInput(val);
                            if (val.trim()) {
                              const nextSmallest = getSmallestUnusedSegmentIndex(
                                srtSegments,
                                slides
                              );
                              setNewSlideStartSegIdx(nextSmallest);
                              setNewSlideEndSegIdx(nextSmallest);
                            }
                          }}
                          placeholder="或直接貼上外部圖片網址 https://..."
                          className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* 步驟 2：選取要放入的起迄 SRT 時間區段範圍 */}
                  <div className="space-y-2 pt-2 border-t border-[#DFCEB4]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[#2B4C7E]">
                        步驟 2：選取此圖片要放入的「起迄 SRT 時間區段範圍」*
                      </label>
                      {srtSegments.length > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            hasUnusedSegment
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {hasUnusedSegment
                            ? `✓ 已自動選取尚未被使用的最小區段 #${smallestUnusedSegIdx}`
                            : '所有時間區段皆已有圖片使用'}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          起始時間區段 (從第幾段開始顯示)
                        </label>
                        <select
                          value={newSlideStartSegIdx}
                          onChange={(e) => {
                            const sVal = Number(e.target.value) || 1;
                            setNewSlideStartSegIdx(sVal);
                            if (newSlideEndSegIdx < sVal) {
                              setNewSlideEndSegIdx(sVal);
                            }
                          }}
                          className="w-full px-2.5 py-2 rounded-lg border border-[#C8B598] bg-white text-xs font-medium text-[#2C221E]"
                        >
                          {srtSegments.map((seg) => {
                            const isUsed = usedSegmentIndicesSet.has(seg.index);
                            return (
                              <option key={seg.id} value={seg.index}>
                                #{seg.index} {isUsed ? '(已被選取)' : '(尚未選取)'} [
                                {secondsToSrtTime(seg.startSec)}] —{' '}
                                {(seg.text || '').replace(/\n/g, ' ').slice(0, 16)}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          結束時間區段 (顯示到第幾段結束)
                        </label>
                        <select
                          value={newSlideEndSegIdx}
                          onChange={(e) => {
                            const eVal = Number(e.target.value) || newSlideStartSegIdx;
                            setNewSlideEndSegIdx(Math.max(newSlideStartSegIdx, eVal));
                          }}
                          className="w-full px-2.5 py-2 rounded-lg border border-[#C8B598] bg-white text-xs font-medium text-[#2C221E]"
                        >
                          {srtSegments
                            .filter((seg) => seg.index >= newSlideStartSegIdx)
                            .map((seg) => {
                              const isUsed = usedSegmentIndicesSet.has(seg.index);
                              return (
                                <option key={seg.id} value={seg.index}>
                                  #{seg.index} {isUsed ? '(已被選取)' : '(尚未選取)'} [至{' '}
                                  {secondsToSrtTime(seg.endSec)}] —{' '}
                                  {(seg.text || '').replace(/\n/g, ' ').slice(0, 16)}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                    </div>

                    {/* 1c & 2a: 圖說文字就是 SRT 時間區段的內容 (即時預覽) */}
                    <div className="p-3 rounded-lg bg-white/90 border border-[#DFCEB4] space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-[#7A6855]">
                        <span className="font-semibold text-[#5C3A1B]">
                          對應圖說文字（自動帶入 SRT 區段 #{previewNewSlideRange.startIdx} ~ #
                          {previewNewSlideRange.endIdx} 內容）：
                        </span>
                        <span className="font-mono text-[#2B4C7E]">
                          {secondsToSrtTime(previewNewSlideRange.startSec)} {'-->'}{' '}
                          {secondsToSrtTime(previewNewSlideRange.endSec)}
                        </span>
                      </div>
                      <p className="text-xs text-[#2C221E] font-serif-tc whitespace-pre-line line-clamp-3">
                        {previewNewSlideRange.caption || '（所選區段尚無文字）'}
                      </p>
                    </div>
                  </div>

                  {/* 步驟 3：確認上傳並儲存至雲端硬碟與 Firebase */}
                  <button
                    type="button"
                    disabled={isUploading || (!pendingSlideFile && !newSlideUrlInput.trim())}
                    onClick={handleConfirmAddSlideWithRange}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#2B4C7E] hover:bg-[#1E385F] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      步驟 3：確認新增圖片至區段 #{previewNewSlideRange.startIdx} ~ #
                      {previewNewSlideRange.endIdx}（自動存入雲端硬碟與 Firebase）
                    </span>
                  </button>
                </div>

                {/* 總筆數統計、每頁顯示與上方分頁切換控制列 */}
                <div className="p-3 rounded-xl bg-[#EFE6D5] border border-[#DFCEB4] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-[#3A2518]">
                    <span className="font-semibold">
                      總筆數統計：共 <strong className="text-[#2B4C7E] font-mono">{totalSlidesCount}</strong> 筆圖片
                    </span>
                    {totalSlidesCount > 0 && (
                      <span className="text-[#7A6855] font-normal">
                        (顯示第 {slideStartIndex + 1} ~{' '}
                        {Math.min(slideStartIndex + slidePageSize, totalSlidesCount)} 筆)
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      <label className="text-[#5C3A1B] font-medium">每頁顯示：</label>
                      <select
                        value={slidePageSize}
                        onChange={(e) => {
                          setSlidePageSize(Number(e.target.value));
                          setSlideCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded-lg border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer"
                      >
                        {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map((size) => (
                          <option key={size} value={size}>
                            {size} 筆 / 頁
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 清單上方分頁切換按鈕控制列 */}
                  {totalSlidePages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeSlidePage <= 1}
                        onClick={() => setSlideCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2 py-1 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-0.5 cursor-pointer"
                        title="上一頁"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一頁</span>
                      </button>

                      {Array.from({ length: totalSlidePages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          type="button"
                          key={pageNum}
                          onClick={() => setSlideCurrentPage(pageNum)}
                          className={`w-6 h-6 rounded-md font-mono text-xs font-semibold cursor-pointer ${
                            pageNum === safeSlidePage
                              ? 'bg-[#2B4C7E] text-white shadow-2xs'
                              : 'bg-white border border-[#D5C5AE] text-[#5C3A1B] hover:bg-[#F4ECE0]'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={safeSlidePage >= totalSlidePages}
                        onClick={() => setSlideCurrentPage((p) => Math.min(totalSlidePages, p + 1))}
                        className="px-2 py-1 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-0.5 cursor-pointer"
                        title="下一頁"
                      >
                        <span>下一頁</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 已設定的播放時圖片列表（含前方序號、修改起迄區段、刪除確認視窗） */}
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {paginatedSlides.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-dashed border-[#D5C5AE] bg-white/60 text-xs text-[#7A6855]">
                      目前尚無播放展示圖片，請於上方選取圖片並指定起迄 SRT 時間區段。
                    </div>
                  ) : (
                    paginatedSlides.map((sl, idxInPage) => {
                      const globalSeq = slideStartIndex + idxInPage + 1;
                      const isEditingThisSlide = editingSlideId === sl.id;

                      return (
                        <div
                          key={sl.id}
                          className={`rounded-xl border transition-all p-3 ${
                            isEditingThisSlide
                              ? 'bg-[#FFFDF7] border-2 border-[#2B4C7E] shadow-md'
                              : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* 前方序號 */}
                              <span className="px-2.5 py-1 rounded-lg bg-[#2B4C7E] text-white font-mono text-xs font-bold shrink-0 mt-1">
                                #{globalSeq}
                              </span>

                              <img
                                src={isEditingThisSlide ? editSlideImageUrl : sl.imageUrl}
                                alt={sl.caption}
                                className="w-20 h-14 rounded-lg object-cover shrink-0 border border-[#D5C5AE]"
                              />

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="inline-block px-2 py-0.5 rounded bg-[#2B4C7E]/10 text-[#2B4C7E] font-mono text-[11px] font-semibold">
                                    {formatSlideRangeBadge(sl)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F4ECE0] border border-[#DFCEB4] text-[#5C3A1B] text-[11px] font-semibold">
                                    <ImageIcon className="w-3 h-3 text-[#8B5A2B]" />
                                    <span>
                                      圖片檔名：{getSlideDisplayFileName(sl, globalSeq)}
                                    </span>
                                  </span>
                                </div>
                                <p className="text-xs font-serif-tc text-[#2C221E] line-clamp-2 whitespace-pre-line">
                                  {sl.caption || '（對應 SRT 區段文字）'}
                                </p>
                              </div>
                            </div>

                            {/* 修改 與 刪除按鈕 */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isEditingThisSlide && (
                                <button
                                  type="button"
                                  onClick={() => startEditSlide(sl, globalSeq)}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#2B4C7E]/15 hover:bg-[#2B4C7E] text-[#2B4C7E] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>修改</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setSlidePendingDelete({ slide: sl, seqNumber: globalSeq })
                                }
                                className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                                title="刪除此張播放圖片"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* 單筆圖片的「修改」展開面板（顯示並可修改「使用圖片的檔案名稱」、起迄 SRT 時間區段範圍與更換圖片） */}
                          {isEditingThisSlide && (
                            <div className="mt-3 pt-3 border-t border-[#EFE6D5] space-y-3 bg-[#FAF6EE] p-3.5 rounded-lg">
                              {/* 2a-(1)：顯示並可修改「使用圖片的檔案名稱」，修改後同步至 Google 雲端硬碟 */}
                              <div className="p-3 rounded-lg bg-white border border-[#C8B598] space-y-1.5">
                                <label className="block text-xs font-bold text-[#2B4C7E] flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  <span>
                                    使用圖片的檔案名稱（可修改，確認後自動同步至 Google 雲端硬碟檔案名稱）：
                                  </span>
                                </label>
                                <input
                                  type="text"
                                  value={editSlideFileName}
                                  onChange={(e) => setEditSlideFileName(e.target.value)}
                                  placeholder="請輸入此圖片的檔案名稱（例如：插畫01.jpg）..."
                                  className="w-full px-3 py-1.5 rounded-lg border border-[#C8B598] bg-[#FAF6EE] focus:bg-white text-xs font-semibold text-[#2C221E] focus:outline-none focus:border-[#2B4C7E]"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#2B4C7E] mb-1">
                                    修改起始 SRT 時間區段：
                                  </label>
                                  <select
                                    value={editSlideStartSegIdx}
                                    onChange={(e) => {
                                      const sVal = Number(e.target.value) || 1;
                                      setEditSlideStartSegIdx(sVal);
                                      if (editSlideEndSegIdx < sVal) {
                                        setEditSlideEndSegIdx(sVal);
                                      }
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs"
                                  >
                                    {srtSegments.map((seg) => (
                                      <option key={seg.id} value={seg.index}>
                                        #{seg.index} [{secondsToSrtTime(seg.startSec)}] —{' '}
                                        {(seg.text || '').replace(/\n/g, ' ').slice(0, 18)}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-[#2B4C7E] mb-1">
                                    修改結束 SRT 時間區段：
                                  </label>
                                  <select
                                    value={editSlideEndSegIdx}
                                    onChange={(e) => {
                                      const eVal =
                                        Number(e.target.value) || editSlideStartSegIdx;
                                      setEditSlideEndSegIdx(
                                        Math.max(editSlideStartSegIdx, eVal)
                                      );
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs"
                                  >
                                    {srtSegments
                                      .filter((seg) => seg.index >= editSlideStartSegIdx)
                                      .map((seg) => (
                                        <option key={seg.id} value={seg.index}>
                                          #{seg.index} [至 {secondsToSrtTime(seg.endSec)}] —{' '}
                                          {(seg.text || '').replace(/\n/g, ' ').slice(0, 18)}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              </div>

                              {/* 預覽修改後的區段圖說文字 */}
                              <div className="p-2.5 rounded bg-white border border-[#E2D5C1] text-xs space-y-1">
                                <span className="text-[11px] font-semibold text-[#5C3A1B] block">
                                  對應 SRT 圖說文字預覽（區段 #{previewEditSlideRange.startIdx} ~ #
                                  {previewEditSlideRange.endIdx}）：
                                </span>
                                <p className="text-[#2C221E] font-serif-tc whitespace-pre-line">
                                  {previewEditSlideRange.caption}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <label className="px-3 py-1.5 rounded-lg bg-white border border-[#C8B598] hover:border-[#2B4C7E] text-[#2B4C7E] text-xs font-semibold cursor-pointer flex items-center gap-1">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>重新上傳替換此圖片</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleReplaceSlideImageInEdit(f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                <input
                                  type="url"
                                  value={editSlideImageUrl}
                                  onChange={(e) => setEditSlideImageUrl(e.target.value)}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs"
                                  placeholder="圖片網址..."
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={isRenamingSlide}
                                  onClick={() => setEditingSlideId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer disabled:opacity-50"
                                >
                                  取消
                                </button>
                                <button
                                  type="button"
                                  disabled={isRenamingSlide}
                                  onClick={() => confirmEditSlide(sl.id, globalSeq)}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#2B4C7E] hover:bg-[#1E385F] disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isRenamingSlide ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>正在同步雲端硬碟檔名與儲存...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>確認修改（同步雲端硬碟檔名與 Firebase）</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 分頁頁碼切換控制列 */}
                {totalSlidesCount > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#E5D9C5] text-xs">
                    <span className="text-[#7A6855]">
                      第 <strong>{safeSlidePage}</strong> / <strong>{totalSlidePages}</strong> 頁（共{' '}
                      {totalSlidesCount} 筆）
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeSlidePage <= 1}
                        onClick={() => setSlideCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一頁</span>
                      </button>

                      {Array.from({ length: totalSlidePages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          type="button"
                          key={pageNum}
                          onClick={() => setSlideCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded-lg font-mono font-semibold cursor-pointer ${
                            pageNum === safeSlidePage
                              ? 'bg-[#2B4C7E] text-white'
                              : 'bg-white border border-[#D5C5AE] text-[#5C3A1B] hover:bg-[#F4ECE0]'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={safeSlidePage >= totalSlidePages}
                        onClick={() =>
                          setSlideCurrentPage((p) => Math.min(totalSlidePages, p + 1))
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <span>下一頁</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 底部即時儲存狀態提示與返回列表列 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#E5D9C5]">
              <span className="text-xs text-[#2E5A44] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>上方 1 ~ 4 各區域所做的任何修改皆已即時自動儲存至 Firebase 雲端資料庫</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClearEditing();
                  setActiveSubTab('list');
                }}
                className="px-5 py-2.5 rounded-xl bg-[#3A2518] hover:bg-[#27180F] text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <FolderOpen className="w-4 h-4" />
                <span>完成並返回館藏列表</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          2b. 圖書館典藏風格：「批次修改時間區段」視窗 Modal
         ======================================================================== */}
      {showBatchTimeModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#2E5A44] to-[#1E3F2E] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-200" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  批次修改時間區段 (共 {srtSegments.length} 個區段)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchTimeModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-[#5C4938] leading-relaxed">
                請選擇要一次性套用至所有 SRT 時間區段的調整方式，執行後也會自動更新所有綁定圖片的出現時間並儲存至 Firebase：
              </p>

              {/* 三種批次修改模式選單 */}
              <div className="space-y-2.5">
                <label
                  onClick={() => setBatchMode('add')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                    batchMode === 'add'
                      ? 'bg-[#2E5A44]/10 border-2 border-[#2E5A44]'
                      : 'bg-white border-[#DFCEB4]'
                  }`}
                >
                  <input
                    type="radio"
                    name="batchMode"
                    checked={batchMode === 'add'}
                    onChange={() => setBatchMode('add')}
                    className="mt-1 accent-[#2E5A44]"
                  />
                  <div>
                    <p className="text-xs font-bold text-[#2C221E]">
                      1. 全部時間區段「增加」秒數 (+ XX 秒)
                    </p>
                    <p className="text-[11px] text-[#7A6855] mt-0.5">
                      將所有區段的起始時間與結束時間統一往後延遲指定秒數。
                    </p>
                  </div>
                </label>

                <label
                  onClick={() => setBatchMode('subtract')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                    batchMode === 'subtract'
                      ? 'bg-[#2E5A44]/10 border-2 border-[#2E5A44]'
                      : 'bg-white border-[#DFCEB4]'
                  }`}
                >
                  <input
                    type="radio"
                    name="batchMode"
                    checked={batchMode === 'subtract'}
                    onChange={() => setBatchMode('subtract')}
                    className="mt-1 accent-[#2E5A44]"
                  />
                  <div>
                    <p className="text-xs font-bold text-[#2C221E]">
                      2. 全部時間區段「減少」秒數 (- XX 秒)
                    </p>
                    <p className="text-[11px] text-[#7A6855] mt-0.5">
                      將所有區段的起始時間與結束時間統一往前提前指定秒數（最低至 0 秒）。
                    </p>
                  </div>
                </label>

                <label
                  onClick={() => setBatchMode('insert_gap')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                    batchMode === 'insert_gap'
                      ? 'bg-[#2E5A44]/10 border-2 border-[#2E5A44]'
                      : 'bg-white border-[#DFCEB4]'
                  }`}
                >
                  <input
                    type="radio"
                    name="batchMode"
                    checked={batchMode === 'insert_gap'}
                    onChange={() => setBatchMode('insert_gap')}
                    className="mt-1 accent-[#2E5A44]"
                  />
                  <div>
                    <p className="text-xs font-bold text-[#2C221E]">
                      3. 在每個時間區段中間「加入 XX 秒的空白間隔」
                    </p>
                    <p className="text-[11px] text-[#7A6855] mt-0.5">
                      維持每個區段原本的朗讀長度，但在每兩個區段之間插入指定秒數的留白間隔，並依序向後順延。
                    </p>
                  </div>
                </label>
              </div>

              {/* 秒數輸入框 */}
              <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] flex items-center justify-between gap-4">
                <label className="text-xs font-bold text-[#3A2518]">
                  請輸入要調整的秒數 (秒)：
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={batchSeconds}
                    onChange={(e) => setBatchSeconds(Math.max(0, Number(e.target.value) || 0))}
                    className="w-28 px-3 py-2 rounded-lg border border-[#C8B598] bg-white text-sm font-mono font-bold text-center"
                  />
                  <span className="text-xs font-semibold text-[#5C3A1B]">秒</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setShowBatchTimeModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBatchModify}
                  className="px-5 py-2 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>確認執行批次修改</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 圖書館典藏風格：「刪除所有時間區段」確認視窗 Modal */}
      {showDeleteAllSegmentsModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2218] to-[#522D20] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-300/30 flex items-center justify-center text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  刪除所有時間區段確認
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteAllSegmentsModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                確定要將「<strong>{title || '目前語音館藏'}</strong>」中全部{' '}
                <strong className="text-red-700 font-mono">{srtSegments.length}</strong>{' '}
                筆 SRT 時間區段與文字內容一次清空嗎？
              </p>

              <div className="p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] space-y-1.5 text-xs text-[#5C4938]">
                <div className="flex items-center gap-2 font-semibold text-[#3A2518]">
                  <FileText className="w-4 h-4 text-[#8B5A2B] shrink-0" />
                  <span>即將清除的內容摘要：</span>
                </div>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] text-[#7A5835]">
                  <li>共 {srtSegments.length} 個 SRT 時間段落與對應講稿文字</li>
                  <li>確認刪除後將立即同步儲存至 Firebase 雲端資料庫</li>
                  <li>刪除後您仍可隨時重新「匯入SRT檔案」或手動新增區段</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setShowDeleteAllSegmentsModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] transition cursor-pointer"
                >
                  保留時間區段 (取消)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAllSegments}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>確認刪除所有時間區段</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 圖書館典藏風格：「播放時圖片」刪除確認視窗 Modal */}
      {slidePendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#2B4C7E] to-[#1E3557] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-200" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  移除播放展示圖片與雲端檔案確認
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeletingSlide}
                onClick={() => setSlidePendingDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                確定要移除第 <strong>#{slidePendingDelete.seqNumber}</strong> 筆播放時顯示的圖片嗎？
              </p>

              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4]">
                <img
                  src={slidePendingDelete.slide.imageUrl}
                  alt={slidePendingDelete.slide.caption}
                  className="w-20 h-14 rounded-lg object-cover border border-[#C8B294] shrink-0 shadow-xs"
                />
                <div className="min-w-0 space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2B4C7E] text-white">
                    序號 #{slidePendingDelete.seqNumber} ·{' '}
                    {formatSlideRangeBadge(slidePendingDelete.slide)}
                  </span>
                  <h4 className="font-bold font-serif-tc text-xs text-[#2C221E] line-clamp-2">
                    {slidePendingDelete.slide.caption || '（無圖說文字）'}
                  </h4>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-[#6E4720] space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#8B5A2B] shrink-0" />
                  <span>將同步執行以下刪除作業：</span>
                </p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] text-[#7A5835]">
                  <li>從 Firebase 資料庫移除此筆播放圖片與時間區段設定</li>
                  <li>一併刪除 Google 雲端硬碟中對應的圖片檔案</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  disabled={isDeletingSlide}
                  onClick={() => setSlidePendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] transition cursor-pointer"
                >
                  保留圖片 (取消)
                </button>
                <button
                  type="button"
                  disabled={isDeletingSlide}
                  onClick={async () => {
                    if (!slidePendingDelete) return;
                    setIsDeletingSlide(true);
                    try {
                      const targetSlide = slidePendingDelete.slide;
                      const targetId = targetSlide.id;
                      const seq = slidePendingDelete.seqNumber;
                      const nextSlides = sortSlidesBySegmentRange(
                        slides.filter((s) => s.id !== targetId)
                      );

                      setSlides(nextSlides);
                      if (editingSlideId === targetId) setEditingSlideId(null);

                      // 1. 先同步更新 Firebase 資料庫中的播放圖片清單
                      await autoPersistToFirebase(srtSegments, nextSlides);

                      // 2. 檢查此圖片是否有對應的 Google 雲端硬碟 File ID，並同步從 Google Drive 刪除
                      const driveFileId = extractDriveFileIdFromSlide(targetSlide);
                      // 確認沒有其他剩餘圖片或封面圖共用同一個 Drive File ID
                      const stillUsedByOtherSlide =
                        driveFileId &&
                        (coverImageDriveId === driveFileId ||
                          nextSlides.some(
                            (s) => extractDriveFileIdFromSlide(s) === driveFileId
                          ));

                      if (driveFileId && !stillUsedByOtherSlide) {
                        const driveRes = await deleteFilesFromGoogleDrive([driveFileId]);
                        setSlidePendingDelete(null);
                        if (driveRes.deletedOnDrive) {
                          showToast(
                            `✅ 已移除第 #${seq} 筆播放展示圖片，並已同步從 Google 雲端硬碟刪除該圖片檔案！`
                          );
                        } else if (driveRes.message) {
                          showToast(`⚠️ 已從 Firebase 移除第 #${seq} 筆圖片（${driveRes.message}）`);
                        } else {
                          showToast(`✅ 已移除第 #${seq} 筆播放展示圖片，並已同步更新至 Firebase！`);
                        }
                      } else {
                        setSlidePendingDelete(null);
                        showToast(`✅ 已移除第 #${seq} 筆播放展示圖片，並已同步更新至 Firebase！`);
                      }
                    } finally {
                      setIsDeletingSlide(false);
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  {isDeletingSlide ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在同步刪除雲端圖片...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>確認刪除此圖片與雲端檔案</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 圖書館典藏風格：刪除整筆語音館藏確認視窗 Modal */}
      {itemPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2218] to-[#522D20] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-300/30 flex items-center justify-center text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  館藏撤架與雲端檔案刪除確認
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setItemPendingDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                您確定要從「聲書閣」撤下並刪除以下有聲書館藏嗎？
              </p>

              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4]">
                <img
                  src={itemPendingDelete.coverImageUrl}
                  alt={itemPendingDelete.title}
                  className="w-14 h-18 rounded-lg object-cover border border-[#C8B294] shrink-0 shadow-xs"
                />
                <div className="min-w-0 space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#3A2518] text-[#F3D5B5]">
                    {categories.find((c) => c.id === itemPendingDelete.categoryId)?.name ||
                      '館藏作品'}
                  </span>
                  <h4 className="font-bold font-serif-tc text-sm text-[#2C221E] truncate">
                    {itemPendingDelete.title}
                  </h4>
                  <p className="text-xs text-[#7A6855] font-mono">
                    時長：{formatDuration(itemPendingDelete.duration)} · 展演圖片{' '}
                    {itemPendingDelete.playbackDisplay.slides.length} 張
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-[#6E4720] space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#8B5A2B] shrink-0" />
                  <span>將同步執行以下清理作業：</span>
                </p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] text-[#7A5835]">
                  <li>移除 Firebase 資料庫中的館藏紀錄與圖文設定</li>
                  <li>一併刪除 Google 雲端硬碟中關聯的語音檔與插圖檔案</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={() => setItemPendingDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] transition cursor-pointer"
                >
                  保留館藏 (取消)
                </button>
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={async () => {
                    if (!itemPendingDelete) return;
                    setIsDeletingItem(true);
                    try {
                      const target = itemPendingDelete;
                      const res = await onDeleteAudioItem(target.id);
                      setItemPendingDelete(null);
                      if (res.deletedOnDrive) {
                        showToast(
                          `✅ 已刪除「${target.title}」，並同步從 Google 雲端硬碟移除 ${res.deletedCount} 個關聯檔案！`
                        );
                      } else if (res.message) {
                        showToast(`⚠️ ${res.message}`);
                      } else {
                        showToast(`✅ 已刪除館藏「${target.title}」！`);
                      }
                    } finally {
                      setIsDeletingItem(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  {isDeletingItem ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在同步刪除雲端檔案...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>確認撤架並刪除雲端檔案</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
