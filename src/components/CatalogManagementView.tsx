import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderKanban,
  Plus,
  Edit3,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
  ChevronLeft,
  ChevronRight,
  FileText,
  FileAudio,
  Loader2,
  Download,
  User,
  Users,
  Edit2,
} from 'lucide-react';
import { AudioItem, Category, Speaker } from '../types';
import {
  formatDuration,
  getCategoryIcon,
  THEME_COLOR_OPTIONS,
  ICON_OPTIONS,
} from './DashboardView';
import {
  renameFileInGoogleDrive,
  downloadAudioItemFile,
  loadSavedSpeakers,
  saveSavedSpeaker,
  renameSavedSpeaker,
  deleteSavedSpeaker,
} from '../services/storageService';
import { getAudioItemCallNumberMap, getAudioFileType } from '../utils/audioFileUtils';

interface CatalogManagementViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  onAddCategory: (cat: Omit<Category, 'id' | 'createdAt' | 'order'>) => Promise<void>;
  onUpdateCategory: (cat: Category) => Promise<void>;
  onReorderCategories: (nextCategories: Category[]) => Promise<void>;
  onDeleteCategory: (categoryId: string, migrateToCategoryId?: string) => Promise<void>;
  onSaveAudioItem: (item: AudioItem) => Promise<void>;
  onBatchMoveAudioCategory: (itemIds: string[], targetCategoryId: string) => Promise<void>;
  onRemoveTagFromAllAudioItems?: (tagToRemove: string) => Promise<void>;
  onRenameSpeakerInAllAudioItems?: (oldSpeakerName: string, newSpeakerName: string) => Promise<number>;
  onRemoveSpeakerFromAllAudioItems?: (speakerToRemove: string) => Promise<number>;
  onPlayInScreeningRoom: (item: AudioItem) => void;
  onEditInAudioLibrary: (item: AudioItem) => void;
}

const DEFAULT_QUICK_TAGS = [
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

const QUICK_TAGS_STORAGE_KEY = 'soundbook_quick_tags_v1';

export const CatalogManagementView: React.FC<CatalogManagementViewProps> = ({
  categories,
  audioItems,
  onAddCategory,
  onUpdateCategory,
  onReorderCategories,
  onDeleteCategory,
  onSaveAudioItem,
  onBatchMoveAudioCategory,
  onRemoveTagFromAllAudioItems,
  onRenameSpeakerInAllAudioItems,
  onRemoveSpeakerFromAllAudioItems,
  onPlayInScreeningRoom,
  onEditInAudioLibrary,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const audioListSectionRef = useRef<HTMLElement | null>(null);

  // ============================================================================
  // 快速標記 (Quick Tags) 狀態：支援新增自訂標籤同步加入、以及刪除確認視窗
  // ============================================================================
  const [quickTags, setQuickTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(QUICK_TAGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_QUICK_TAGS;
  });

  // 待刪除的快速標記類別標籤（控制系統風格確認視窗）
  const [quickTagPendingDelete, setQuickTagPendingDelete] = useState<string | null>(null);

  const saveQuickTags = (nextTags: string[]) => {
    setQuickTags(nextTags);
    try {
      localStorage.setItem(QUICK_TAGS_STORAGE_KEY, JSON.stringify(nextTags));
    } catch {
      // ignore storage errors
    }
  };

  // ============================================================================
  // 館藏分類：新增、修改、刪除、移動排序 狀態
  // ============================================================================
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState(THEME_COLOR_OPTIONS[0].value);
  const [newCatIcon, setNewCatIcon] = useState(ICON_OPTIONS[0].value);
  const [newCatAllowGuest, setNewCatAllowGuest] = useState(false);

  // 修改館藏分類狀態
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatCode, setEditCatCode] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');
  const [editCatColor, setEditCatColor] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');
  const [editCatAllowGuest, setEditCatAllowGuest] = useState(false);

  // 刪除館藏分類確認視窗狀態
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<Category | null>(null);
  const [migrateTargetCatId, setMigrateTargetCatId] = useState<string>('');

  // 整館分類快速遷移視窗狀態
  const [categorySourceForMove, setCategorySourceForMove] = useState<Category | null>(null);
  const [categoryDestForMove, setCategoryDestForMove] = useState<string>('');

  // ============================================================================
  // 語音檔案館藏資料管理：五欄查詢（語音檔案名稱、館藏分類、主講人、說明內容、標籤）、分頁、編輯狀態
  // ============================================================================
  const [searchTitle, setSearchTitle] = useState<string>('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterSpeaker, setFilterSpeaker] = useState<string>('all');
  const [searchDescription, setSearchDescription] = useState<string>('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [searchTag, setSearchTag] = useState<string>('');

  // 主講人名冊狀態
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  // 主講人管理視窗狀態：新增、修改、刪除、總覽名冊
  const [speakerTargetItem, setSpeakerTargetItem] = useState<AudioItem | null>(null);
  const [isAddSpeakerOpen, setIsAddSpeakerOpen] = useState<boolean>(false);
  const [newSpeakerName, setNewSpeakerName] = useState<string>('');

  const [editingSpeakerOldName, setEditingSpeakerOldName] = useState<string | null>(null);
  const [editingSpeakerNewName, setEditingSpeakerNewName] = useState<string>('');

  const [deletingSpeakerName, setDeletingSpeakerName] = useState<string | null>(null);

  const [isSpeakerManagerOpen, setIsSpeakerManagerOpen] = useState<boolean>(false);

  // 排序狀態：預設依上傳日期由大到小（條件：依上傳日期、依檔案名稱、依館藏分類、依主講人；方向：由大到小、由小到大）
  const [catalogSortBy, setCatalogSortBy] = useState<'title' | 'createdAt' | 'category' | 'speaker'>('createdAt');
  const [catalogSortOrder, setCatalogSortOrder] = useState<'asc' | 'desc'>('desc');

  // 分頁狀態（以 10 的倍數選取）
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // 依據「館藏分類編號 + 流水號 (號碼從 1 開始，依語音檔案上傳順序)」建立每筆語音檔之獨立編號
  const audioCallNumberMap = useMemo(
    () => getAudioItemCallNumberMap(audioItems, categories),
    [audioItems, categories]
  );

  // 勾選批次移動館藏分類的語音檔 ID 集合
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [batchTargetCategoryId, setBatchTargetCategoryId] = useState<string>(
    categories[0]?.id || ''
  );

  // 單筆語音檔「語音檔案名稱」即時編輯暫存 (key: item.id) 與雲端改名進行中狀態
  const [editingTitles, setEditingTitles] = useState<Record<string, string>>({});
  const [renamingItemIds, setRenamingItemIds] = useState<Record<string, boolean>>({});
  // 單筆語音檔「下載中」狀態 (key: item.id)
  const [downloadingItemIds, setDownloadingItemIds] = useState<Record<string, boolean>>({});

  const handleDownloadAudio = async (item: AudioItem) => {
    if (downloadingItemIds[item.id]) return;
    setDownloadingItemIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await downloadAudioItemFile(item);
      showToast(
        res.success
          ? `✅ 已開始下載語音檔「${res.fileName}」${res.message ? `（${res.message}）` : ''}`
          : `❌ 下載失敗：${res.message || '請稍後再試'}`
      );
    } catch (err: any) {
      showToast(`❌ 下載失敗：${err?.message || '請稍後再試'}`);
    } finally {
      setDownloadingItemIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };
  // 單筆語音檔「說明內容」即時編輯暫存 (key: item.id)
  const [editingDescriptions, setEditingDescriptions] = useState<Record<string, string>>({});
  // 單筆語音檔「自訂類別標籤」輸入框暫存 (key: item.id)
  const [customTagInputs, setCustomTagInputs] = useState<Record<string, string>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // 平滑捲動跳至下方「語音檔案館藏資料管理」清單
  const scrollToAudioList = () => {
    setTimeout(() => {
      audioListSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 60);
  };

  // ============================================================================
  // 統計各個館藏分類，各類別總數
  // ============================================================================
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

  // 合併快速標記與目前語音檔已使用的標籤，依數量由高至低排序
  const allKnownTags = Array.from(
    new Set([...quickTags, ...Array.from(tagCountsMap.keys())])
  );
  const sortedTagStats = allKnownTags
    .map((tag) => ({
      tag,
      count: tagCountsMap.get(tag) || 0,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hant'));

  // 各個館藏分類統計（含該分類下的語音總數、總時長、以及該分類內各類別標籤的細項數量）
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
  // 主講人名冊載入、統計與維護（新增、修改、刪除、指派）
  // ============================================================================
  const isMutatingSpeakerRef = useRef<boolean>(false);

  useEffect(() => {
    if (isMutatingSpeakerRef.current) return;
    let isMounted = true;
    loadSavedSpeakers().then((saved) => {
      if (!isMounted || isMutatingSpeakerRef.current) return;
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
      const combined = Array.from(byName.values()).sort((a, b) =>
        a.name.localeCompare(b.name, 'zh-Hant')
      );
      setSpeakers(combined);
      newlyDiscovered.forEach((sp) => saveSavedSpeaker(sp).catch(() => {}));
    });
    return () => {
      isMounted = false;
    };
  }, [audioItems]);

  // 統計各主講人的語音檔數量
  const speakerStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let unassigned = 0;
    audioItems.forEach((item) => {
      const sp = item.speaker?.trim();
      if (!sp) {
        unassigned++;
      } else {
        counts[sp] = (counts[sp] || 0) + 1;
      }
    });

    const list = speakers.map((s) => ({
      name: s.name,
      id: s.id,
      count: counts[s.name] || 0,
    }));

    return { list, unassigned };
  }, [audioItems, speakers]);

  // 指派主講人給特定語音檔
  const handleAssignSpeaker = async (item: AudioItem, speakerName: string) => {
    const updatedSpeaker = speakerName.trim() || undefined;
    if (item.speaker === updatedSpeaker) return;

    const updatedItem: AudioItem = {
      ...item,
      speaker: updatedSpeaker,
      updatedAt: new Date().toISOString(),
    };

    await onSaveAudioItem(updatedItem);
    showToast(
      updatedSpeaker
        ? `✅ 已將「${item.title}」之主講人指派為「${updatedSpeaker}」！`
        : `✅ 已清除「${item.title}」之主講人！`
    );
  };

  // 下拉選單選擇變更（支援選取主講人、新增、修改、刪除、開啟名冊）
  const handleSpeakerDropdownChange = (item: AudioItem, value: string) => {
    if (value === '__ACTION_ADD__') {
      setSpeakerTargetItem(item);
      setNewSpeakerName('');
      setIsAddSpeakerOpen(true);
      return;
    }
    if (value === '__ACTION_EDIT__') {
      if (item.speaker) {
        setEditingSpeakerOldName(item.speaker);
        setEditingSpeakerNewName(item.speaker);
      }
      return;
    }
    if (value === '__ACTION_DELETE__') {
      if (item.speaker) {
        setDeletingSpeakerName(item.speaker);
      }
      return;
    }
    if (value === '__ACTION_MANAGE__') {
      setIsSpeakerManagerOpen(true);
      return;
    }
    handleAssignSpeaker(item, value);
  };

  // 確認新增主講人
  const handleConfirmAddSpeaker = async () => {
    const trimmed = newSpeakerName.trim();
    if (!trimmed) {
      showToast('❌ 請輸入主講人姓名！');
      return;
    }

    const existing = speakers.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (speakerTargetItem) {
        await handleAssignSpeaker(speakerTargetItem, existing.name);
      } else {
        showToast(`ℹ️ 主講人「${existing.name}」已存在於名冊中`);
      }
      setIsAddSpeakerOpen(false);
      setNewSpeakerName('');
      setSpeakerTargetItem(null);
      return;
    }

    const now = new Date().toISOString();
    const newSpeaker: Speaker = {
      id: `speaker_${Date.now()}`,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
    };

    await saveSavedSpeaker(newSpeaker);
    setSpeakers((prev) => [...prev, newSpeaker].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')));

    if (speakerTargetItem) {
      await handleAssignSpeaker(speakerTargetItem, trimmed);
    }
    showToast(`✅ 已新增主講人「${trimmed}」！`);
    setIsAddSpeakerOpen(false);
    setNewSpeakerName('');
    setSpeakerTargetItem(null);
  };

  // 確認修改主講人名稱（同步更新名冊與所有已關聯之語音檔，不會產生多餘重複項目）
  const handleConfirmEditSpeaker = async () => {
    if (!editingSpeakerOldName) return;
    const oldName = editingSpeakerOldName.trim();
    const newName = editingSpeakerNewName.trim();

    if (!newName) {
      showToast('❌ 請輸入新的主講人姓名！');
      return;
    }
    if (oldName === newName) {
      setEditingSpeakerOldName(null);
      setEditingSpeakerNewName('');
      return;
    }

    isMutatingSpeakerRef.current = true;
    try {
      // 1. 先在本地將名冊內的舊名稱立即更新為新名稱並去重（若修改為已存在的名稱則自動合併）
      const now = new Date().toISOString();
      setSpeakers((prev) => {
        const byName = new Map<string, Speaker>();
        prev.forEach((s) => {
          const clean = s.name.trim();
          const finalName = clean === oldName ? newName : clean;
          if (!byName.has(finalName)) {
            byName.set(
              finalName,
              clean === oldName ? { ...s, name: newName, updatedAt: now } : s
            );
          }
        });
        if (!byName.has(newName)) {
          byName.set(newName, {
            id: `speaker_${Date.now()}`,
            name: newName,
            createdAt: now,
            updatedAt: now,
          });
        }
        return Array.from(byName.values()).sort((a, b) =>
          a.name.localeCompare(b.name, 'zh-Hant')
        );
      });

      // 2. 一次性批次同步更新所有關聯此主講人的語音檔（避免逐筆更新造成舊閉包覆蓋與重複探索）
      const affectedItems = audioItems.filter(
        (a) => (a.speaker || '').trim() === oldName
      );
      let updatedCount = affectedItems.length;

      if (onRenameSpeakerInAllAudioItems) {
        updatedCount = await onRenameSpeakerInAllAudioItems(oldName, newName);
      } else {
        for (const item of affectedItems) {
          const updated: AudioItem = {
            ...item,
            speaker: newName,
            updatedAt: now,
          };
          await onSaveAudioItem(updated);
        }
      }

      // 3. 同步更新本地 LocalStorage 與雲端 Firestore 主講人名冊（並自動清理舊名稱文件）
      const nextSpeakers = await renameSavedSpeaker(oldName, newName);
      setSpeakers(nextSpeakers);

      if (filterSpeaker === oldName) {
        setFilterSpeaker(newName);
      }

      setEditingSpeakerOldName(null);
      setEditingSpeakerNewName('');
      showToast(
        `✅ 已將主講人「${oldName}」修改為「${newName}」（同步更新 ${updatedCount} 筆語音檔）！`
      );
    } finally {
      window.setTimeout(() => {
        isMutatingSpeakerRef.current = false;
      }, 300);
    }
  };

  // 確認刪除主講人（自名冊刪除，並自動解除所有關聯語音檔之主講人設定）
  const handleConfirmDeleteSpeaker = async () => {
    if (!deletingSpeakerName) return;
    const targetName = deletingSpeakerName.trim();
    const matchingSpeakers = speakers.filter((s) => s.name.trim() === targetName);

    isMutatingSpeakerRef.current = true;
    try {
      setSpeakers((prev) => prev.filter((s) => s.name.trim() !== targetName));

      const affectedItems = audioItems.filter(
        (a) => (a.speaker || '').trim() === targetName
      );
      let updatedCount = affectedItems.length;

      if (onRemoveSpeakerFromAllAudioItems) {
        updatedCount = await onRemoveSpeakerFromAllAudioItems(targetName);
      } else {
        const now = new Date().toISOString();
        for (const item of affectedItems) {
          const updated: AudioItem = {
            ...item,
            speaker: undefined,
            updatedAt: now,
          };
          await onSaveAudioItem(updated);
        }
      }

      if (matchingSpeakers.length > 0) {
        for (const sp of matchingSpeakers) {
          await deleteSavedSpeaker(sp.id, targetName);
        }
      } else {
        await deleteSavedSpeaker('', targetName);
      }

      if (filterSpeaker === targetName) {
        setFilterSpeaker('all');
      }

      setDeletingSpeakerName(null);
      showToast(
        `🗑️ 已刪除主講人「${targetName}」（已解除 ${updatedCount} 筆語音檔之主講人關聯）！`
      );
    } finally {
      window.setTimeout(() => {
        isMutatingSpeakerRef.current = false;
      }, 300);
    }
  };

  // ============================================================================
  // 新增、修改、刪除、排序館藏分類 處理函式
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
      allowGuest: newCatAllowGuest,
    });

    setNewCatName('');
    setNewCatCode('');
    setNewCatDesc('');
    setNewCatAllowGuest(false);
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
    setEditCatAllowGuest(Boolean(cat.allowGuest));
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
      allowGuest: editCatAllowGuest,
    };

    await onUpdateCategory(updated);
    setEditingCategory(null);
    showToast(`✅ 已修改館藏分類「${updated.name}」並即時儲存至 Firebase！`);
  };

  const handleToggleCategoryGuestAccess = async (cat: Category) => {
    const nextAllowGuest = !cat.allowGuest;
    const updated: Category = {
      ...cat,
      allowGuest: nextAllowGuest,
    };
    await onUpdateCategory(updated);
    showToast(
      nextAllowGuest
        ? `✅ 已為「${cat.name}」開啟訪客瀏覽權限（訪客登入可瀏覽使用）！`
        : `🔒 已關閉「${cat.name}」的訪客瀏覽權限！`
    );
  };

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
  // 管理每筆語音檔的 語音檔案名稱（含同步雲端硬碟檔案名稱）、館藏分類、說明內容、類別標籤
  // ============================================================================
  const handleSaveItemTitle = async (item: AudioItem, nextTitle: string) => {
    const trimmed = nextTitle.trim();
    if (!trimmed) {
      // 若清空則還原為原有名稱
      setEditingTitles((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }
    if (trimmed === item.title) return;

    // 步驟 1：立即清除編輯暫存並將新名稱寫入 Firebase（0.1 秒內極速完成，完全不阻塞畫面操作！）
    setEditingTitles((prev) => {
      const copy = { ...prev };
      delete copy[item.id];
      return copy;
    });

    const immediateUpdated: AudioItem = {
      ...item,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await onSaveAudioItem(immediateUpdated);
    showToast(`✅ 已儲存語音檔案名稱「${trimmed}」（雲端硬碟檔名正在背景同步...）`);

    // 步驟 2：在背景非同步同步修改 Google 雲端硬碟中的檔案名稱，完全不需等待！
    setRenamingItemIds((prev) => ({ ...prev, [item.id]: true }));
    renameFileInGoogleDrive(item.audioDriveFileId, trimmed, {
      fallbackUrl: item.audioUrl,
      mimeType: item.mimeType || 'audio/mpeg',
      isAudio: true,
      itemId: item.id,
    })
      .then(async (renameRes) => {
        // 原位改名不會變更雲端硬碟檔案 ID，因此無需再覆寫資料（避免覆蓋使用者同時進行的其他修改）
        if (renameRes.renamedOnDrive) {
          showToast(
            `✅ Google 雲端硬碟檔案名稱已同步更新為「${renameRes.finalFileName}」！`
          );
        } else if (renameRes.message) {
          showToast(`⚠️ ${renameRes.message}`);
        }
      })
      .finally(() => {
        setRenamingItemIds((prev) => ({ ...prev, [item.id]: false }));
      });
  };

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

    // 同步將新增的自訂類別標籤加入到「快速標記」清單中
    const nextQuickTags = Array.from(new Set([...quickTags, ...splitTags]));
    if (nextQuickTags.length !== quickTags.length) {
      saveQuickTags(nextQuickTags);
    }

    const updated: AudioItem = {
      ...item,
      tags: mergedTags,
      updatedAt: new Date().toISOString(),
    };

    setCustomTagInputs((prev) => ({ ...prev, [item.id]: '' }));
    await onSaveAudioItem(updated);
    showToast(
      `✅ 已為「${item.title}」新增類別標籤「${splitTags.join('、')}」，並已同步加入至快速標記！`
    );
  };

  // 確認刪除「快速標記」中的類別標籤
  const handleConfirmDeleteQuickTag = async () => {
    if (!quickTagPendingDelete) return;
    const targetTag = quickTagPendingDelete;
    const nextQuickTags = quickTags.filter((t) => t !== targetTag);
    saveQuickTags(nextQuickTags);

    if (onRemoveTagFromAllAudioItems) {
      await onRemoveTagFromAllAudioItems(targetTag);
    }

    if (filterTag === targetTag) {
      setFilterTag('all');
    }

    setQuickTagPendingDelete(null);
    showToast(`✅ 已從快速標記中刪除類別標籤「${targetTag}」！`);
  };

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

  // ============================================================================
  // 篩選語音檔清單（分成：語音檔案名稱、館藏分類、主講人、說明內容、以及標籤查詢）
  // ============================================================================
  const filteredAudioItems = audioItems.filter((item) => {
    const matchCategory =
      filterCategoryId === 'all' || item.categoryId === filterCategoryId;

    const matchSpeaker =
      filterSpeaker === 'all'
        ? true
        : filterSpeaker === '__unassigned__'
        ? !item.speaker || item.speaker.trim() === ''
        : item.speaker === filterSpeaker;

    const itemTags = item.tags || [];
    const matchTagSelect =
      filterTag === 'all'
        ? true
        : filterTag === '__untagged__'
        ? itemTags.length === 0
        : itemTags.includes(filterTag);

    const qTag = searchTag.trim().toLowerCase();
    const matchTagInput =
      !qTag || itemTags.some((t) => t.toLowerCase().includes(qTag));

    const qTitle = searchTitle.trim().toLowerCase();
    const matchTitle = !qTitle || item.title.toLowerCase().includes(qTitle);

    const qDesc = searchDescription.trim().toLowerCase();
    const matchDesc = !qDesc || item.description.toLowerCase().includes(qDesc);

    return (
      matchCategory &&
      matchSpeaker &&
      matchTagSelect &&
      matchTagInput &&
      matchTitle &&
      matchDesc
    );
  });

  // 依條件（上傳日期、檔案名稱、館藏分類、主講人）與方向（由大到小、由小到大）進行排序
  const sortedAudioItems = useMemo(() => {
    return [...filteredAudioItems].sort((a, b) => {
      let cmp = 0;
      if (catalogSortBy === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      } else if (catalogSortBy === 'createdAt') {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        cmp = timeA - timeB;
      } else if (catalogSortBy === 'category') {
        const catA = categories.find((c) => c.id === a.categoryId);
        const catB = categories.find((c) => c.id === b.categoryId);
        const labelA = catA ? `${catA.code} ${catA.name}` : a.categoryId;
        const labelB = catB ? `${catB.code} ${catB.name}` : b.categoryId;
        cmp = labelA.localeCompare(labelB, 'zh-Hant');
      } else if (catalogSortBy === 'speaker') {
        const spA = a.speaker || '';
        const spB = b.speaker || '';
        cmp = spA.localeCompare(spB, 'zh-Hant');
      }

      if (cmp === 0) {
        cmp = (a.title || '').localeCompare(b.title || '', 'zh-Hant');
      }

      return catalogSortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredAudioItems, catalogSortBy, catalogSortOrder, categories]);

  // 分頁計算（10 的倍數）
  const totalItems = sortedAudioItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedAudioItems = sortedAudioItems.slice(
    startIndex,
    startIndex + pageSize
  );

  // 當篩選條件、排序條件或每頁筆數改變時，自動回到第 1 頁
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTitle,
    filterCategoryId,
    filterSpeaker,
    searchDescription,
    filterTag,
    searchTag,
    pageSize,
    catalogSortBy,
    catalogSortOrder,
  ]);

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
            在此集中管理所有「館藏分類（新增 / 修改 / 刪除 / 移動排序）」與每筆語音檔的「語音檔案名稱、館藏分類、說明內容、類別標籤（如：繪本、小說等）」，所有變更皆即時同步儲存至 Firebase。
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
          區塊 1：館藏分類與各類別標籤總數統計
         ======================================================================== */}
      <section className="parchment-card rounded-2xl p-6 shadow-md space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D9C5] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#2B4C7E]/15 text-[#2B4C7E] flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                館藏分類與各類別標籤總數統計
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

        {/* 1. 各個館藏分類統計卡 (點擊後篩選並跳至下方清單) */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[#5C3A1B] uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#8B5A2B]" />
            <span>1. 各個館藏分類總數與分類內「類別標籤」分佈統計（點擊卡片可篩選並跳至下方清單）</span>
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
                  onClick={() => {
                    setFilterCategoryId(isSelectedCat ? 'all' : stat.category.id);
                    scrollToAudioList();
                  }}
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

        {/* 2. 全館各「類別標籤 (如：繪本、小說...)」總數統計 (點擊後篩選並跳至下方清單) */}
        <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-[#3A2518] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#2E5A44]" />
              <span>2. 全館各「類別標籤（繪本、小說、童話、科普...）」總數統計（點擊標籤可篩選並跳至下方清單）：</span>
            </h4>
            {filterTag !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setFilterTag('all');
                  scrollToAudioList();
                }}
                className="text-xs text-[#8B5A2B] hover:underline font-semibold cursor-pointer"
              >
                清除類別篩選 (顯示全部)
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFilterTag('all');
                scrollToAudioList();
              }}
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
                  onClick={() => {
                    setFilterTag(active ? 'all' : tag);
                    scrollToAudioList();
                  }}
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
                onClick={() => {
                  setFilterTag(filterTag === '__untagged__' ? 'all' : '__untagged__');
                  scrollToAudioList();
                }}
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
          區塊 2：館藏分類管理（新增、修改、刪除、移動排序、整館遷移）
         ======================================================================== */}
      <section className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5D9C5] pb-4">
          <div>
            <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
              館藏分類管理（新增 · 修改 · 刪除 · 移動分類順序與整館遷移）
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
                          代表色系（共 {THEME_COLOR_OPTIONS.length} 種）
                        </label>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 rounded-lg shrink-0 border border-[#C8B598] shadow-2xs"
                            style={{ backgroundColor: editCatColor }}
                          />
                          <select
                            value={editCatColor}
                            onChange={(e) => setEditCatColor(e.target.value)}
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs"
                          >
                            {THEME_COLOR_OPTIONS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                          館廳圖示（共 {ICON_OPTIONS.length} 種）
                        </label>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-white shadow-2xs"
                            style={{ backgroundColor: editCatColor }}
                          >
                            {getCategoryIcon(editCatIcon, 'w-4 h-4')}
                          </span>
                          <select
                            value={editCatIcon}
                            onChange={(e) => setEditCatIcon(e.target.value)}
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs"
                          >
                            {ICON_OPTIONS.map((ic) => (
                              <option key={ic.value} value={ic.value}>
                                {ic.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-[#FAF4E8] border border-[#DFCEB4]">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={editCatAllowGuest}
                          onChange={(e) => setEditCatAllowGuest(e.target.checked)}
                          className="w-4 h-4 rounded accent-[#2E5A44] cursor-pointer"
                        />
                        <span className="text-xs font-bold text-[#2C221E]">
                          是否開啟訪客瀏覽
                        </span>
                        <span className="text-[11px] text-[#6E5D4F]">
                          （勾選後，訪客登入才能瀏覽與使用此館藏分類）
                        </span>
                      </label>
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
                            {cat.allowGuest ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                                ✓ 開放訪客瀏覽
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-300 text-[10px] font-medium">
                                未開放訪客
                              </span>
                            )}
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

                    {/* 是否開啟訪客瀏覽 勾選設定列 */}
                    <div
                      className={`px-3 py-2 rounded-xl border transition-colors ${
                        cat.allowGuest
                          ? 'bg-emerald-50/80 border-emerald-300'
                          : 'bg-[#FAF6EE] border-[#E5D9C5]'
                      }`}
                    >
                      <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={Boolean(cat.allowGuest)}
                            onChange={() => handleToggleCategoryGuestAccess(cat)}
                            className="w-4 h-4 rounded accent-[#2E5A44] cursor-pointer shrink-0"
                          />
                          <span className="text-xs font-bold text-[#2C221E]">
                            是否開啟訪客瀏覽
                          </span>
                          <span className="text-[11px] text-[#6E5D4F] truncate">
                            {cat.allowGuest
                              ? '（已開啟：訪客登入可使用此館藏分類）'
                              : '（勾選後，訪客登入才能使用）'}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                            cat.allowGuest
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#E5D9C5] text-[#5C3A1B]'
                          }`}
                        >
                          {cat.allowGuest ? '已開啟' : '未開啟'}
                        </span>
                      </label>
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
          區塊 3：語音檔案館藏資料管理（語音檔案名稱 · 館藏分類 · 說明內容 · 類別標籤設定）
         ======================================================================== */}
      <section
        ref={audioListSectionRef}
        className="parchment-card rounded-2xl p-6 shadow-md space-y-5 scroll-mt-20"
      >
        <div className="border-b border-[#E5D9C5] pb-4">
          <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
            語音檔案館藏資料管理（語音檔案名稱 · 館藏分類 · 說明內容 · 類別標籤設定）
          </h3>
          <p className="text-xs text-[#7A6855] mt-1">
            可直接修改每筆語音檔的「語音檔案名稱」、調整「館藏分類」、編輯「說明內容」，並為每個檔案標記「類別標籤（如：繪本、小說、童話、科普等）」，修改後立即自動儲存
          </p>
        </div>

        {/* 查詢區塊：分成 語音檔案名稱、館藏分類、說明內容、標籤 四個查詢欄位 */}
        <div className="p-4 rounded-xl bg-[#FAF4E8] border border-[#DFCEB4] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#3A2518] flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-[#8B5A2B]" />
              <span>館藏清單多欄位查詢（語音檔案名稱 · 館藏分類 · 說明內容 · 標籤）：</span>
            </span>

            {(searchTitle ||
              filterCategoryId !== 'all' ||
              searchDescription ||
              filterTag !== 'all' ||
              searchTag ||
              filterSpeaker !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTitle('');
                  setFilterCategoryId('all');
                  setFilterSpeaker('all');
                  setSearchDescription('');
                  setFilterTag('all');
                  setSearchTag('');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#8B5A2B]/15 hover:bg-[#8B5A2B] text-[#8B5A2B] hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                清除所有查詢條件
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* 欄位 1：語音檔案名稱 */}
            <div>
              <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                1. 語音檔案名稱
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  placeholder="輸入語音檔案名稱查詢..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>
            </div>

            {/* 欄位 2：館藏分類 */}
            <div>
              <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                2. 館藏分類
              </label>
              <select
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs font-semibold text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
              >
                <option value="all">所有館藏分類 ({audioItems.length})</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    [{cat.code}] {cat.name} (
                    {audioItems.filter((a) => a.categoryId === cat.id).length})
                  </option>
                ))}
              </select>
            </div>

            {/* 欄位 3：主講人（下拉選單查詢） */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-[#5C3A1B]">
                  3. 主講人
                </label>
                <button
                  type="button"
                  onClick={() => setIsSpeakerManagerOpen(true)}
                  className="text-[10px] text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-0.5 cursor-pointer font-semibold"
                  title="開啟主講人名冊維護管理"
                >
                  <Users className="w-3 h-3" />
                  <span>名冊維護</span>
                </button>
              </div>
              <select
                value={filterSpeaker}
                onChange={(e) => setFilterSpeaker(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs font-semibold text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
              >
                <option value="all">全部主講人 (不限) ({audioItems.length})</option>
                {speakerStats.unassigned > 0 && (
                  <option value="__unassigned__">
                    尚未指定主講人 ({speakerStats.unassigned} 筆)
                  </option>
                )}
                {speakerStats.list.map(({ name, count }) => (
                  <option key={name} value={name}>
                    {name} ({count} 筆)
                  </option>
                ))}
              </select>
            </div>

            {/* 欄位 4：說明內容 */}
            <div>
              <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                4. 說明內容
              </label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDescription}
                  onChange={(e) => setSearchDescription(e.target.value)}
                  placeholder="輸入說明內容關鍵字查詢..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>
            </div>

            {/* 欄位 5：標籤（支援下拉選取與關鍵字查詢） */}
            <div>
              <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                5. 標籤（類別標籤）
              </label>
              <div className="flex flex-col gap-1.5">
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#D5C5AE] bg-white text-xs font-semibold text-[#2C221E] focus:outline-none focus:border-[#2E5A44]"
                >
                  <option value="all">所有類別標籤 ({audioItems.length})</option>
                  {sortedTagStats.map(({ tag, count }) => (
                    <option key={tag} value={tag}>
                      {tag} ({count} 筆)
                    </option>
                  ))}
                  {untaggedCount > 0 && (
                    <option value="__untagged__">
                      尚未標記類別 ({untaggedCount} 筆)
                    </option>
                  )}
                </select>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTag}
                    onChange={(e) => setSearchTag(e.target.value)}
                    placeholder="或輸入標籤關鍵字查詢..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#D5C5AE] bg-white text-xs focus:outline-none focus:border-[#2E5A44]"
                  />
                </div>
              </div>
            </div>
          </div>

          {(filterSpeaker !== 'all' || filterTag !== 'all' || searchTag.trim() !== '') && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-[#5C3A1B] font-semibold">目前篩選條件：</span>
              {filterSpeaker !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#8B5A2B] text-white font-semibold">
                  <User className="w-3 h-3" />
                  <span>
                    {filterSpeaker === '__unassigned__'
                      ? '尚未指定主講人'
                      : `主講人: ${filterSpeaker}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterSpeaker('all')}
                    className="ml-1 hover:text-amber-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterTag !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#2E5A44] text-white font-semibold">
                  <Tag className="w-3 h-3" />
                  <span>{filterTag === '__untagged__' ? '尚未標記類別' : filterTag}</span>
                  <button
                    type="button"
                    onClick={() => setFilterTag('all')}
                    className="ml-1 hover:text-amber-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {searchTag.trim() !== '' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#2E5A44] text-white font-semibold">
                  <Tag className="w-3 h-3" />
                  <span>關鍵字：{searchTag.trim()}</span>
                  <button
                    type="button"
                    onClick={() => setSearchTag('')}
                    className="ml-1 hover:text-amber-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* 清單上方分頁控制列（以 10 的倍數選取）與批次移動工具列 */}
        <div className="space-y-3">
          {/* 上方分頁控制列 */}
          <div className="p-3.5 rounded-xl bg-[#EFE6D5] border border-[#D8C7AE] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#3A2518]">
              <span className="font-bold">
                共 <strong className="text-[#8B5A2B] font-mono text-sm">{totalItems}</strong> 筆語音檔案
              </span>
              {totalItems > 0 && (
                <span className="text-[#6E5D4F]">
                  （目前顯示第{' '}
                  <strong className="font-mono text-[#2C221E]">{startIndex + 1}</strong> -{' '}
                  <strong className="font-mono text-[#2C221E]">
                    {Math.min(startIndex + pageSize, totalItems)}
                  </strong>{' '}
                  筆）
                </span>
              )}

              <div className="flex items-center gap-1.5">
                <label className="font-semibold text-[#5C3A1B]">每頁顯示筆數：</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white text-xs font-mono font-bold text-[#2C221E] cursor-pointer"
                >
                  {[10, 20, 30, 40, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} 筆 / 頁
                    </option>
                  ))}
                </select>
              </div>

              {/* 排序功能：依檔案名稱、上傳日期、館藏分類；由小到大、由大到小 */}
              <div className="flex items-center gap-1.5 bg-[#FAF6EE] px-2.5 py-1 rounded-lg border border-[#DFCEB4]">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#8B5A2B]" />
                <label className="font-semibold text-[#5C3A1B]">排序：</label>
                <select
                  value={catalogSortBy}
                  onChange={(e) => setCatalogSortBy(e.target.value as any)}
                  className="px-2 py-0.5 rounded border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer"
                >
                  <option value="createdAt">依上傳日期</option>
                  <option value="title">依檔案名稱</option>
                  <option value="category">依館藏分類</option>
                  <option value="speaker">依主講人</option>
                </select>

                <select
                  value={catalogSortOrder}
                  onChange={(e) => setCatalogSortOrder(e.target.value as any)}
                  className="px-2 py-0.5 rounded border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer"
                >
                  <option value="desc">由大到小</option>
                  <option value="asc">由小到大</option>
                </select>
              </div>
            </div>

            {/* 頁碼切換按鈕 */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 text-xs font-semibold text-[#3A2518] flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>上一頁</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                      pageNum === safeCurrentPage
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
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 text-xs font-semibold text-[#3A2518] flex items-center gap-1 cursor-pointer"
              >
                <span>下一頁</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
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
                <span>全選查詢結果 ({filteredAudioItems.length} 筆)</span>
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
        </div>

        {/* 語音檔詳細館藏管理卡片清單 */}
        <div className="space-y-4">
          {paginatedAudioItems.length === 0 ? (
            <div className="p-10 text-center rounded-xl border border-dashed border-[#D5C5AE] bg-white/60 text-xs text-[#7A6855]">
              目前查詢條件下沒有符合的語音檔。
            </div>
          ) : (
            paginatedAudioItems.map((item, idx) => {
              const globalIdx = startIndex + idx;
              const isChecked = selectedItemIds.includes(item.id);
              const currentCat = categories.find((c) => c.id === item.categoryId);
              const itemTags = item.tags || [];
              const listSeq = globalIdx + 1;
              const callNumber =
                audioCallNumberMap.get(item.id) || (currentCat ? `${currentCat.code}-1` : 'CAT-1');
              const fileType = getAudioFileType(item);
              const titleValue =
                editingTitles[item.id] !== undefined
                  ? editingTitles[item.id]
                  : item.title;
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
                  {/* 卡片頂部：標題資訊、語音檔名修改、操作按鈕群與所屬分類切換 */}
                  <div className="space-y-3 pb-3 border-b border-[#EFE6D5]">
                    {/* 第一列：勾選框 + 封面 + 序號/分類徽章/時長 + 右側快速操作按鈕群（放映室播放、下載語音檔、SRT編輯） */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
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
                          className="w-4 h-4 accent-[#8B5A2B] rounded shrink-0 cursor-pointer"
                        />

                        <img
                          src={item.coverImageUrl}
                          alt={item.title}
                          className="w-12 h-14 rounded-lg object-cover border border-[#D5C5AE] shrink-0"
                        />

                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {/* 清單序號：依照查詢條件從 1 開始的序號 */}
                          <span
                            className="px-2 py-0.5 rounded bg-[#3A2518] text-white font-mono text-[10px] font-bold shrink-0"
                            title={`清單序號：第 ${listSeq} 筆`}
                          >
                            #{listSeq}
                          </span>
                          {/* 獨立語音檔編號：館藏分類編號 + 流水號 (號碼從 1 開始，依上傳順序編號) */}
                          <span
                            className="px-2 py-0.5 rounded bg-[#FAF4E8] border border-[#D5C5AE] text-[#5C3A1B] font-mono text-[10px] font-bold shadow-xs shrink-0"
                            title="語音檔獨立編號（館藏分類編號 + 上傳順序流水號）"
                          >
                            {callNumber}
                          </span>
                          {currentCat && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-semibold text-white shrink-0"
                              style={{ backgroundColor: currentCat.themeColor }}
                            >
                              [{currentCat.code}] {currentCat.name}
                            </span>
                          )}
                          {/* 語音檔案類型（例如：MP3, WAV, M4A 等） */}
                          <span
                            className="px-2 py-0.5 rounded-md bg-[#2B4C7E]/12 border border-[#2B4C7E]/30 text-[#2B4C7E] font-mono text-[10px] font-bold tracking-wider flex items-center gap-1 shadow-2xs shrink-0"
                            title={`語音檔案類型：${fileType}`}
                          >
                            <FileAudio className="w-3 h-3 text-[#2B4C7E]" />
                            <span>{fileType}</span>
                          </span>
                          {item.speaker && (
                            <span
                              className="px-2 py-0.5 rounded bg-[#8B5A2B]/15 border border-[#8B5A2B]/30 text-[#5C3A1B] font-semibold text-[10px] flex items-center gap-1 shrink-0"
                              title={`主講人：${item.speaker}`}
                            >
                              <User className="w-2.5 h-2.5 text-[#8B5A2B]" />
                              <span>主講人: {item.speaker}</span>
                            </span>
                          )}
                          <span className="text-xs font-mono text-[#7A6855] flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration)}
                          </span>
                        </div>
                      </div>

                      {/* 右側操作按鈕群：放映室播放、下載語音檔、SRT 編輯 */}
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
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
                          onClick={() => handleDownloadAudio(item)}
                          disabled={!!downloadingItemIds[item.id]}
                          title="下載此語音檔到電腦或手機"
                          className="px-3 py-1.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] disabled:opacity-60 disabled:cursor-wait text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          {downloadingItemIds[item.id] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>{downloadingItemIds[item.id] ? '準備下載中...' : '下載語音檔'}</span>
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

                    {/* 第二列：語音檔案名稱修改（左側寬敞空間，儲存按鈕絕不被遮擋） */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[#FAF6EE] p-3 rounded-xl border border-[#E5D9C5]">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="text-xs font-bold text-[#5C3A1B] flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-[#8B5A2B]" />
                          <span>語音檔案名稱：</span>
                        </label>
                        <span
                          className="px-1.5 py-0.5 rounded bg-[#2B4C7E]/12 border border-[#2B4C7E]/30 text-[#2B4C7E] font-mono text-[10px] font-bold tracking-wider flex items-center gap-0.5"
                          title={`語音檔案類型：${fileType}`}
                        >
                          <FileAudio className="w-2.5 h-2.5" />
                          <span>{fileType}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={titleValue}
                          onChange={(e) =>
                            setEditingTitles((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          onBlur={(e) => handleSaveItemTitle(item, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveItemTitle(item, titleValue);
                            }
                          }}
                          placeholder="輸入語音檔案名稱（修改後自動同步雲端硬碟檔名）..."
                          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white focus:bg-white font-bold font-serif-tc text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-2xs"
                        />
                        {editingTitles[item.id] !== undefined &&
                        editingTitles[item.id].trim() !== '' &&
                        editingTitles[item.id].trim() !== item.title ? (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              // 避免觸發 input onBlur 造成兩次呼叫，直接立即執行儲存
                              e.preventDefault();
                              handleSaveItemTitle(item, titleValue);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer z-10"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>儲存並同步雲端檔名</span>
                          </button>
                        ) : renamingItemIds[item.id] ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-[#2E5A44] text-[11px] font-semibold flex items-center gap-1 shrink-0">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>雲端檔名背景同步中</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* 第三列：所屬館藏分類切換 + 主講人選取與管理（含新增、修改、刪除功能） */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF6EE] p-3 rounded-xl border border-[#E5D9C5]">
                      {/* 左側：所屬館藏分類 */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#5C3A1B] shrink-0">
                          所屬館藏分類：
                        </span>
                        <select
                          value={item.categoryId}
                          onChange={(e) =>
                            handleSingleItemCategoryChange(item, e.target.value)
                          }
                          className="px-3 py-1.5 rounded-lg border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E] cursor-pointer shadow-2xs hover:border-[#8B5A2B]"
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              [{cat.code}] {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 右側：主講人下拉選單（包含新增、修改、刪除）與快捷操作按鈕 */}
                      <div className="flex flex-wrap items-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#E2D5C1]">
                        <label className="text-xs font-bold text-[#5C3A1B] shrink-0 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-[#8B5A2B]" />
                          <span>主講人：</span>
                        </label>

                        {/* 下拉選單：包含未指定、現有名冊、新增、修改、刪除 */}
                        <select
                          value={item.speaker || ''}
                          onChange={(e) => handleSpeakerDropdownChange(item, e.target.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer shadow-2xs transition ${
                            item.speaker
                              ? 'border-[#8B5A2B] bg-[#FFF8EE] text-[#5C3A1B]'
                              : 'border-[#C8B598] bg-white text-[#6B5A4B]'
                          }`}
                        >
                          <option value="">-- 未指定主講人 --</option>
                          {speakers.length > 0 && (
                            <optgroup label="現有主講人名冊">
                              {speakers.map((sp) => (
                                <option key={sp.id} value={sp.name}>
                                  {sp.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="── 主講人管理操作 ──">
                            <option value="__ACTION_ADD__">➕ 新增主講人...</option>
                            {item.speaker && (
                              <>
                                <option value="__ACTION_EDIT__">✏️ 修改「{item.speaker}」名稱...</option>
                                <option value="__ACTION_DELETE__">🗑️ 刪除「{item.speaker}」...</option>
                              </>
                            )}
                            <option value="__ACTION_MANAGE__">⚙️ 開啟主講人名冊維護...</option>
                          </optgroup>
                        </select>

                        {/* 快捷操作按鈕 */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSpeakerTargetItem(item);
                              setNewSpeakerName('');
                              setIsAddSpeakerOpen(true);
                            }}
                            title="新增主講人"
                            className="px-2 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] text-[#2E5A44] hover:border-[#2E5A44] text-[11px] font-semibold flex items-center gap-0.5 cursor-pointer shadow-2xs transition"
                          >
                            <Plus className="w-3 h-3" />
                            <span>新增</span>
                          </button>

                          {item.speaker && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSpeakerOldName(item.speaker!);
                                  setEditingSpeakerNewName(item.speaker!);
                                }}
                                title={`修改主講人「${item.speaker}」名稱`}
                                className="px-2 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] text-[#8B5A2B] hover:border-[#8B5A2B] text-[11px] font-semibold flex items-center gap-0.5 cursor-pointer shadow-2xs transition"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>修改</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingSpeakerName(item.speaker!)}
                                title={`刪除主講人「${item.speaker}」`}
                                className="px-2 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-rose-50 text-rose-600 hover:border-rose-400 text-[11px] font-semibold flex items-center gap-0.5 cursor-pointer shadow-2xs transition"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>刪除</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setIsSpeakerManagerOpen(true)}
                            title="開啟主講人名冊維護管理"
                            className="p-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] text-[#5C3A1B] cursor-pointer shadow-2xs transition"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 卡片下半部：左欄「館藏說明內容編輯」+ 右欄「類別標籤設定」（兩區塊底部貼齊對齊） */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                    {/* 左欄 5 欄：說明內容即時編輯（高度自動伸展，底部與右方類別標籤區塊貼齊） */}
                    <div className="lg:col-span-5 flex flex-col space-y-2 bg-[#FAF6EE] p-3.5 rounded-xl border border-[#E5D9C5] h-full">
                      <div className="flex items-center justify-between shrink-0">
                        <label className="text-xs font-bold text-[#5C3A1B] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#8B5A2B]" />
                          <span>館藏說明內容（修改後自動即時儲存）：</span>
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
                        value={descValue}
                        onChange={(e) =>
                          setEditingDescriptions((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        onBlur={(e) => handleSaveItemDescription(item, e.target.value)}
                        placeholder="請輸入此語音檔的館藏說明內容..."
                        className="w-full flex-1 min-h-[140px] p-3 rounded-xl border border-[#D5C5AE] bg-white focus:bg-white text-xs text-[#2C221E] leading-relaxed focus:outline-none focus:border-[#8B5A2B] resize-y shadow-2xs"
                      />
                    </div>

                    {/* 右欄 7 欄：類別標籤 (繪本、小說、童話...) 標記與管理 */}
                    <div className="lg:col-span-7 space-y-2.5 bg-[#FAF6EE] p-3.5 rounded-xl border border-[#E5D9C5] flex flex-col justify-between h-full">
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-bold text-[#2E5A44] flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5" />
                            <span>
                              類別標籤設定（目前已標記 {itemTags.length} 個類別）：
                            </span>
                          </label>
                          <span className="text-[11px] text-[#7A6855]">
                            點擊下方快速標記即可套用或取消，點擊「×」可從快速標記中刪除
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
                                  title={`從此語音檔移除「${tag}」標籤`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>

                        {/* 快速標記類別標籤列（支援點選標記 + 刪除快速標記按鈕） */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#E5D9C5]">
                          <span className="text-[11px] font-semibold text-[#6E5D4F] mr-1">
                            快速標記：
                          </span>
                          {quickTags.map((presetTag) => {
                            const isTagged = itemTags.includes(presetTag);
                            return (
                              <div
                                key={presetTag}
                                className={`inline-flex items-center rounded-md text-[11px] font-semibold transition overflow-hidden border ${
                                  isTagged
                                    ? 'bg-[#2E5A44]/20 text-[#2E5A44] border-[#2E5A44]'
                                    : 'bg-white text-[#5C3A1B] border-[#D5C5AE] hover:border-[#8B5A2B]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleItemTag(item, presetTag)}
                                  className="px-2 py-0.5 cursor-pointer"
                                  title={
                                    isTagged
                                      ? `點擊取消標記「${presetTag}」`
                                      : `點擊為此語音檔標記「${presetTag}」`
                                  }
                                >
                                  {isTagged ? `✓ ${presetTag}` : `+ ${presetTag}`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuickTagPendingDelete(presetTag)}
                                  className="px-1.5 py-0.5 border-l border-[#D5C5AE]/70 hover:bg-red-600 hover:text-white text-[#8B735B] transition cursor-pointer"
                                  title={`從快速標記清單中刪除「${presetTag}」`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 自訂類別標籤輸入框（新增後自動加入快速標記） */}
                      <div className="flex items-center gap-2 pt-2 border-t border-[#E5D9C5] mt-2">
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
                          placeholder="輸入自訂類別（例如：繪本、奇幻小說... 新增後將自動加入快速標記）"
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

        {/* 清單底部也提供分頁切換列（當頁數大於 1 時方便直接翻頁） */}
        {totalItems > 0 && (
          <div className="p-3.5 rounded-xl bg-[#EFE6D5] border border-[#D8C7AE] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#5C3A1B] font-semibold">
              第 <strong>{safeCurrentPage}</strong> / <strong>{totalPages}</strong> 頁（共{' '}
              <strong>{totalItems}</strong> 筆）
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  scrollToAudioList();
                }}
                className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 text-xs font-semibold text-[#3A2518] flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>上一頁</span>
              </button>
              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  scrollToAudioList();
                }}
                className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 text-xs font-semibold text-[#3A2518] flex items-center gap-1 cursor-pointer"
              >
                <span>下一頁</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================
          Modal 1：新增館藏分類視窗（20 個代表色系 + 20 個館廳圖示）
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
                    代表色系（共 {THEME_COLOR_OPTIONS.length} 種）
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
                    館廳圖示（共 {ICON_OPTIONS.length} 種）
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

              <div className="p-3 rounded-xl bg-[#FAF4E8] border border-[#DFCEB4]">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCatAllowGuest}
                    onChange={(e) => setNewCatAllowGuest(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#2E5A44] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-[#2C221E]">
                    是否開啟訪客瀏覽
                  </span>
                  <span className="text-[11px] text-[#6E5D4F]">
                    （勾選後，訪客登入才能瀏覽與使用此館藏分類）
                  </span>
                </label>
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

      {/* ========================================================================
          Modal 4：刪除「快速標記」類別標籤確認視窗（符合系統典藏風格）
         ======================================================================== */}
      {quickTagPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2218] to-[#522D20] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-300/30 flex items-center justify-center text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  刪除快速標記類別確認
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickTagPendingDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                確定要從「快速標記」清單中刪除類別標籤「
                <strong className="text-[#8B5A2B]">{quickTagPendingDelete}</strong>
                」嗎？
              </p>

              {(() => {
                const usedCount = tagCountsMap.get(quickTagPendingDelete) || 0;
                if (usedCount > 0) {
                  return (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#6E4720] leading-relaxed">
                      ⚠️ 目前共有 <strong>{usedCount}</strong> 筆語音檔標記了「
                      <strong>{quickTagPendingDelete}</strong>
                      」，確認刪除後也會一併從這些語音檔中移除此類別標籤並同步更新 Firebase。
                    </div>
                  );
                }
                return (
                  <div className="p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] text-xs text-[#5C4938]">
                    目前沒有任何語音檔使用此標籤，可直接從快速標記清單中安全移除。
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setQuickTagPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  保留標籤 (取消)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteQuickTag}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>確認刪除類別標籤</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          Modal 5：主講人名冊維護管理視窗（層級 z-50）
         ======================================================================== */}
      {isSpeakerManagerOpen && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            {/* 視窗頂部標題列 */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#261A13] to-[#3E2A1D] text-[#FAF5EC] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#8B5A2B]/40 border border-[#D4A373]/30 flex items-center justify-center text-[#F3D5B5]">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold font-serif-tc text-base tracking-wide">
                    主講人名冊維護管理
                  </h3>
                  <p className="text-[11px] text-[#C8B5A0]">
                    管理數位有聲圖書館之主講人名單、館藏語音數量統計與快速維護
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSpeakerManagerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-[#E6D7C3] cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 內容區塊 */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* 統計與新增列 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAF6EE] border border-[#E5D9C5]">
                <div className="text-xs text-[#5C3A1B] space-y-0.5">
                  <div>
                    名冊現有主講人：<strong className="text-[#8B5A2B] font-mono text-sm">{speakers.length}</strong> 位
                  </div>
                  <div>
                    尚未指定主講人之語音檔：<strong className="text-amber-800 font-mono font-bold">{speakerStats.unassigned}</strong> 筆
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSpeakerTargetItem(null);
                    setNewSpeakerName('');
                    setIsAddSpeakerOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1.5 self-start sm:self-center shadow-xs cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新增主講人</span>
                </button>
              </div>

              {/* 主講人名單列表 */}
              {speakers.length === 0 ? (
                <div className="text-center py-12 text-sm text-[#7A6855] bg-[#FAF6EE]/50 rounded-xl border border-dashed border-[#DFCEB4]">
                  目前名冊中尚未有任何主講人，請點擊上方「新增主講人」按鈕建立第一位主講人！
                </div>
              ) : (
                <div className="rounded-xl border border-[#E2D5C1] overflow-hidden bg-white shadow-2xs">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-[#F4ECE0] text-xs font-bold text-[#5C3A1B] border-b border-[#E2D5C1]">
                    <div className="col-span-2 sm:col-span-1 text-center font-mono">序號</div>
                    <div className="col-span-6 sm:col-span-6">主講人姓名</div>
                    <div className="col-span-4 sm:col-span-2 text-center">館藏語音數</div>
                    <div className="hidden sm:block sm:col-span-3 text-right">操作</div>
                  </div>

                  <div className="divide-y divide-[#EFE6D5]">
                    {speakerStats.list.map((sp, idx) => (
                      <div
                        key={sp.id}
                        className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[#FAF6EE] text-xs transition"
                      >
                        <div className="col-span-2 sm:col-span-1 text-center font-mono font-semibold text-[#8B735B]">
                          #{idx + 1}
                        </div>
                        <div className="col-span-6 sm:col-span-6 font-semibold text-[#2C221E] flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[#8B5A2B]" />
                          <span>{sp.name}</span>
                        </div>
                        <div className="col-span-4 sm:col-span-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setFilterSpeaker(sp.name);
                              setIsSpeakerManagerOpen(false);
                              scrollToAudioList();
                            }}
                            title={`點選以篩選主講人「${sp.name}」之語音檔`}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#8B5A2B]/15 hover:bg-[#8B5A2B] text-[#5C3A1B] hover:text-white font-mono font-bold text-xs transition cursor-pointer"
                          >
                            <span>{sp.count}</span>
                            <span className="text-[10px]">筆</span>
                          </button>
                        </div>
                        <div className="col-span-12 sm:col-span-3 flex items-center justify-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0E4D4]">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSpeakerOldName(sp.name);
                              setEditingSpeakerNewName(sp.name);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-[#FAF4E8] text-[#8B5A2B] text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>修改</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingSpeakerName(sp.name)}
                            className="px-2.5 py-1 rounded-lg border border-[#C8B598] bg-white hover:bg-rose-50 text-rose-600 hover:border-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>刪除</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 視窗底部按鈕列 */}
            <div className="px-6 py-3.5 bg-[#FAF4E8] border-t border-[#E5D9C5] flex items-center justify-between shrink-0">
              <span className="text-xs text-[#7A6855]">
                💡 點擊任一主講人的「館藏語音數」，即可自動套用篩選並跳轉至該主講人的語音清單。
              </span>
              <button
                type="button"
                onClick={() => setIsSpeakerManagerOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#3A2518] hover:bg-[#261A13] text-white text-xs font-semibold shadow-xs cursor-pointer transition"
              >
                關閉名冊
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          Modal 6：新增主講人視窗（層級 z-[70]，確保在名冊管理等所有視窗最前方）
         ======================================================================== */}
      {isAddSpeakerOpen && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#261A13] to-[#3E2A1D] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#8B5A2B]/40 border border-[#D4A373]/30 flex items-center justify-center text-[#F3D5B5]">
                  <User className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  新增主講人
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddSpeakerOpen(false);
                  setNewSpeakerName('');
                  setSpeakerTargetItem(null);
                }}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {speakerTargetItem && (
                <div className="p-3 rounded-xl bg-[#FAF4E8] border border-[#DFCEB4] text-xs text-[#5C3A1B]">
                  💡 新增後將自動指派給當前語音檔：
                  <strong className="block text-[#2C221E] font-serif-tc text-sm mt-0.5 truncate">
                    {speakerTargetItem.title}
                  </strong>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1.5">
                  主講人姓名 / 稱謂 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmAddSpeaker();
                    }
                  }}
                  placeholder="例如：林教授、張老師、王作家、陳導覽員..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8B598] bg-white text-sm text-[#2C221E] font-medium focus:outline-none focus:border-[#8B5A2B] shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddSpeakerOpen(false);
                    setNewSpeakerName('');
                    setSpeakerTargetItem(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddSpeaker}
                  className="px-5 py-2 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>確認新增主講人</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          Modal 7：修改主講人名稱視窗（層級 z-[70]，確保在名冊管理等所有視窗最前方）
         ======================================================================== */}
      {editingSpeakerOldName && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#261A13] to-[#3E2A1D] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#8B5A2B]/40 border border-[#D4A373]/30 flex items-center justify-center text-[#F3D5B5]">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  修改主講人名稱
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSpeakerOldName(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#7A4B1D] leading-relaxed">
                ℹ️ 修改後，名冊與所有目前標記為「<strong>{editingSpeakerOldName}</strong>」的語音檔案（共 {audioItems.filter((a) => (a.speaker || '').trim() === editingSpeakerOldName.trim()).length} 筆）將同步自動更新。
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1.5">
                  新的主講人姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={editingSpeakerNewName}
                  onChange={(e) => setEditingSpeakerNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmEditSpeaker();
                    }
                  }}
                  placeholder="輸入新的主講人姓名..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#C8B598] bg-white text-sm text-[#2C221E] font-medium focus:outline-none focus:border-[#8B5A2B] shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setEditingSpeakerOldName(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEditSpeaker}
                  className="px-5 py-2 rounded-xl bg-[#8B5A2B] hover:bg-[#6F4520] text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>確認修改名稱</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          Modal 8：刪除主講人確認視窗（層級 z-[70]，確保在名冊管理等所有視窗最前方）
         ======================================================================== */}
      {deletingSpeakerName && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2218] to-[#522D20] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-300/30 flex items-center justify-center text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  刪除主講人確認
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingSpeakerName(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                確定要自主講人名冊中刪除「
                <strong className="text-[#8B5A2B]">{deletingSpeakerName}</strong>」嗎？
              </p>

              {(() => {
                const affectedCount = audioItems.filter((a) => (a.speaker || '').trim() === deletingSpeakerName.trim()).length;
                if (affectedCount > 0) {
                  return (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#6E4720] leading-relaxed">
                      ⚠️ 目前共有 <strong>{affectedCount}</strong> 筆語音檔指派了此主講人，刪除後將自動解除這些語音檔的主講人欄位（語音檔本身不會被刪除），並同步更新至 Firebase。
                    </div>
                  );
                }
                return (
                  <div className="p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4] text-xs text-[#5C4938]">
                    目前沒有任何語音檔指派此主講人，可直接安全刪除。
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setDeletingSpeakerName(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] cursor-pointer"
                >
                  保留主講人 (取消)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSpeaker}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>確認刪除主講人</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
