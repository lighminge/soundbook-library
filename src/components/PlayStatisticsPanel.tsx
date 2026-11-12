import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  List,
  RefreshCw,
  Loader2,
  Trash2,
  Search,
  CalendarDays,
  Filter,
  RotateCcw,
  Clock,
  Headphones,
  Users,
  FileAudio,
  ArrowUpDown,
  TrendingUp,
  Tag,
  User,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { AudioItem, Category, PlayLogRecord } from '../types';
import { loadPlayLogs, clearAllPlayLogs } from '../services/playStatsService';
import { PaginationBar, dateInputToEndMs, dateInputToStartMs } from './PaginationBar';
import { getCategoryIcon, getCategoryEmoji } from './DashboardView';

interface PlayStatisticsPanelProps {
  audioItems: AudioItem[];
  categories: Category[];
}

interface AudioStatRow {
  audioId: string;
  title: string;
  categoryId: string;
  speaker: string;
  tags: string[];
  isDeleted: boolean;
  totalSeconds: number;
  playCount: number;
  listenerCount: number;
  lastPlayedAt: string | null;
}

type StatSortField = 'totalSeconds' | 'playCount' | 'lastPlayedAt' | 'title';

/** 將秒數格式化為「X 小時 Y 分 Z 秒」 */
export function formatPlayTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} 小時 ${m} 分 ${sec} 秒`;
  if (m > 0) return `${m} 分 ${sec} 秒`;
  return `${sec} 秒`;
}

function formatHours(totalSeconds: number): string {
  return (totalSeconds / 3600).toFixed(2);
}

function toDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PlayStatisticsPanel: React.FC<PlayStatisticsPanelProps> = ({
  audioItems,
  categories,
}) => {
  const [playLogs, setPlayLogs] = useState<PlayLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [speakerFilter, setSpeakerFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [onlyPlayed, setOnlyPlayed] = useState(false);
  const [sortField, setSortField] = useState<StatSortField>('totalSeconds');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      setPlayLogs(await loadPlayLogs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, tagFilter, speakerFilter, keyword, dateFrom, dateTo, onlyPlayed, sortField, sortDir, pageSize]);

  const handleClear = async () => {
    setConfirmClear(false);
    setLoading(true);
    try {
      await clearAllPlayLogs();
      setPlayLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setCategoryFilter('all');
    setTagFilter('all');
    setSpeakerFilter('all');
    setKeyword('');
    setDateFrom('');
    setDateTo('');
    setOnlyPlayed(false);
  };

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    audioItems.forEach((a) => (a.tags || []).forEach((t) => t && s.add(t)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [audioItems]);

  const allSpeakers = useMemo(() => {
    const s = new Set<string>();
    audioItems.forEach((a) => a.speaker && a.speaker.trim() && s.add(a.speaker.trim()));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [audioItems]);

  // 依日期起迄篩選播放紀錄
  const dateFilteredLogs = useMemo(() => {
    const fromMs = dateInputToStartMs(dateFrom);
    const toMs = dateInputToEndMs(dateTo);
    return playLogs.filter((log) => {
      const ts = new Date(log.playedAt || 0).getTime();
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs !== null && ts > toMs) return false;
      return true;
    });
  }, [playLogs, dateFrom, dateTo]);

  // 彙總各語音檔播放統計並套用分類 / 標籤 / 主講人 / 關鍵字篩選
  const statRows = useMemo<AudioStatRow[]>(() => {
    const rows = new Map<string, AudioStatRow & { users: Set<string> }>();
    audioItems.forEach((a) => {
      rows.set(a.id, {
        audioId: a.id,
        title: a.title,
        categoryId: a.categoryId,
        speaker: (a.speaker || '').trim(),
        tags: a.tags || [],
        isDeleted: false,
        totalSeconds: 0,
        playCount: 0,
        listenerCount: 0,
        lastPlayedAt: null,
        users: new Set<string>(),
      });
    });

    dateFilteredLogs.forEach((log) => {
      let row = rows.get(log.audioId);
      if (!row) {
        row = {
          audioId: log.audioId,
          title: log.audioTitle || log.audioId,
          categoryId: log.categoryId,
          speaker: (log.speaker || '').trim(),
          tags: log.tags || [],
          isDeleted: true,
          totalSeconds: 0,
          playCount: 0,
          listenerCount: 0,
          lastPlayedAt: null,
          users: new Set<string>(),
        };
        rows.set(log.audioId, row);
      }
      row.totalSeconds += Number(log.playedSeconds) || 0;
      row.playCount += 1;
      row.users.add(log.userId || log.username);
      if (!row.lastPlayedAt || new Date(log.playedAt) > new Date(row.lastPlayedAt)) {
        row.lastPlayedAt = log.playedAt;
      }
    });

    const kw = keyword.trim().toLowerCase();
    const list: AudioStatRow[] = [];
    rows.forEach((r) => {
      if (r.isDeleted && r.playCount === 0) return;
      if (categoryFilter !== 'all' && r.categoryId !== categoryFilter) return;
      if (tagFilter !== 'all' && !r.tags.includes(tagFilter)) return;
      if (speakerFilter !== 'all' && r.speaker !== speakerFilter) return;
      if (kw && !r.title.toLowerCase().includes(kw)) return;
      if (onlyPlayed && r.playCount === 0) return;
      const { users, ...rest } = r;
      list.push({ ...rest, listenerCount: users.size });
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'totalSeconds') cmp = a.totalSeconds - b.totalSeconds;
      else if (sortField === 'playCount') cmp = a.playCount - b.playCount;
      else if (sortField === 'lastPlayedAt')
        cmp =
          (a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0) -
          (b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0);
      else cmp = a.title.localeCompare(b.title, 'zh-Hant');
      if (cmp === 0) cmp = a.title.localeCompare(b.title, 'zh-Hant') * dir;
      return cmp * dir;
    });
    return list;
  }, [audioItems, dateFilteredLogs, categoryFilter, tagFilter, speakerFilter, keyword, onlyPlayed, sortField, sortDir]);

  const matchedAudioIds = useMemo(() => new Set(statRows.map((r) => r.audioId)), [statRows]);
  const matchedLogs = useMemo(
    () => dateFilteredLogs.filter((l) => matchedAudioIds.has(l.audioId)),
    [dateFilteredLogs, matchedAudioIds]
  );

  const summary = useMemo(() => {
    const totalSeconds = statRows.reduce((s, r) => s + r.totalSeconds, 0);
    const playCount = statRows.reduce((s, r) => s + r.playCount, 0);
    const listeners = new Set(matchedLogs.map((l) => l.userId || l.username)).size;
    return {
      audioCount: statRows.length,
      playedAudioCount: statRows.filter((r) => r.playCount > 0).length,
      totalSeconds,
      playCount,
      listeners,
    };
  }, [statRows, matchedLogs]);

  // 每日播放時數趨勢（依篩選結果）
  const dailyTrend = useMemo(() => {
    const byDay = new Map<string, number>();
    matchedLogs.forEach((l) => {
      const key = toDateKey(l.playedAt);
      byDay.set(key, (byDay.get(key) || 0) + (Number(l.playedSeconds) || 0));
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-31);
  }, [matchedLogs]);

  const totalPages = Math.max(1, Math.ceil(statRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedRows = statRows.slice(pageStart, pageStart + pageSize);
  const maxSecondsOnPage = Math.max(1, ...pagedRows.map((r) => r.totalSeconds));
  const maxDaily = Math.max(1, ...dailyTrend.map((d) => d[1]));

  const selectCls =
    'w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs sm:text-sm focus:outline-none focus:border-[#8B5A2B] cursor-pointer';

  return (
    <div className="bg-[#FFFDF9] border border-[#DECGB4] rounded-2xl shadow-md overflow-hidden">
      {/* 分頁標頭 */}
      <div className="px-6 py-4 bg-[#FAF4E8] border-b border-[#E5D9C5] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center border border-[#8B5A2B]/30">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold font-serif-tc text-[#2C221E]">
              統計作業 · 語音檔播放總時數統計
            </h3>
            <p className="text-xs text-[#6E5D4F]">
              依放映室實際播放的秒數累計各語音檔的播放總時數與次數，可依館藏分類、類別標籤、主講人與日期區間查詢
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 清單 / 圖表 切換 */}
          <div className="inline-flex items-center p-1 rounded-xl bg-white border border-[#D5C5AE]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'list' ? 'bg-[#8B5A2B] text-white' : 'text-[#5C3A1B] hover:bg-[#F3ECE0]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>清單</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'chart' ? 'bg-[#8B5A2B] text-white' : 'text-[#5C3A1B] hover:bg-[#F3ECE0]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>圖表</span>
            </button>
          </div>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F3ECE0] text-[#5C3A1B] text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>重新整理</span>
          </button>
          {playLogs.length > 0 && !confirmClear && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空統計紀錄</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {confirmClear && (
          <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-red-900 font-medium">
              確定要清空全部 <span className="font-bold">{playLogs.length}</span> 筆播放統計紀錄嗎？清空後無法復原。
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                確認清空
              </button>
            </div>
          </div>
        )}

        {/* 查詢條件 */}
        <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#E5D9C5] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[#3A2518]">
              <Filter className="w-4 h-4 text-[#8B5A2B]" />
              <span>查詢條件</span>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#EFE2C8] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>清除條件</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">館藏分類</label>
              <div className="relative">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
                  {categoryMap.get(categoryFilter) ? (
                    <span style={{ color: categoryMap.get(categoryFilter)!.themeColor }}>
                      {getCategoryIcon(categoryMap.get(categoryFilter)!.icon, 'w-4 h-4')}
                    </span>
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#8B5A2B]" />
                  )}
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs sm:text-sm focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate font-medium text-[#2C221E]"
                >
                  <option value="all">✨ 全部分類</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getCategoryEmoji(c.icon)} {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-[#8B5A2B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">標籤類別</label>
              <div className="relative">
                <Tag className="w-4 h-4 text-[#8B5A2B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs sm:text-sm focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate font-medium text-[#2C221E]"
                >
                  <option value="all">全部標籤</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-[#8B5A2B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">主講人</label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8B5A2B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={speakerFilter}
                  onChange={(e) => setSpeakerFilter(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs sm:text-sm focus:outline-none focus:border-[#8B5A2B] cursor-pointer appearance-none truncate font-medium text-[#2C221E]"
                >
                  <option value="all">全部主講人</option>
                  {allSpeakers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-[#8B5A2B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">語音檔標題關鍵字</label>
              <div className="relative">
                <Search className="w-4 h-4 text-[#8B5A2B] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="輸入標題關鍵字..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs sm:text-sm focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C3A1B]">
              <CalendarDays className="w-4 h-4 text-[#8B5A2B]" />
              <span className="font-semibold">播放日期</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
              />
              <span>至</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
              />
              <label className="inline-flex items-center gap-1.5 ml-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyPlayed}
                  onChange={(e) => setOnlyPlayed(e.target.checked)}
                  className="accent-[#8B5A2B]"
                />
                <span>僅顯示有播放紀錄的語音檔</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C3A1B]">
              <ArrowUpDown className="w-4 h-4 text-[#8B5A2B]" />
              <span className="font-semibold">排序</span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as StatSortField)}
                className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs font-semibold focus:outline-none focus:border-[#8B5A2B] cursor-pointer"
              >
                <option value="totalSeconds">播放總時數</option>
                <option value="playCount">播放次數</option>
                <option value="lastPlayedAt">最近播放時間</option>
                <option value="title">語音檔標題</option>
              </select>
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs font-semibold focus:outline-none focus:border-[#8B5A2B] cursor-pointer"
              >
                <option value="desc">由大到小</option>
                <option value="asc">由小到大</option>
              </select>
            </div>
          </div>
        </div>

        {/* 統計摘要卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: <FileAudio className="w-5 h-5" />,
              label: '統計語音檔數',
              value: `${summary.audioCount}`,
              sub: `其中 ${summary.playedAudioCount} 筆有播放紀錄`,
            },
            {
              icon: <Clock className="w-5 h-5" />,
              label: '播放總時數',
              value: `${formatHours(summary.totalSeconds)} 小時`,
              sub: formatPlayTime(summary.totalSeconds),
            },
            {
              icon: <Headphones className="w-5 h-5" />,
              label: '播放總次數',
              value: `${summary.playCount} 次`,
              sub: '每次暫停 / 播畢 / 切換計為一次',
            },
            {
              icon: <Users className="w-5 h-5" />,
              label: '播放人數',
              value: `${summary.listeners} 人`,
              sub: '依登入帳號不重複計算',
            },
          ].map((card) => (
            <div key={card.label} className="p-4 rounded-xl bg-white border border-[#E5D9C5] shadow-xs">
              <div className="flex items-center gap-2 text-[#8B5A2B]">
                {card.icon}
                <span className="text-xs font-semibold text-[#6E5D4F]">{card.label}</span>
              </div>
              <div className="mt-1.5 text-lg sm:text-xl font-bold font-mono text-[#2C221E]">{card.value}</div>
              <div className="text-[11px] text-[#8C7A6B] mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[#7A6855] gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#8B5A2B]" />
            <span className="text-xs">正在載入播放統計資料...</span>
          </div>
        ) : statRows.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-[#D5C5AE] rounded-xl bg-[#FAF6EE]/60 text-[#7A6855] text-xs sm:text-sm">
            目前尚無符合查詢條件的語音檔播放統計
          </div>
        ) : viewMode === 'list' ? (
          <div className="border border-[#E5D9C5] rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-[#F3ECE0] text-[#5C3A1B] text-xs border-b border-[#E5D9C5]">
                  <th className="py-3 px-3.5 font-semibold w-14">#</th>
                  <th className="py-3 px-3.5 font-semibold">語音檔標題</th>
                  <th className="py-3 px-3.5 font-semibold">館藏分類</th>
                  <th className="py-3 px-3.5 font-semibold">主講人</th>
                  <th className="py-3 px-3.5 font-semibold">類別標籤</th>
                  <th className="py-3 px-3.5 font-semibold text-right">播放次數</th>
                  <th className="py-3 px-3.5 font-semibold text-right">播放人數</th>
                  <th className="py-3 px-3.5 font-semibold text-right">播放總時數</th>
                  <th className="py-3 px-3.5 font-semibold">最近播放</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE6D5] text-sm bg-white">
                {pagedRows.map((r, idx) => {
                  const cat = categoryMap.get(r.categoryId);
                  return (
                    <tr key={r.audioId} className="hover:bg-[#FAF6EE] transition-colors">
                      <td className="py-2.5 px-3.5 text-xs font-mono text-[#8C7A6B]">{pageStart + idx + 1}</td>
                      <td className="py-2.5 px-3.5 font-semibold text-[#2C221E]">
                        <div className="flex items-center gap-1.5">
                          <span className="line-clamp-2">{r.title}</span>
                          {r.isDeleted && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-stone-100 text-stone-600 border border-stone-300 shrink-0">
                              已刪除
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-xs whitespace-nowrap">
                        {cat ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                            style={{ backgroundColor: cat.themeColor || '#8B5A2B' }}
                          >
                            {cat.name}
                          </span>
                        ) : (
                          <span className="text-[#8C7A6B]">未分類</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-xs text-[#4A3728] whitespace-nowrap">{r.speaker || '-'}</td>
                      <td className="py-2.5 px-3.5">
                        <div className="flex flex-wrap gap-1">
                          {r.tags.length > 0
                            ? r.tags.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-[#F0E6D8] text-[#5C3A1B] border border-[#E2D4BC]"
                                >
                                  {t}
                                </span>
                              ))
                            : <span className="text-xs text-[#8C7A6B]">-</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-xs text-[#4A3728]">{r.playCount}</td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-xs text-[#4A3728]">{r.listenerCount}</td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-[#8B5A2B]">{formatPlayTime(r.totalSeconds)}</div>
                        <div className="font-mono text-[10px] text-[#8C7A6B]">{formatHours(r.totalSeconds)} 小時</div>
                      </td>
                      <td className="py-2.5 px-3.5 text-xs font-mono text-[#6E5D4F] whitespace-nowrap">
                        {r.lastPlayedAt
                          ? new Date(r.lastPlayedAt).toLocaleString('zh-TW', { hour12: false })
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {/* 長條圖：各語音檔播放總時數 */}
            <div className="xl:col-span-3 p-4 rounded-xl bg-white border border-[#E5D9C5]">
              <div className="flex items-center gap-2 text-sm font-bold text-[#3A2518] mb-3">
                <BarChart3 className="w-4 h-4 text-[#8B5A2B]" />
                <span>各語音檔播放總時數（本頁 {pagedRows.length} 筆）</span>
              </div>
              <div className="space-y-2.5">
                {pagedRows.map((r, idx) => {
                  const cat = categoryMap.get(r.categoryId);
                  const pct = (r.totalSeconds / maxSecondsOnPage) * 100;
                  return (
                    <div key={r.audioId} className="grid grid-cols-12 items-center gap-2">
                      <div className="col-span-4 text-xs text-[#2C221E] truncate" title={r.title}>
                        <span className="font-mono text-[#8C7A6B] mr-1">{pageStart + idx + 1}.</span>
                        {r.title}
                      </div>
                      <div className="col-span-8 flex items-center gap-2">
                        <div className="flex-1 h-5 rounded-md bg-[#F3ECE0] overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-500"
                            style={{
                              width: `${r.totalSeconds > 0 ? Math.max(pct, 1.5) : 0}%`,
                              background: `linear-gradient(90deg, ${cat?.themeColor || '#8B5A2B'}, #D4A373)`,
                            }}
                          />
                        </div>
                        <span className="w-28 shrink-0 text-right font-mono text-[11px] font-semibold text-[#5C3A1B]">
                          {formatPlayTime(r.totalSeconds)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 每日播放時數趨勢 */}
            <div className="xl:col-span-2 p-4 rounded-xl bg-white border border-[#E5D9C5] flex flex-col">
              <div className="flex items-center gap-2 text-sm font-bold text-[#3A2518] mb-3">
                <TrendingUp className="w-4 h-4 text-[#8B5A2B]" />
                <span>每日播放時數趨勢（最近 {dailyTrend.length} 個有播放的日期）</span>
              </div>
              {dailyTrend.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-[#8C7A6B] py-10">
                  查詢區間內尚無播放紀錄
                </div>
              ) : (
                <div className="flex-1 flex items-end gap-1 h-56 pt-4 border-b border-l border-[#E5D9C5] px-1">
                  {dailyTrend.map(([day, secs]) => (
                    <div key={day} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group relative">
                      <div
                        className="w-full max-w-[28px] rounded-t bg-gradient-to-t from-[#8B5A2B] to-[#D4A373] group-hover:from-[#5C3A1B]"
                        style={{ height: `${Math.max((secs / maxDaily) * 100, 2)}%` }}
                        title={`${day}：${formatPlayTime(secs)}`}
                      />
                      <span className="absolute -top-5 hidden group-hover:block whitespace-nowrap text-[10px] font-mono bg-[#2C221E] text-white px-1.5 py-0.5 rounded">
                        {formatPlayTime(secs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {dailyTrend.length > 0 && (
                <div className="flex justify-between text-[10px] font-mono text-[#8C7A6B] mt-1">
                  <span>{dailyTrend[0][0]}</span>
                  <span>{dailyTrend[dailyTrend.length - 1][0]}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && statRows.length > 0 && (
          <PaginationBar
            totalItems={statRows.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
};
