import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  Tag,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  X,
  Check,
  Search,
  Clock,
  BookOpen,
  Play,
  Sparkles,
} from 'lucide-react';
import { AudioItem, Category } from '../types';
import { formatDuration, getCategoryIcon } from './DashboardView';

interface CatalogManagementViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  onAddCategory: (cat: Omit<Category, 'id' | 'createdAt' | 'order'>) => Promise<void>;
  onUpdateCategory: (cat: Category) => Promise<void>;
  onReorderCategories: (nextCategories: Category[]) => Promise<void>;
  onDeleteCategory: (categoryId: string, migrateToCategoryId?: string) => Promise<void>;
  onSaveAudioItem: (item: AudioItem) => Promise<void>;
  onBatchMoveAudioCategory: (itemIds: string[], targetCategoryId: string) => Promise<void>;
  onPlayInScreeningRoom: (item: AudioItem) => void;
  onEditInAudioLibrary: (item: AudioItem) => void;
}

const PRESET_GENRE_TAGS = [
  '繪本',
  '小說',
  '經典童話',
  '散文',
  '科普',
  '歷史故事',
  '傳記',
  '詩詞朗誦',
  '自然音景',
  '生活手札',
];

const THEME_COLOR_OPTIONS = [
  { label: '古銅胡桃棕', value: '#8B5A2B' },
  { label: '典藏松針綠', value: '#2E5A44' },
  { label: '深海學院藍', value: '#2B4C7E' },
  { label: '胭脂紫檀紅', value: '#7A3E65' },
  { label: '琥珀焦糖金', value: '#B46528' },
  { label: '沉穩石墨灰', value: '#3E4C59' },
];

const ICON_OPTIONS = [
  { label: '書籍 (BookOpen)', value: 'BookOpen' },
  { label: '歷史殿堂 (Landmark)', value: 'Landmark' },
  { label: '探索羅盤 (Compass)', value: 'Compass' },
  { label: '羽毛筆 (Feather)', value: 'Feather' },
  { label: '音樂 (Music)', value: 'Music' },
  { label: '全球 (Globe)', value: 'Globe' },
];

export const CatalogManagementView: React.FC<CatalogManagementViewProps> = ({
  categories,
  audioItems,
  onAddCategory,
  onUpdateCategory,
  onReorderCategories,
  onDeleteCategory,
  onSaveAudioItem,
  onBatchMoveAudioCategory,
  onPlayInScreeningRoom,
  onEditInAudioLibrary,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ============================================================================
  // (a) & (c) 館藏分類：新增、修改、刪除、移動排序 狀態
  // ============================================================================
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState(THEME_COLOR_OPTIONS[0].value);
  const [newCatIcon, setNewCatIcon] = useState(ICON_OPTIONS[0].value);

  // 修改館藏分類狀態
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatCode, setEditCatCode] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [editCatColor, setEditCatColor] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');

  // 刪除館藏分類確認視窗狀態
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<Category | null>(null);
  const [migrateTargetCatId, setMigrateTargetCatId] = useState<string>('');

  // 整館分類快速遷移視窗狀態
  const [categorySourceForMove, setCategorySourceForMove] = useState<Category | null>(null);
  const [categoryDestForMove, setCategoryDestForMove] = useState<string>('');

  // ============================================================================
  // (b) & (c) 語音檔館藏分類、說明內容、類別標籤管理 & 批次移動館藏分類 狀態
  // ============================================================================
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 勾選批次移動館藏分類的語音檔 ID 集合
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [batchTargetCategoryId, setBatchTargetCategoryId] = useState<string>(
    categories[0]?.id || ''
  );

  // 單筆語音檔「說明內容」即時編輯暫存 (key: item.id)
  const [editingDescriptions, setEditingDescriptions] = useState<Record<string, string>>({});
  // 單筆語音檔「自訂類別標籤」輸入框暫存 (key: item.id)
  const [customTagInputs, setCustomTagInputs] = useState<Record<string, string>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ============================================================================
  // (d) 統計各個館藏分類，各類別總數
  // ============================================================================
  // 1. 全館各類別標籤 (tags) 總數統計
  const tagCountsMap = new Map<string, number>();
  let untaggedCount = 0;

  for (const item of audioItems) {
    const tags = item.tags || [];
    if (tags.length === 0) {
      untaggedCount++;
    } else {
      for (const t of tags) {
        const clean = t.trim();
        if (clean) {
          tagCountsMap.set(clean, (tagCountsMap.get(clean) || 0) + 1);
        }
      }
    }
  }

  // 合併預設常用標籤與使用者自訂標籤，依數量由高至低排序
  const allKnownTags = Array.from(
    new Set([...PRESET_GENRE_TAGS, ...Array.from(tagCountsMap.keys())])
  );
  const sortedTagStats = allKnownTags
    .map((tag) => ({
      tag,
      count: tagCountsMap.get(tag) || 0,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hant'));

  // 2. 各個館藏分類統計（含該分類下的語音總數、總時長、以及該分類內各類別標籤的細項數量）
  const categoryStats = categories.map((cat) => {
    const itemsInCat = audioItems.filter((a) => a.categoryId === cat.id);
    const totalDuration = itemsInCat.reduce((sum, a) => sum + (a.duration || 0), 0);
    const catTagMap = new Map<string, number>();
    let catUntagged = 0;

    for (const item of itemsInCat) {
      const tags = item.tags || [];
      if (tags.length === 0) {
        catUntagged++;
      } else {
        for (const t of tags) {
          const clean = t.trim();
          if (clean) {
            catTagMap.set(clean, (catTagMap.get(clean) || 0) + 1);
          }
        }
      }
    }

    const tagBreakdown = Array.from(catTagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return {
      category: cat,
      count: itemsInCat.length,
      totalDuration,
      tagBreakdown,
      untaggedCount: catUntagged,
    };
  });

  // ============================================================================
  // (a) 新增、修改、刪除館藏分類 處理函式
  // ============================================================================
  const handleConfirmAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    await onAddCategory({
      name: newCatName.trim(),
      code:
        newCatCode.trim().toUpperCase() ||
        `CAT-${(categories.length + 1) * 100}`,
      description: newCatDesc.trim() || `${newCatName.trim()}有聲館藏專區`,
      themeColor: newCatColor,
      icon: newCatIcon,
    });

    setNewCatName('');
    setNewCatCode('');
    setNewCatDesc('');
    setShowAddCategoryModal(false);
    showToast(`✅ 已新增館藏分類「${newCatName.trim()}」並同步儲存至 Firebase！`);
  };

  const startEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setEditCatName(cat.name);
    setEditCatCode(cat.code);
    setEditCatDesc(cat.description);
    setEditCatColor(cat.themeColor);
    setEditCatIcon(cat.icon);
  };

  const handleConfirmUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editCatName.trim()) return;

    const updated: Category = {
      ...editingCategory,
      name: editCatName.trim(),
      code: editCatCode.trim().toUpperCase() || editingCategory.code,
      description: editCatDesc.trim(),
      themeColor: editCatColor,
      icon: editCatIcon,
    };

    await onUpdateCategory(updated);
    setEditingCategory(null);
    showToast(`✅ 已修改館藏分類「${updated.name}」並即時儲存至 Firebase！`);
  };

  /**
   * (c) 移動館藏分類排序（上移 / 下移）
   */
  const handleMoveCategoryOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= categories.length) return;

    const cloned = [...categories];
    const temp = cloned[index];
    cloned[index] = cloned[targetIdx];
    cloned[targetIdx] = temp;

    const reordered = cloned.map((c, idx) => ({
      ...c,
      order: idx + 1,
    }));

    await onReorderCategories(reordered);
    showToast(`✅ 已移動館藏分類「${temp.name}」的排列順序並同步儲存至 Firebase！`);
  };

  /**
   * (a) 確認刪除館藏分類（若有語音檔則自動遷移至指定分類）
   */
  const handleConfirmDeleteCategory = async () => {
    if (!categoryPendingDelete) return;
    if (categories.length <= 1) {
      showToast('⚠️ 系統至少需保留一個館藏分類，無法刪除最後一個分類！');
      setCategoryPendingDelete(null);
      return;
    }

    const fallbackCat =
      categories.find((c) => c.id === migrateTargetCatId && c.id !== categoryPendingDelete.id) ||
      categories.find((c) => c.id !== categoryPendingDelete.id);

    const delName = categoryPendingDelete.name;
    await onDeleteCategory(categoryPendingDelete.id, fallbackCat?.id);
    if (filterCategoryId === categoryPendingDelete.id) {
      setFilterCategoryId('all');
    }
    setCategoryPendingDelete(null);
    showToast(`✅ 已刪除館藏分類「${delName}」並同步更新 Firebase！`);
  };

  /**
   * (c) 將某個館藏分類下的所有語音檔，一次移動至另一個館藏分類
   */
  const handleConfirmMoveAllCategoryItems = async () => {
    if (!categorySourceForMove || !categoryDestForMove) return;
    if (categorySourceForMove.id === categoryDestForMove) {
      showToast('請選擇不同的目標館藏分類！');
      return;
    }

    const itemsToMove = audioItems
      .filter((a) => a.categoryId === categorySourceForMove.id)
      .map((a) => a.id);

    const destCat = categories.find((c) => c.id === categoryDestForMove);
    if (itemsToMove.length > 0 && destCat) {
      await onBatchMoveAudioCategory(itemsToMove, destCat.id);
      showToast(
        `✅ 已將「${categorySourceForMove.name}」的 ${itemsToMove.length} 筆語音檔全部移動至「${destCat.name}」！`
      );
    }
    setCategorySourceForMove(null);
  };

  // ============================================================================
  // (b) & (c) 管理每筆語音檔的 館藏分類、說明內容、類別標籤
  // ============================================================================
  const handleSingleItemCategoryChange = async (item: AudioItem, nextCategoryId: string) => {
    if (item.categoryId === nextCategoryId) return;
    const targetCat = categories.find((c) => c.id === nextCategoryId);
    const updated: AudioItem = {
      ...item,
      categoryId: nextCategoryId,
      updatedAt: new Date().toISOString(),
    };
    await onSaveAudioItem(updated);
    showToast(`✅ 已將「${item.title}」移動至館藏分類「${targetCat?.name || ''}」！`);
  };

  const handleSaveItemDescription = async (item: AudioItem, nextDesc: string) => {
    const trimmed = nextDesc.trim();
    if (trimmed === item.description) return;
    const updated: AudioItem = {
      ...item,
      description: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await onSaveAudioItem(updated);
    showToast(`✅ 已即時儲存「${item.title}」的館藏說明內容！`);
  };

  const handleToggleItemTag = async (item: AudioItem, tag: string) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    const currentTags = item.tags || [];
    const exists = currentTags.includes(cleanTag);
    const nextTags = exists
      ? currentTags.filter((t) => t !== cleanTag)
      : [...currentTags, cleanTag];

    const updated: AudioItem = {
      ...item,
      tags: nextTags,
      updatedAt: new Date().toISOString(),
    };
    await onSaveAudioItem(updated);
    showToast(
      exists
        ? `已從「${item.title}」移除類別標籤「${cleanTag}」`
        : `✅ 已為「${item.title}」加上類別標籤「${cleanTag}」並儲存至 Firebase！`
    );
  };

  const handleAddCustomTagToItem = async (item: AudioItem) => {
    const raw = (customTagInputs[item.id] || '').trim();
    if (!raw) return;
    // 支援以逗號或空格分隔一次輸入多個標籤
    const splitTags = raw
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (splitTags.length === 0) return;

    const currentTags = item.tags || [];
    const mergedTags = Array.from(new Set([...currentTags, ...splitTags]));

    const updated: AudioItem = {
      ...item,
      tags: mergedTags,
      updatedAt: new Date().toISOString(),
    };

    setCustomTagInputs((prev) => ({ ...prev, [item.id]: '' }));
    await onSaveAudioItem(updated);
    showToast(
      `✅ 已為「${item.title}」新增類別標籤「${splitTags.join('、')}」並同步儲存至 Firebase！`
    );
  };

  /**
   * (c) 批次移動已勾選的語音檔至指定館藏分類
   */
  const handleBatchMoveSelectedItems = async () => {
    if (selectedItemIds.length === 0) {
      showToast('請先在下方清單勾選要移動館藏分類的語音檔！');
      return;
    }
    const targetCatId = batchTargetCategoryId || categories[0]?.id;
    if (!targetCatId) return;
    const targetCat = categories.find((c) => c.id === targetCatId);

    await onBatchMoveAudioCategory(selectedItemIds, targetCatId);
    const count = selectedItemIds.length;
    setSelectedItemIds([]);
    showToast(
      `✅ 已將所選的 ${count} 筆語音檔批次移動至館藏分類「${targetCat?.name || ''}」並儲存至 Firebase！`
    );
  };

  // 篩選語音檔清單
  const filteredAudioItems = audioItems.filter((item) => {
    const matchCategory =
      filterCategoryId === 'all' || item.categoryId === filterCategoryId;
    const itemTags = item.tags || [];
    const matchTag =
      filterTag === 'all'
        ? true
        : filterTag === '__untagged__'
        ? itemTags.length === 0
        : itemTags.includes(filterTag);
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      itemTags.some((t) => t.toLowerCase().includes(q));

    return matchCategory && matchTag && matchSearch;
  });

  const allFilteredSelected =
    filteredAudioItems.length > 0 &&
    filteredAudioItems.every((item) => selectedItemIds.includes(item.id));

  return (
    <div className="space-y-8 pb-12">
      {/* 儲存成功提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#2E5A44] text-white shadow-2xl border border-emerald-400/30 animate-bounce max-w-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 頁面頂部標題橫幅 */}
      <div className="parchment-card rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-[#8B5A2B]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#8B5A2B]/15 text-[#8B5A2B] text-xs font-semibold mb-1.5">
            <FolderKanban className="w-3.5 h-3.5" />
            <span>CATALOG & GENRE MANAGEMENT · 館藏資料與分類標籤管理中心</span>
          </div>
          <h2 className="text-2xl font-bold font-serif-tc text-[#2C221E]">
            館藏資料管理（分類維護 · 類別標籤 · 館藏遷移 · 總數統計）
          </h2>
          <p className="text-xs text-[#6E5D4F] mt-1">
            在此集中管理所有「館藏分類（新增 / 修改 / 刪除 / 移動排序）」與每筆語音檔的「館藏分類、說明內容、類別標籤（如：繪本、小說等）」，所有變更皆即時同步儲存至 Firebase。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddCategoryModal(true)}
          className="px-4 py-2.5 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-2 shadow-md transition shrink-0 cursor-pointer self-start md:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>+ 新增館藏分類</span>
        </button>
      </div>

      {/* ========================================================================
          區塊 (d)：統計各個館藏分類，各類別總數
         ======================================================================== */}
      <section className="parchment-card rounded-2xl p-6 shadow-md space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D9C5] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#2B4C7E]/15 text-[#2B4C7E] flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                (d) 館藏分類與各類別標籤總數統計
              </h3>
              <p className="text-xs text-[#7A6855]">
                即時統計全館 {categories.length} 個館藏分類、共 {audioItems.length} 部語音檔之分類分佈與各「類別標籤（繪本、小說等）」總數
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-[#EFE6D5] text-[#3A2518] font-semibold">
              館藏分類總數：<strong>{categories.length}</strong> 館
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#EFE6D5] text-[#3A2518] font-semibold">
              語音檔案總數：<strong>{audioItems.length}</strong> 部
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[#EFE6D5] text-[#3A2518] font-semibold">
              已使用類別標籤：<strong>{tagCountsMap.size}</strong> 種
            </span>
          </div>
        </div>

        {/* 1. 各個館藏分類統計卡 (含分類內各類別標籤統計) */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[#5C3A1B] uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#8B5A2B]" />
            <span>1. 各個館藏分類總數與分類內「類別標籤」分佈統計（點擊卡片可篩選下方清單）</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {categoryStats.map((stat) => {
              const pct =
                audioItems.length > 0
                  ? Math.round((stat.count / audioItems.length) * 100)
                  : 0;
              const isSelectedCat = filterCategoryId === stat.category.id;

              return (
                <div
                  key={stat.category.id}
                  onClick={() =>
                    setFilterCategoryId(isSelectedCat ? 'all' : stat.category.id)
                  }
                  className={`rounded-xl p-4 border transition cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelectedCat
                      ? 'bg-[#FFFDF7] border-2 border-[#8B5A2B] shadow-md'
                      : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white"
                        style={{ backgroundColor: stat.category.themeColor }}
                      >
                        {stat.category.code}
                      </span>
                      <span className="text-xs font-mono text-[#7A6855]">
                        佔比 {pct}% · {formatDuration(stat.totalDuration)}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <h5 className="font-bold font-serif-tc text-base text-[#2C221E] flex items-center gap-1.5">
                        <span style={{ color: stat.category.themeColor }}>
                          {getCategoryIcon(stat.category.icon, 'w-4 h-4')}
                        </span>
                        <span>{stat.category.name}</span>
                      </h5>
                      <span className="text-xl font-extrabold font-mono text-[#2C221E]">
                        {stat.count}{' '}
                        <span className="text-xs font-normal text-[#7A6855]">筆</span>
                      </span>
                    </div>

                    {/* 佔比進度條 */}
                    <div className="w-full h-1.5 rounded-full bg-[#EFE6D5] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: stat.category.themeColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* 該館藏分類內的各類別標籤數量細項 */}
                  <div className="pt-2 border-t border-[#F1E8D8]">
                    <p className="text-[11px] font-semibold text-[#6E5D4F] mb-1.5">
                      本分類內各類別統計：
                    </p>
                    {stat.count === 0 ? (
                      <span className="text-[11px] text-[#9C8B7A] italic">尚無語音館藏</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {stat.tagBreakdown.map((tb) => (
                          <span
                            key={tb.tag}
                            className="px-2 py-0.5 rounded-md bg-[#F4ECE0] text-[#4A3525] text-[11px] font-medium"
                          >
                            {tb.tag}: <strong>{tb.count}</strong>
                          </span>
                        ))}
                        {stat.untaggedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px]">
                            未標記: <strong>{stat.untaggedCount}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. 全館各「類別標籤 (如：繪本、小說...)」總數統計 */}
        <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#3A2518] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#2E5A44]" />
              <span>2. 全館各「類別標籤（繪本、小說、童話、科普...）」總數統計（點擊標籤可快速篩選）：</span>
            </h4>
            {filterTag !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterTag('all')}
                className="text-xs text-[#8B5A2B] hover:underline font-semibold cursor-pointer"
              >
                清除類別篩選 (顯示全部)
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterTag('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                filterTag === 'all'
                  ? 'bg-[#3A2518] text-white shadow-xs'
                  : 'bg-white text-[#5C3A1B] border border-[#D5C5AE] hover:bg-[#EFE6D5]'
              }`}
            >
              <span>全部類別</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/15 text-[11px] font-mono">
                {audioItems.length}
              </span>
            </button>

            {sortedTagStats.map(({ tag, count }) => {
              const active = filterTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilterTag(active ? 'all' : tag)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#2E5A44] text-white shadow-xs'
                      : count > 0
                      ? 'bg-white text-[#2C221E] border border-[#C8B598] hover:border-[#2E5A44]'
                      : 'bg-white/60 text-[#8B7968] border border-dashed border-[#D5C5AE] hover:bg-white'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  <span>{tag}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : count > 0
                        ? 'bg-[#2E5A44]/15 text-[#2E5A44]'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {count} 筆
                  </span>
                </button>
              );
            })}

            {untaggedCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setFilterTag(filterTag === '__untagged__' ? 'all' : '__untagged__')
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  filterTag === '__untagged__'
                    ? 'bg-amber-700 text-white'
                    : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                }`}
              >
                <span>尚未標記類別</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-200/80 text-amber-950 text-[11px] font-mono font-bold">
                  {untaggedCount} 筆
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================
          區塊 (a) & (c)：館藏分類管理（新增、修改、刪除、移動排序、整館遷移）
         ======================================================================== */}
      <section className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D9C5] pb-4">
          <div>
            <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
              (a) & (c) 館藏分類管理（新增 · 修改 · 刪除 · 移動分類順序與整館遷移）
            </h3>
            <p className="text-xs text-[#7A6855]">
              可隨時新增館藏分類、修改分類名稱與索書號代碼、上下移動館藏分類排列順序，或將整個分類的館藏移動至其他分類
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddCategoryModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新增館藏分類</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat, idx) => {
            const count = audioItems.filter((a) => a.categoryId === cat.id).length;
            const isEditingThisCat = editingCategory?.id === cat.id;

            return (
              <div
                key={cat.id}
                className={`rounded-xl border p-4 transition-all ${
                  isEditingThisCat
                    ? 'bg-[#FFFDF7] border-2 border-[#8B5A2B] shadow-md'
                    : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                }`}
              >
                {isEditingThisCat ? (
                  <form onSubmit={handleConfirmUpdateCategory} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[#EFE6D5] pb-2">
                      <span className="text-xs font-bold text-[#8B5A2B]">
                        修改館藏分類設定
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="text-xs text-[#7A6855] hover:text-[#2C221E] cursor-pointer"
                      >
                        取消
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          分類館廳名稱 *
                        </label>
                        <input
                          type="text"
                          required
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          索書號代碼 *
                        </label>
                        <input
                          type="text"
                          required
                          value={editCatCode}
                          onChange={(e) => setEditCatCode(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                        分類館廳說明
                      </label>
                      <input
                        type="text"
                        value={editCatDesc}
                        onChange={(e) => setEditCatDesc(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          代表色系
                        </label>
                        <select
                          value={editCatColor}
                          onChange={(e) => setEditCatColor(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs"
                        >
                          {THEME_COLOR_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label} ({c.value})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          館廳圖示
                        </label>
                        <select
                          value={editCatIcon}
                          onChange={(e) => setEditCatIcon(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs"
                        >
                          {ICON_OPTIONS.map((ic) => (
                            <option key={ic.value} value={ic.value}>
                              {ic.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFE6D5]">
                      <button
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>確認修改分類</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col justify-between h-full gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                          style={{ backgroundColor: cat.themeColor }}
                        >
                          {getCategoryIcon(cat.icon, 'w-5 h-5')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-[#EFE6D5] text-[#5C3A1B] font-mono text-[10px] font-bold">
                              排序 #{idx + 1}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white"
                              style={{ backgroundColor: cat.themeColor }}
                            >
                              {cat.code}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#F4ECE0] text-[#3A2518] text-[11px] font-semibold">
                              館藏 {count} 筆
                            </span>
                          </div>
                          <h4 className="font-bold font-serif-tc text-base text-[#2C221E] mt-1">
                            {cat.name}
                          </h4>
                          <p className="text-xs text-[#6E5D4F] line-clamp-2 mt-0.5">
                            {cat.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 分類操作按鈕列：上移 / 下移 / 整館移動 / 修改 / 刪除 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#F1E8D8]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveCategoryOrder(idx, 'up')}
                          className="px-2 py-1 rounded-lg border border-[#D5C5AE] bg-[#FAF6EE] hover:bg-[#EFE6D5] disabled:opacity-40 text-xs font-medium text-[#5C3A1B] flex items-center gap-1 cursor-pointer"
                          title="往前移動此分類排序"
                        >
                          <ArrowUp className="w-3 h-3" />
                          <span>上移</span>
                        </button>
                        <button
                          type="button"
                          disabled={idx === categories.length - 1}
                          onClick={() => handleMoveCategoryOrder(idx, 'down')}
                          className="px-2 py-1 rounded-lg border border-[#D5C5AE] bg-[#FAF6EE] hover:bg-[#EFE6D5] disabled:opacity-40 text-xs font-medium text-[#5C3A1B] flex items-center gap-1 cursor-pointer"
                          title="往後移動此分類排序"
                        >
                          <ArrowDown className="w-3 h-3" />
                          <span>下移</span>
                        </button>

                        {count > 0 && categories.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const firstOther = categories.find((c) => c.id !== cat.id);
                              setCategorySourceForMove(cat);
                              setCategoryDestForMove(firstOther?.id || '');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#2B4C7E]/10 hover:bg-[#2B4C7E] text-[#2B4C7E] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            title="將此分類下的語音檔全部移動至其他館藏分類"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>移動本館館藏</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditCategory(cat)}
                          className="px-2.5 py-1 rounded-lg bg-[#8B5A2B]/15 hover:bg-[#8B5A2B] text-[#8B5A2B] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>修改</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const firstOther = categories.find((c) => c.id !== cat.id);
                            setMigrateTargetCatId(firstOther?.id || '');
                            setCategoryPendingDelete(cat);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-red-700/10 hover:bg-red-700 text-red-700 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>刪除</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================
          區塊 (b) & (c)：管理每筆語音檔的 館藏分類、說明內容、類別標籤 (如：繪本、小說...)
         ======================================================================== */}
      <section className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E5D9C5] pb-4">
          <div>
            <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
              (b) & (c) 語音檔案館藏資料管理（館藏分類 · 說明內容 · 類別標籤設定）
            </h3>
            <p className="text-xs text-[#7A6855]">
              可直接調整每筆語音檔的「館藏分類」、修改「說明內容」，並為每個檔案標記「類別標籤（如：繪本、小說、童話、科普等）」，修改後立即自動儲存
            </p>
          </div>

          {/* 搜尋與過濾控制列 */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs font-semibold text-[#2C221E]"
            >
              <option value="all">所有館藏分類 ({audioItems.length})</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  [{cat.code}] {cat.name} (
                  {audioItems.filter((a) => a.categoryId === cat.id).length})
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋標題、說明或類別標籤..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
              />
            </div>
          </div>
        </div>

        {/* 批次勾選移動館藏分類工具列 */}
        <div className="p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#3A2518] cursor-pointer">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedItemIds(filteredAudioItems.map((i) => i.id));
                  } else {
                    setSelectedItemIds([]);
                  }
                }}
                className="w-4 h-4 accent-[#8B5A2B] rounded cursor-pointer"
              />
              <span>全選目前清單 ({filteredAudioItems.length} 筆)</span>
            </label>
            {selectedItemIds.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#8B5A2B] text-white text-xs font-semibold">
                已勾選 {selectedItemIds.length} 筆語音檔
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#5C3A1B]">
              將勾選項目移動至館藏分類：
            </span>
            <select
              value={batchTargetCategoryId || categories[0]?.id || ''}
              onChange={(e) => setBatchTargetCategoryId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-medium text-[#2C221E]"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  [{cat.code}] {cat.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={selectedItemIds.length === 0}
              onClick={handleBatchMoveSelectedItems}
              className="px-3.5 py-1.5 rounded-lg bg-[#2B4C7E] hover:bg-[#1E385F] disabled:opacity-45 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>批次移動館藏分類</span>
            </button>
          </div>
        </div>

        {/* 語音檔詳細館藏管理卡片清單 */}
        <div className="space-y-4">
          {filteredAudioItems.length === 0 ? (
            <div className="p-10 text-center rounded-xl border border-dashed border-[#D5C5AE] bg-white/60 text-xs text-[#7A6855]">
              目前篩選條件下沒有符合的語音檔。
            </div>
          ) : (
            filteredAudioItems.map((item, idx) => {
              const isChecked = selectedItemIds.includes(item.id);
              const currentCat = categories.find((c) => c.id === item.categoryId);
              const itemTags = item.tags || [];
              const descValue =
                editingDescriptions[item.id] !== undefined
                  ? editingDescriptions[item.id]
                  : item.description;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 transition-all space-y-4 ${
                    isChecked
                      ? 'bg-[#FFFDF7] border-2 border-[#8B5A2B] shadow-md'
                      : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                  }`}
                >
                  {/* 卡片頂部：勾選框 + 封面 + 標題 + 快速移動館藏分類下拉選單 */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#EFE6D5]">
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItemIds((prev) => [...prev, item.id]);
                          } else {
                            setSelectedItemIds((prev) =>
                              prev.filter((id) => id !== item.id)
                            );
                          }
                        }}
                        className="w-4 h-4 accent-[#8B5A2B] rounded mt-1 sm:mt-0 shrink-0 cursor-pointer"
                      />

                      <img
                        src={item.coverImageUrl}
                        alt={item.title}
                        className="w-14 h-18 rounded-lg object-cover border border-[#D5C5AE] shrink-0"
                      />

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-[#3A2518] text-white font-mono text-[10px] font-bold">
                            #{idx + 1}
                          </span>
                          {currentCat && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                              style={{ backgroundColor: currentCat.themeColor }}
                            >
                              [{currentCat.code}] {currentCat.name}
                            </span>
                          )}
                          <span className="text-xs font-mono text-[#7A6855] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration)}
                          </span>
                        </div>
                        <h4 className="font-bold font-serif-tc text-base text-[#2C221E]">
                          {item.title}
                        </h4>
                      </div>
                    </div>

                    {/* 單筆直接移動 / 切換館藏分類 + 預覽與進階圖文編輯按鈕 */}
                    <div className="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
                      <div className="flex items-center gap-1.5 bg-[#FAF4E8] px-3 py-1.5 rounded-xl border border-[#DFCEB4]">
                        <span className="text-[11px] font-semibold text-[#5C3A1B]">
                          所屬館藏分類：
                        </span>
                        <select
                          value={item.categoryId}
                          onChange={(e) =>
                            handleSingleItemCategoryChange(item, e.target.value)
                          }
                          className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer"
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              [{cat.code}] {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => onPlayInScreeningRoom(item)}
                        className="px-3 py-1.5 rounded-xl bg-[#EFE6D5] hover:bg-[#E2D4BC] text-[#3A2518] text-xs font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>放映室播放</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditInAudioLibrary(item)}
                        className="px-3 py-1.5 rounded-xl border border-[#D5C5AE] hover:bg-[#FAF4E8] text-[#5C3A1B] text-xs font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>SRT 與圖片編輯</span>
                      </button>
                    </div>
                  </div>

                  {/* 卡片下半部：左欄「館藏說明內容編輯」+ 右欄「類別標籤 (繪本、小說等) 管理」 */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* 左欄 5 欄：說明內容即時編輯 */}
                    <div className="lg:col-span-5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#5C3A1B]">
                          館藏說明內容（修改後自動即時儲存）：
                        </label>
                        {editingDescriptions[item.id] !== undefined &&
                          editingDescriptions[item.id] !== item.description && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveItemDescription(item, editingDescriptions[item.id])
                              }
                              className="px-2 py-0.5 rounded bg-[#2E5A44] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>立即儲存說明</span>
                            </button>
                          )}
                      </div>
                      <textarea
                        rows={3}
                        value={descValue}
                        onChange={(e) =>
                          setEditingDescriptions((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        onBlur={(e) => handleSaveItemDescription(item, e.target.value)}
                        placeholder="請輸入此語音檔的館藏說明內容..."
                        className="w-full p-2.5 rounded-xl border border-[#D5C5AE] bg-[#FAF6EE] focus:bg-white text-xs text-[#2C221E] leading-relaxed focus:outline-none focus:border-[#8B5A2B]"
                      />
                    </div>

                    {/* 右欄 7 欄：類別標籤 (繪本、小說、童話...) 標記與管理 */}
                    <div className="lg:col-span-7 space-y-2.5 bg-[#FAF6EE] p-3.5 rounded-xl border border-[#E5D9C5]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-bold text-[#2E5A44] flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" />
                          <span>
                            類別標籤設定（目前已標記 {itemTags.length} 個類別）：
                          </span>
                        </label>
                        <span className="text-[11px] text-[#7A6855]">
                          點擊下方常用類別即可快速標記或取消
                        </span>
                      </div>

                      {/* 已標記在此語音檔上的類別標籤 */}
                      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                        {itemTags.length === 0 ? (
                          <span className="text-xs text-[#9C8B7A] italic">
                            尚未標記類別標籤（請點擊下方「+ 繪本」、「+ 小說」或自行輸入新增）
                          </span>
                        ) : (
                          itemTags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2E5A44] text-white text-xs font-semibold shadow-2xs"
                            >
                              <Tag className="w-3 h-3" />
                              <span>{tag}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleItemTag(item, tag)}
                                className="ml-0.5 p-0.5 rounded hover:bg-white/20 text-white/90 cursor-pointer"
                                title={`移除「${tag}」標籤`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* 預設常用類別標籤快速點選列 */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#E5D9C5]">
                        <span className="text-[11px] font-semibold text-[#6E5D4F] mr-1">
                          快速標記：
                        </span>
                        {PRESET_GENRE_TAGS.map((presetTag) => {
                          const isTagged = itemTags.includes(presetTag);
                          return (
                            <button
                              key={presetTag}
                              type="button"
                              onClick={() => handleToggleItemTag(item, presetTag)}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                                isTagged
                                  ? 'bg-[#2E5A44]/20 text-[#2E5A44] border border-[#2E5A44]'
                                  : 'bg-white text-[#5C3A1B] border border-[#D5C5AE] hover:border-[#8B5A2B]'
                              }`}
                            >
                              {isTagged ? `✓ ${presetTag}` : `+ ${presetTag}`}
                            </button>
                          );
                        })}
                      </div>

                      {/* 自訂類別標籤輸入框 */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={customTagInputs[item.id] || ''}
                          onChange={(e) =>
                            setCustomTagInputs((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomTagToItem(item);
                            }
                          }}
                          placeholder="輸入自訂類別（例如：繪本、奇幻小說、兒童故事... 按 Enter 新增）"
                          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs focus:outline-none focus:border-[#2E5A44]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddCustomTagToItem(item)}
                          className="px-3 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新增類別</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ========================================================================
          Modal 1：新增館藏分類視窗
         ======================================================================== */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2518] to-[#5C3A1B] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  新增館藏分類 (Add Library Category)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAddCategory} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    館藏分類名稱 *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="例如：親子繪本故事館"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#C8B598] bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    索書號代碼
                  </label>
                  <input
                    type="text"
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value)}
                    placeholder="例如：PIC-500"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#C8B598] bg-white text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  館藏分類說明
                </label>
                <textarea
                  rows={2}
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="輸入此館藏分類的主題介紹..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#C8B598] bg-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    代表色系
                  </label>
                  <select
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#C8B598] bg-white text-xs font-medium"
                  >
                    {THEME_COLOR_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    館廳圖示
                  </label>
                  <select
                    value={newCatIcon}
                    onChange={(e) => setNewCatIcon(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#C8B598] bg-white text-xs font-medium"
                  >
                    {ICON_OPTIONS.map((ic) => (
                      <option key={ic.value} value={ic.value}>
                        {ic.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>確認新增館藏分類</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          Modal 2：刪除館藏分類確認視窗（符合系統典藏風格）
         ======================================================================== */}
      {categoryPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2218] to-[#522D20] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-300/30 flex items-center justify-center text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  刪除館藏分類確認
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCategoryPendingDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                確定要刪除館藏分類「
                <strong>
                  [{categoryPendingDelete.code}] {categoryPendingDelete.name}
                </strong>
                」嗎？
              </p>

              {(() => {
                const affectedCount = audioItems.filter(
                  (a) => a.categoryId === categoryPendingDelete.id
                ).length;
                const otherCats = categories.filter(
                  (c) => c.id !== categoryPendingDelete.id
                );

                if (affectedCount === 0) {
                  return (
                    <div className="p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] text-xs text-[#5C4938]">
                      此館藏分類目前沒有任何語音檔，可直接安全刪除。
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5 text-xs text-[#6E4720]">
                    <p className="font-semibold">
                      ⚠️ 此分類下共有 <strong>{affectedCount}</strong> 筆語音檔，刪除分類時將自動把這些語音檔移動至以下館藏分類：
                    </p>
                    <select
                      value={migrateTargetCatId || otherCats[0]?.id || ''}
                      onChange={(e) => setMigrateTargetCatId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E]"
                    >
                      {otherCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          [{c.code}] {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setCategoryPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  保留分類 (取消)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteCategory}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>確認刪除此館藏分類</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          Modal 3：移動整個館藏分類下所有語音檔至其他分類視窗
         ======================================================================== */}
      {categorySourceForMove && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#2B4C7E] to-[#1E3557] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="w-4 h-4 text-sky-200" />
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  移動館藏分類（整館語音遷移）
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCategorySourceForMove(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                將「<strong>{categorySourceForMove.name}</strong>」內全部{' '}
                <strong>
                  {audioItems.filter((a) => a.categoryId === categorySourceForMove.id).length}
                </strong>{' '}
                筆語音檔，一次移動至以下目標館藏分類：
              </p>

              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1.5">
                  選擇目標館藏分類：
                </label>
                <select
                  value={categoryDestForMove}
                  onChange={(e) => setCategoryDestForMove(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E]"
                >
                  {categories
                    .filter((c) => c.id !== categorySourceForMove.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setCategorySourceForMove(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMoveAllCategoryItems}
                  className="px-5 py-2 rounded-xl bg-[#2B4C7E] hover:bg-[#1E385F] text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>確認移動館藏分類</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
