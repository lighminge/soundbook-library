import React, { useEffect, useRef, useState } from 'react';
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
  Sparkles,
  Repeat,
} from 'lucide-react';
import { AudioItem, Category, PlaybackSlide } from '../types';
import { formatDuration, getCategoryIcon } from './DashboardView';
import { fetchAudioBlobFromGoogleDrive } from '../services/storageService';
import { usePlayableAudioUrl } from '../utils/mediaCache';

interface ScreeningRoomViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  activeAudio: AudioItem | null;
  initialCategoryFilter?: string;
  onSelectAudio: (item: AudioItem) => void;
  onEditAudio: (item: AudioItem) => void;
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
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialCategoryFilter) {
      setSelectedCategoryId(initialCategoryFilter);
    }
  }, [initialCategoryFilter]);

  const currentItem = activeAudio || audioItems[0] || null;

  // 將 Google Drive 音訊自動解析為瀏覽器 100% 可播放的本地 Blob/Data URL
  const { playableUrl: playableScreeningUrl, isLoadingAudio: isScreeningAudioLoading } =
    usePlayableAudioUrl(
      currentItem?.audioUrl || '',
      currentItem?.audioDriveFileId,
      fetchAudioBlobFromGoogleDrive
    );

  // 當切換曲目時重置播放狀態
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setManualSlideIndex(null);
    if (currentItem) {
      setDuration(currentItem.duration || 20);
    }
  }, [currentItem?.id]);

  // 當 playableScreeningUrl 解析完成或更新時，讓 audio 元件重新載入來源
  useEffect(() => {
    if (audioRef.current && playableScreeningUrl) {
      audioRef.current.load();
    }
  }, [playableScreeningUrl]);

  // 依據分類與搜尋篩選清單
  const filteredItems = audioItems.filter((item) => {
    const matchCat =
      selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
    const matchQuery =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  const currentCategory = categories.find((c) => c.id === currentItem?.categoryId);

  // 取得播放時要展示的所有圖片（若無設定 slides，自動以封面圖作為預設展演圖）
  const slides: PlaybackSlide[] =
    currentItem && currentItem.playbackDisplay.slides.length > 0
      ? [...currentItem.playbackDisplay.slides].sort((a, b) => a.timestampSec - b.timestampSec)
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

  // 根據播放進度自動計算當前對應的投影片索引
  const autoSlideIndex = (() => {
    if (slides.length <= 1) return 0;
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

  const paragraphs = parsePlaybackText(currentItem?.playbackDisplay.textContent || '');

  // 計算當前對應的文字段落索引
  const activeParagraphIndex = (() => {
    let idx = -1;
    for (let i = 0; i < paragraphs.length; i++) {
      const ts = paragraphs[i].timestampSec;
      if (ts !== null && currentTime >= ts) {
        idx = i;
      }
    }
    return idx;
  })();

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setManualSlideIndex(null); // 播放時恢復時間軸自動同步圖片
      audio.play().catch((err) => console.warn('播放失敗:', err));
      setIsPlaying(true);
    }
  };

  const handleSeek = (newTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(duration || 1, newTime));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
    setManualSlideIndex(null);
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

  if (!currentItem) {
    return (
      <div className="p-12 text-center parchment-card rounded-2xl">
        <p className="text-[#7A6855]">目前系統尚無語音檔，請先至「語音檔案庫」上傳語音。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 隱藏的 HTML5 Audio 元件 */}
      <audio
        ref={audioRef}
        src={playableScreeningUrl}
        loop={isLooping}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          if (!isLooping) setIsPlaying(false);
        }}
      />

      {/* 頂部：分類篩選導覽列 */}
      <div className="parchment-card rounded-2xl p-4 md:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
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

        {/* 搜尋框 */}
        <div className="relative w-full lg:w-64 shrink-0">
          <Search className="w-4 h-4 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋館藏語音標題或內容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D8C8B0] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
          />
        </div>
      </div>

      {/* 主放映室佈局：左側/上方為多媒體展演舞台，右側為分類書架選單 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左側 8 欄：放映室主舞台（圖片展演 + 播放器 + 播放時同步文字） */}
        <div className="lg:col-span-8 space-y-6">
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white opacity-80 group-hover:opacity-100 transition cursor-pointer"
                    title="上一張播放圖片"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setManualSlideIndex((activeSlideIndex + 1) % slides.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white opacity-80 group-hover:opacity-100 transition cursor-pointer"
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
                  <p className="text-sm md:text-base font-medium text-white">
                    {activeSlide?.caption || currentItem.description}
                  </p>
                </div>

                {/* 多張圖片縮圖切換器 */}
                {slides.length > 1 && (
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {slides.map((sl, i) => (
                      <button
                        key={sl.id}
                        onClick={() => {
                          setManualSlideIndex(i);
                          handleSeek(sl.timestampSec);
                        }}
                        className={`w-12 h-8 rounded overflow-hidden border-2 transition cursor-pointer ${
                          i === activeSlideIndex
                            ? 'border-amber-400 scale-105'
                            : 'border-white/30 opacity-60 hover:opacity-100'
                        }`}
                        title={`${formatDuration(sl.timestampSec)} - ${sl.caption}`}
                      >
                        <img src={sl.imageUrl} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
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
                  >
                    {isPlaying ? (
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
                    點擊任一段落可跳轉至對應播放秒數，亦可於「語音檔案庫」隨時編輯文字內容
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

            {/* 館藏說明簡介 */}
            <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1]">
              <p className="text-xs font-semibold text-[#8B5A2B] mb-1">【館藏簡介說明】</p>
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                {currentItem.description || '尚無簡介說明'}
              </p>
            </div>

            {/* 播放時顯示的文字段落 */}
            <div className="space-y-3">
              {paragraphs.length === 0 ? (
                <p className="text-sm text-[#7A6855] italic py-4 text-center">
                  此語音檔尚未設定「播放時的文字顯示」，可點擊右上角「編輯此語音圖文設定」新增。
                </p>
              ) : (
                paragraphs.map((p, idx) => {
                  const isActive = idx === activeParagraphIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (p.timestampSec !== null) handleSeek(p.timestampSec);
                      }}
                      className={`p-4 rounded-xl border transition-all ${
                        p.timestampSec !== null ? 'cursor-pointer' : ''
                      } ${
                        isActive
                          ? 'bg-[#FFF9EE] border-[#8B5A2B] shadow-sm ring-1 ring-[#8B5A2B]/30'
                          : 'bg-white/70 border-[#E8DEC8] hover:border-[#C8B598]'
                      }`}
                    >
                      {p.timeLabel && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                              isActive
                                ? 'bg-[#8B5A2B] text-white'
                                : 'bg-[#EFE6D5] text-[#5C3A1B]'
                            }`}
                          >
                            {p.timeLabel}
                          </span>
                          {isActive && (
                            <span className="text-xs font-medium text-[#8B5A2B]">
                              ● 正在朗讀此段落
                            </span>
                          )}
                        </div>
                      )}
                      <p
                        className={`text-[#2C221E] whitespace-pre-line leading-relaxed font-serif-tc ${
                          fontSize === 'sm'
                            ? 'text-sm'
                            : fontSize === 'lg'
                            ? 'text-lg'
                            : 'text-base'
                        }`}
                      >
                        {p.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 右側 4 欄：分類書架播放清單 (Category Audio Selector) */}
        <div className="lg:col-span-4">
          <div className="parchment-card rounded-2xl p-5 shadow-md sticky top-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5D9C5] pb-3">
              <div className="flex items-center gap-2">
                <ListMusic className="w-5 h-5 text-[#8B5A2B]" />
                <h3 className="font-bold font-serif-tc text-base text-[#2C221E]">
                  館藏語音選片書架
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#EFE6D5] text-[#5C3A1B] font-medium">
                共 {filteredItems.length} 部
              </span>
            </div>

            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#7A6855]">
                  此分類或搜尋條件下沒有符合的語音檔
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === currentItem.id;
                  const cat = categories.find((c) => c.id === item.categoryId);

                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelectAudio(item)}
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
                        <div className="flex items-center gap-1.5 mb-1">
                          {cat && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{ backgroundColor: cat.themeColor }}
                            >
                              {cat.name}
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
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
