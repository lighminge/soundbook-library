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
  Repeat1,
  ListOrdered,
  Loader2,
  Check,
  CheckCircle2,
  X,
  Tag,
  Maximize2,
  Minimize2,
  Cast,
  Tv,
  Airplay,
  QrCode,
  Copy,
  Share2,
  SkipBack,
  SkipForward,
  Plus,
  Trash2,
  Shuffle,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  ArrowUpToLine,
  Save,
  FolderPlus,
  Folder,
  FolderOpen,
  Bookmark,
  BookmarkPlus,
  Music2,
  User,
  Mail,
  Lock,
  Info,
  Smartphone,
} from 'lucide-react';
import { AudioItem, Category, PlaybackSlide, SavedPlaylist } from '../types';
import { formatDuration, getCategoryIcon } from './DashboardView';
import {
  fetchAudioBlobFromGoogleDrive,
  loadSavedPlaylists,
  saveSavedPlaylist,
  deleteSavedPlaylist,
} from '../services/storageService';
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
import { recordPlayLog } from '../services/playStatsService';

interface ScreeningRoomViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  activeAudio: AudioItem | null;
  initialCategoryFilter?: string;
  initialPlaylistIds?: string[];
  initialAutoPlay?: boolean;
  onClearInitialPlaylist?: () => void;
  onSelectAudio: (item: AudioItem) => void;
  onEditAudio: (item: AudioItem) => void;
  onSaveAudioItem: (item: AudioItem) => Promise<void>;
  isGuest?: boolean;
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

interface ScreeningMarqueeTitleProps {
  title: string;
  size?: 'xs' | 'sm' | 'base';
  className?: string;
  isSelected?: boolean;
}

/**
 * 放映室專用書架與播放清單語音檔名跑馬燈元件：
 * 當檔名長度超出容器時，滑鼠移入卡片時自動啟動跑馬燈動畫，顯示完整語音檔名
 */
export const ScreeningMarqueeTitle: React.FC<ScreeningMarqueeTitleProps> = ({
  title,
  size = 'sm',
  className = '',
  isSelected = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [scrollDist, setScrollDist] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        if (textWidth > containerWidth + 2) {
          setIsOverflow(true);
          // 額外加上 36px 餘裕並搭配 pr-8，確保跑馬燈滾動至最末端時，最後字元完全呈現且留有舒適間距
          setScrollDist(textWidth - containerWidth + 36);
        } else {
          setIsOverflow(false);
          setScrollDist(0);
        }
      }
    };

    checkOverflow();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(checkOverflow);
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => checkOverflow());
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', checkOverflow);
    return () => {
      window.removeEventListener('resize', checkOverflow);
      if (ro) ro.disconnect();
    };
  }, [title]);

  const durationSec = Math.max(4, Math.min(14, Math.round(scrollDist / 20)));

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${className}`}
      title={title}
    >
      <h4
        ref={textRef}
        className={`font-bold font-serif-tc whitespace-nowrap inline-block transition-colors ${
          size === 'xs' ? 'text-xs' : size === 'base' ? 'text-base' : 'text-sm'
        } ${isSelected ? 'text-[#FAF5EC]' : 'text-[#2C221E]'} ${
          isOverflow ? 'animate-marquee-on-hover pr-8' : 'truncate'
        }`}
        style={
          isOverflow
            ? ({
                '--marquee-dist': `-${scrollDist}px`,
                '--marquee-duration': `${durationSec}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {title}
      </h4>
    </div>
  );
};

export const ScreeningRoomView: React.FC<ScreeningRoomViewProps> = ({
  categories,
  audioItems,
  activeAudio,
  initialCategoryFilter = 'all',
  initialPlaylistIds,
  initialAutoPlay = false,
  onClearInitialPlaylist,
  onSelectAudio,
  onEditAudio,
  onSaveAudioItem,
  isGuest = false,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(initialCategoryFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  // 放映循環/順序模式：'sequential' (循序播放，播完清單停止) | 'playlist' (清單循環，播完最後一首跳回第一首) | 'single' (單曲循環)
  const [playbackLoopMode, setPlaybackLoopMode] = useState<'sequential' | 'playlist' | 'single'>('sequential');
  const [manualSlideIndex, setManualSlideIndex] = useState<number | null>(null);
  const [manualSegmentIndex, setManualSegmentIndex] = useState<number | null>(null);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  // 放映室「播放清單」功能：僅在放映室當前畫面週期內暫存，不寫入 localStorage；離開放映室後自動清空
  const [playlistItemIds, setPlaylistItemIds] = useState<string[]>(() => {
    return initialPlaylistIds && initialPlaylistIds.length > 0 ? initialPlaylistIds : [];
  });

  // 右側書架分頁標籤：'shelf' (館藏選片書架) | 'playlist' (播放清單)
  const [shelfTab, setShelfTab] = useState<'shelf' | 'playlist'>(() =>
    initialPlaylistIds && initialPlaylistIds.length > 0 ? 'playlist' : 'shelf'
  );

  // 當由外部（如「館藏總覽」單曲播放、隨機播放或選取多筆語音播放按鈕）傳入 initialPlaylistIds 或 initialAutoPlay 時同步套用
  useEffect(() => {
    if (initialPlaylistIds && initialPlaylistIds.length > 0) {
      setPlaylistItemIds(initialPlaylistIds);
      setShelfTab('playlist');
    }
    if (initialAutoPlay) {
      pendingAutoPlayRef.current = true;
    }
    if ((initialPlaylistIds && initialPlaylistIds.length > 0) || initialAutoPlay) {
      onClearInitialPlaylist?.();
    }
  }, [initialPlaylistIds, initialAutoPlay, onClearInitialPlaylist]);

  // 離開放映室頁面（組件卸載）時，清空暫存播放清單
  useEffect(() => {
    return () => {
      setPlaylistItemIds([]);
      setActiveSavedPlaylistId(null);
      localStorage.removeItem('soundbook_screening_playlist');
      localStorage.removeItem('soundbook_active_saved_playlist_id');
    };
  }, []);

  // 有效的播放清單項目 (自動過濾已不存在的語音)
  const playlistItems: AudioItem[] = useMemo(() => {
    const itemMap = new Map<string, AudioItem>(audioItems.map((a) => [a.id, a]));
    return playlistItemIds.map((id) => itemMap.get(id)).filter(Boolean) as AudioItem[];
  }, [playlistItemIds, audioItems]);

  // 計算播放清單所有語音總時長 (秒)
  const totalPlaylistDuration = useMemo(() => {
    return playlistItems.reduce((acc, item) => acc + (item.duration || 0), 0);
  }, [playlistItems]);

  // 書架多選加入清單模式開關與已選取的語音 ID 清單
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [selectedShelfIds, setSelectedShelfIds] = useState<string[]>([]);

  // 全螢幕模式下的浮動播放清單展開開關
  const [showFullscreenPlaylist, setShowFullscreenPlaylist] = useState<boolean>(false);

  // 已儲存的播放清單列表 (來自 Firestore / LocalStorage)
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState<boolean>(false);

  // 當前選用/綁定的已儲存播放清單 ID (若為自訂臨時清單則為 null，進入放映室預設不選取任何已儲存清單)
  const [activeSavedPlaylistId, setActiveSavedPlaylistId] = useState<string | null>(null);

  // 儲存播放清單 Modal 狀態與表單
  const [showSavePlaylistModal, setShowSavePlaylistModal] = useState<boolean>(false);
  const [savePlaylistName, setSavePlaylistName] = useState<string>('');
  const [savePlaylistDesc, setSavePlaylistDesc] = useState<string>('');
  const [saveAsNewMode, setSaveAsNewMode] = useState<boolean>(false);

  // 管理已儲存清單 Modal 狀態
  const [showManagePlaylistsModal, setShowManagePlaylistsModal] = useState<boolean>(false);
  const [manageSearchQuery, setManageSearchQuery] = useState<string>('');
  const [managePageSize, setManagePageSize] = useState<number>(5);
  const [manageCurrentPage, setManageCurrentPage] = useState<number>(1);
  const [editingPlaylistData, setEditingPlaylistData] = useState<SavedPlaylist | null>(null);
  const [isCreatingNewPlaylist, setIsCreatingNewPlaylist] = useState<boolean>(false);
  const [deleteConfirmPlaylist, setDeleteConfirmPlaylist] = useState<SavedPlaylist | null>(null);
  const [playlistPickerAddAudioId, setPlaylistPickerAddAudioId] = useState<string>('');
  // 編輯播放清單時：快速檢索未加入語音之查詢狀態 (關鍵字、類別標籤)
  const [editPickerSearchQuery, setEditPickerSearchQuery] = useState<string>('');
  const [editPickerTagFilter, setEditPickerTagFilter] = useState<string>('');

  // 放映室「播放時的文字顯示與導讀講稿」單筆時間區段即時修改狀態
  const [isEditingSegment, setIsEditingSegment] = useState<boolean>(false);
  const [editSegStartSec, setEditSegStartSec] = useState<number>(0);
  const [editSegEndSec, setEditSegEndSec] = useState<number>(5);
  const [editSegStartSrt, setEditSegStartSrt] = useState<string>('00:00:00,000');
  const [editSegEndSrt, setEditSegEndSrt] = useState<string>('00:00:05,000');
  const [editSegText, setEditSegText] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 「館藏語音選片書架」專屬查詢狀態（檔案名稱、類別標籤、主講人）
  const [shelfSearchTitle, setShelfSearchTitle] = useState('');
  const [shelfSearchTag, setShelfSearchTag] = useState('');
  const [shelfSearchSpeaker, setShelfSearchSpeaker] = useState('');

  // 「館藏語音選片書架」專屬分頁狀態（以 5 的倍數做選取）
  const [shelfPageSize, setShelfPageSize] = useState<number>(5);
  const [shelfCurrentPage, setShelfCurrentPage] = useState<number>(1);

  // 依據「館藏分類編號 + 流水號 (號碼從 1 開始，依語音檔案上傳順序)」建立每筆語音檔之獨立編號
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

  // 舞台全螢幕容器 Ref 與狀態
  const theaterStageRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  // 全螢幕播放時：滑鼠未移動約 5 秒後自動隱藏下方播放功能區，滑鼠移動時自動顯示
  const [showFullscreenControls, setShowFullscreenControls] = useState<boolean>(true);
  const fullscreenControlsTimerRef = useRef<number | null>(null);

  // 投放到其他裝置 Modal 狀態與複製成功標記
  const [showCastModal, setShowCastModal] = useState<boolean>(false);
  const [castCopied, setCastCopied] = useState<boolean>(false);

  // 分享功能 Modal 狀態與複製標記
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [shareIncludeTime, setShareIncludeTime] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  // 初次載入若網址帶有 ?t=秒數，於音訊載入時自動跳轉定位
  const initialSeekTimeRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tParam = urlParams.get('t');
      if (tParam) {
        const parsed = parseFloat(tParam);
        if (!isNaN(parsed) && parsed > 0) {
          initialSeekTimeRef.current = parsed;
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showAutoplayPrompt, setShowAutoplayPrompt] = useState<boolean>(false);
  const [isPresentationConnected, setIsPresentationConnected] = useState<boolean>(false);
  const presentationConnectionRef = useRef<any>(null);

  const shouldAutoPlayFromUrl = useMemo(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('autoplay') === '1' || p.get('shared') === '1';
    } catch {
      return false;
    }
  }, []);

  const pendingAutoPlayRef = useRef<boolean>(Boolean(initialAutoPlay || shouldAutoPlayFromUrl));

  useEffect(() => {
    if (initialAutoPlay || shouldAutoPlayFromUrl) {
      pendingAutoPlayRef.current = true;
    }
  }, [initialAutoPlay, shouldAutoPlayFromUrl]);

  // 嘗試啟動自動播放；若遭遇現代瀏覽器 Autoplay 規範擋下 (NotAllowedError)，
  // 顯示醒目操作橫幅並綁定全域單次手勢（點選螢幕任意處立即解鎖並播放）
  const attemptAutoPlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => {
        setIsPlaying(true);
        setShowAutoplayPrompt(false);
        pendingAutoPlayRef.current = false;
      })
      .catch((err) => {
        console.warn('瀏覽器自動播放受限 (Autoplay policy):', err);
        setShowAutoplayPrompt(true);
        const handleUserGesture = () => {
          if (audioRef.current) {
            audioRef.current
              .play()
              .then(() => {
                setIsPlaying(true);
                setShowAutoplayPrompt(false);
                pendingAutoPlayRef.current = false;
              })
              .catch(console.warn);
          }
          window.removeEventListener('click', handleUserGesture, true);
          window.removeEventListener('touchstart', handleUserGesture, true);
          window.removeEventListener('keydown', handleUserGesture, true);
        };
        window.addEventListener('click', handleUserGesture, true);
        window.addEventListener('touchstart', handleUserGesture, true);
        window.addEventListener('keydown', handleUserGesture, true);
      });
  };

  // 透過 Presentation API 發送雙向同步訊息至 Android TV / 客廳電視
  const sendPresentationMessage = (msg: any) => {
    const conn = presentationConnectionRef.current;
    if (conn && (conn.state === 'connected' || conn.state === 'connecting')) {
      try {
        conn.send(JSON.stringify(msg));
      } catch (e) {
        console.warn('發送投放同步訊息失敗:', e);
      }
    }
  };

  const setupPresentationConnection = (conn: any) => {
    if (!conn) return;
    conn.onconnect = () => {
      setIsPresentationConnected(true);
      sendPresentationMessage({
        type: 'INIT_SYNC',
        audioId: currentItem?.id,
        currentTime: audioRef.current?.currentTime || currentTime,
        isPlaying: isPlaying,
        playbackRate: playbackRate,
        muted: isMuted,
      });
    };
    conn.onclose = () => {
      setIsPresentationConnected(false);
      presentationConnectionRef.current = null;
      showToast('📺 已中斷客廳電視投放連線');
    };
    conn.onterminate = () => {
      setIsPresentationConnected(false);
      presentationConnectionRef.current = null;
      showToast('📺 客廳電視投放已結束');
    };
  };

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

  // ==========================================
  // 播放統計：累計每首語音檔實際播放的秒數，於暫停 / 結束 / 切換曲目 / 離開頁面時寫入播放紀錄
  // ==========================================
  const playAccumRef = useRef<{ item: AudioItem | null; seconds: number; lastTime: number | null }>({
    item: null,
    seconds: 0,
    lastTime: null,
  });

  const flushPlayStats = () => {
    const acc = playAccumRef.current;
    if (acc.item && acc.seconds >= 1) {
      recordPlayLog(acc.item, acc.seconds).catch(() => {});
    }
    acc.seconds = 0;
    acc.lastTime = null;
  };

  const trackPlayProgress = (t: number, paused: boolean) => {
    const acc = playAccumRef.current;
    if (!currentItem) return;
    if (!acc.item || acc.item.id !== currentItem.id) {
      flushPlayStats();
      acc.item = currentItem;
    }
    if (paused) {
      acc.lastTime = t;
      return;
    }
    if (acc.lastTime !== null) {
      const delta = t - acc.lastTime;
      // 只累計正常推進的播放（排除拖曳跳轉與循環重播造成的大幅跳動）
      if (delta > 0 && delta < 3) {
        acc.seconds += delta;
      }
    }
    acc.lastTime = t;
  };

  useEffect(() => {
    playAccumRef.current.item = currentItem;
    playAccumRef.current.seconds = 0;
    playAccumRef.current.lastTime = null;
    return () => {
      flushPlayStats();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id]);

  useEffect(() => {
    const handleHidden = () => {
      if (document.visibilityState === 'hidden') flushPlayStats();
    };
    const handleUnload = () => flushPlayStats();
    document.addEventListener('visibilitychange', handleHidden);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleHidden);
      window.removeEventListener('beforeunload', handleUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 當切換曲目時重置播放狀態（保留 pendingAutoPlayRef，讓新曲目就緒後立即自動放映）
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setManualSlideIndex(null);
    setManualSegmentIndex(null);
    setIsEditingSegment(false);
    if (currentItem) {
      setDuration(currentItem.duration || 20);
    }
  }, [currentItem?.id]);

  // 當 playableScreeningUrl 解析完成或更新時，讓 audio 元件重新載入來源；若有待執行之自動播放則調用 attemptAutoPlay()
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && playableScreeningUrl) {
      audio.load();
      if (pendingAutoPlayRef.current) {
        attemptAutoPlay();
      }
    }
  }, [playableScreeningUrl, currentItem?.id]);

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

  // 統計可用主講人與筆數（以當前選取分類為主，全選則統計全部館藏）
  const availableShelfSpeakers = useMemo(() => {
    const targetItems =
      selectedCategoryId === 'all'
        ? audioItems
        : audioItems.filter((i) => i.categoryId === selectedCategoryId);

    const speakerCountMap: Record<string, number> = {};
    let unassignedCount = 0;
    targetItems.forEach((item) => {
      const sp = item.speaker?.trim();
      if (sp) {
        speakerCountMap[sp] = (speakerCountMap[sp] || 0) + 1;
      } else {
        unassignedCount++;
      }
    });

    const list = Object.keys(speakerCountMap)
      .sort((a, b) => a.localeCompare(b, 'zh-TW'))
      .map((speaker) => ({
        speaker,
        count: speakerCountMap[speaker],
      }));

    return {
      speakers: list,
      unassignedCount,
    };
  }, [audioItems, selectedCategoryId]);

  // 當分類切換時，若已選取的主講人不在新分類的主講人名單中，自動重設為全部主講人
  useEffect(() => {
    if (
      shelfSearchSpeaker &&
      shelfSearchSpeaker !== '__unassigned__' &&
      !availableShelfSpeakers.speakers.some((s) => s.speaker === shelfSearchSpeaker)
    ) {
      setShelfSearchSpeaker('');
    }
  }, [availableShelfSpeakers, shelfSearchSpeaker]);

  // 當使用者在「搜尋館藏語音」輸入關鍵字或選取標籤、主講人時：若播放清單內有內容，自動清空並切回「館藏選片書架」顯示查詢結果
  const handleSearchQueryChange = (val: string) => {
    setSearchQuery(val);
    if (val.trim()) {
      if (playlistItemIds.length > 0) {
        setPlaylistItemIds([]);
        setActiveSavedPlaylistId(null);
      }
      setShelfTab('shelf');
    }
  };

  const handleShelfSearchTagChange = (tagVal: string) => {
    setShelfSearchTag(tagVal);
    if (tagVal) {
      if (playlistItemIds.length > 0) {
        setPlaylistItemIds([]);
        setActiveSavedPlaylistId(null);
      }
      setShelfTab('shelf');
    }
  };

  const handleShelfSearchSpeakerChange = (spVal: string) => {
    setShelfSearchSpeaker(spVal);
    if (spVal) {
      if (playlistItemIds.length > 0) {
        setPlaylistItemIds([]);
        setActiveSavedPlaylistId(null);
      }
      setShelfTab('shelf');
    }
  };

  const handleShelfSearchTitleChange = (titleVal: string) => {
    setShelfSearchTitle(titleVal);
    if (titleVal.trim()) {
      if (playlistItemIds.length > 0) {
        setPlaylistItemIds([]);
        setActiveSavedPlaylistId(null);
      }
      setShelfTab('shelf');
    }
  };

  // 點選書架上的語音檔時，切換曲目；手機版自動平滑捲動至下方的播放舞台，電腦版則平滑定位至頂部播放視角
  const handleSelectShelfAudio = (item: AudioItem) => {
    onSelectAudio(item);
    sendPresentationMessage({ type: 'SET_AUDIO', audioId: item.id });
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

  // 「館藏語音選片書架」專屬篩選：分類 + 關鍵字 + 檔案名稱查詢 + 類別標籤查詢 + 主講人查詢
  const shelfFilteredItems = audioItems.filter((item) => {
    // 1. 分類篩選
    const matchCat =
      selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
    // 2. 頂部通用搜尋 (標題、說明或主講人)
    const matchGeneral =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.speaker && item.speaker.toLowerCase().includes(searchQuery.toLowerCase()));
    // 3. 書架專屬檔案名稱查詢
    const qTitle = shelfSearchTitle.trim().toLowerCase();
    const matchTitle = !qTitle || item.title.toLowerCase().includes(qTitle);
    // 4. 書架專屬類別標籤查詢
    const qTag = shelfSearchTag.trim().toLowerCase();
    const itemTags = item.tags || [];
    const matchTag =
      !qTag || itemTags.some((tag) => tag.toLowerCase().includes(qTag));
    // 5. 主講人篩選
    let matchSpeaker = true;
    if (shelfSearchSpeaker === '__unassigned__') {
      matchSpeaker = !item.speaker || !item.speaker.trim();
    } else if (shelfSearchSpeaker) {
      matchSpeaker = item.speaker?.trim() === shelfSearchSpeaker;
    }

    return matchCat && matchGeneral && matchTitle && matchTag && matchSpeaker;
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

  // 底部翻頁按鈕智能精簡視窗（避免頁數過多時「下一頁」按鈕超出卡片區塊）
  const visibleShelfPages = useMemo(() => {
    if (totalShelfPages <= 5) {
      return Array.from({ length: totalShelfPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    const start = Math.max(1, Math.min(safeShelfPage - 1, totalShelfPages - 3));
    const end = Math.min(totalShelfPages, Math.max(safeShelfPage + 1, 4));

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalShelfPages) {
      if (end < totalShelfPages - 1) pages.push('...');
      pages.push(totalShelfPages);
    }

    return pages;
  }, [safeShelfPage, totalShelfPages]);

  // 當分類、搜尋關鍵字、書架檔案名稱查詢、類別標籤查詢、主講人或每頁筆數變更時，自動回到第 1 頁
  useEffect(() => {
    setShelfCurrentPage(1);
  }, [
    selectedCategoryId,
    searchQuery,
    shelfSearchTitle,
    shelfSearchTag,
    shelfSearchSpeaker,
    shelfPageSize,
  ]);

  // 統計全體館藏可用之類別標籤（供編輯播放清單時篩選未加入語音使用）
  const allAudioTags = useMemo(() => {
    const tagCountMap: Record<string, number> = {};
    audioItems.forEach((item) => {
      (item.tags || []).forEach((t) => {
        const trimmed = t.trim();
        if (trimmed) {
          tagCountMap[trimmed] = (tagCountMap[trimmed] || 0) + 1;
        }
      });
    });
    return Object.keys(tagCountMap)
      .sort((a, b) => a.localeCompare(b, 'zh-TW'))
      .map((tag) => ({ tag, count: tagCountMap[tag] }));
  }, [audioItems]);

  // 編輯播放清單時：可供追加的候選語音（排除已在此清單者，並支援關鍵字與類別標籤過濾）
  const availableCandidateAudio = useMemo(() => {
    if (!editingPlaylistData) return [];
    const addedSet = new Set(editingPlaylistData.audioItemIds);
    return audioItems.filter((a) => {
      if (addedSet.has(a.id)) return false;
      const q = editPickerSearchQuery.trim().toLowerCase();
      const matchQ =
        !q ||
        a.title.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q));
      const t = editPickerTagFilter.trim().toLowerCase();
      const matchTag =
        !t || (a.tags || []).some((tag) => tag.toLowerCase().includes(t));
      return matchQ && matchTag;
    });
  }, [audioItems, editingPlaylistData, editPickerSearchQuery, editPickerTagFilter]);

  // 「已儲存播放清單管理」搜尋與分頁計算（以 5 的倍數做選取：5, 10, 15, 20, 25）
  const filteredManagePlaylists = useMemo(() => {
    const q = manageSearchQuery.trim().toLowerCase();
    if (!q) return savedPlaylists;
    return savedPlaylists.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [savedPlaylists, manageSearchQuery]);

  const totalManageCount = filteredManagePlaylists.length;
  const totalManagePages = Math.max(1, Math.ceil(totalManageCount / managePageSize));
  const safeManagePage = Math.min(manageCurrentPage, totalManagePages);
  const manageStartIndex = (safeManagePage - 1) * managePageSize;
  const paginatedManagePlaylists = filteredManagePlaylists.slice(
    manageStartIndex,
    manageStartIndex + managePageSize
  );

  useEffect(() => {
    setManageCurrentPage(1);
  }, [manageSearchQuery, managePageSize]);

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
      sendPresentationMessage({ type: 'PAUSE' });
    } else {
      setManualSlideIndex(null);
      setManualSegmentIndex(null); // 播放時恢復依時間軸自動切換區段
      if (isScreeningAudioLoading || !playableScreeningUrl) {
        pendingAutoPlayRef.current = true;
        return;
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          sendPresentationMessage({ type: 'PLAY' });
        })
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

    sendPresentationMessage({ type: 'SEEK', currentTime: clamped });

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

    sendPresentationMessage({ type: 'SLIDE', slideIndex: index, currentTime: clamped });

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
    sendPresentationMessage({ type: 'RATE', playbackRate: nextRate });
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    audioRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    sendPresentationMessage({ type: 'MUTE', muted: nextMuted });
  };

  // 切換放映循環/順序模式：循序播放 -> 清單循環 -> 單曲循環 -> 循序播放
  const cycleLoopMode = () => {
    if (playbackLoopMode === 'sequential') {
      setPlaybackLoopMode('playlist');
      showToast('🔁 已切換為「清單循環播放」模式');
    } else if (playbackLoopMode === 'playlist') {
      setPlaybackLoopMode('single');
      showToast('🔂 已切換為「單曲循環播放」模式');
    } else {
      setPlaybackLoopMode('sequential');
      showToast('⏩ 已切換為「循序播放」模式（播完停止）');
    }
  };

  // 播放下一首
  const playNextTrack = (autoPlay = true) => {
    sendPresentationMessage({ type: 'NEXT_TRACK' });
    if (playbackLoopMode === 'single') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(console.warn);
      }
      return;
    }

    if (playlistItems.length > 0) {
      const currentIndex = playlistItems.findIndex((it) => it.id === currentItem.id);
      let nextIndex = -1;
      if (currentIndex === -1) {
        nextIndex = 0;
      } else if (currentIndex + 1 < playlistItems.length) {
        nextIndex = currentIndex + 1;
      } else if (playbackLoopMode === 'playlist') {
        nextIndex = 0;
      }

      if (nextIndex !== -1) {
        const nextItem = playlistItems[nextIndex];
        if (autoPlay) pendingAutoPlayRef.current = true;
        onSelectAudio(nextItem);
        showToast(
          `▶️ 播放清單（第 ${nextIndex + 1}/${playlistItems.length} 部）：${nextItem.title}`
        );
        return;
      } else {
        setIsPlaying(false);
        showToast('🏁 播放清單已播畢！');
        return;
      }
    }

    // 若未建立播放清單，預設在當前書架篩選結果中順序播放
    const currentShelfIdx = shelfFilteredItems.findIndex((it) => it.id === currentItem.id);
    if (currentShelfIdx !== -1 && currentShelfIdx + 1 < shelfFilteredItems.length) {
      const nextItem = shelfFilteredItems[currentShelfIdx + 1];
      if (autoPlay) pendingAutoPlayRef.current = true;
      onSelectAudio(nextItem);
      showToast(`▶️ 播放下一部：${nextItem.title}`);
    } else if (playbackLoopMode === 'playlist' && shelfFilteredItems.length > 0) {
      const nextItem = shelfFilteredItems[0];
      if (autoPlay) pendingAutoPlayRef.current = true;
      onSelectAudio(nextItem);
      showToast(`▶️ 循環回到第一部：${nextItem.title}`);
    } else {
      setIsPlaying(false);
    }
  };

  // 播放上一首
  const playPrevTrack = (autoPlay = true) => {
    sendPresentationMessage({ type: 'PREV_TRACK' });
    if (currentTime > 3) {
      handleSeek(0);
      return;
    }

    if (playlistItems.length > 0) {
      const currentIndex = playlistItems.findIndex((it) => it.id === currentItem.id);
      let prevIndex = -1;
      if (currentIndex === -1) {
        prevIndex = 0;
      } else if (currentIndex - 1 >= 0) {
        prevIndex = currentIndex - 1;
      } else if (playbackLoopMode === 'playlist') {
        prevIndex = playlistItems.length - 1;
      } else {
        prevIndex = 0;
      }

      const prevItem = playlistItems[prevIndex];
      if (autoPlay) pendingAutoPlayRef.current = true;
      onSelectAudio(prevItem);
      showToast(
        `⏮️ 切換至清單（第 ${prevIndex + 1}/${playlistItems.length} 部）：${prevItem.title}`
      );
      return;
    }

    // 若未建立清單，在書架列表中倒退上一部
    const currentShelfIdx = shelfFilteredItems.findIndex((it) => it.id === currentItem.id);
    if (currentShelfIdx > 0) {
      const prevItem = shelfFilteredItems[currentShelfIdx - 1];
      if (autoPlay) pendingAutoPlayRef.current = true;
      onSelectAudio(prevItem);
      showToast(`⏮️ 播放上一部：${prevItem.title}`);
    } else {
      handleSeek(0);
    }
  };

  // 加入單筆至播放清單
  const handleAddToPlaylist = (item: AudioItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (playlistItemIds.includes(item.id)) {
      showToast(`ℹ️ 「${item.title}」已在播放清單中`);
      return;
    }
    setPlaylistItemIds((prev) => [...prev, item.id]);
    showToast(`➕ 已將「${item.title}」加入播放清單`);
  };

  // 從播放清單移除單筆
  const handleRemoveFromPlaylist = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPlaylistItemIds((prev) => prev.filter((id) => id !== itemId));
    showToast('🗑️ 已從播放清單移除');
  };

  // 清空播放清單
  const handleClearPlaylist = () => {
    if (playlistItemIds.length === 0) return;
    setPlaylistItemIds([]);
    showToast('🧹 已清空播放清單');
  };

  // 播放清單順序調整：上移
  const handleMoveUpInPlaylist = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (index <= 0) return;
    setPlaylistItemIds((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // 播放清單順序調整：下移
  const handleMoveDownInPlaylist = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (index >= playlistItemIds.length - 1) return;
    setPlaylistItemIds((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // 播放清單順序調整：移至頂部
  const handleMoveToTopInPlaylist = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (index <= 0) return;
    setPlaylistItemIds((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
    showToast('⬆️ 已移至清單第 1 順位');
  };

  // 播放清單順序調整：隨機亂序
  const handleShufflePlaylist = () => {
    if (playlistItemIds.length <= 1) return;
    setPlaylistItemIds((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    showToast('🔀 已重新隨機排列播放清單！');
  };

  // 播放清單順序調整：倒序反轉
  const handleReversePlaylist = () => {
    if (playlistItemIds.length <= 1) return;
    setPlaylistItemIds((prev) => [...prev].reverse());
    showToast('🔄 已反轉播放清單順序！');
  };

  // 書架多選操作：勾選/取消單筆
  const toggleSelectShelfItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedShelfIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 書架多選操作：全選本頁
  const handleSelectAllOnCurrentPage = () => {
    const pageIds = paginatedShelfItems.map((i) => i.id);
    setSelectedShelfIds((prev) => {
      const set = new Set([...prev, ...pageIds]);
      return Array.from(set);
    });
    showToast(`已選取本頁 ${pageIds.length} 部語音`);
  };

  // 書架多選操作：全選符合目前篩選結果
  const handleSelectAllFiltered = () => {
    const allFilteredIds = shelfFilteredItems.map((i) => i.id);
    setSelectedShelfIds(allFilteredIds);
    showToast(`已選取目前符合條件的全部 ${allFilteredIds.length} 部語音`);
  };

  // 書架多選操作：清除勾選
  const handleDeselectAll = () => {
    setSelectedShelfIds([]);
  };

  // 批量將已勾選的項目加入播放清單
  const handleAddSelectedToPlaylist = () => {
    if (selectedShelfIds.length === 0) {
      showToast('⚠️ 請先勾選要加入的語音檔案');
      return;
    }
    const newIds = selectedShelfIds.filter((id) => !playlistItemIds.includes(id));
    if (newIds.length === 0) {
      showToast('ℹ️ 所選語音皆已在播放清單中');
    } else {
      setPlaylistItemIds((prev) => [...prev, ...newIds]);
      showToast(`🎉 成功將 ${newIds.length} 部語音加入播放清單！`);
    }
    setIsMultiSelectMode(false);
    setSelectedShelfIds([]);
    setShelfTab('playlist'); // 自動切換至播放清單，方便使用者預覽與調整順序
  };

  // 一鍵將目前符合條件的所有語音直接加入清單
  const handleAddAllFilteredToPlaylist = () => {
    const allFilteredIds = shelfFilteredItems.map((i) => i.id);
    if (allFilteredIds.length === 0) {
      showToast('⚠️ 目前沒有符合條件的語音');
      return;
    }
    const newIds = allFilteredIds.filter((id) => !playlistItemIds.includes(id));
    if (newIds.length === 0) {
      showToast('ℹ️ 符合條件的語音皆已在播放清單中');
    } else {
      setPlaylistItemIds((prev) => [...prev, ...newIds]);
      showToast(`🎉 已將符合條件的 ${newIds.length} 部語音全數加入播放清單！`);
    }
    setShelfTab('playlist');
  };

  // 載入與重新整理已儲存的播放清單
  const refreshSavedPlaylists = async (): Promise<SavedPlaylist[]> => {
    setIsLoadingPlaylists(true);
    try {
      const list = await loadSavedPlaylists();
      setSavedPlaylists(list);
      return list;
    } catch (err) {
      console.warn('載入已儲存播放清單失敗:', err);
      return savedPlaylists;
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  useEffect(() => {
    refreshSavedPlaylists();
  }, []);

  // 選取已儲存的播放清單（預設立即自動播放第一首有效語音檔）
  const handleSelectSavedPlaylist = (playlistId: string, autoPlay = true) => {
    if (!playlistId) {
      setActiveSavedPlaylistId(null);
      localStorage.removeItem('soundbook_active_saved_playlist_id');
      showToast('ℹ️ 已切換為自訂/未綁定播放佇列');
      return;
    }
    const target = savedPlaylists.find((p) => p.id === playlistId);
    if (!target) return;

    setActiveSavedPlaylistId(target.id);
    localStorage.setItem('soundbook_active_saved_playlist_id', target.id);
    setPlaylistItemIds(target.audioItemIds);

    if (autoPlay) {
      setShelfTab('playlist');
    }

    // 切換至該清單的第一首有效語音檔（若 autoPlay 為 true 則強制載入並自動播放）
    if (target.audioItemIds.length > 0) {
      const firstItem = target.audioItemIds
        .map((id) => audioItems.find((a) => a.id === id))
        .find((a): a is AudioItem => Boolean(a));
      if (firstItem) {
        if (autoPlay) {
          pendingAutoPlayRef.current = true;
          onSelectAudio(firstItem);

          const audio = audioRef.current;
          if (audio && currentItem?.id === firstItem.id && playableScreeningUrl) {
            audio.currentTime = 0;
            audio
              .play()
              .then(() => {
                setIsPlaying(true);
                pendingAutoPlayRef.current = false;
              })
              .catch((err) => console.warn('載入播放清單自動播放失敗:', err));
          }

          if (window.innerWidth < 1024) {
            if (playerStageRef.current) {
              playerStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } else if (firstItem.id !== currentItem?.id) {
          onSelectAudio(firstItem);
        }
      }
    }
    showToast(
      autoPlay
        ? `🎬 已載入並開始自動播放清單：「${target.name}」（共 ${target.audioItemIds.length} 部語音）`
        : `📂 已載入播放清單：「${target.name}」（共 ${target.audioItemIds.length} 部語音）`
    );
  };

  // 開啟「儲存播放清單」彈出視窗
  const handleOpenSaveModal = (asNew = false) => {
    if (playlistItemIds.length === 0) {
      showToast('⚠️ 播放清單內尚無語音檔，請先至選片書架加入語音');
      return;
    }
    const currentSaved = savedPlaylists.find((p) => p.id === activeSavedPlaylistId);
    if (currentSaved && !asNew) {
      setSavePlaylistName(currentSaved.name);
      setSavePlaylistDesc(currentSaved.description || '');
      setSaveAsNewMode(false);
    } else {
      setSavePlaylistName(currentSaved ? `${currentSaved.name} (複本)` : `精選播放清單 ${new Date().toLocaleDateString('zh-TW')}`);
      setSavePlaylistDesc(currentSaved?.description || '');
      setSaveAsNewMode(true);
    }
    setShowSavePlaylistModal(true);
  };

  // 確認儲存/更新播放清單
  const handleConfirmSavePlaylist = async () => {
    const trimmedName = savePlaylistName.trim();
    if (!trimmedName) {
      showToast('⚠️ 請輸入播放清單名稱');
      return;
    }
    if (playlistItemIds.length === 0) {
      showToast('⚠️ 播放清單內沒有語音檔');
      return;
    }

    const now = new Date().toISOString();
    let targetPlaylist: SavedPlaylist;

    if (!saveAsNewMode && activeSavedPlaylistId) {
      const existing = savedPlaylists.find((p) => p.id === activeSavedPlaylistId);
      targetPlaylist = {
        id: activeSavedPlaylistId,
        name: trimmedName,
        description: savePlaylistDesc.trim(),
        audioItemIds: playlistItemIds,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await saveSavedPlaylist(targetPlaylist);
      showToast(`💾 已成功更新播放清單：「${targetPlaylist.name}」！`);
    } else {
      targetPlaylist = {
        id: `playlist_${Date.now()}`,
        name: trimmedName,
        description: savePlaylistDesc.trim(),
        audioItemIds: playlistItemIds,
        createdAt: now,
        updatedAt: now,
      };
      await saveSavedPlaylist(targetPlaylist);
      setActiveSavedPlaylistId(targetPlaylist.id);
      localStorage.setItem('soundbook_active_saved_playlist_id', targetPlaylist.id);
      showToast(`🎉 已成功建立並保存新播放清單：「${targetPlaylist.name}」！`);
    }

    await refreshSavedPlaylists();
    setShowSavePlaylistModal(false);
  };

  // 確認刪除已儲存播放清單
  const handleConfirmDeleteSavedPlaylist = async (playlist: SavedPlaylist) => {
    await deleteSavedPlaylist(playlist.id);
    if (activeSavedPlaylistId === playlist.id) {
      setActiveSavedPlaylistId(null);
      localStorage.removeItem('soundbook_active_saved_playlist_id');
    }
    await refreshSavedPlaylists();
    setDeleteConfirmPlaylist(null);
    if (editingPlaylistData?.id === playlist.id) {
      setEditingPlaylistData(null);
    }
    showToast(`🗑️ 已刪除播放清單：「${playlist.name}」`);
  };

  // 在管理面板中建立全新空白播放清單（不自動寫入資料庫，不自動帶入當下播放的語音，待按下確認儲存時才寫入）
  const handleCreateNewBlankPlaylist = () => {
    const name = `新播放清單 #${savedPlaylists.length + 1}`;
    const now = new Date().toISOString();
    const newPlaylist: SavedPlaylist = {
      id: `playlist_${Date.now()}`,
      name,
      description: '',
      audioItemIds: [], // 不要自動帶入當下播放的語音檔
      createdAt: now,
      updatedAt: now,
    };
    setIsCreatingNewPlaylist(true);
    setEditingPlaylistData(newPlaylist);
    setEditPickerSearchQuery('');
    setEditPickerTagFilter('');
    setPlaylistPickerAddAudioId('');
  };

  // 取消編輯播放清單（直接退出，不儲存任何變更或新增草稿）
  const handleCancelEditPlaylist = () => {
    setEditingPlaylistData(null);
    setIsCreatingNewPlaylist(false);
    setEditPickerSearchQuery('');
    setEditPickerTagFilter('');
    setPlaylistPickerAddAudioId('');
  };

  // 在編輯面板中儲存對特定播放清單的修改（或儲存新建立的播放清單）
  const handleSaveEditedPlaylistData = async () => {
    if (!editingPlaylistData) return;
    const trimmed = editingPlaylistData.name.trim();
    if (!trimmed) {
      showToast('⚠️ 播放清單名稱不能為空');
      return;
    }
    const nowIso = new Date().toISOString();
    const updated: SavedPlaylist = {
      ...editingPlaylistData,
      name: trimmed,
      createdAt: isCreatingNewPlaylist ? nowIso : editingPlaylistData.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await saveSavedPlaylist(updated);
    if (activeSavedPlaylistId === updated.id) {
      setPlaylistItemIds(updated.audioItemIds);
    }
    const refreshedList = await refreshSavedPlaylists();
    if (isCreatingNewPlaylist) {
      // 新建立的播放清單排在原本有的清單之後，自動切換分頁至最後一頁以便立即檢視
      const lastPage = Math.max(1, Math.ceil(refreshedList.length / managePageSize));
      setManageCurrentPage(lastPage);
    }
    setEditingPlaylistData(null);
    setIsCreatingNewPlaylist(false);
    setEditPickerSearchQuery('');
    setEditPickerTagFilter('');
    setPlaylistPickerAddAudioId('');
    showToast(
      isCreatingNewPlaylist
        ? `🎉 已成功建立並保存新播放清單：「${updated.name}」！`
        : `✅ 已儲存播放清單「${updated.name}」的修改！`
    );
  };

  // 「館藏選片書架」專屬隨機播放：將目前選片書架中符合篩選條件的語音隨機打亂並立即開始放映
  const handleShufflePlayShelfAudio = () => {
    if (shelfFilteredItems.length === 0) {
      showToast('⚠️ 目前選片書架沒有符合條件的語音檔可供隨機播放');
      return;
    }
    const shuffled = [...shelfFilteredItems].sort(() => Math.random() - 0.5);
    const shuffledIds = shuffled.map((i) => i.id);

    setPlaylistItemIds(shuffledIds);
    setActiveSavedPlaylistId(null);
    localStorage.removeItem('soundbook_active_saved_playlist_id');

    pendingAutoPlayRef.current = true;
    const targetItem = shuffled[0];
    onSelectAudio(targetItem);

    const audio = audioRef.current;
    if (audio) {
      if (currentItem?.id === targetItem.id && playableScreeningUrl) {
        audio.currentTime = 0;
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            pendingAutoPlayRef.current = false;
          })
          .catch((err) => console.warn('直接播放失敗:', err));
      }
    }

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

    showToast(`🔀 已啟動書架隨機放映！正在播放：${targetItem.title}（共 ${shuffled.length} 部）`);
  };

  // 監聽原生 Fullscreen 變化，確保 Esc 鍵或手勢退出時狀態同步
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 全螢幕播放時：滑鼠移動即顯示下方播放功能區，若播放中且滑鼠靜止滿 5 秒則自動隱藏
  const handleFullscreenUserActivity = () => {
    setShowFullscreenControls(true);
    if (fullscreenControlsTimerRef.current) {
      window.clearTimeout(fullscreenControlsTimerRef.current);
      fullscreenControlsTimerRef.current = null;
    }
    if (isFullscreen && isPlaying && !showFullscreenPlaylist) {
      fullscreenControlsTimerRef.current = window.setTimeout(() => {
        setShowFullscreenControls(false);
      }, 5000);
    }
  };

  useEffect(() => {
    if (!isFullscreen || !isPlaying || showFullscreenPlaylist) {
      setShowFullscreenControls(true);
      if (fullscreenControlsTimerRef.current) {
        window.clearTimeout(fullscreenControlsTimerRef.current);
        fullscreenControlsTimerRef.current = null;
      }
      return;
    }

    // 進入全螢幕且正在播放時，啟動 5 秒無滑鼠移動自動隱藏計時器
    setShowFullscreenControls(true);
    fullscreenControlsTimerRef.current = window.setTimeout(() => {
      setShowFullscreenControls(false);
    }, 5000);

    const onActivity = () => {
      setShowFullscreenControls(true);
      if (fullscreenControlsTimerRef.current) {
        window.clearTimeout(fullscreenControlsTimerRef.current);
      }
      fullscreenControlsTimerRef.current = window.setTimeout(() => {
        setShowFullscreenControls(false);
      }, 5000);
    };

    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('mousedown', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      if (fullscreenControlsTimerRef.current) {
        window.clearTimeout(fullscreenControlsTimerRef.current);
        fullscreenControlsTimerRef.current = null;
      }
    };
  }, [isFullscreen, isPlaying, showFullscreenPlaylist]);

  const enterFullscreen = async () => {
    const el = theaterStageRef.current;
    if (!el) return;

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
      } else if ((el as any).mozRequestFullScreen) {
        (el as any).mozRequestFullScreen();
      } else if ((el as any).msRequestFullscreen) {
        (el as any).msRequestFullscreen();
      } else {
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('原生全螢幕受限，切換至視窗滿版全螢幕模式:', err);
      setIsFullscreen(true);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      ) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('退出原生全螢幕錯誤:', err);
    }
    setIsFullscreen(false);
  };

  const toggleFullscreen = () => {
    if (isFullscreen || document.fullscreenElement || (document as any).webkitFullscreenElement) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  };

  // 鍵盤與 Android TV 遙控器快速鍵支援：全螢幕下 Esc 退出、F 切換全螢幕、Space/Enter/OK 播放/暫停、左右鍵快轉/倒退、上下鍵調音量、[ / ] 上下首
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      } else if (
        e.code === 'Space' ||
        e.key === ' ' ||
        e.key === 'Enter' ||
        e.key === 'Select' ||
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaPause'
      ) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'MediaRewind') {
        e.preventDefault();
        handleSeek(currentTime - 5);
      } else if (e.key === 'ArrowRight' || e.key === 'MediaFastForward') {
        e.preventDefault();
        handleSeek(currentTime + 5);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (audioRef.current) {
          const newVol = Math.min(1, (audioRef.current.volume || 1) + 0.1);
          audioRef.current.volume = newVol;
          showToast(`🔊 音量: ${Math.round(newVol * 100)}%`);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (audioRef.current) {
          const newVol = Math.max(0, (audioRef.current.volume || 1) - 0.1);
          audioRef.current.volume = newVol;
          showToast(`🔉 音量: ${Math.round(newVol * 100)}%`);
        }
      } else if (e.key === '[' || e.key === 'PageUp' || e.key === 'MediaTrackPrevious') {
        e.preventDefault();
        playPrevTrack(true);
      } else if (e.key === ']' || e.key === 'PageDown' || e.key === 'MediaTrackNext') {
        e.preventDefault();
        playNextTrack(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, currentTime, isPlaying, playlistItems, playbackLoopMode, currentItem, shelfFilteredItems]);

  // 監聽來自控制端（如電腦）透過 W3C Presentation API 傳入的投放同步指令（於 Android TV / 電視端接收處理）
  useEffect(() => {
    const navPres = (navigator as any)?.presentation;
    if (!navPres?.receiver) return;

    let activeConnections: any[] = [];

    const handleMessage = (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg || !msg.type) return;
        const audio = audioRef.current;

        switch (msg.type) {
          case 'INIT_SYNC':
            if (msg.currentTime !== undefined && audio) {
              audio.currentTime = msg.currentTime;
              setCurrentTime(msg.currentTime);
            }
            if (msg.playbackRate && audio) {
              audio.playbackRate = msg.playbackRate;
              setPlaybackRate(msg.playbackRate);
            }
            if (msg.muted !== undefined && audio) {
              audio.muted = Boolean(msg.muted);
              setIsMuted(Boolean(msg.muted));
            }
            if (msg.isPlaying) {
              audio?.play().then(() => setIsPlaying(true)).catch(console.warn);
            }
            break;
          case 'PLAY':
            audio?.play().then(() => setIsPlaying(true)).catch(console.warn);
            break;
          case 'PAUSE':
            audio?.pause();
            setIsPlaying(false);
            break;
          case 'SEEK':
            if (msg.currentTime !== undefined && audio) {
              audio.currentTime = msg.currentTime;
              setCurrentTime(msg.currentTime);
            }
            break;
          case 'RATE':
            if (msg.playbackRate && audio) {
              audio.playbackRate = msg.playbackRate;
              setPlaybackRate(msg.playbackRate);
            }
            break;
          case 'MUTE':
            if (audio) {
              audio.muted = Boolean(msg.muted);
              setIsMuted(Boolean(msg.muted));
            }
            break;
          case 'SLIDE':
            if (msg.slideIndex !== undefined) {
              setManualSlideIndex(msg.slideIndex);
            }
            if (msg.currentTime !== undefined && audio) {
              audio.currentTime = msg.currentTime;
              setCurrentTime(msg.currentTime);
            }
            break;
          case 'NEXT_TRACK':
            playNextTrack(true);
            break;
          case 'PREV_TRACK':
            playPrevTrack(true);
            break;
          case 'SET_AUDIO':
            if (msg.audioId) {
              const target = audioItems.find((a) => a.id === msg.audioId);
              if (target) {
                onSelectAudio(target);
              }
            }
            break;
        }
      } catch (e) {
        console.warn('處理電視接收投放指令失敗:', e);
      }
    };

    navPres.receiver.connectionList
      .then((list: any) => {
        const registerConn = (conn: any) => {
          activeConnections.push(conn);
          conn.addEventListener('message', handleMessage);
        };

        list.connections.forEach(registerConn);
        list.addEventListener('connectionavailable', (event: any) => {
          registerConn(event.connection);
        });
      })
      .catch((err: any) => {
        console.warn('Presentation Receiver 初始化失敗:', err);
      });

    return () => {
      activeConnections.forEach((conn) => {
        try {
          conn.removeEventListener('message', handleMessage);
        } catch {}
      });
    };
  }, [audioItems, onSelectAudio]);

  // 判斷是否為行動裝置 (iPhone / iPad / Android) 與 iOS 裝置 (iPhone / iPad / iPod)
  const isMobileDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }, []);

  const isIOSDevice = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }, []);

  // 監聽 Apple AirPlay 裝置狀態 (WebKit / iOS Safari 必要監聽，WebKit 需註冊此監聽才會啟動區域網路 AirPlay 搜尋)
  const [airPlayAvailability, setAirPlayAvailability] = useState<'available' | 'not-available' | 'unsupported'>('unsupported');
  const [isWirelessAirPlay, setIsWirelessAirPlay] = useState<boolean>(false);

  useEffect(() => {
    const audioEl = audioRef.current as any;
    if (!audioEl) return;

    try {
      audioEl.setAttribute('x-webkit-airplay', 'allow');
      audioEl.setAttribute('airplay', 'allow');
    } catch {
      // ignore
    }

    const handleAvailabilityChanged = (event: any) => {
      setAirPlayAvailability(event.availability === 'available' ? 'available' : 'not-available');
    };

    const handleWirelessTargetChanged = () => {
      setIsWirelessAirPlay(Boolean(audioEl.webkitCurrentPlaybackTargetIsWireless));
    };

    if ((window as any).WebKitPlaybackTargetAvailabilityEvent) {
      audioEl.addEventListener('webkitplaybacktargetavailabilitychanged', handleAvailabilityChanged);
      audioEl.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', handleWirelessTargetChanged);
    }

    return () => {
      if ((window as any).WebKitPlaybackTargetAvailabilityEvent) {
        audioEl.removeEventListener('webkitplaybacktargetavailabilitychanged', handleAvailabilityChanged);
        audioEl.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', handleWirelessTargetChanged);
      }
    };
  }, [playableScreeningUrl]);

  // 觸發原生系統投放 (Google Presentation API / Chrome Cast / Apple AirPlay / Remote Playback)
  // 注意：在各大瀏覽器中，喚起系統投放皆必須在原生的使用者點擊事件調用棧中執行，不可有非同步延遲
  const handleTriggerNativeCast = () => {
    const audioEl = audioRef.current as any;
    let invoked = false;

    // 1. 若為 Apple 行動裝置 (iOS / iPadOS)：優先喚起 Apple AirPlay
    if (isIOSDevice && audioEl && typeof audioEl.webkitShowPlaybackTargetPicker === 'function') {
      try {
        audioEl.webkitShowPlaybackTargetPicker();
        showToast('📺 已開啟 Apple AirPlay 裝置選單 (支援 Apple TV / AirPlay 智慧電視)');
        invoked = true;
      } catch (e) {
        console.warn('AirPlay 呼叫失敗:', e);
      }
    }

    // 2. 電腦版 Chrome / Edge / 支援 Presentation API 之瀏覽器：優先喚起 Presentation API 投放！
    // 這是 Chrome / Edge 電腦版最核心、能完整搜尋區域網路中所有 Google Chromecast、Google TV、Android TV 與客廳智慧電視的標準 API！
    if (!invoked && typeof (window as any).PresentationRequest === 'function') {
      try {
        const pres = new (window as any).PresentationRequest([currentShareUrl]);
        pres
          .start()
          .then((conn: any) => {
            presentationConnectionRef.current = conn;
            setIsPresentationConnected(true);
            setupPresentationConnection(conn);
            showToast('📺 已連線至客廳電視 / 外接投放顯示器！您可由電腦控制台或電視遙控器同步操控。');
          })
          .catch((e: any) => {
            if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') {
              console.warn('Presentation API 投放取消或失敗:', e);
            }
          });
        showToast('📻 已開啟系統投放選單 (正在搜尋 Chromecast / 智慧電視...)');
        invoked = true;
      } catch (e) {
        console.warn('Presentation API 啟動失敗:', e);
      }
    }

    // 3. 次選：Apple AirPlay (若電腦為 Mac Safari 且未支援 Presentation API)
    if (!invoked && audioEl && typeof audioEl.webkitShowPlaybackTargetPicker === 'function') {
      try {
        audioEl.webkitShowPlaybackTargetPicker();
        showToast('📺 已開啟 Apple AirPlay 裝置選單');
        invoked = true;
      } catch (e) {
        console.warn('AirPlay 呼叫失敗:', e);
      }
    }

    // 4. 次選：W3C Remote Playback API
    if (!invoked && audioEl?.remote && typeof audioEl.remote.prompt === 'function') {
      try {
        audioEl.remote
          .prompt()
          .then(() => {
            showToast('📻 已開啟遠端裝置投放選單');
          })
          .catch((e: any) => {
            if (e?.name !== 'AbortError') {
              console.warn('Remote Playback 呼叫失敗:', e);
            }
          });
        showToast('📻 已開啟投放選單');
        invoked = true;
      } catch (e) {
        console.warn('Remote Playback 呼叫失敗:', e);
      }
    }

    if (!invoked) {
      if (isIOSDevice) {
        showToast('💡 iPhone 請使用 Safari 瀏覽器以支援 AirPlay，或從右上角滑開「控制中心」點選 AirPlay / 螢幕鏡像輸出！');
      } else {
        showToast('💡 瀏覽器尚未偵測到即時投放裝置，您亦可使用 Chrome 右上角選單「儲存與分享 ➔ 投放」，或使用電視掃描下方 QR Code 接續播放！');
      }
    }
  };

  // 生成跨裝置接續播放 URL
  const currentShareUrl = useMemo(() => {
    if (!currentItem) return window.location.href;
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    return `${origin}${pathname}?tab=screening&audioId=${currentItem.id}&t=${Math.floor(currentTime)}&shared=1&autoplay=1`;
  }, [currentItem, currentTime]);

  // 複製跨裝置播放連結
  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentShareUrl);
      setCastCopied(true);
      showToast('📋 已複製跨裝置接續播放連結！可直接傳送給客廳電視、平板或家人手機開啟。');
      setTimeout(() => setCastCopied(false), 3000);
    } catch {
      showToast('⚠️ 複製失敗，請手動複製連結');
    }
  };

  // 使用系統原生分享 (AirDrop / LINE / 訊息 / 附近分享)
  const handleSystemShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `聲書閣放映室 - ${currentItem.title}`,
          text: `正在放映：${currentItem.title} (${formatDuration(currentTime)} / ${formatDuration(duration)})`,
          url: currentShareUrl,
        });
      } catch {
        // 使用者取消分享不報錯
      }
    } else {
      handleCopyShareUrl();
    }
  };

  // 生成「分享功能」專屬 URL（可自選是否包含當前播放秒數）
  const shareTargetUrl = useMemo(() => {
    if (!currentItem) return window.location.href;
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    let url = `${origin}${pathname}?tab=screening&audioId=${currentItem.id}&shared=1&autoplay=1`;
    if (shareIncludeTime && currentTime > 0) {
      url += `&t=${Math.floor(currentTime)}`;
    }
    return url;
  }, [currentItem, currentTime, shareIncludeTime]);

  // LINE 分享專屬網址：手機端使用 Universal Link (https://line.me/R/share?text=...) 直接喚起 LINE App 選擇好友；電腦端使用官方 Web 外掛
  const currentScreeningLineUrl = useMemo(() => {
    if (!currentItem) return '';
    if (isMobileDevice) {
      const shareMessage = `邀請您在「聲書閣」觀賞聆聽：《${currentItem.title}》${
        currentItem.speaker ? ` (主講：${currentItem.speaker})` : ''
      }${shareIncludeTime && currentTime > 0 ? ` (進度於 ${formatDuration(currentTime)})` : ''}\n${shareTargetUrl}`;
      return `https://line.me/R/share?text=${encodeURIComponent(shareMessage)}`;
    }
    return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareTargetUrl)}`;
  }, [currentItem, currentTime, shareIncludeTime, shareTargetUrl, isMobileDevice]);

  // 複製分享連結
  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareTargetUrl);
      setShareCopied(true);
      showToast('📋 已複製分享連結！可直接分享給好友觀看此語音檔。');
      setTimeout(() => setShareCopied(false), 3000);
    } catch {
      showToast('⚠️ 複製失敗，請手動複製連結');
    }
  };

  // 透過系統原生管道分享 (AirDrop / 手機通訊軟體 / 訊息)
  const handleNativeShare = async () => {
    if (!currentItem) return;
    const shareTitle = `聲書閣放映室 - ${currentItem.title}`;
    const shareText = `邀請您一同在「聲書閣」觀賞聆聽：《${currentItem.title}》${
      currentItem.speaker ? ` (主講：${currentItem.speaker})` : ''
    }${shareIncludeTime && currentTime > 0 ? `，進度於 ${formatDuration(currentTime)}` : ''}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareTargetUrl,
        });
      } catch {
        // 使用者取消分享不報錯
      }
    } else {
      handleCopyShareLink();
    }
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

      {/* 隱藏的 HTML5 Audio 元件（加入 playsInline、preload 與 AirPlay 支援手機 iOS/Android 播放） */}
      <audio
        ref={audioRef}
        src={playableScreeningUrl || undefined}
        playsInline
        preload="auto"
        loop={playbackLoopMode === 'single'}
        {...{
          'x-webkit-airplay': 'allow',
          airplay: 'allow',
          'webkit-playsinline': 'true',
        }}
        onPlay={() => {
          setIsPlaying(true);
          if (audioRef.current) trackPlayProgress(audioRef.current.currentTime, true);
        }}
        onPause={() => {
          setIsPlaying(false);
          if (audioRef.current) trackPlayProgress(audioRef.current.currentTime, false);
          flushPlayStats();
        }}
        onCanPlay={() => {
          if (initialSeekTimeRef.current !== null && audioRef.current) {
            const seekT = initialSeekTimeRef.current;
            initialSeekTimeRef.current = null;
            if (seekT > 0 && seekT < (audioRef.current.duration || 999999)) {
              audioRef.current.currentTime = seekT;
              setCurrentTime(seekT);
            }
          }
          if (pendingAutoPlayRef.current && audioRef.current) {
            attemptAutoPlay();
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            const t = audioRef.current.currentTime;
            setCurrentTime(t);
            trackPlayProgress(t, audioRef.current.paused);
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
          if (initialSeekTimeRef.current !== null && audioRef.current) {
            const seekT = initialSeekTimeRef.current;
            initialSeekTimeRef.current = null;
            if (seekT > 0 && seekT < (audioRef.current.duration || 999999)) {
              audioRef.current.currentTime = seekT;
              setCurrentTime(seekT);
            }
          }
        }}
        onEnded={() => {
          if (audioRef.current) trackPlayProgress(audioRef.current.currentTime, false);
          flushPlayStats();
          playNextTrack(true);
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

      {/* 獨立區塊：「搜尋館藏語音」查詢功能區塊（位於分類區塊下方，包含關鍵字、主講人與類別標籤下拉查詢） */}
      <div className="parchment-card rounded-2xl p-4 md:p-5 shadow-sm border border-[#E2D5C1] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B]">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold font-serif-tc text-sm text-[#2C221E] flex items-center gap-2">
                <span>搜尋館藏語音</span>
                {(searchQuery.trim() || shelfSearchTag || shelfSearchSpeaker) && (
                  <span className="text-[11px] px-2 py-0.2 rounded-full bg-[#8B5A2B] text-white font-mono font-medium">
                    找到 {shelfFilteredItems.length} 部
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[#7A6855]">
                依標題關鍵字、故事內容說明、主講人或選取類別標籤即時檢索可放映之語音作品
              </p>
            </div>
          </div>

          {(searchQuery || shelfSearchTag || shelfSearchSpeaker) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setShelfSearchTag('');
                setShelfSearchSpeaker('');
                setShelfTab('shelf');
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
          <div className="relative sm:col-span-12 md:col-span-6 lg:col-span-6">
            <Search className="w-4 h-4 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜尋館藏語音標題、說明或主講人關鍵字..."
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchQueryChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8B735B] hover:text-[#2C221E] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 2. 主講人下拉選單查詢 */}
          <div className="relative sm:col-span-6 md:col-span-3 lg:col-span-3">
            <User className="w-4 h-4 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={shelfSearchSpeaker}
              onChange={(e) => handleShelfSearchSpeakerChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner cursor-pointer appearance-none truncate font-medium"
            >
              <option value="">
                全部主講人 {availableShelfSpeakers.speakers.length === 0 ? '(尚無主講人)' : '(不限)'}
              </option>
              {availableShelfSpeakers.speakers.map(({ speaker, count }) => (
                <option key={speaker} value={speaker}>
                  🎙️ {speaker} ({count} 部)
                </option>
              ))}
              {availableShelfSpeakers.unassignedCount > 0 && (
                <option value="__unassigned__">
                  ❓ 尚未指定主講人 ({availableShelfSpeakers.unassignedCount} 部)
                </option>
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8B735B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 3. 類別標籤下拉選取查詢 */}
          <div className="relative sm:col-span-6 md:col-span-3 lg:col-span-3">
            <Tag className="w-4 h-4 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={shelfSearchTag}
              onChange={(e) => handleShelfSearchTagChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner cursor-pointer appearance-none truncate font-medium"
            >
              <option value="">
                🏷️ 全部類別標籤 {availableShelfTags.length === 0 ? '(尚無標籤)' : '(不限)'}
              </option>
              {availableShelfTags.map(({ tag, count }) => (
                <option key={tag} value={tag}>
                  🏷️ #{tag} ({count} 部)
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
          {/* 舞台主卡片 (支援一鍵放大全螢幕與視窗滿版劇場模式) */}
          <div
            ref={theaterStageRef}
            onMouseMove={handleFullscreenUserActivity}
            onTouchStart={handleFullscreenUserActivity}
            className={`transition-all duration-300 ${
              isFullscreen
                ? 'fixed inset-0 z-[100] w-screen h-screen bg-[#0D0907] text-[#FAF5EC] flex flex-col justify-between overflow-hidden shadow-2xl'
                : 'rounded-2xl overflow-hidden bg-[#1E1612] text-[#FAF5EC] shadow-2xl border border-[#4A3427]'
            }`}
          >
            {/* 舞台頂部資訊列（全螢幕播放時滑鼠靜止 5 秒後與下方播放功能區一併自動隱藏，滑鼠移動時自動顯示） */}
            <div
              className={`flex flex-wrap items-center justify-between gap-3 transition-all duration-300 ease-in-out ${
                isFullscreen
                  ? `absolute top-0 inset-x-0 px-6 py-3.5 bg-black/85 backdrop-blur-md border-b border-white/10 z-30 ${
                      showFullscreenControls
                        ? 'translate-y-0 opacity-100 pointer-events-auto'
                        : '-translate-y-full opacity-0 pointer-events-none'
                    }`
                  : 'px-5 py-4 bg-[#2A1E18] border-b border-[#3E2C23]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {currentCategory && (
                  <span
                    className="px-2.5 py-1 rounded-md text-xs font-semibold text-white flex items-center gap-1.5 shrink-0"
                    style={{ backgroundColor: currentCategory.themeColor }}
                  >
                    {getCategoryIcon(currentCategory.icon, 'w-3.5 h-3.5')}
                    <span>{currentCategory.name}</span>
                  </span>
                )}
                <h2 className="text-base sm:text-lg md:text-xl font-bold font-serif-tc text-[#FAF5EC] truncate">
                  {currentItem.title}
                </h2>
                {isFullscreen && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-xs font-mono font-medium border border-amber-400/30">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    全螢幕劇場放映中
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* 投放到其他裝置 */}
                <button
                  type="button"
                  onClick={() => setShowCastModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-[#F3D5B5] flex items-center gap-1.5 transition cursor-pointer"
                  title="投放到其他裝置 (AirPlay / Chromecast / 智慧電視)"
                >
                  <Cast className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden sm:inline">投放到其他裝置</span>
                </button>

                {/* 分享此語音檔 */}
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  title="分享此語音檔給他人觀看"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>分享</span>
                </button>

                {isFullscreen ? (
                  <button
                    type="button"
                    onClick={exitFullscreen}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                    title="退出全螢幕 (Esc)"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>退出全螢幕 (Esc)</span>
                  </button>
                ) : !isGuest ? (
                  <button
                    onClick={() => onEditAudio(currentItem)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-[#F3D5B5] flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">編輯此語音圖文設定</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* 播放時的圖片顯示舞台 (Playback Image Stage) */}
            <div
              className={`relative w-full bg-[#120D0A] overflow-hidden flex items-center justify-center group ${
                isFullscreen ? 'flex-1 min-h-0 bg-black' : 'aspect-16/9'
              }`}
            >
              {activeSlide && (
                <>
                  {/* 背景模糊氛圍層 */}
                  <img
                    src={activeSlide.imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-35 scale-110 pointer-events-none select-none"
                  />
                  {/* 主展演圖片 */}
                  <img
                    src={activeSlide.imageUrl}
                    alt={activeSlide.caption || currentItem.title}
                    className="relative z-10 max-h-full max-w-full object-contain transition-all duration-500 drop-shadow-2xl select-none"
                  />
                </>
              )}

              {/* 右上角浮動快捷功能按鈕（一般模式下便捷分享、放大或投放） */}
              {!isFullscreen && (
                <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    className="p-2 rounded-xl bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/20 backdrop-blur-md shadow-lg transition cursor-pointer"
                    title="分享此語音檔給他人觀看"
                  >
                    <Share2 className="w-4 h-4 text-amber-300" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCastModal(true)}
                    className="p-2 rounded-xl bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/20 backdrop-blur-md shadow-lg transition cursor-pointer"
                    title="投放到其他裝置 (AirPlay / Chromecast / 智慧電視)"
                  >
                    <Cast className="w-4 h-4 text-amber-300" />
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl bg-black/60 hover:bg-black/85 text-white/90 hover:text-white border border-white/20 backdrop-blur-md shadow-lg transition cursor-pointer"
                    title="放大全螢幕 (F)"
                  >
                    <Maximize2 className="w-4 h-4 text-amber-300" />
                  </button>
                </div>
              )}

              {/* 左右手動切換圖片按鈕（若有多張播放圖片） */}
              {slides.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setManualSlideIndex((activeSlideIndex - 1 + slides.length) % slides.length)
                    }
                    className={`absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/65 hover:bg-black/90 border border-white/20 text-white opacity-85 hover:opacity-100 transition shadow-xl cursor-pointer ${
                      isFullscreen ? 'p-3.5 sm:p-4' : 'p-2.5'
                    }`}
                    title="上一張播放圖片"
                  >
                    <ChevronLeft className={isFullscreen ? 'w-6 h-6' : 'w-5 h-5'} />
                  </button>
                  <button
                    onClick={() => setManualSlideIndex((activeSlideIndex + 1) % slides.length)}
                    className={`absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/65 hover:bg-black/90 border border-white/20 text-white opacity-85 hover:opacity-100 transition shadow-xl cursor-pointer ${
                      isFullscreen ? 'p-3.5 sm:p-4' : 'p-2.5'
                    }`}
                    title="下一張播放圖片"
                  >
                    <ChevronRight className={isFullscreen ? 'w-6 h-6' : 'w-5 h-5'} />
                  </button>
                </>
              )}

              {/* 底部圖片說明字幕條 */}
              <div
                className={`absolute inset-x-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex items-end justify-between gap-4 transition-all duration-300 ease-in-out ${
                  isFullscreen
                    ? showFullscreenControls
                      ? 'bottom-28 sm:bottom-32 p-6 pt-16 pb-4'
                      : 'bottom-0 p-6 pt-16 pb-6'
                    : 'bottom-0 p-4 pt-10'
                }`}
              >
                <div
                  className={`space-y-1.5 ${
                    isFullscreen ? 'max-w-4xl mx-auto text-center w-full' : ''
                  }`}
                >
                  <div
                    className={`inline-flex items-center gap-1.5 text-[11px] text-amber-300 font-medium ${
                      isFullscreen ? 'justify-center w-full' : ''
                    }`}
                  >
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
                  <p
                    className={`font-serif-tc font-medium text-white whitespace-pre-line leading-relaxed ${
                      isFullscreen
                        ? 'text-lg sm:text-2xl md:text-3xl text-center bg-black/70 backdrop-blur-md px-6 py-3.5 rounded-2xl border border-white/15 shadow-2xl inline-block max-w-full'
                        : 'text-sm md:text-base line-clamp-2'
                    }`}
                  >
                    {activeSegment?.text || activeSlide?.caption || currentItem.description}
                  </p>
                </div>

                {/* 多張圖片縮圖切換器（支援圖片過多時平滑水平滑動、滑鼠滾輪與精確點選） */}
                {!isFullscreen && slides.length > 1 && (
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

            {/* 專業語音播放控制面板（全螢幕播放時滑鼠靜止 5 秒後自動隱藏，滑鼠移動時自動顯示） */}
            <div
              className={`space-y-3 transition-all duration-300 ease-in-out ${
                isFullscreen
                  ? `absolute bottom-0 inset-x-0 p-4 sm:p-5 bg-[#1B120D]/95 backdrop-blur-md border-t border-white/10 z-30 ${
                      showFullscreenControls
                        ? 'translate-y-0 opacity-100 pointer-events-auto'
                        : 'translate-y-full opacity-0 pointer-events-none'
                    }`
                  : 'p-5 bg-[#271C16] space-y-4'
              }`}
            >
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
              <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={handleRateChange}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-mono text-[#F3D5B5] transition cursor-pointer"
                    title="調整播放語速"
                  >
                    {playbackRate}x 語速
                  </button>

                  {/* 循環/順序模式切換：循序播放 -> 清單循環 -> 單曲循環 */}
                  <button
                    onClick={cycleLoopMode}
                    className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs font-medium ${
                      playbackLoopMode !== 'sequential'
                        ? 'bg-[#D4A373] text-[#2B1B11] font-semibold shadow-xs'
                        : 'bg-white/10 text-[#C8B5A0] hover:bg-white/15'
                    }`}
                    title={
                      playbackLoopMode === 'sequential'
                        ? '目前模式：循序放映（播放清單結束後停止，點擊切換為清單循環）'
                        : playbackLoopMode === 'playlist'
                        ? '目前模式：清單循環（最後一首結束回到第一首，點擊切換為單曲循環）'
                        : '目前模式：單曲循環（重複播放當前語音，點擊切換為循序放映）'
                    }
                  >
                    {playbackLoopMode === 'single' ? (
                      <>
                        <Repeat1 className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">單曲循環</span>
                      </>
                    ) : playbackLoopMode === 'playlist' ? (
                      <>
                        <Repeat className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">清單循環</span>
                      </>
                    ) : (
                      <>
                        <ListOrdered className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">循序放映</span>
                      </>
                    )}
                  </button>

                  {/* 若目前語音在播放清單中，顯示當前順位提示 */}
                  {playlistItems.length > 0 && (
                    <span className="hidden sm:inline-flex items-center text-[11px] font-mono px-2 py-1 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
                      清單 {(() => {
                        const idx = playlistItems.findIndex((i) => i.id === currentItem.id);
                        return idx !== -1 ? `${idx + 1}/${playlistItems.length}` : `-/${playlistItems.length}`;
                      })()}
                    </span>
                  )}
                </div>

                {/* 中央主播放區：上一首、倒退5秒、播放/暫停、快轉5秒、下一首 */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* 上一首按鈕 */}
                  <button
                    onClick={() => playPrevTrack(true)}
                    className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF5EC] hover:text-amber-200 transition cursor-pointer"
                    title="播放上一首 (快速鍵: [ 鍵)"
                  >
                    <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  <button
                    onClick={() => handleSeek(currentTime - 5)}
                    className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF5EC] transition cursor-pointer"
                    title="倒退 5 秒 (快速鍵: ← 鍵)"
                  >
                    <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#D4A373] hover:bg-[#E3B587] text-[#2B1B11] flex items-center justify-center shadow-lg transition transform active:scale-95 cursor-pointer"
                    title={isScreeningAudioLoading ? '正在載入雲端音訊...' : isPlaying ? '暫停 (空白鍵)' : '播放 (空白鍵)'}
                  >
                    {isScreeningAudioLoading ? (
                      <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    onClick={() => handleSeek(currentTime + 5)}
                    className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF5EC] transition cursor-pointer"
                    title="快轉 5 秒 (快速鍵: → 鍵)"
                  >
                    <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>

                  {/* 下一首按鈕 */}
                  <button
                    onClick={() => playNextTrack(true)}
                    className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FAF5EC] hover:text-amber-200 transition cursor-pointer"
                    title="播放下一首 (快速鍵: ] 鍵)"
                  >
                    <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                {/* 右側附加控制區：播放清單切換、靜音、投放、全螢幕 */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* 查看/設定播放清單按鈕 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isFullscreen) {
                        setShowFullscreenPlaylist((prev) => !prev);
                      } else {
                        setShelfTab('playlist');
                        if (window.innerWidth < 1024 && playerStageRef.current) {
                          // 手機版平滑往上捲動至播放清單
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                      (!isFullscreen && shelfTab === 'playlist') || (isFullscreen && showFullscreenPlaylist)
                        ? 'bg-amber-400/25 text-amber-200 border border-amber-400/40 shadow-xs'
                        : 'bg-white/10 hover:bg-white/20 text-[#FAF5EC]'
                    }`}
                    title="查看/設定播放清單"
                  >
                    <ListMusic className="w-4 h-4 text-amber-300" />
                    <span className="hidden sm:inline">清單</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[10px] font-bold font-mono">
                      {playlistItems.length}
                    </span>
                  </button>

                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-[#FAF5EC] transition cursor-pointer"
                    title={isMuted ? '取消靜音' : '靜音'}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  {/* 投放到其他裝置 */}
                  <button
                    type="button"
                    onClick={() => setShowCastModal(true)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#FAF5EC] hover:text-amber-300 transition cursor-pointer"
                    title="投放到其他裝置 (AirPlay / Chromecast / 智慧電視)"
                  >
                    <Cast className="w-4 h-4" />
                  </button>

                  {/* 分享此語音檔 */}
                  <button
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#FAF5EC] hover:text-amber-300 transition cursor-pointer"
                    title="分享此語音檔給他人觀看"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  {/* 放大全螢幕 */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#FAF5EC] hover:text-amber-300 transition cursor-pointer"
                    title={isFullscreen ? '退出全螢幕 (Esc)' : '放大全螢幕 (F)'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-amber-300" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 全螢幕模式下的浮動播放清單抽屜 */}
            {isFullscreen && showFullscreenPlaylist && (
              <div className="absolute top-16 right-4 bottom-24 z-40 w-80 sm:w-96 bg-[#160E0B]/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl p-4 flex flex-col text-white animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-white/15 shrink-0">
                  <div className="flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-sm">劇場播放清單 ({playlistItems.length})</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullscreenPlaylist(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 py-2 border-b border-white/10 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={cycleLoopMode}
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-amber-300 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    {playbackLoopMode === 'sequential' ? '循序放映' : playbackLoopMode === 'playlist' ? '清單循環' : '單曲循環'}
                  </button>
                  <button
                    type="button"
                    disabled={playlistItems.length <= 1}
                    onClick={handleShufflePlaylist}
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 text-[11px] flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>隨機排列</span>
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2 pr-1 scrollbar-thin">
                  {playlistItems.length === 0 ? (
                    <div className="py-10 text-center text-xs text-white/60">播放清單目前沒有曲目</div>
                  ) : (
                    playlistItems.map((item, index) => {
                      const isCurrent = item.id === currentItem.id;
                      return (
                        <div
                          key={`fs_p_${item.id}_${index}`}
                          onClick={() => {
                            pendingAutoPlayRef.current = true;
                            onSelectAudio(item);
                          }}
                          className={`group flex items-center gap-2.5 p-2 rounded-xl transition cursor-pointer ${
                            isCurrent
                              ? 'bg-amber-500/25 border border-amber-400/50 text-white'
                              : 'bg-white/5 hover:bg-white/10 border border-white/5 text-white/80'
                          }`}
                        >
                          <span className="font-mono text-xs font-bold text-amber-300 w-5 text-center">
                            #{index + 1}
                          </span>
                          <img
                            src={item.coverImageUrl}
                            alt=""
                            className="w-9 h-9 rounded object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0 text-left">
                            <ScreeningMarqueeTitle
                              title={item.title}
                              size="xs"
                              isSelected={isCurrent}
                            />
                            <span className="text-[10px] text-white/50 font-mono">
                              {formatDuration(item.duration)}
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => handleMoveUpInPlaylist(index, e)}
                              className="p-1 hover:bg-white/10 rounded disabled:opacity-20 text-white/70 cursor-pointer"
                              title="上移"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={index === playlistItems.length - 1}
                              onClick={(e) => handleMoveDownInPlaylist(index, e)}
                              className="p-1 hover:bg-white/10 rounded disabled:opacity-20 text-white/70 cursor-pointer"
                              title="下移"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleRemoveFromPlaylist(item.id, e)}
                              className="p-1 hover:bg-red-500/20 text-red-300 rounded cursor-pointer"
                              title="移除"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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
                      {/* (1) 加入「修改」按鈕，讓使用者直接在放映室修改文字內容及時間起迄 (訪客模式唯讀) */}
                      {!isEditingSegment && !isGuest && (
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
            {/* 右側分頁切換導覽列：館藏選片書架 vs 播放清單 */}
            <div className="flex items-center gap-1.5 p-1 bg-[#EFE6D5] rounded-xl border border-[#DFCEB4]">
              <button
                type="button"
                onClick={() => setShelfTab('shelf')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  shelfTab === 'shelf'
                    ? 'bg-[#3A2518] text-white shadow-sm'
                    : 'text-[#5C3A1B] hover:bg-[#E2D4BC]'
                }`}
              >
                <ListMusic className="w-4 h-4" />
                <span>館藏選片書架</span>
                <span className="text-[10px] opacity-80">({shelfFilteredItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setShelfTab('playlist')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer relative ${
                  shelfTab === 'playlist'
                    ? 'bg-[#8B5A2B] text-white shadow-sm'
                    : 'text-[#5C3A1B] hover:bg-[#E2D4BC]'
                }`}
              >
                <ListOrdered className="w-4 h-4" />
                <span>播放清單</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    shelfTab === 'playlist'
                      ? 'bg-amber-300 text-[#2C221E]'
                      : 'bg-[#8B5A2B] text-white'
                  }`}
                >
                  {playlistItems.length}
                </span>
              </button>
            </div>

            {/* 分頁 1：館藏語音選片書架 */}
            {shelfTab === 'shelf' && (
              <>
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
                        onChange={(e) => handleShelfSearchTitleChange(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                      />
                    </div>

                    {/* 類別標籤查詢 (下拉選單方式) */}
                    <div className="relative">
                      <Tag className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        value={shelfSearchTag}
                        onChange={(e) => handleShelfSearchTagChange(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate"
                      >
                        <option value="">
                          🏷️ 全部類別標籤 {availableShelfTags.length === 0 ? '(尚無標籤)' : '(不限)'}
                        </option>
                        {availableShelfTags.map(({ tag, count }) => (
                          <option key={tag} value={tag}>
                            🏷️ #{tag} ({count} 部)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8B735B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* 批次加入播放清單與隨機播放快捷操作列 */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMultiSelectMode((v) => !v);
                        if (isMultiSelectMode) setSelectedShelfIds([]);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                        isMultiSelectMode
                          ? 'bg-[#8B5A2B] text-white border-[#8B5A2B] shadow-xs'
                          : 'bg-white text-[#5C3A1B] border-[#D5C5AE] hover:bg-[#FAF4E8]'
                      }`}
                    >
                      {isMultiSelectMode ? (
                        <CheckSquare className="w-3.5 h-3.5" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      <span>{isMultiSelectMode ? '結束多選模式' : '多選加入清單'}</span>
                    </button>

                    {/* 書架隨機播放功能：自動隨機播放選片書架內的語音檔 */}
                    <button
                      type="button"
                      onClick={handleShufflePlayShelfAudio}
                      disabled={shelfFilteredItems.length === 0}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                      title="將目前選片書架內符合條件的語音檔隨機排列並立即放映"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>隨機播放 ({shelfFilteredItems.length})</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddAllFilteredToPlaylist}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[#FAF4E8] hover:bg-[#EFE6D5] text-[#8B5A2B] border border-[#DFCEB4] flex items-center gap-1 transition cursor-pointer"
                    title="將目前分類或搜尋出的所有語音檔案一次加入播放清單"
                  >
                    <Plus className="w-3 h-3" />
                    <span>加入搜尋全部 ({shelfFilteredItems.length})</span>
                  </button>
                </div>

                {/* 多選操作懸浮列（當開啟多選模式時顯示） */}
                {isMultiSelectMode && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#5C3A1B]">
                        已選取 <strong className="font-mono text-[#8B5A2B] text-sm">{selectedShelfIds.length}</strong> 部語音
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleSelectAllOnCurrentPage}
                          className="px-2 py-0.5 rounded bg-white border border-[#DFCEB4] text-[11px] font-medium text-[#5C3A1B] hover:bg-[#FAF4E8] cursor-pointer"
                        >
                          全選本頁
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllFiltered}
                          className="px-2 py-0.5 rounded bg-white border border-[#DFCEB4] text-[11px] font-medium text-[#5C3A1B] hover:bg-[#FAF4E8] cursor-pointer"
                        >
                          全選全部
                        </button>
                        {selectedShelfIds.length > 0 && (
                          <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="px-1.5 py-0.5 text-[11px] text-[#8B735B] hover:text-[#2C221E] cursor-pointer"
                          >
                            清除
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={selectedShelfIds.length === 0}
                      onClick={handleAddSelectedToPlaylist}
                      className="w-full py-2 px-3 rounded-lg bg-[#2E5A44] hover:bg-[#234735] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>將選取的 {selectedShelfIds.length} 部加入播放清單</span>
                    </button>
                  </div>
                )}

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
                      const isCheckedInMulti = selectedShelfIds.includes(item.id);
                      const inPlaylist = playlistItemIds.includes(item.id);

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (isMultiSelectMode) {
                              toggleSelectShelfItem(item.id);
                            } else {
                              handleSelectShelfAudio(item);
                            }
                          }}
                          className={`group flex items-start gap-2.5 sm:gap-3 p-3 rounded-xl border transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#3A2518] text-[#FAF5EC] border-[#3A2518] shadow-md ring-2 ring-amber-400/40'
                              : 'bg-white hover:bg-[#FAF4E8] text-[#2C221E] border-[#E5D9C5]'
                          }`}
                        >
                          {/* 多選勾選框 */}
                          {isMultiSelectMode && (
                            <div
                              className="pt-1 shrink-0"
                              onClick={(e) => toggleSelectShelfItem(item.id, e)}
                            >
                              {isCheckedInMulti ? (
                                <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                              ) : (
                                <Square className="w-5 h-5 text-[#8B735B]" />
                              )}
                            </div>
                          )}

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
                            <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                              <div className="flex flex-wrap items-center gap-1.5">
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
                                  {audioCallNumberMap.get(item.id) || (cat ? `${cat.code}-1` : 'CAT-1')}
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

                              {/* 單筆快速加入/移出播放清單按鈕 */}
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0"
                              >
                                {inPlaylist ? (
                                  <button
                                    type="button"
                                    onClick={(e) => handleRemoveFromPlaylist(item.id, e)}
                                    className="px-2 py-0.5 rounded-md bg-emerald-600/15 hover:bg-red-500/15 text-emerald-700 hover:text-red-700 border border-emerald-600/30 text-[10px] font-medium transition cursor-pointer flex items-center gap-0.5 group/btn"
                                    title="已在播放清單中，點擊可移出"
                                  >
                                    <Check className="w-3 h-3 group-hover/btn:hidden" />
                                    <X className="w-3 h-3 hidden group-hover/btn:inline" />
                                    <span className="group-hover/btn:hidden">已在清單</span>
                                    <span className="hidden group-hover/btn:inline">移出清單</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => handleAddToPlaylist(item, e)}
                                    className="px-2 py-0.5 rounded-md bg-[#FAF4E8] hover:bg-[#8B5A2B] hover:text-white text-[#8B5A2B] border border-[#DFCEB4] text-[10px] font-medium transition cursor-pointer flex items-center gap-0.5"
                                    title="加入播放清單"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>+ 清單</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            <ScreeningMarqueeTitle
                              title={item.title}
                              size="sm"
                              isSelected={isSelected}
                            />
                            <p
                              className={`text-xs line-clamp-1 mt-0.5 ${
                                isSelected ? 'text-[#E2D4C0]' : 'text-[#6E5D4F]'
                              }`}
                            >
                              {item.description}
                            </p>

                            {/* 主講人與類別標籤徽章展示 */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {item.speaker && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleShelfSearchSpeakerChange(item.speaker!);
                                  }}
                                  title={`主講人：${item.speaker}（點擊過濾此主講人）`}
                                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded font-medium border transition cursor-pointer ${
                                    shelfSearchSpeaker === item.speaker
                                      ? 'bg-amber-600 border-amber-600 text-white font-bold shadow-xs'
                                      : isSelected
                                      ? 'bg-white/20 border-white/30 text-amber-200 hover:bg-white/30'
                                      : 'bg-[#F2E8DC] border-[#D8C7B2] text-[#5C3A1B] hover:bg-[#EAE0D2]'
                                  }`}
                                >
                                  <User className="w-2.5 h-2.5" />
                                  <span>{item.speaker}</span>
                                </span>
                              )}
                              {item.tags && item.tags.slice(0, 3).map((tag) => (
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
                              {item.tags && item.tags.length > 3 && (
                                <span className="text-[10px] text-[#8B735B]">
                                  +{item.tags.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 書架底部翻頁控制列 */}
                {totalShelfPages > 1 && (
                  <div className="pt-2.5 border-t border-[#E5D9C5] space-y-2">
                    {/* 總部數與頁碼統計資訊 */}
                    <div className="flex items-center justify-between text-[11px] text-[#7A6855] px-0.5">
                      <span>
                        共 <strong className="text-[#8B5A2B] font-mono font-bold">{totalShelfCount}</strong> 部語音
                      </span>
                      <span>
                        第 <strong className="text-[#8B5A2B] font-mono font-bold">{safeShelfPage}</strong> /{' '}
                        <strong className="text-[#8B5A2B] font-mono">{totalShelfPages}</strong> 頁
                      </span>
                    </div>

                    {/* 翻頁按鈕列 (置中、換行自適應、防超出區塊) */}
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button
                        type="button"
                        disabled={safeShelfPage <= 1}
                        onClick={() => setShelfCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2 py-1 rounded-md border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 disabled:cursor-not-allowed text-[#3A2518] text-[11px] font-medium flex items-center gap-0.5 cursor-pointer shrink-0 transition"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一頁</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {visibleShelfPages.map((pageNum, idx) => {
                          if (typeof pageNum === 'string') {
                            return (
                              <span
                                key={`shelf-ellipsis-${idx}`}
                                className="w-4 text-center text-[11px] font-mono text-[#8C7A6B] select-none"
                              >
                                …
                              </span>
                            );
                          }
                          const isCurrent = pageNum === safeShelfPage;
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setShelfCurrentPage(pageNum)}
                              className={`w-6 h-6 rounded-md font-mono text-[11px] font-bold transition cursor-pointer flex items-center justify-center ${
                                isCurrent
                                  ? 'bg-[#8B5A2B] text-white shadow-xs'
                                  : 'bg-white text-[#5C3A1B] border border-[#D5C5AE] hover:bg-[#FAF4E8]'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        disabled={safeShelfPage >= totalShelfPages}
                        onClick={() => setShelfCurrentPage((p) => Math.min(totalShelfPages, p + 1))}
                        className="px-2 py-1 rounded-md border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-40 disabled:cursor-not-allowed text-[#3A2518] text-[11px] font-medium flex items-center gap-0.5 cursor-pointer shrink-0 transition"
                      >
                        <span>下一頁</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 分頁 2：播放清單 (支援使用者自訂與設定調整播放順序) */}
            {shelfTab === 'playlist' && (
              <div className="space-y-3">
                {/* 播放清單頂部資訊與控制卡片 */}
                <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#E5D9C5] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-[#5C3A1B]">播放清單概況：</span>
                      <span className="text-[#7A6855] ml-1">
                        共 <strong className="text-[#8B5A2B] font-mono">{playlistItems.length}</strong> 部，總計約{' '}
                        <strong className="text-[#8B5A2B] font-mono">{formatDuration(totalPlaylistDuration)}</strong>
                      </span>
                    </div>

                    {/* 快速切換放映順序模式 */}
                    <button
                      type="button"
                      onClick={cycleLoopMode}
                      className="px-2.5 py-1 rounded-lg bg-[#EFE6D5] hover:bg-[#E2D4BC] text-[#3A2518] text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="點擊切換放映模式"
                    >
                      {playbackLoopMode === 'sequential' && (
                        <>
                          <ListOrdered className="w-3.5 h-3.5 text-[#8B5A2B]" />
                          <span>循序放映</span>
                        </>
                      )}
                      {playbackLoopMode === 'playlist' && (
                        <>
                          <Repeat className="w-3.5 h-3.5 text-emerald-700" />
                          <span>清單循環</span>
                        </>
                      )}
                      {playbackLoopMode === 'single' && (
                        <>
                          <Repeat1 className="w-3.5 h-3.5 text-amber-700" />
                          <span>單曲循環</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 已儲存播放清單選取列（下拉選取已儲存清單、快速儲存/更新、管理庫） */}
                  <div className="space-y-2 pt-2 border-t border-[#E5D9C5]/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#5C3A1B] flex items-center gap-1">
                        <ListMusic className="w-3.5 h-3.5 text-[#8B5A2B]" />
                        <span>已儲存播放清單：</span>
                      </span>

                      {!isGuest && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenSaveModal(false)}
                            className="text-[11px] text-[#2E5A44] hover:text-[#1F3D2E] font-semibold flex items-center gap-0.5 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition"
                            title="將目前選取的清單保存至雲端與本機"
                          >
                            <Save className="w-3 h-3" />
                            <span>{activeSavedPlaylistId ? '儲存更新' : '保存此清單'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingPlaylistData(null);
                              setShowManagePlaylistsModal(true);
                            }}
                            className="text-[11px] text-[#8B5A2B] hover:text-[#5C3A1B] font-semibold flex items-center gap-0.5 cursor-pointer hover:underline"
                          >
                            <span>管理清單 ({savedPlaylists.length})</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={activeSavedPlaylistId || ''}
                        onChange={(e) => handleSelectSavedPlaylist(e.target.value, true)}
                        className="flex-1 min-w-0 pl-2.5 pr-8 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer truncate font-medium shadow-2xs"
                      >
                        <option value="">
                          {activeSavedPlaylistId
                            ? '-- 切換為自訂播放佇列 --'
                            : '-- 請選擇已儲存清單（或自訂播放佇列）--'}
                        </option>
                        {savedPlaylists.length > 0 && (
                          <optgroup label="已儲存的播放清單">
                            {savedPlaylists.map((p) => (
                              <option key={p.id} value={p.id}>
                                ♪ {p.name} ({p.audioItemIds.length} 部)
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>

                      {!isGuest && (
                        <button
                          type="button"
                          onClick={() => handleOpenSaveModal(true)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#FAF4E8] hover:bg-[#EFE6D5] text-[#8B5A2B] border border-[#DFCEB4] text-xs font-medium flex items-center gap-1 transition cursor-pointer shrink-0"
                          title="將目前清單另存為新播放清單"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          <span>另存新檔</span>
                        </button>
                      )}
                    </div>

                    {/* 若目前綁定已儲存清單，顯示清單狀態橫條 */}
                    {activeSavedPlaylistId && (() => {
                      const activeP = savedPlaylists.find((p) => p.id === activeSavedPlaylistId);
                      if (!activeP) return null;
                      return (
                        <div className="flex items-center justify-between text-[11px] bg-white/90 p-2 rounded-lg border border-[#E5D9C5] shadow-2xs">
                          <span className="text-[#6E5D4F] truncate">
                            正在放映：<strong className="text-[#8B5A2B] font-bold">{activeP.name}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPlaylistData(activeP);
                              setShowManagePlaylistsModal(true);
                            }}
                            className="text-[10px] text-[#8B5A2B] hover:text-[#5C3A1B] font-semibold underline cursor-pointer shrink-0 ml-1"
                          >
                            修改內容
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 快捷整理按鈕列 */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-[#E5D9C5]/60 text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={playlistItems.length <= 1}
                        onClick={handleShufflePlaylist}
                        className="px-2 py-1 rounded-md bg-white border border-[#D5C5AE] hover:bg-[#FAF4E8] disabled:opacity-40 text-[#5C3A1B] text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                        title="隨機重新排列播放清單順序"
                      >
                        <Shuffle className="w-3 h-3 text-[#8B5A2B]" />
                        <span>隨機排列</span>
                      </button>

                      <button
                        type="button"
                        disabled={playlistItems.length <= 1}
                        onClick={handleReversePlaylist}
                        className="px-2 py-1 rounded-md bg-white border border-[#D5C5AE] hover:bg-[#FAF4E8] disabled:opacity-40 text-[#5C3A1B] text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                        title="將清單播放順序倒轉反向"
                      >
                        <RotateCcw className="w-3 h-3 text-[#8B5A2B]" />
                        <span>反轉順序</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={playlistItems.length === 0}
                        onClick={handleClearPlaylist}
                        className="px-2 py-1 rounded-md bg-white border border-[#E5D9C5] hover:bg-red-50 hover:text-red-700 hover:border-red-300 disabled:opacity-40 text-[#8B5A2B] text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                        title="清空目前播放清單"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>清空清單</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShelfTab('shelf')}
                        className="px-2 py-1 rounded-md bg-[#8B5A2B] hover:bg-[#6E4420] text-white text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="切換回館藏書架挑選更多語音加入"
                      >
                        <Plus className="w-3 h-3" />
                        <span>挑選加入</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 清單項目列表 (支援上下移動調整播放順序) */}
                <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                  {playlistItems.length === 0 ? (
                    <div className="py-12 px-4 text-center rounded-xl bg-[#FAF6EE] border border-dashed border-[#D5C5AE] space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[#EFE6D5] text-[#8B5A2B] flex items-center justify-center mx-auto">
                        <ListOrdered className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#3A2518]">播放清單目前是空的</p>
                        <p className="text-xs text-[#7A6855] max-w-xs mx-auto leading-relaxed">
                          您可以切換至「館藏選片書架」，單部點選「+ 清單」或開啟「多選加入清單」一次勾選多筆語音加入！
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShelfTab('shelf')}
                        className="px-4 py-1.5 rounded-lg bg-[#3A2518] hover:bg-[#523522] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>前往選片書架挑選</span>
                      </button>
                    </div>
                  ) : (
                    playlistItems.map((item, index) => {
                      const isCurrent = item.id === currentItem.id;
                      const cat = categories.find((c) => c.id === item.categoryId);

                      return (
                        <div
                          key={`playlist_${item.id}_${index}`}
                          onClick={() => {
                            pendingAutoPlayRef.current = true;
                            handleSelectShelfAudio(item);
                          }}
                          className={`group flex items-center gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
                            isCurrent
                              ? 'bg-[#3A2518] text-[#FAF5EC] border-[#3A2518] shadow-md ring-2 ring-amber-400/50'
                              : 'bg-white hover:bg-[#FAF4E8] text-[#2C221E] border-[#E5D9C5]'
                          }`}
                        >
                          {/* 順位編號與播放指示標籤 */}
                          <div className="flex flex-col items-center justify-center shrink-0 w-7">
                            <span
                              className={`font-mono text-xs font-bold ${
                                isCurrent ? 'text-amber-300' : 'text-[#8B5A2B]'
                              }`}
                            >
                              #{index + 1}
                            </span>
                            {isCurrent && (
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping mt-0.5" />
                            )}
                          </div>

                          {/* 封面小縮圖 */}
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[#2C221E]">
                            <img
                              src={item.coverImageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                            {isCurrent && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Play className="w-4 h-4 text-amber-400 fill-current" />
                              </div>
                            )}
                          </div>

                          {/* 標題與資訊 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {cat && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-semibold text-white shrink-0"
                                  style={{ backgroundColor: cat.themeColor }}
                                >
                                  {cat.name}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-mono shrink-0 ${
                                  isCurrent ? 'text-amber-200' : 'text-[#7A6855]'
                                }`}
                              >
                                {formatDuration(item.duration)}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-400/25 text-amber-300 font-bold border border-amber-400/40">
                                  放映中
                                </span>
                              )}
                            </div>
                            <ScreeningMarqueeTitle
                              title={item.title}
                              size="xs"
                              isSelected={isCurrent}
                              className="mt-0.5"
                            />
                          </div>

                          {/* 順序調整控制按鈕群 */}
                          <div
                            className="flex items-center gap-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* 移至頂部 */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => handleMoveToTopInPlaylist(index, e)}
                              className={`p-1.5 rounded hover:bg-black/10 disabled:opacity-20 cursor-pointer ${
                                isCurrent ? 'text-white/80 hover:text-white' : 'text-[#7A6855] hover:text-[#2C221E]'
                              }`}
                              title="移到最前面第 1 順位"
                            >
                              <ArrowUpToLine className="w-3.5 h-3.5" />
                            </button>

                            {/* 上移 */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={(e) => handleMoveUpInPlaylist(index, e)}
                              className={`p-1.5 rounded hover:bg-black/10 disabled:opacity-20 cursor-pointer ${
                                isCurrent ? 'text-white/80 hover:text-white' : 'text-[#7A6855] hover:text-[#2C221E]'
                              }`}
                              title="順序往前上移一位"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>

                            {/* 下移 */}
                            <button
                              type="button"
                              disabled={index === playlistItems.length - 1}
                              onClick={(e) => handleMoveDownInPlaylist(index, e)}
                              className={`p-1.5 rounded hover:bg-black/10 disabled:opacity-20 cursor-pointer ${
                                isCurrent ? 'text-white/80 hover:text-white' : 'text-[#7A6855] hover:text-[#2C221E]'
                              }`}
                              title="順序往後下移一位"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {/* 移出清單 */}
                            <button
                              type="button"
                              onClick={(e) => handleRemoveFromPlaylist(item.id, e)}
                              className={`p-1.5 rounded hover:bg-red-500/20 hover:text-red-300 transition cursor-pointer ${
                                isCurrent ? 'text-white/60' : 'text-[#8B5A2B]'
                              }`}
                              title="從播放清單移除"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 投放到其他裝置 (Cast / AirPlay / 智慧電視) 彈出視窗 */}
      {showCastModal && currentItem && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border-2 border-[#8B5A2B] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal 頂部標題列 */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#2A1E18] to-[#3E2C22] text-[#FAF5EC] border-b border-[#4A3427] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <Cast className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold font-serif-tc text-base">投放到其他裝置</h3>
                  <p className="text-[11px] text-[#C8B5A0]">
                    支援 Apple AirPlay、Google Cast、智慧電視與跨裝置無縫接力
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCastModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal 內容區 */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* 目前正在放映的語音檔資訊 */}
              <div className="p-3.5 rounded-xl bg-[#FAF4E8] border border-[#D5C5AE] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={currentItem.coverImageUrl}
                    alt={currentItem.title}
                    className="w-12 h-12 rounded-lg object-cover border border-[#C8B598] shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-[#8B5A2B] font-semibold">目前放映中作品</p>
                    <h4 className="font-bold text-sm text-[#2C221E] truncate">{currentItem.title}</h4>
                    <p className="text-xs text-[#7A6855] font-mono">
                      進度：{formatDuration(currentTime)} / {formatDuration(duration)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 核心功能：一鍵喚起系統投放 */}
              <button
                type="button"
                onClick={handleTriggerNativeCast}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#2E5A44] to-[#1F3D2E] hover:from-[#234735] hover:to-[#172D22] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isIOSDevice ? (
                  <>
                    <Airplay className="w-4 h-4 text-emerald-300" />
                    <span>一鍵喚起 Apple AirPlay 投放 (Apple TV / 智慧電視)</span>
                  </>
                ) : (
                  <>
                    <Tv className="w-4 h-4 text-emerald-300" />
                    <span>一鍵喚起系統投放 (Chromecast / 智慧電視 / AirPlay)</span>
                  </>
                )}
              </button>

              {/* 電腦版輔助提示與 Android TV 操控指南 */}
              {!isIOSDevice && (
                <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-300/80 text-xs space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-emerald-900">
                    <Tv className="w-4 h-4 shrink-0 text-emerald-700" />
                    <span className="text-[13px]">電腦投放到 Android TV / 智慧電視操控指南</span>
                  </div>
                  <div className="space-y-2 text-[#4A3222]">
                    <div className="p-2 rounded-lg bg-white/95 border border-emerald-200/60 flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <div>
                        <p className="font-bold text-[#2C221E] text-[11px]">
                          電腦專屬「電視同步控制台」
                        </p>
                        <p className="text-[#6E5D4F] text-[11px] leading-relaxed">
                          透過上方按鈕連線電視後，電腦畫面右下方會自動顯示懸浮控制台，可直接在電腦按暫停、播放、快轉倒退與切換曲目，電視同步響應！
                        </p>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-white/95 border border-emerald-200/60 flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <div>
                        <p className="font-bold text-[#2C221E] text-[11px]">
                          Android TV 實體遙控器直接操作
                        </p>
                        <p className="text-[#6E5D4F] text-[11px] leading-relaxed">
                          按電視遙控器 <strong>OK / 確定鍵</strong> 可播放或暫停；按 <strong>左右方向鍵 ◀ / ▶</strong> 可快轉或倒退 5 秒；按 <strong>上下鍵 ▲ / ▼</strong> 可調整音量。
                        </p>
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-white/95 border border-emerald-200/60 flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <div>
                        <p className="font-bold text-[#2C221E] text-[11px]">
                          Chrome「投放分頁 (Cast Tab)」鏡像投影
                        </p>
                        <p className="text-[#6E5D4F] text-[11px] leading-relaxed">
                          在 Chrome 瀏覽器右上角選單點選「儲存與分享 ➔ 投放」，將來源選取「投放分頁 (Cast Tab)」，電腦網頁畫面與音訊 100% 鏡像投射至電視，電腦上任何滑鼠滾動與點擊完全即時同步！
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* iPhone / iPad 投放核心說明卡片（解答為什麼電腦看得到 Chromecast，iPhone 卻沒看到） */}
              {isIOSDevice && (
                <div className="p-3.5 rounded-xl bg-amber-50/95 border border-amber-300/80 text-xs space-y-2.5">
                  <div className="flex items-center gap-2 font-bold text-[#8B5A2B]">
                    <Info className="w-4 h-4 shrink-0 text-amber-700" />
                    <span className="text-[13px]">為什麼電腦看得到投放裝置，iPhone 卻沒看到？</span>
                  </div>
                  <p className="text-[#6E5D4F] leading-relaxed">
                    <strong>電腦版 Chrome / Edge</strong> 內建 Google 專屬 Cast 協定，因此能跨網段搜尋 <strong>Google Chromecast / Android TV</strong>；而 <strong>iPhone / iOS</strong> 依 Apple 系統安全規範，網頁原生僅支援 <strong>Apple AirPlay</strong>（Apple TV、HomePod 或 AirPlay 認證電視），<strong>無法由網頁直接搜尋 Google Chromecast 裝置</strong>。
                  </p>
                  <div className="pt-2 border-t border-amber-200/80 space-y-2 text-[#4A3222]">
                    <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>iPhone 投放至客廳電視 / Chromecast 的 2 大推薦方案：</span>
                    </div>
                    <div className="space-y-1.5 pl-1">
                      <div className="p-2 rounded-lg bg-white/90 border border-amber-200/60 flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="font-bold text-[#2C221E] text-[11px]">
                            客廳電視直接掃描（最推薦，原音質全螢幕呈現）
                          </p>
                          <p className="text-[#6E5D4F] text-[11px] leading-relaxed">
                            使用電視遙控器開啟電視內建瀏覽器，或用手機相機掃描下方<strong>「QR Code」</strong>，客廳電視將直接開啟聲書閣放映室並同步當前秒數播放！
                          </p>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-white/90 border border-amber-200/60 flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-emerald-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <div>
                          <p className="font-bold text-[#2C221E] text-[11px]">
                            iPhone「螢幕鏡像輸出」（影音完整同步）
                          </p>
                          <p className="text-[#6E5D4F] text-[11px] leading-relaxed">
                            從 iPhone 螢幕右上角向下滑開<strong>「iOS 控制中心」</strong>，點選<strong>「螢幕鏡像輸出」（雙矩形圖示）</strong>，選取客廳電視即可將聲書閣展演畫面與聲音完整投射至大螢幕！
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 投放管道說明卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* AirPlay */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E2D5C1] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-[#2C221E]">
                    <Airplay className="w-4 h-4 text-[#8B5A2B]" />
                    <span>Apple AirPlay</span>
                  </div>
                  <p className="text-[#6E5D4F] leading-relaxed">
                    iPhone / iPad / Mac 使用者可點擊上方按鈕，或滑開系統控制中心點選「螢幕鏡像輸出 / 音訊投放」，選取 Apple TV、智慧電視或 HomePod。
                  </p>
                </div>

                {/* Google Cast */}
                <div className="p-3.5 rounded-xl bg-white border border-[#E2D5C1] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-[#2C221E]">
                    <Cast className="w-4 h-4 text-[#2B4C7E]" />
                    <span>Google Cast / 電視</span>
                  </div>
                  <p className="text-[#6E5D4F] leading-relaxed">
                    Chrome 與 Edge 瀏覽器使用者點擊上方按鈕或瀏覽器功能表「投放」，即可將聲音與展演畫面投射至 Chromecast 與 Android TV。
                  </p>
                </div>
              </div>

              {/* 跨裝置接續播放：QR Code 與專屬連結 */}
              <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#D5C5AE] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[#8B5A2B]" />
                    <span className="font-bold text-sm text-[#2C221E]">
                      客廳電視 / 平板手機 掃描接續播放
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* 動態生成的 QR Code */}
                  <div className="p-2 bg-white rounded-xl border border-[#D5C5AE] shadow-xs shrink-0">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                        currentShareUrl
                      )}&margin=4`}
                      alt="掃描接續播放 QR Code"
                      className="w-28 h-28 object-contain"
                    />
                  </div>

                  <div className="flex-1 space-y-2 text-xs">
                    <p className="text-[#6E5D4F] leading-relaxed">
                      用平板相機或客廳智慧電視掃描此 QR Code，即可直接以當前播放進度（
                      <span className="font-mono font-bold text-[#8B5A2B]">
                        {formatDuration(currentTime)}
                      </span>
                      ）接續放映！
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCopyShareUrl}
                        className="px-3 py-1.5 rounded-lg bg-[#3A2518] hover:bg-[#523522] text-white font-medium flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        {castCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                            <span>已複製連結</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>複製跨裝置播放連結</span>
                          </>
                        )}
                      </button>

                      {typeof navigator.share === 'function' && (
                        <button
                          type="button"
                          onClick={handleSystemShare}
                          className="px-3 py-1.5 rounded-lg bg-[#EFE6D5] hover:bg-[#E2D4BC] text-[#3A2518] font-medium flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>系統分享</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal 底部按鈕 */}
            <div className="px-6 py-3 bg-[#F4ECE0] border-t border-[#E5D9C5] flex justify-end">
              <button
                type="button"
                onClick={() => setShowCastModal(false)}
                className="px-4 py-2 rounded-xl bg-[#3A2518] hover:bg-[#523522] text-white text-xs font-semibold cursor-pointer transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 語音檔案分享 (Share Modal) 彈出視窗 */}
      {showShareModal && currentItem && (
        <div className="fixed inset-0 z-[125] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border-2 border-[#8B5A2B] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal 頂部標題列 */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#2A1E18] to-[#3E2C22] text-[#FAF5EC] border-b border-[#4A3427] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold font-serif-tc text-base">分享此語音檔案</h3>
                  <p className="text-[11px] text-[#C8B5A0]">
                    分享給朋友、社群或跨裝置一同觀看聆聽
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
                title="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal 內容區 */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* 目前欲分享的語音檔案資訊預覽 */}
              <div className="p-3.5 rounded-xl bg-[#FAF4E8] border border-[#D5C5AE] flex items-center gap-3.5">
                <img
                  src={currentItem.coverImageUrl}
                  alt={currentItem.title}
                  className="w-14 h-14 rounded-lg object-cover border border-[#C8B598] shrink-0 shadow-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {currentCategory && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded text-white font-medium flex items-center gap-1 shrink-0"
                        style={{ backgroundColor: currentCategory.themeColor }}
                      >
                        {getCategoryIcon(currentCategory.icon, 'w-3 h-3')}
                        <span>{currentCategory.name}</span>
                      </span>
                    )}
                    {currentItem.speaker && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#EAE0D0] text-[#5C3A1B] font-medium flex items-center gap-1">
                        <User className="w-3 h-3 text-[#8B5A2B]" />
                        <span>{currentItem.speaker}</span>
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-[#2C221E] truncate" title={currentItem.title}>
                    {currentItem.title}
                  </h4>
                  <p className="text-[11px] text-[#7A6855] font-mono mt-0.5">
                    時長：{formatDuration(currentItem.duration || duration)}
                  </p>
                </div>
              </div>

              {/* 訪客瀏覽權限狀態說明 */}
              {Boolean(currentCategory?.allowGuest) ? (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-[11px] leading-relaxed">
                    此分類已勾選「開放訪客瀏覽」。收到分享連結之人員<strong>無需帳號密碼，點擊即可直接觀看放映</strong>！
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 leading-relaxed">
                    <p className="font-bold">此作品所屬分類「未開放訪客瀏覽」</p>
                    <p className="text-[11px] text-amber-800">
                      收到此分享網址的人員，<strong>必須登入具備權限之系統帳號</strong>方可觀看放映；訪客將無法存取此作品。若欲允許其他人免密直接觀看，請至「館藏資料管理」開啟該分類之「開放訪客瀏覽」。
                    </p>
                  </div>
                </div>
              )}

              {/* 是否包含當前播放進度核取方塊 */}
              <div className="p-3 rounded-xl bg-white border border-[#E2D5C1] flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[#2C221E] select-none">
                  <input
                    type="checkbox"
                    checked={shareIncludeTime}
                    onChange={(e) => setShareIncludeTime(e.target.checked)}
                    className="w-4 h-4 rounded text-[#8B5A2B] focus:ring-[#8B5A2B] cursor-pointer"
                  />
                  <span>包含當前播放進度（從 <span className="font-mono font-bold text-[#8B5A2B]">{formatDuration(currentTime)}</span> 開始播放）</span>
                </label>
                {shareIncludeTime && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono font-bold border border-amber-300 shrink-0">
                    + {Math.floor(currentTime)}s
                  </span>
                )}
              </div>

              {/* 複製專屬連結列 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#5C3A1B] flex items-center justify-between">
                  <span>分享連結：</span>
                  <span className="text-[11px] text-[#8B5A2B] font-normal">點擊複製即可傳送給他人</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareTargetUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#D5C5AE] bg-white text-[#2C221E] font-mono select-all focus:outline-none focus:ring-2 focus:ring-[#8B5A2B]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer shadow-xs ${
                      shareCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#3A2518] hover:bg-[#523522] text-white'
                    }`}
                  >
                    {shareCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>已複製</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-amber-300" />
                        <span>複製連結</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 快速社群分享按鈕 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#5C3A1B]">一鍵快速分享至：</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* LINE */}
                  <a
                    href={currentScreeningLineUrl}
                    target={isMobileDevice ? '_self' : '_blank'}
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-[#06C755]/10 hover:bg-[#06C755]/20 border border-[#06C755]/30 text-[#06C755] font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    title={
                      isMobileDevice
                        ? '開啟 LINE App 選擇好友或群組分享'
                        : '開啟 LINE 網頁版分享'
                    }
                  >
                    <span className="w-5 h-5 rounded-full bg-[#06C755] text-white text-[10px] font-bold flex items-center justify-center leading-none">L</span>
                    <span>LINE</span>
                  </a>

                  {/* Facebook */}
                  <button
                    type="button"
                    onClick={() => {
                      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareTargetUrl)}`;
                      window.open(fbUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="p-2.5 rounded-xl bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/30 text-[#1877F2] font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    title="分享至 Facebook"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#1877F2] text-white text-[11px] font-bold flex items-center justify-center leading-none">f</span>
                    <span>Facebook</span>
                  </button>

                  {/* X (Twitter) */}
                  <button
                    type="button"
                    onClick={() => {
                      const tweetText = `邀請您在聲書閣觀賞聆聽：《${currentItem.title}》`;
                      const xUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareTargetUrl)}&text=${encodeURIComponent(tweetText)}`;
                      window.open(xUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="p-2.5 rounded-xl bg-black/10 hover:bg-black/20 border border-black/30 text-black font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    title="分享至 X (Twitter)"
                  >
                    <span className="w-5 h-5 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center leading-none">𝕏</span>
                    <span>X</span>
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => {
                      const emailSubject = `聲書閣語音檔分享：《${currentItem.title}》`;
                      const emailBody = `邀請您在「聲書閣」觀賞聆聽此部作品：《${currentItem.title}》${
                        currentItem.speaker ? ` (主講：${currentItem.speaker})` : ''
                      }\n\n立即開啟放映室觀賞：\n${shareTargetUrl}`;
                      window.location.href = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
                    }}
                    className="p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-600/30 text-[#8B5A2B] font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    title="透過電子郵件分享"
                  >
                    <Mail className="w-4 h-4 text-[#8B5A2B]" />
                    <span>Email</span>
                  </button>
                </div>

                {/* 系統原生分享 (若支援 navigator.share) */}
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#EFE6D5] hover:bg-[#E2D4BC] text-[#3A2518] border border-[#D5C5AE] font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <Share2 className="w-4 h-4 text-[#8B5A2B]" />
                    <span>更多分享管道（AirDrop、手機通訊軟體、訊息等）</span>
                  </button>
                )}
              </div>

              {/* QR Code 掃描區 */}
              <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#D5C5AE] flex flex-col sm:flex-row items-center gap-4">
                <div className="p-2 bg-white rounded-xl border border-[#D5C5AE] shadow-xs shrink-0">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      shareTargetUrl
                    )}&margin=4`}
                    alt="掃描分享 QR Code"
                    className="w-24 h-24 object-contain"
                  />
                </div>
                <div className="text-left space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-[#2C221E]">
                    <QrCode className="w-4 h-4 text-[#8B5A2B]" />
                    <span>行動裝置相機掃描</span>
                  </div>
                  <p className="text-[#6E5D4F] leading-relaxed">
                    直接以手機或平板相機掃描此 QR Code，即可在行動裝置上開啟此語音檔案觀賞聆聽。
                  </p>
                </div>
              </div>
            </div>

            {/* Modal 底部按鈕 */}
            <div className="px-6 py-3 bg-[#F4ECE0] border-t border-[#E5D9C5] flex justify-end">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 rounded-xl bg-[#3A2518] hover:bg-[#523522] text-white text-xs font-semibold cursor-pointer transition shadow-xs"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. 「儲存播放清單」彈出視窗 (支援另存新檔或覆蓋更新) */}
      {showSavePlaylistModal && (
        <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border-2 border-[#8B5A2B] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#2A1E18] to-[#3E2C22] text-[#FAF5EC] border-b border-[#4A3427] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                  <Save className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold font-serif-tc text-base">儲存播放清單</h3>
                  <p className="text-[11px] text-[#C8B5A0]">
                    將目前放映室挑選的 {playlistItems.length} 部語音儲存至雲端與本機
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSavePlaylistModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 若目前已綁定既有清單，提供「更新覆蓋」或「另存新檔」選項 */}
              {activeSavedPlaylistId && (() => {
                const activeP = savedPlaylists.find((p) => p.id === activeSavedPlaylistId);
                if (!activeP) return null;
                return (
                  <div className="p-3 rounded-xl bg-[#FAF4E8] border border-[#DFCEB4] space-y-2 text-xs">
                    <span className="font-bold text-[#5C3A1B]">選擇儲存方式：</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSaveAsNewMode(false);
                          setSavePlaylistName(activeP.name);
                          setSavePlaylistDesc(activeP.description || '');
                        }}
                        className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                          !saveAsNewMode
                            ? 'bg-[#3A2518] text-white border-[#3A2518] shadow-xs'
                            : 'bg-white text-[#3A2518] border-[#D5C5AE] hover:bg-[#FAF4E8]'
                        }`}
                      >
                        <p className="font-bold">更新現有清單</p>
                        <p className="text-[10px] opacity-80 truncate">{activeP.name}</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSaveAsNewMode(true);
                          setSavePlaylistName(`${activeP.name} (複本)`);
                        }}
                        className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                          saveAsNewMode
                            ? 'bg-[#8B5A2B] text-white border-[#8B5A2B] shadow-xs'
                            : 'bg-white text-[#3A2518] border-[#D5C5AE] hover:bg-[#FAF4E8]'
                        }`}
                      >
                        <p className="font-bold">另存為新清單</p>
                        <p className="text-[10px] opacity-80">保留原清單，建立新複本</p>
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-[#5C3A1B] mb-1">
                  播放清單名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={savePlaylistName}
                  onChange={(e) => setSavePlaylistName(e.target.value)}
                  placeholder="例如：晚安床邊故事集、歷史經典導讀..."
                  className="w-full px-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5C3A1B] mb-1">
                  播放清單說明 (選填)
                </label>
                <textarea
                  rows={2}
                  value={savePlaylistDesc}
                  onChange={(e) => setSavePlaylistDesc(e.target.value)}
                  placeholder="簡短描述這份播放清單的主題或收錄特色..."
                  className="w-full px-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>

              {/* 清單預覽摘要 */}
              <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#E5D9C5] space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[#5C3A1B] font-semibold">
                  <span>包含語音內容：</span>
                  <span className="font-mono">
                    共 {playlistItems.length} 部 · 約 {formatDuration(totalPlaylistDuration)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {playlistItems.map((item, idx) => (
                    <span
                      key={item.id}
                      className="px-2 py-0.5 rounded bg-white border border-[#DFCEB4] text-[10px] text-[#3A2518] truncate max-w-[200px]"
                    >
                      #{idx + 1} {item.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-[#F4ECE0] border-t border-[#E5D9C5] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSavePlaylistModal(false)}
                className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#EFE6D5] text-xs font-medium text-[#5C3A1B] cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmSavePlaylist}
                className="px-5 py-2 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>確認儲存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 「已儲存的播放清單管理」彈出視窗 (支援 新增、修改、刪除、載入) */}
      {showManagePlaylistsModal && (
        <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border-2 border-[#8B5A2B] animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            {/* Modal 頂部標題 */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#2A1E18] to-[#3E2C22] text-[#FAF5EC] border-b border-[#4A3427] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center">
                  <ListMusic className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold font-serif-tc text-base">
                    {editingPlaylistData
                      ? isCreatingNewPlaylist
                        ? '新建立播放清單'
                        : `編輯播放清單：${editingPlaylistData.name}`
                      : '已儲存的播放清單管理'}
                  </h3>
                  <p className="text-[11px] text-[#C8B5A0]">
                    {editingPlaylistData
                      ? isCreatingNewPlaylist
                        ? '輸入清單名稱、說明，並檢索館藏語音加入清單'
                        : '調整此清單名稱、說明、語音排列順序與增減項目'
                      : '瀏覽、載入放映、編輯內容或刪除已保存的播放清單'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowManagePlaylistsModal(false);
                  setEditingPlaylistData(null);
                  setIsCreatingNewPlaylist(false);
                  setDeleteConfirmPlaylist(null);
                  setEditPickerSearchQuery('');
                  setEditPickerTagFilter('');
                  setPlaylistPickerAddAudioId('');
                }}
                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 模式 A：清單管理總覽列表 */}
            {!editingPlaylistData ? (
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {/* 搜尋過濾與新增按鈕列 */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="搜尋播放清單名稱或說明..."
                      value={manageSearchQuery}
                      onChange={(e) => setManageSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleCreateNewBlankPlaylist}
                      className="px-3 py-1.5 rounded-xl bg-[#8B5A2B] hover:bg-[#6E4420] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>建立新播放清單</span>
                    </button>
                  </div>
                </div>

                {/* 統計數量顯示 */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7A6855] px-1">
                  <span>
                    共收錄 <strong className="text-[#8B5A2B] font-bold">{savedPlaylists.length}</strong> 個播放清單
                    {manageSearchQuery.trim() && (
                      <>（符合搜尋條件：<strong className="text-[#8B5A2B] font-bold">{totalManageCount}</strong> 個）</>
                    )}
                  </span>
                  {totalManageCount > 0 && (
                    <span>
                      第 <strong className="text-[#8B5A2B] font-bold">{safeManagePage}</strong> / {totalManagePages} 頁
                    </span>
                  )}
                </div>

                {/* 清單上方分頁控制列（以 5 的倍數做選取：5, 10, 15, 20, 25） */}
                {totalManageCount > 0 && (
                  <div className="py-2 px-3 rounded-xl bg-[#FAF6EE] border border-[#E5D9C5] flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2 text-[#7A6855]">
                      <span>每頁顯示</span>
                      <select
                        value={managePageSize}
                        onChange={(e) => {
                          setManagePageSize(Number(e.target.value));
                          setManageCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer font-medium"
                      >
                        <option value={5}>5 筆</option>
                        <option value={10}>10 筆</option>
                        <option value={15}>15 筆</option>
                        <option value={20}>20 筆</option>
                        <option value={25}>25 筆</option>
                      </select>
                      <span className="hidden sm:inline">
                        （顯示第 {manageStartIndex + 1} - {Math.min(manageStartIndex + managePageSize, totalManageCount)} 筆，共 {totalManageCount} 筆）
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeManagePage <= 1}
                        onClick={() => setManageCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-[#D5C5AE] bg-white text-[#5C3A1B] hover:bg-[#FAF4E8] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                        title="上一頁"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {Array.from({ length: totalManagePages }, (_, i) => i + 1)
                        .filter(
                          (page) =>
                            page === 1 ||
                            page === totalManagePages ||
                            Math.abs(page - safeManagePage) <= 1
                        )
                        .map((page, idx, arr) => (
                          <React.Fragment key={`top_page_${page}`}>
                            {idx > 0 && arr[idx - 1] !== page - 1 && (
                              <span className="px-1 text-[#7A6855]">...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setManageCurrentPage(page)}
                              className={`w-7 h-7 rounded-lg text-xs font-semibold cursor-pointer transition ${
                                safeManagePage === page
                                  ? 'bg-[#8B5A2B] text-white shadow-xs'
                                  : 'bg-white border border-[#D5C5AE] text-[#5C3A1B] hover:bg-[#FAF4E8]'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        ))}

                      <button
                        type="button"
                        disabled={safeManagePage >= totalManagePages}
                        onClick={() => setManageCurrentPage((p) => Math.min(totalManagePages, p + 1))}
                        className="p-1.5 rounded-lg border border-[#D5C5AE] bg-white text-[#5C3A1B] hover:bg-[#FAF4E8] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                        title="下一頁"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 清單列表 */}
                {savedPlaylists.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-xl bg-[#FAF6EE] border border-dashed border-[#D5C5AE] space-y-3">
                    <div className="w-12 h-12 rounded-full bg-[#EFE6D5] text-[#8B5A2B] flex items-center justify-center mx-auto">
                      <ListMusic className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-[#3A2518]">目前尚無已儲存的播放清單</p>
                      <p className="text-xs text-[#7A6855] max-w-sm mx-auto leading-relaxed">
                        您可以點選上方「建立新播放清單」，或先在放映室書架挑選語音後點選「保存清單」！
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateNewBlankPlaylist}
                      className="px-4 py-2 rounded-xl bg-[#3A2518] hover:bg-[#523522] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>建立第一份播放清單</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paginatedManagePlaylists.map((p, idx) => {
                      const globalIndex = (safeManagePage - 1) * managePageSize + idx + 1;
                      const isCurrentlyActive = activeSavedPlaylistId === p.id;
                      // 計算清單總時長
                      const pDuration = p.audioItemIds.reduce((sum, id) => {
                        const it = audioItems.find((a) => a.id === id);
                        return sum + (it?.duration || 0);
                      }, 0);

                      return (
                        <div
                          key={p.id}
                          className={`p-4 rounded-xl border transition space-y-3 ${
                            isCurrentlyActive
                              ? 'bg-[#FFF9EE] border-amber-400 ring-2 ring-amber-400/40 shadow-md'
                              : 'bg-white hover:bg-[#FAF6EE] border-[#E5D9C5]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="font-mono text-xs font-bold text-[#8B5A2B] bg-[#F4ECE0] px-2 py-0.5 rounded-md border border-[#DFCEB4] shrink-0"
                                  title={`清單序號 #${globalIndex}`}
                                >
                                  #{globalIndex}
                                </span>
                                <h4 className="font-bold font-serif-tc text-sm text-[#2C221E] flex items-center gap-1.5">
                                  <ListMusic className="w-4 h-4 text-[#8B5A2B]" />
                                  <span>{p.name}</span>
                                </h4>
                                {isCurrentlyActive && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-[#2C221E] font-bold text-[10px] flex items-center gap-1">
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                    放映中
                                  </span>
                                )}
                              </div>
                              {p.description && (
                                <p className="text-xs text-[#6E5D4F] line-clamp-1">{p.description}</p>
                              )}
                            </div>

                            {/* 操作按鈕群：載入、編輯、刪除 */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectSavedPlaylist(p.id, true);
                                  setShowManagePlaylistsModal(false);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs ${
                                  isCurrentlyActive
                                    ? 'bg-amber-400 text-[#2C221E]'
                                    : 'bg-[#2E5A44] hover:bg-[#234735] text-white'
                                }`}
                                title="載入此清單至放映室並自動播放"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>{isCurrentlyActive ? '重新載入' : '載入放映'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setIsCreatingNewPlaylist(false);
                                  setEditingPlaylistData(p);
                                  setEditPickerSearchQuery('');
                                  setEditPickerTagFilter('');
                                  setPlaylistPickerAddAudioId('');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#EFE6D5] border border-[#D5C5AE] text-[#5C3A1B] text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                                title="修改此播放清單內容與順序"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>修改</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeleteConfirmPlaylist(p)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-[#8B735B] hover:text-red-700 transition cursor-pointer"
                                title="刪除此播放清單"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* 統計與曲目縮圖預覽 */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5D9C5]/60 text-xs">
                            <span className="text-[#7A6855] text-[11px] font-mono">
                              收錄 {p.audioItemIds.length} 部語音 · 總時長約 {formatDuration(pDuration)}
                            </span>

                            {/* 前 4 張縮圖 */}
                            <div className="flex items-center gap-1 overflow-x-auto">
                              {p.audioItemIds.slice(0, 4).map((id) => {
                                const it = audioItems.find((a) => a.id === id);
                                if (!it) return null;
                                return (
                                  <img
                                    key={id}
                                    src={it.coverImageUrl}
                                    alt={it.title}
                                    title={it.title}
                                    className="w-6 h-6 rounded object-cover border border-[#D5C5AE]"
                                  />
                                );
                              })}
                              {p.audioItemIds.length > 4 && (
                                <span className="text-[10px] text-[#7A6855] font-mono">
                                  +{p.audioItemIds.length - 4}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 清單分頁控制列（以 5 的倍數做選取：5, 10, 15, 20, 25） */}
                {totalManageCount > 0 && (
                  <div className="pt-3 border-t border-[#E5D9C5] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-[#7A6855]">
                      <span>每頁顯示</span>
                      <select
                        value={managePageSize}
                        onChange={(e) => {
                          setManagePageSize(Number(e.target.value));
                          setManageCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer font-medium"
                      >
                        <option value={5}>5 筆</option>
                        <option value={10}>10 筆</option>
                        <option value={15}>15 筆</option>
                        <option value={20}>20 筆</option>
                        <option value={25}>25 筆</option>
                      </select>
                      <span className="hidden sm:inline">
                        （顯示第 {manageStartIndex + 1} - {Math.min(manageStartIndex + managePageSize, totalManageCount)} 筆，共 {totalManageCount} 筆）
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeManagePage <= 1}
                        onClick={() => setManageCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-[#D5C5AE] bg-white text-[#5C3A1B] hover:bg-[#FAF4E8] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                        title="上一頁"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {Array.from({ length: totalManagePages }, (_, i) => i + 1)
                        .filter(
                          (page) =>
                            page === 1 ||
                            page === totalManagePages ||
                            Math.abs(page - safeManagePage) <= 1
                        )
                        .map((page, idx, arr) => (
                          <React.Fragment key={page}>
                            {idx > 0 && arr[idx - 1] !== page - 1 && (
                              <span className="px-1 text-[#7A6855]">...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setManageCurrentPage(page)}
                              className={`w-7 h-7 rounded-lg text-xs font-semibold cursor-pointer transition ${
                                safeManagePage === page
                                  ? 'bg-[#8B5A2B] text-white shadow-xs'
                                  : 'bg-white border border-[#D5C5AE] text-[#5C3A1B] hover:bg-[#FAF4E8]'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        ))}

                      <button
                        type="button"
                        disabled={safeManagePage >= totalManagePages}
                        onClick={() => setManageCurrentPage((p) => Math.min(totalManagePages, p + 1))}
                        className="p-1.5 rounded-lg border border-[#D5C5AE] bg-white text-[#5C3A1B] hover:bg-[#FAF4E8] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                        title="下一頁"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 模式 B：特定播放清單內容修改面板 (編輯名稱、說明、調序、刪曲、加曲) */
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleCancelEditPlaylist}
                    className="text-xs text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>返回清單列表</span>
                  </button>
                  <span className="text-xs text-[#7A6855]">
                    共 {editingPlaylistData.audioItemIds.length} 部語音
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#5C3A1B] mb-1">
                      播放清單名稱 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingPlaylistData.name}
                      onChange={(e) =>
                        setEditingPlaylistData({ ...editingPlaylistData, name: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl border border-[#D5C5AE] bg-white text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5C3A1B] mb-1">
                      播放清單說明
                    </label>
                    <input
                      type="text"
                      value={editingPlaylistData.description || ''}
                      onChange={(e) =>
                        setEditingPlaylistData({ ...editingPlaylistData, description: e.target.value })
                      }
                      placeholder="簡述此播放清單特色..."
                      className="w-full px-3 py-1.5 rounded-xl border border-[#D5C5AE] bg-white text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                    />
                  </div>
                </div>

                {/* 從館藏追加語音快捷選單 (支援關鍵字查詢與類別標籤下拉選取) */}
                <div className="p-3.5 bg-[#FAF6EE] rounded-xl border border-[#E5D9C5] space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#5C3A1B] flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5 text-[#8B5A2B]" />
                      <span>追加館藏語音至此清單：</span>
                    </span>
                    {(editPickerSearchQuery || editPickerTagFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditPickerSearchQuery('');
                          setEditPickerTagFilter('');
                        }}
                        className="text-[11px] text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-0.5 cursor-pointer font-medium"
                      >
                        <X className="w-3 h-3" />
                        <span>重設搜尋</span>
                      </button>
                    )}
                  </div>

                  {/* 關鍵字查詢與類別標籤下拉選取 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="搜尋未加入語音名稱/說明..."
                        value={editPickerSearchQuery}
                        onChange={(e) => setEditPickerSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                      />
                    </div>

                    <div className="relative">
                      <Tag className="w-3.5 h-3.5 text-[#8B735B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        value={editPickerTagFilter}
                        onChange={(e) => setEditPickerTagFilter(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate"
                      >
                        <option value="">🏷️ 全部類別標籤 {allAudioTags.length === 0 ? '(尚無標籤)' : '(不限)'}</option>
                        {allAudioTags.map(({ tag, count }) => (
                          <option key={tag} value={tag}>
                            🏷️ #{tag} ({count} 部)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8B735B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* 候選語音下拉選單與加入按鈕 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={playlistPickerAddAudioId}
                      onChange={(e) => setPlaylistPickerAddAudioId(e.target.value)}
                      className="flex-1 min-w-[200px] pl-2.5 pr-8 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] cursor-pointer truncate"
                    >
                      <option value="">
                        {availableCandidateAudio.length === 0
                          ? '無符合條件的未加入語音'
                          : `選擇要加入的語音（符合條件：${availableCandidateAudio.length} 部）...`}
                      </option>
                      {availableCandidateAudio.map((a) => {
                        const callNo = audioCallNumberMap.get(a.id);
                        return (
                          <option key={a.id} value={a.id}>
                            {callNo ? `[${callNo}] ` : ''}{a.title} ({formatDuration(a.duration)})
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      disabled={!playlistPickerAddAudioId}
                      onClick={() => {
                        if (!playlistPickerAddAudioId) return;
                        setEditingPlaylistData({
                          ...editingPlaylistData,
                          audioItemIds: [...editingPlaylistData.audioItemIds, playlistPickerAddAudioId],
                        });
                        setPlaylistPickerAddAudioId('');
                        showToast('➕ 已加入該語音至清單！');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#8B5A2B] hover:bg-[#6E4420] disabled:opacity-40 text-white font-semibold text-xs cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>加入</span>
                    </button>

                    {availableCandidateAudio.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newIds = availableCandidateAudio.map((a) => a.id);
                          setEditingPlaylistData({
                            ...editingPlaylistData,
                            audioItemIds: [...editingPlaylistData.audioItemIds, ...newIds],
                          });
                          setPlaylistPickerAddAudioId('');
                          showToast(`🎉 已將符合條件的 ${newIds.length} 部語音全數加入清單！`);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#FAF4E8] hover:bg-[#EFE6D5] text-[#8B5A2B] border border-[#DFCEB4] text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                        title="將目前搜尋出的所有語音檔案一次加入清單"
                      >
                        <Plus className="w-3 h-3" />
                        <span>全部加入 ({availableCandidateAudio.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 清單曲目排列與刪減區 */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {editingPlaylistData.audioItemIds.length === 0 ? (
                    <div className="py-8 px-4 text-center rounded-xl bg-white border border-dashed border-[#D5C5AE] text-[#7A6855] text-xs space-y-1">
                      <p className="font-bold text-[#3A2518]">此清單目前尚無語音檔</p>
                      <p>請使用上方「追加館藏語音至此清單」搜尋並加入語音！</p>
                    </div>
                  ) : (
                    editingPlaylistData.audioItemIds.map((id, index) => {
                      const it = audioItems.find((a) => a.id === id);
                      if (!it) return null;

                      return (
                        <div
                          key={`edit_track_${id}_${index}`}
                          className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-[#E5D9C5] text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-mono text-xs font-bold text-[#8B5A2B] w-5 text-center shrink-0">
                              #{index + 1}
                            </span>
                            <img
                              src={it.coverImageUrl}
                              alt=""
                              className="w-8 h-8 rounded object-cover border border-[#D5C5AE] shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-[#2C221E] truncate">{it.title}</p>
                              <span className="text-[10px] text-[#7A6855] font-mono">
                                {formatDuration(it.duration)}
                              </span>
                            </div>
                          </div>

                          {/* 順序調整控制 */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {/* 移至頂部 */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                const nextIds = [...editingPlaylistData.audioItemIds];
                                const [moved] = nextIds.splice(index, 1);
                                nextIds.unshift(moved);
                                setEditingPlaylistData({ ...editingPlaylistData, audioItemIds: nextIds });
                              }}
                              className="p-1 rounded hover:bg-black/10 disabled:opacity-20 cursor-pointer text-[#7A6855]"
                              title="移至第 1 順位"
                            >
                              <ArrowUpToLine className="w-3 h-3" />
                            </button>

                            {/* 上移 */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                const nextIds = [...editingPlaylistData.audioItemIds];
                                const tmp = nextIds[index - 1];
                                nextIds[index - 1] = nextIds[index];
                                nextIds[index] = tmp;
                                setEditingPlaylistData({ ...editingPlaylistData, audioItemIds: nextIds });
                              }}
                              className="p-1 rounded hover:bg-black/10 disabled:opacity-20 cursor-pointer text-[#7A6855]"
                              title="上移"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>

                            {/* 下移 */}
                            <button
                              type="button"
                              disabled={index === editingPlaylistData.audioItemIds.length - 1}
                              onClick={() => {
                                const nextIds = [...editingPlaylistData.audioItemIds];
                                const tmp = nextIds[index + 1];
                                nextIds[index + 1] = nextIds[index];
                                nextIds[index] = tmp;
                                setEditingPlaylistData({ ...editingPlaylistData, audioItemIds: nextIds });
                              }}
                              className="p-1 rounded hover:bg-black/10 disabled:opacity-20 cursor-pointer text-[#7A6855]"
                              title="下移"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>

                            {/* 移出 */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextIds = editingPlaylistData.audioItemIds.filter((_, idx) => idx !== index);
                                setEditingPlaylistData({ ...editingPlaylistData, audioItemIds: nextIds });
                              }}
                              className="p-1 rounded hover:bg-red-50 text-red-600 cursor-pointer ml-1"
                              title="從此清單移除"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Modal 底部按鈕 */}
            <div className="px-6 py-3 bg-[#F4ECE0] border-t border-[#E5D9C5] flex items-center justify-between shrink-0">
              <span className="text-[11px] text-[#7A6855]">
                {isLoadingPlaylists ? '正在同步雲端清單...' : '支援跨裝置自動同步保存'}
              </span>

              <div className="flex items-center gap-2">
                {editingPlaylistData ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelEditPlaylist}
                      className="px-3 py-1.5 rounded-xl border border-[#D5C5AE] bg-white text-xs font-medium text-[#5C3A1B] cursor-pointer hover:bg-[#FAF6EE]"
                    >
                      取消編輯
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditedPlaylistData}
                      className="px-4 py-1.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isCreatingNewPlaylist ? '確認建立播放清單' : '確認儲存清單修改'}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowManagePlaylistsModal(false);
                      setEditingPlaylistData(null);
                      setIsCreatingNewPlaylist(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#3A2518] hover:bg-[#523522] text-white text-xs font-semibold cursor-pointer transition"
                  >
                    關閉
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 刪除播放清單二度確認對話框 */}
      {deleteConfirmPlaylist && (
        <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-sm w-full p-6 space-y-4 border-2 border-red-500/40 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-bold text-sm text-[#2C221E]">確定要刪除此播放清單？</h4>
              <p className="text-xs text-[#7A6855] leading-relaxed">
                確定要刪除「<strong className="text-red-700">{deleteConfirmPlaylist.name}</strong>
                」嗎？此動作將同步從雲端及本機徹底刪除，且無法復原。
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmPlaylist(null)}
                className="flex-1 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs font-semibold text-[#5C3A1B] cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteSavedPlaylist(deleteConfirmPlaylist)}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 瀏覽器自動播放受限時之友善點擊解鎖橫幅 (點選螢幕任意處或此橫幅即可立即放映) */}
      {showAutoplayPrompt && (
        <aside
          aria-label="點選立即播放導覽"
          onClick={() => {
            if (audioRef.current) {
              audioRef.current
                .play()
                .then(() => {
                  setIsPlaying(true);
                  setShowAutoplayPrompt(false);
                  pendingAutoPlayRef.current = false;
                })
                .catch(console.warn);
            }
          }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] max-w-md w-[92%] p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-[#2A1E18] to-[#4A301E] text-[#FAF5EC] border-2 border-amber-400 shadow-2xl flex items-center justify-between gap-3 cursor-pointer animate-bounce hover:scale-102 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-amber-400 text-stone-900 flex items-center justify-center shrink-0 font-bold shadow-md">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-amber-300 font-semibold">點選螢幕任意處立即播放</p>
              <h4 className="font-bold text-sm text-white truncate">
                {currentItem?.title || '語音導覽作品'}
              </h4>
            </div>
          </div>
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-900 font-bold text-xs shrink-0 shadow-sm transition"
          >
            立即聆聽
          </button>
        </aside>
      )}

      {/* 客廳電視 (Android TV / Chromecast) 連線投放中專屬懸浮同步控制台 */}
      {isPresentationConnected && (
        <aside
          aria-label="客廳電視連線控制台"
          className="fixed bottom-6 right-6 z-[130] bg-[#1F2D24]/95 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border-2 border-emerald-400/90 backdrop-blur-md max-w-xs sm:max-w-sm w-[90%] sm:w-auto animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-emerald-500/30">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-emerald-200 flex items-center gap-1">
                <Tv className="w-3.5 h-3.5" /> 客廳電視連線投放中
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  presentationConnectionRef.current?.terminate();
                  presentationConnectionRef.current?.close();
                } catch {}
                presentationConnectionRef.current = null;
                setIsPresentationConnected(false);
                showToast('📺 已中斷客廳電視投放');
              }}
              className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 transition cursor-pointer"
              title="中斷電視連線"
            >
              斷開投放
            </button>
          </div>

          <div className="text-xs text-stone-200 truncate font-semibold mb-2.5">
            {currentItem?.title}
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => playPrevTrack(true)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="上一首"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSeek(currentTime - 5)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="倒退 5 秒"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-900 font-bold transition cursor-pointer shadow-md"
              title={isPlaying ? '暫停電視播放' : '開始電視播放'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSeek(currentTime + 5)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="快轉 5 秒"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => playNextTrack(true)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="下一首"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};
