import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Edit3,
  Image as ImageIcon,
  FileText,
  ListMusic,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Repeat,
  Loader2,
  Check,
  CheckCircle2,
  X,
  Tag,
} from 'lucide-react';
import { AudioItem, Category, PlaybackSlide } from '../types';
import { formatDuration, getCategoryIcon } from './DashboardView';
import { fetchAudioBlobFromGoogleDrive } from '../services/storageService';
import { usePlayableAudioUrl } from '../utils/mediaCache';
import {
  parseSrtContent,
  secondsToSrtTime,
  srtTimeToSeconds,
  updateSegmentAndCascade,
  serializeSrtSegments,
  syncSlidesWithSrtSegments,
  sortSlidesBySegmentRange,
} from '../utils/srtUtils';
import { getAudioItemCallNumberMap } from '../utils/audioFileUtils';

interface ScreeningRoomViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  activeAudio: AudioItem | null;
  initialCategoryFilter?: string;
  onSelectAudio: (item: AudioItem) => void;
  onEditAudio: (item: AudioItem) => void;
  onSaveAudioItem: (item: AudioItem) => Promise<void>;
}

interface ParsedParagraph {
  timestampSec: number | null;
  timeLabel: string | null;
  content: string;
}

/**
 * 解析含有 [mm:ss] 時間戳記或一般段落的播放文字
 */
function parsePlaybackText(rawText: string): ParsedParagraph[] {
  if (!rawText || !rawText.trim()) return [];
  const blocks = rawText.split(/\n\s*\n/).filter((b) => b.trim().length > 0);

  return blocks.map((block) => {
    const match = block.trim().match(/^\[(\d{1,2}):(\d{2})\]\s*([\s\S]*)$/);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      return {
        timestampSec: mins * 60 + secs,
        timeLabel: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        content: match[3].trim(),
      };
    }
    return {
      timestampSec: null,
      timeLabel: null,
      content: block.trim(),
    };
  });
}

export const ScreeningRoomView: React.FC<ScreeningRoomViewProps> = ({
  categories,
  audioItems,
  activeAudio,
  initialCategoryFilter = 'all',
  onSelectAudio,
  onEditAudio,
  onSaveAudioItem,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(initialCategoryFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [manualSlideIndex, setManualSlideIndex] = useState<number | null>(null);
  const [manualSegmentIndex, setManualSegmentIndex] = useState<number | null>(null);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  // 放映室「播放時的文字顯示與導讀講稿」單筆時間區段即時修改狀態
  const [isEditingSegment, setIsEditingSegment] = useState<boolean>(false);
  const [editSegStartSec, setEditSegStartSec] = useState<number>(0);
  const [editSegEndSec, setEditSegEndSec] = useState<number>(5);
  const [editSegStartSrt, setEditSegStartSrt] = useState<string>('00:00:00,000');
  const [editSegEndSrt, setEditSegEndSrt] = useState<string>('00:00:05,000');
  const [editSegText, setEditSegText] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 「館藏語音選片書架」專屬查詢狀態（檔案名稱、類別標籤）
  const [shelfSearchTitle, setShelfSearchTitle] = useState('');
  const [shelfSearchTag, setShelfSearchTag] = useState('');

  // 「館藏語音選片書架」專屬分頁狀態（以 5 的倍數做選取）
  const [shelfPageSize, setShelfPageSize] = useState<number>(5);
  const [shelfCurrentPage, setShelfCurrentPage] = useState<number>(1);

  // 依據「館藏分類編號 + 流水號 (號碼從 0 開始，依語音檔案上傳順序)」建立每筆語音檔之獨立編號
  const audioCallNumberMap = useMemo(
    () => getAudioItemCallNumberMap(audioItems, categories),
    [audioItems, categories]
  );

  // 播放時圖片縮圖水平滾動容器 Ref
  const slideThumbsContainerRef = useRef<HTMLDivElement | null>(null);

  // 放映室最上方容器 Ref，用於選片時跳到最上方
  const screeningTopRef = useRef<HTMLDivElement | null>(null);

  // 放映室多媒體播放舞台 Ref (供手機版選片後平滑捲動至播放畫面)
  const playerStageRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAutoPlayRef = useRef<boolean>(false);

  useEffect(() => {
    if (initialCategoryFilter) {
      setSelectedCategoryId(initialCategoryFilter);
    }
  }, [initialCategoryFilter]);

  const currentItem = activeAudio || audioItems[0] || null;

  // 將 Google Drive 音訊自動解析為手機與電腦瀏覽器 100% 可播放的本地 Blob URL
  const { playableUrl: playableScreeningUrl, isLoadingAudio: isScreeningAudioLoading } =
    usePlayableAudioUrl(
      currentItem?.audioUrl || '',
      currentItem?.audioDriveFileId,
      fetchAudioBlobFromGoogleDrive,
      currentItem?.id
    );

  // 當切換曲目時重置播放狀態
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setManualSlideIndex(null);
    setManualSegmentIndex(null);
    setIsEditingSegment(false);
    pendingAutoPlayRef.current = false;
    if (currentItem) {
      setDuration(currentItem.duration || 20);
    }
  }, [currentItem?.id]);

  // 當 playableScreeningUrl 解析完成或更新時，讓 audio 元件重新載入來源；若手機使用者已按下播放則自動開始播放
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && playableScreeningUrl) {
      audio.load();
      if (pendingAutoPlayRef.current) {
        pendingAutoPlayRef.current = false;
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => console.warn('自動開始播放失敗:', err));
      }
    }
  }, [playableScreeningUrl]);

  // 依據分類與頂部搜尋篩選清單
  const filteredItems = audioItems.filter((item) => {
    const matchCat =
      selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
    const matchQuery =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  // 統計可用類別標籤與筆數（以當前選取分類為主，全選則統計全部館藏）
  const availableShelfTags = useMemo(() => {
    const targetItems =
      selectedCategoryId === 'all'
        ? audioItems
        : audioItems.filter((i) => i.categoryId === selectedCategoryId);

    const tagCountMap: Record<string, number> = {};
    targetItems.forEach((item) => {
      (item.tags || []).forEach((t) => {
        const trimmed = t.trim();
        if (trimmed) {
          tagCountMap[trimmed] = (tagCountMap[trimmed] || 0) + 1;
        }
      });
    });

    return Object.keys(tagCountMap)
      .sort((a, b) => a.localeCompare(b, 'zh-TW'))
      .map((tag) => ({
        tag,
        count: tagCountMap[tag],
      }));
  }, [audioItems, selectedCategoryId]);

  // 當分類切換時，若已選取的標籤不在新分類的標籤清單中，自動重設為全部標籤
  useEffect(() => {
    if (shelfSearchTag && !availableShelfTags.some((t) => t.tag === shelfSearchTag)) {
      setShelfSearchTag('');
    }
  }, [availableShelfTags, shelfSearchTag]);

  // 點選書架上的語音檔時，切換曲目；手機版自動平滑捲動至下方的播放舞台，電腦版則平滑定位至頂部播放視角
  const handleSelectShelfAudio = (item: AudioItem) => {
    onSelectAudio(item);
    if (window.innerWidth < 1024) {
      if (playerStageRef.current) {
        playerStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (screeningTopRef.current) {
        screeningTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // 「館藏語音選片書架」專屬篩選：分類 + 檔案名稱查詢 + 類別標籤查詢
  const shelfFilteredItems = audioItems.filter((item) => {
    // 1. 分類篩選
    const matchCat =
      selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
    // 2. 頂部通用搜尋 (標題或說明)
    const matchGeneral =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    // 3. 書架專屬檔案名稱查詢
    const qTitle = shelfSearchTitle.trim().toLowerCase();
    const matchTitle = !qTitle || item.title.toLowerCase().includes(qTitle);
    // 4. 書架專屬類別標籤查詢
    const qTag = shelfSearchTag.trim().toLowerCase();
    const itemTags = item.tags || [];
    const matchTag =
      !qTag || itemTags.some((tag) => tag.toLowerCase().includes(qTag));

    return matchCat && matchGeneral && matchTitle && matchTag;
  });

  // 「館藏語音選片書架」分頁計算（以 5 的倍數做選取：5, 10, 15, 20, 25）
  const totalShelfCount = shelfFilteredItems.length;
  const totalShelfPages = Math.max(1, Math.ceil(totalShelfCount / shelfPageSize));
  const safeShelfPage = Math.min(shelfCurrentPage, totalShelfPages);
  const shelfStartIndex = (safeShelfPage - 1) * shelfPageSize;
  const paginatedShelfItems = shelfFilteredItems.slice(
    shelfStartIndex,
    shelfStartIndex + shelfPageSize
  );

  // 當分類、搜尋關鍵字、書架檔案名稱查詢、類別標籤查詢或每頁筆數變更時，自動回到第 1 頁
  useEffect(() => {
    setShelfCurrentPage(1);
  }, [
    selectedCategoryId,
    searchQuery,
    shelfSearchTitle,
    shelfSearchTag,
    shelfPageSize,
  ]);

  const currentCategory = categories.find((c) => c.id === currentItem?.categoryId);

  // 取得播放時要展示的所有圖片（若無設定 slides，自動以封面圖作為預設展演圖，並依時間區段由小到大排序）
  const slides: PlaybackSlide[] =
    currentItem && currentItem.playbackDisplay.slides.length > 0
      ? sortSlidesBySegmentRange(currentItem.playbackDisplay.slides)
      : currentItem
      ? [
          {
            id: 'default_cover',
            imageUrl: currentItem.coverImageUrl,
            caption: currentItem.title,
            timestampSec: 0,
          },
        ]
      : [];

  // 根據播放進度自動計算當前對應的投影片索引 (支援起迄時間區段範圍)
  const autoSlideIndex = (() => {
    if (slides.length <= 1) return 0;
    for (let i = 0; i < slides.length; i++) {
      const sl = slides[i];
      if (
        sl.endTimestampSec !== undefined &&
        currentTime >= sl.timestampSec &&
        currentTime <= sl.endTimestampSec
      ) {
        return i;
      }
    }
    let idx = 0;
    for (let i = 0; i < slides.length; i++) {
      if (currentTime >= slides[i].timestampSec) {
        idx = i;
      }
    }
    return idx;
  })();

  const activeSlideIndex =
    manualSlideIndex !== null && manualSlideIndex < slides.length
      ? manualSlideIndex
      : autoSlideIndex;
  const activeSlide = slides[activeSlideIndex] || slides[0];

  // 當當前選取的圖片切換時，純在縮圖軌道內部平滑捲動，絕不觸發外層 window 水平位移（避免電腦螢幕被往左擠出）
  useEffect(() => {
    const container = slideThumbsContainerRef.current;
    if (container) {
      const activeEl = container.querySelector(
        `[data-slide-index="${activeSlideIndex}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        const targetScrollLeft =
          activeEl.offsetLeft -
          container.offsetLeft -
          (container.clientWidth / 2 - activeEl.clientWidth / 2);
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'smooth',
        });
      }
    }
  }, [activeSlideIndex]);

  const srtSegments = parseSrtContent(
    currentItem?.playbackDisplay.textContent || '',
    duration || currentItem?.duration || 20
  );

  // 根據播放秒數自動計算當前對應的單一 SRT 段落索引 (由後往前比對 startSec，避免邊界秒數重疊卡住)
  const autoParagraphIndex = (() => {
    if (srtSegments.length === 0) return -1;
    for (let i = srtSegments.length - 1; i >= 0; i--) {
      if (currentTime >= srtSegments[i].startSec) {
        return i;
      }
    }
    return 0;
  })();

  const activeParagraphIndex =
    manualSegmentIndex !== null &&
    manualSegmentIndex >= 0 &&
    manualSegmentIndex < srtSegments.length
      ? manualSegmentIndex
      : autoParagraphIndex;

  const activeSegment =
    activeParagraphIndex >= 0 && activeParagraphIndex < srtSegments.length
      ? srtSegments[activeParagraphIndex]
      : null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      pendingAutoPlayRef.current = false;
    } else {
      setManualSlideIndex(null);
      setManualSegmentIndex(null); // 播放時恢復依時間軸自動切換區段
      if (isScreeningAudioLoading || !playableScreeningUrl) {
        pendingAutoPlayRef.current = true;
        return;
      }
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('播放失敗:', err);
          setIsPlaying(false);
        });
    }
  };

  const handleSeek = (newTime: number, targetSegIdx?: number) => {
    const maxSrtEnd =
      srtSegments.length > 0 ? srtSegments[srtSegments.length - 1].endSec : 0;
    const maxAllowed = Math.max(duration || 1, maxSrtEnd, newTime);
    const clamped = Math.max(0, Math.min(maxAllowed, newTime));

    setCurrentTime(clamped);
    setManualSlideIndex(null);
    if (targetSegIdx !== undefined) {
      setManualSegmentIndex(targetSegIdx);
    } else {
      setManualSegmentIndex(null);
    }

    const audio = audioRef.current;
    if (audio) {
      try {
        audio.currentTime = clamped;
      } catch {
        // ignore if audio metadata not yet ready
      }
    }
  };

  /**
   * 手動點選縮圖或切換展示圖片（支援圖片過多時精確選取，並同步音訊與字幕時間戳）
   */
  const handleSelectSlide = (index: number) => {
    const targetSlide = slides[index];
    if (!targetSlide) return;
    setManualSlideIndex(index);

    const newTime = targetSlide.timestampSec;
    const maxSrtEnd =
      srtSegments.length > 0 ? srtSegments[srtSegments.length - 1].endSec : 0;
    const maxAllowed = Math.max(duration || 1, maxSrtEnd, newTime);
    const clamped = Math.max(0, Math.min(maxAllowed, newTime));

    setCurrentTime(clamped);
    if (targetSlide.startSegmentIndex) {
      setManualSegmentIndex(targetSlide.startSegmentIndex);
    } else {
      setManualSegmentIndex(null);
    }

    const audio = audioRef.current;
    if (audio) {
      try {
        audio.currentTime = clamped;
      } catch {
        // ignore
      }
    }
  };

  const handleRateChange = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  /**
   * 啟動當前顯示 SRT 時間區段的「修改」模式
   */
  const startEditActiveSegment = () => {
    if (!activeSegment || activeParagraphIndex < 0) return;
    // 鎖定在目前編輯的區段，避免編輯途中因播放秒數推進而跳走
    setManualSegmentIndex(activeParagraphIndex);
    setEditSegStartSec(activeSegment.startSec);
    setEditSegEndSec(activeSegment.endSec);
    setEditSegStartSrt(secondsToSrtTime(activeSegment.startSec));
    setEditSegEndSrt(secondsToSrtTime(activeSegment.endSec));
    setEditSegText(activeSegment.text);
    setIsEditingSegment(true);
  };

  /**
   * 確認儲存放映室中對當前時間區段「文字內容」與「時間起迄」的修改，
   * 自動同步推移後方受影響的所有區段時間，並立即寫入 Firebase
   */
  const confirmEditActiveSegment = async () => {
    if (!currentItem || !activeSegment || activeParagraphIndex < 0) return;

    const { updatedSegments, deltaSec } = updateSegmentAndCascade(
      srtSegments,
      activeParagraphIndex,
      editSegStartSec,
      editSegEndSec,
      editSegText
    );

    const syncedSlides = syncSlidesWithSrtSegments(
      currentItem.playbackDisplay.slides || [],
      updatedSegments
    );

    const updatedItem: AudioItem = {
      ...currentItem,
      playbackDisplay: {
        textContent: serializeSrtSegments(updatedSegments),
        slides: syncedSlides,
      },
      updatedAt: new Date().toISOString(),
    };

    await onSaveAudioItem(updatedItem);
    setIsEditingSegment(false);
    setManualSegmentIndex(activeParagraphIndex);

    const affectedCount = Math.max(0, updatedSegments.length - 1 - activeParagraphIndex);
    if (deltaSec !== 0 && affectedCount > 0) {
      showToast(
        `✅ 已更新第 #${activeParagraphIndex + 1} 區段文字與起迄時間，並自動同步推移後方 ${affectedCount} 個區段時間（${
          deltaSec > 0 ? `+${deltaSec}` : deltaSec
        } 秒），已即時儲存至 Firebase！`
      );
    } else {
      showToast(
        `✅ 已更新第 #${activeParagraphIndex + 1} 時間區段文字與起迄時間，並已即時儲存至 Firebase！`
      );
    }
  };

  if (!currentItem) {
    return (
      <div className="p-12 text-center parchment-card rounded-2xl">
        <p className="text-[#7A6855]">目前系統尚無語音檔，請先至「語音檔案庫」上傳語音。</p>
      </div>
    );
  }

  return (
    <div ref={screeningTopRef} className="space-y-6 pb-12">
      {/* 儲存成功提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#2E5A44] text-white shadow-2xl border border-emerald-400/30 animate-bounce max-w-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 隱藏的 HTML5 Audio 元件（加入 playsInline 與 preload 支援手機 iOS/Android 播放） */}
      <audio
        ref={audioRef}
        src={playableScreeningUrl || undefined}
        playsInline
        preload="auto"
        loop={isLooping}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (audioRef.current) {
            const t = audioRef.current.currentTime;
            setCurrentTime(t);
            // 當音訊實際播放推進超過手動選取的區段結束時間時（且未處於編輯狀態），自動交回時間軸控制
            if (
              !isEditingSegment &&
              manualSegmentIndex !== null &&
              srtSegments[manualSegmentIndex] &&
              (t < srtSegments[manualSegmentIndex].startSec ||
                t >= srtSegments[manualSegmentIndex].endSec)
            ) {
              setManualSegmentIndex(null);
            }
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          if (!isLooping) setIsPlaying(false);
        }}
      />

      {/* 頂部：分類篩選導覽列 */}
      <div className="parchment-card rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedCategoryId === 'all'
                ? 'bg-[#3A2518] text-white shadow-sm'
                : 'bg-[#EFE6D5] text-[#5C3A1B] hover:bg-[#E2D4BC]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>全部分類 ({audioItems.length})</span>
          </button>

          {categories.map((cat) => {
            const count = audioItems.filter((a) => a.categoryId === cat.id).length;
            const active = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'text-white shadow-sm'
                    : 'bg-white text-[#4A3525] border border-[#E2D5C1] hover:border-[#8B5A2B]'
                }`}
                style={active ? { backgroundColor: cat.themeColor } : undefined}
              >
                {getCategoryIcon(cat.icon, 'w-3.5 h-3.5')}
                <span>{cat.name}</span>
                <span className="opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 獨立區塊：「搜尋館藏語音」查詢功能區塊（位於分類區塊下方，包含關鍵字與類別標籤下拉查詢） */}
      <div className="parchment-card rounded-2xl p-4 md:p-5 shadow-sm border border-[#E2D5C1] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B]">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold font-serif-tc text-sm text-[#2C221E] flex items-center gap-2">
                <span>搜尋館藏語音</span>
                {(searchQuery.trim() || shelfSearchTag) && (
                  <span className="text-[11px] px-2 py-0.2 rounded-full bg-[#8B5A2B] text-white font-mono font-medium">
                    找到 {shelfFilteredItems.length} 部
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[#7A6855]">
                依標題關鍵字、故事內容說明或選取類別標籤即時檢索可放映之語音作品
              </p>
            </div>
          </div>

          {(searchQuery || shelfSearchTag) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setShelfSearchTag('');
              }}
              className="text-xs text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-1 font-medium cursor-pointer bg-[#FAF4E8] border border-[#DFCEB4] px-2.5 py-1 rounded-lg transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>清空搜尋條件</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          {/* 1. 關鍵字搜尋 */}
          <div className="relative sm:col-span-7 lg:col-span-8">
            <Search className="w-4 h-4 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜尋館藏語音標題或內容關鍵字..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8B735B] hover:text-[#2C221E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 2. 類別標籤下拉選取查詢 */}
          <div className="relative sm:col-span-5 lg:col-span-4">
            <Tag className="w-4 h-4 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={shelfSearchTag}
              onChange={(e) => setShelfSearchTag(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner cursor-pointer appearance-none truncate font-medium"
            >
              <option value="">
                全部類別標籤 {availableShelfTags.length === 0 ? '(尚無標籤)' : '(不限)'}
              </option>
              {availableShelfTags.map(({ tag, count }) => (
                <option key={tag} value={tag}>
                  #{tag} ({count} 部)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8B735B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 主放映室佈局：
          - 手機版 (iPhone/Android，未達 lg 斷點)：選片書架（查詢後的結果）在上方 (order-1)，播放畫面在下方 (order-2)
          - 電腦版 (lg 斷點以上)：播放畫面在左側 (lg:order-1 lg:col-span-8)，選片書架在右側 (lg:order-2 lg:col-span-4)
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 電腦版左側 8 欄 / 手機版下方：放映室主舞台（圖片展演 + 播放器 + 播放時同步文字） */}
        <div ref={playerStageRef} className="order-2 lg:order-1 lg:col-span-8 space-y-6">
          {/* 舞台主卡片 */}
          <div className="rounded-2xl overflow-hidden bg-[#1E1612] text-[#FAF5EC] shadow-2xl border border-[#4A3427]">
            {/* 舞台頂部資訊列 */}
            <div className="px-5 py-4 bg-[#2A1E18] border-b border-[#3E2C23] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {currentCategory && (
                  <span
                    className="px-2.5 py-1 rounded-md text-xs font-semibold text-white flex items-center gap-1.5"
                    style={{ backgroundColor: currentCategory.themeColor }}
                  >
                    {getCategoryIcon(currentCategory.icon, 'w-3.5 h-3.5')}
                    <span>{currentCategory.name}</span>
                  </span>
                )}
                <h2 className="text-lg md:text-xl font-bold font-serif-tc text-[#FAF5EC]">
                  {currentItem.title}
                </h2>
              </div>

              <button
                onClick={() => onEditAudio(currentItem)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-[#F3D5B5] flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>編輯此語音圖文設定</span>
              </button>
            </div>

            {/* 播放時的圖片顯示舞台 (Playback Image Stage) */}
            <div className="relative aspect-16/9 w-full bg-[#120D0A] overflow-hidden flex items-center justify-center group">
              {activeSlide && (
                <>
                  {/* 背景模糊氛圍層 */}
                  <img
                    src={activeSlide.imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110"
                  />
                  {/* 主展演圖片 */}
                  <img
                    src={activeSlide.imageUrl}
                    alt={activeSlide.caption || currentItem.title}
                    className="relative z-10 max-h-full max-w-full object-contain transition-all duration-500"
                  />
                </>
              )}

              {/* 左右手動切換圖片按鈕（若有多張播放圖片） */}
              {slides.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setManualSlideIndex((activeSlideIndex - 1 + slides.length) % slides.length)
                    }
                    className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-black/90 border border-white/20 text-white opacity-85 hover:opacity-100 transition shadow-xl cursor-pointer"
                    title="上一張播放圖片"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setManualSlideIndex((activeSlideIndex + 1) % slides.length)}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/65 hover:bg-black/90 border border-white/20 text-white opacity-85 hover:opacity-100 transition shadow-xl cursor-pointer"
                    title="下一張播放圖片"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* 底部圖片說明字幕條 */}
              <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-10 flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>
                      播放時圖片展示 ({activeSlideIndex + 1} / {slides.length})
                    </span>
                    {activeSlide?.timestampSec !== undefined && (
                      <span className="px-1.5 py-0.5 rounded bg-white/15 text-white font-mono">
                        出現秒數 {formatDuration(activeSlide.timestampSec)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm md:text-base font-medium text-white whitespace-pre-line line-clamp-2">
                    {activeSegment?.text || activeSlide?.caption || currentItem.description}
                  </p>
                </div>

                {/* 多張圖片縮圖切換器（支援圖片過多時平滑水平滑動、滑鼠滾輪與精確點選） */}
                {slides.length > 1 && (
                  <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[50%] md:max-w-[58%] lg:max-w-[62%] bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/20">
                    {/* 向左滾動按鈕 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (slideThumbsContainerRef.current) {
                          slideThumbsContainerRef.current.scrollBy({
                            left: -120,
                            behavior: 'smooth',
                          });
                        }
                      }}
                      className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 shrink-0 cursor-pointer"
                      title="向左滾動縮圖"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    {/* 可水平滾動的縮圖列表 */}
                    <div
                      ref={slideThumbsContainerRef}
                      onWheel={(e) => {
                        if (e.deltaY !== 0 && slideThumbsContainerRef.current) {
                          slideThumbsContainerRef.current.scrollLeft += e.deltaY;
                        }
                      }}
                      className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin py-0.5 px-0.5 max-w-full"
                    >
                      {slides.map((sl, i) => (
                        <button
                          key={sl.id || `slide_${i}`}
                          data-slide-index={i}
                          type="button"
                          onClick={() => handleSelectSlide(i)}
                          className={`w-12 h-8 rounded-md overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                            i === activeSlideIndex
                              ? 'border-amber-400 scale-105 shadow-md ring-2 ring-amber-400/60'
                              : 'border-white/30 opacity-60 hover:opacity-100 hover:border-white/80'
                          }`}
                          title={`#${i + 1} (${formatDuration(sl.timestampSec)}) - ${
                            sl.caption || '展示圖片'
                          }`}
                        >
                          <img
                            src={sl.imageUrl}
                            alt=""
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        </button>
                      ))}
                    </div>

                    {/* 向右滾動按鈕 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (slideThumbsContainerRef.current) {
                          slideThumbsContainerRef.current.scrollBy({
                            left: 120,
                            behavior: 'smooth',
                          });
                        }
                      }}
                      className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 shrink-0 cursor-pointer"
                      title="向右滾動縮圖"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 專業語音播放控制面板 */}
            <div className="p-5 bg-[#271C16] space-y-4">
              {/* 時間進度條 */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  className="w-full accent-[#D4A373] h-2 rounded-lg bg-[#4A3528] cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs font-mono text-[#C8B5A0]">
                  <span>{formatDuration(currentTime)}</span>
                  {isScreeningAudioLoading && (
                    <span className="text-amber-300 animate-pulse font-sans">
                      正在從 Google 雲端硬碟載入音訊串流...
                    </span>
                  )}
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>

              {/* 播放控制按鈕列 */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRateChange}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-mono text-[#F3D5B5] transition cursor-pointer"
                    title="調整播放語速"
                  >
                    {playbackRate}x 語速
                  </button>
                  <button
                    onClick={() => setIsLooping(!isLooping)}
                    className={`p-2 rounded-lg transition cursor-pointer ${
                      isLooping
                        ? 'bg-[#D4A373] text-[#2B1B11]'
                        : 'bg-white/10 text-[#C8B5A0] hover:bg-white/15'
                    }`}
                    title="循環播放"
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleSeek(currentTime - 5)}
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF5EC] transition cursor-pointer"
                    title="倒退 5 秒"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-14 h-14 rounded-full bg-[#D4A373] hover:bg-[#E3B587] text-[#2B1B11] flex items-center justify-center shadow-lg transition transform active:scale-95 cursor-pointer"
                    title={isScreeningAudioLoading ? '正在載入雲端音訊...' : isPlaying ? '暫停' : '播放'}
                  >
                    {isScreeningAudioLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    onClick={() => handleSeek(currentTime + 5)}
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF5EC] transition cursor-pointer"
                    title="快轉 5 秒"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-[#FAF5EC] transition cursor-pointer"
                    title={isMuted ? '取消靜音' : '靜音'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 播放時的文字顯示區 (Synchronized Reading Sheet & Description) */}
          <div className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D9C5] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold font-serif-tc text-base text-[#2C221E]">
                    播放時的文字顯示與導讀講稿
                  </h3>
                  <p className="text-xs text-[#7A6855]">
                    依播放秒數自動切換顯示當前時間區段內容
                  </p>
                </div>
              </div>

              {/* 字體大小切換 */}
              <div className="flex items-center gap-1 bg-[#EFE6D5] p-1 rounded-lg">
                {(
                  [
                    { id: 'sm', label: '小' },
                    { id: 'base', label: '標準' },
                    { id: 'lg', label: '大字閱讀' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setFontSize(opt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                      fontSize === opt.id
                        ? 'bg-[#3A2518] text-white'
                        : 'text-[#5C3A1B] hover:bg-[#E2D4BC]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 播放時顯示的 SRT 文字段落（一次只顯示一筆時間區段內容，當秒數到達時自動切換下一筆） */}
            <div>
              {!activeSegment ? (
                <p className="text-sm text-[#7A6855] italic py-6 text-center">
                  此語音檔尚未設定「播放時的文字顯示」，可點擊右上角「編輯此語音圖文設定」新增。
                </p>
              ) : (
                <div className="p-6 rounded-2xl bg-[#FFF9EE] border-2 border-[#8B5A2B] shadow-md transition-all duration-300 space-y-4">
                  {/* 頂部：當前區段序號、SRT 起迄時間、修改按鈕與前後區段快速跳轉 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5D9C5]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-[#3A2518] text-white">
                        區段 #{activeSegment.index} / {srtSegments.length}
                      </span>
                      <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-[#8B5A2B] text-white">
                        {secondsToSrtTime(activeSegment.startSec)} {'-->'}{' '}
                        {secondsToSrtTime(activeSegment.endSec)}
                      </span>
                      <span className="text-xs font-medium text-[#8B5A2B] animate-pulse">
                        ● 隨播放秒數自動切換
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* (1) 加入「修改」按鈕，讓使用者直接在放映室修改文字內容及時間起迄 */}
                      {!isEditingSegment && (
                        <button
                          type="button"
                          onClick={startEditActiveSegment}
                          className="px-3 py-1 rounded-lg bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1 shadow-xs transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>修改</span>
                        </button>
                      )}

                      {srtSegments.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={activeParagraphIndex <= 0}
                            onClick={() => {
                              setIsEditingSegment(false);
                              const prevIdx = Math.max(0, activeParagraphIndex - 1);
                              const prevSeg = srtSegments[prevIdx];
                              if (prevSeg) handleSeek(prevSeg.startSec, prevIdx);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 text-xs font-medium text-[#5C3A1B] flex items-center gap-1 cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>上一區段</span>
                          </button>
                          <button
                            type="button"
                            disabled={activeParagraphIndex >= srtSegments.length - 1}
                            onClick={() => {
                              setIsEditingSegment(false);
                              const nextIdx = Math.min(
                                srtSegments.length - 1,
                                activeParagraphIndex + 1
                              );
                              const nextSeg = srtSegments[nextIdx];
                              if (nextSeg) handleSeek(nextSeg.startSec, nextIdx);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 text-xs font-medium text-[#5C3A1B] flex items-center gap-1 cursor-pointer"
                          >
                            <span>下一區段</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 檢視模式 vs 修改模式（可修改文字內容與時間起迄，並同步推移後方區段時間） */}
                  {isEditingSegment ? (
                    <div className="pt-2 space-y-3 bg-[#FAF3E6] p-4 rounded-xl border border-[#DFCEB4]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
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
                              className="w-20 px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-mono text-[#2C221E]"
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
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-mono text-[#2C221E]"
                              placeholder="00:00:00,000"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                            結束時間 (修改後自動同步推移後方區段)
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
                              className="w-20 px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-mono text-[#2C221E]"
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
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-mono text-[#2C221E]"
                              placeholder="00:00:05,000"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                          本區段文字內容（同時同步更新對應圖說文字）：
                        </label>
                        <textarea
                          rows={3}
                          value={editSegText}
                          onChange={(e) => setEditSegText(e.target.value)}
                          className="w-full p-3 rounded-xl border border-[#C8B598] bg-white text-sm font-serif-tc text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                          placeholder="請輸入此時間區段的文字內容..."
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingSegment(false)}
                          className="px-3.5 py-1.5 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#EFE6D5] text-xs font-medium text-[#5C3A1B] flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>取消</span>
                        </button>
                        <button
                          type="button"
                          onClick={confirmEditActiveSegment}
                          className="px-4 py-1.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>確認修改並同步後方區段時間</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 單筆時間區段的文字內容 */
                    <div className="py-2 min-h-[96px] flex items-center">
                      <p
                        className={`text-[#2C221E] whitespace-pre-line leading-relaxed font-serif-tc w-full ${
                          fontSize === 'sm'
                            ? 'text-sm'
                            : fontSize === 'lg'
                            ? 'text-xl'
                            : 'text-lg'
                        }`}
                      >
                        {activeSegment.text}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 館藏說明簡介 */}
            <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1]">
              <p className="text-xs font-semibold text-[#8B5A2B] mb-1">【館藏簡介說明】</p>
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                {currentItem.description || '尚無簡介說明'}
              </p>
            </div>
          </div>
        </div>

        {/* 電腦版右側 4 欄 / 手機版上方：館藏語音選片書架（查詢後的結果列表） */}
        <div className="order-1 lg:order-2 lg:col-span-4">
          <div className="parchment-card rounded-2xl p-5 shadow-md lg:sticky lg:top-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5D9C5] pb-3">
              <div className="flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-[#8B5A2B]" />
                <h3 className="font-bold font-serif-tc text-base text-[#2C221E]">
                  館藏語音選片書架
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#EFE6D5] text-[#5C3A1B] font-medium">
                共 {totalShelfCount} 部
              </span>
            </div>

            {/* 書架專屬查詢功能：檔案名稱、類別標籤 */}
            <div className="space-y-2 bg-[#FAF6EE] p-3 rounded-xl border border-[#E5D9C5] text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#5C3A1B] flex items-center gap-1">
                  <Search className="w-3.5 h-3.5 text-[#8B5A2B]" />
                  <span>書架快速查詢：</span>
                </span>
                {(shelfSearchTitle || shelfSearchTag) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShelfSearchTitle('');
                      setShelfSearchTag('');
                    }}
                    className="text-[11px] text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-0.5 cursor-pointer font-medium"
                  >
                    <X className="w-3 h-3" />
                    <span>清空條件</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 檔案名稱查詢 */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="查詢檔案名稱..."
                    value={shelfSearchTitle}
                    onChange={(e) => setShelfSearchTitle(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>

                {/* 類別標籤查詢 (下拉選單方式) */}
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={shelfSearchTag}
                    onChange={(e) => setShelfSearchTag(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate"
                  >
                    <option value="">
                      全部類別標籤 {availableShelfTags.length === 0 ? '(尚無標籤)' : '(不限)'}
                    </option>
                    {availableShelfTags.map(({ tag, count }) => (
                      <option key={tag} value={tag}>
                        #{tag} ({count} 部)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#8B735B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* 書架分頁設定與上方換頁切換列 (以 5 的倍數做選取) */}
            <div className="p-2.5 rounded-xl bg-[#EFE6D5] border border-[#DFCEB4] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#3A2518] font-semibold">
                  第 <strong className="font-mono text-[#8B5A2B]">{safeShelfPage}</strong> /{' '}
                  <strong className="font-mono text-[#8B5A2B]">{totalShelfPages}</strong> 頁
                </span>
                <div className="flex items-center gap-1">
                  <label className="text-[#5C3A1B] text-[11px] font-medium">每頁：</label>
                  <select
                    value={shelfPageSize}
                    onChange={(e) => {
                      setShelfPageSize(Number(e.target.value));
                      setShelfCurrentPage(1);
                    }}
                    className="px-1.5 py-0.5 rounded border border-[#C8B598] bg-white text-[11px] font-semibold text-[#2C221E] cursor-pointer"
                  >
                    {[5, 10, 15, 20, 25].map((size) => (
                      <option key={size} value={size}>
                        {size} 部 / 頁
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 上方翻頁按鈕 */}
              {totalShelfPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeShelfPage <= 1}
                    onClick={() => setShelfCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-0.5 rounded border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 text-[#3A2518] text-[11px] font-medium flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    <span>上頁</span>
                  </button>

                  <button
                    type="button"
                    disabled={safeShelfPage >= totalShelfPages}
                    onClick={() => setShelfCurrentPage((p) => Math.min(totalShelfPages, p + 1))}
                    className="px-2 py-0.5 rounded border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 text-[#3A2518] text-[11px] font-medium flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>下頁</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* 書架語音項目列表 */}
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {paginatedShelfItems.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#7A6855]">
                  此分類或搜尋條件下沒有符合的語音檔
                </div>
              ) : (
                paginatedShelfItems.map((item, idxInPage) => {
                  const isSelected = item.id === currentItem.id;
                  const cat = categories.find((c) => c.id === item.categoryId);
                  const globalSeq = shelfStartIndex + idxInPage + 1;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectShelfAudio(item)}
                      className={`group flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#3A2518] text-[#FAF5EC] border-[#3A2518] shadow-md'
                          : 'bg-white hover:bg-[#FAF4E8] text-[#2C221E] border-[#E5D9C5]'
                      }`}
                    >
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[#2C221E]">
                        <img
                          src={item.coverImageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                        <div
                          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <Play className="w-5 h-5 text-white fill-current" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {/* 選片書架清單序號：依照查詢條件從 1 開始 */}
                          <span
                            className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-[#3A2518] text-white'
                            }`}
                            title={`清單序號：第 ${globalSeq} 筆`}
                          >
                            #{globalSeq}
                          </span>
                          {/* 語音檔獨立編號（館藏分類編號 + 流水號） */}
                          <span
                            className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                              isSelected
                                ? 'bg-white/20 text-amber-200'
                                : 'bg-[#FAF4E8] border border-[#D5C5AE] text-[#5C3A1B]'
                            }`}
                            title="語音檔獨立編號（館藏分類編號 + 上傳順序流水號）"
                          >
                            {audioCallNumberMap.get(item.id) || (cat ? `${cat.code}-0` : 'CAT-0')}
                          </span>
                          {cat && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{ backgroundColor: cat.themeColor }}
                            >
                              [{cat.code}] {cat.name}
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-mono ${
                              isSelected ? 'text-amber-200' : 'text-[#7A6855]'
                            }`}
                          >
                            {formatDuration(item.duration)}
                          </span>
                        </div>

                        <h4 className="font-bold font-serif-tc text-sm truncate">
                          {item.title}
                        </h4>
                        <p
                          className={`text-xs line-clamp-1 mt-0.5 ${
                            isSelected ? 'text-[#E2D4C0]' : 'text-[#6E5D4F]'
                          }`}
                        >
                          {item.description}
                        </p>

                        {/* 類別標籤徽章展示 */}
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {item.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShelfSearchTag(tag);
                                }}
                                title={`點擊過濾標籤 #${tag}`}
                                className={`text-[10px] px-1.5 py-0.2 rounded transition cursor-pointer ${
                                  shelfSearchTag === tag
                                    ? 'bg-[#8B5A2B] text-white font-bold shadow-xs'
                                    : isSelected
                                    ? 'bg-white/15 text-[#FAF5EC] hover:bg-white/25'
                                    : 'bg-[#FAF4E8] border border-[#DFCEB4] text-[#5C3A1B] hover:bg-[#EFE6D5]'
                                }`}
                              >
                                #{tag}
                              </span>
                            ))}
                            {item.tags.length > 3 && (
                              <span className="text-[10px] text-[#8B735B]">
                                +{item.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 書架底部翻頁控制列 */}
            {totalShelfPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-[#E5D9C5] text-xs">
                <span className="text-[#7A6855] text-[11px]">
                  共 {totalShelfCount} 部語音
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeShelfPage <= 1}
                    onClick={() => setShelfCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-1 rounded-md border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 text-[#3A2518] text-[11px] font-medium flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    <span>上一頁</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalShelfPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setShelfCurrentPage(pageNum)}
                        className={`w-6 h-6 rounded-md font-mono text-[11px] font-bold transition cursor-pointer ${
                          pageNum === safeShelfPage
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
                    disabled={safeShelfPage >= totalShelfPages}
                    onClick={() => setShelfCurrentPage((p) => Math.min(totalShelfPages, p + 1))}
                    className="px-2 py-1 rounded-md border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 text-[#3A2518] text-[11px] font-medium flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>下一頁</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
