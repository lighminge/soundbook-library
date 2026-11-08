import React, { useEffect, useState } from 'react';
import {
  Library,
  LayoutDashboard,
  Radio,
  FolderKanban,
  Tags,
  Settings,
  Github,
  Database,
  HardDrive,
  Users,
  LogOut,
  Shield,
  User as UserIcon,
  Compass,
  LayoutTemplate,
} from 'lucide-react';
import { AudioItem, Category, CurrentUser, LoginScreenConfig } from './types';
import {
  deleteCategoryItem,
  getLocalLoginScreenConfig,
  isGoogleDriveConfigured,
  loadLibraryData,
  loadLoginScreenConfig,
  removeAudioItem,
  saveAudioItem,
  saveCategoryItem,
} from './services/storageService';
import { getCurrentSessionUser, logout, GUEST_USER } from './services/authService';
import { LoginView } from './components/LoginView';
import { SystemManagementView, SystemSubTab } from './components/SystemManagementView';
import { DashboardView } from './components/DashboardView';
import { ScreeningRoomView } from './components/ScreeningRoomView';
import { AudioLibraryView } from './components/AudioLibraryView';
import { CatalogManagementView } from './components/CatalogManagementView';
import { CloudSettingsModal } from './components/CloudSettingsModal';

type NavTab = 'dashboard' | 'screening' | 'library' | 'catalog' | 'system';

export function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => getCurrentSessionUser());
  const [loginScreenConfig, setLoginScreenConfig] = useState<LoginScreenConfig>(() =>
    getLocalLoginScreenConfig()
  );

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [systemInitialSubTab, setSystemInitialSubTab] = useState<SystemSubTab>('accounts');
  const [categories, setCategories] = useState<Category[]>([]);
  const [audioItems, setAudioItems] = useState<AudioItem[]>([]);
  const [dataSource, setDataSource] = useState<'firebase' | 'local'>('local');
  const [driveConnected, setDriveConnected] = useState<boolean>(false);

  const isGuest = currentUser?.role === 'guest' || currentUser?.isGuest === true;
  const isAdmin = currentUser?.role === 'admin';

  // 放映室目前選取播放的語音檔與分類篩選
  const [activeAudioForPlayback, setActiveAudioForPlayback] = useState<AudioItem | null>(null);
  const [screeningCategoryFilter, setScreeningCategoryFilter] = useState<string>('all');
  // 放映室啟動隨機播放時帶入的自訂播放佇列與自動播放標記
  const [screeningInitialPlaylistIds, setScreeningInitialPlaylistIds] = useState<string[]>([]);
  const [screeningInitialAutoPlay, setScreeningInitialAutoPlay] = useState<boolean>(false);

  const handleStartShufflePlayback = (items: AudioItem[], categoryId?: string) => {
    if (!items || items.length === 0) return;
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    setActiveAudioForPlayback(shuffled[0]);
    setScreeningInitialPlaylistIds(shuffled.map((i) => i.id));
    setScreeningInitialAutoPlay(true);
    setScreeningCategoryFilter(categoryId || 'all');
    setActiveTab('screening');
  };

  // 手動選取多筆語音檔後，依選取順序當作播放清單一併到放映室播放
  const handleStartPlaylistPlayback = (items: AudioItem[], categoryId?: string) => {
    if (!items || items.length === 0) return;
    setActiveAudioForPlayback(items[0]);
    setScreeningInitialPlaylistIds(items.map((i) => i.id));
    setScreeningInitialAutoPlay(true);
    setScreeningCategoryFilter(categoryId || 'all');
    setActiveTab('screening');
  };

  // 語音檔案庫目前選取編輯的語音檔與預設上傳分類
  const [editingAudioItem, setEditingAudioItem] = useState<AudioItem | null>(null);
  const [defaultUploadCategoryId, setDefaultUploadCategoryId] = useState<string | undefined>(
    undefined
  );

  // 雲端設定 Modal
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);

  const reloadAllData = async () => {
    const res = await loadLibraryData();
    setCategories(res.categories);
    setAudioItems(res.audioItems);
    setDataSource(res.source);
    setDriveConnected(isGoogleDriveConfigured());
    loadLoginScreenConfig()
      .then((cfg) => setLoginScreenConfig(cfg))
      .catch(() => {});

    // 支援跨裝置投放 / 連結分享時直接定位至指定語音作品
    const urlParams = new URLSearchParams(window.location.search);
    const audioIdFromUrl = urlParams.get('audioId');
    if (audioIdFromUrl) {
      const target = res.audioItems.find((i) => i.id === audioIdFromUrl);
      if (target) {
        setActiveAudioForPlayback(target);
        return;
      }
    }

    if (!activeAudioForPlayback && res.audioItems.length > 0) {
      setActiveAudioForPlayback(res.audioItems[0]);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabFromUrl = urlParams.get('tab');
    if (
      tabFromUrl === 'screening' ||
      tabFromUrl === 'dashboard' ||
      (!isGuest && (tabFromUrl === 'library' || tabFromUrl === 'catalog')) ||
      (isAdmin && tabFromUrl === 'system')
    ) {
      setActiveTab(tabFromUrl as any);
    }
    reloadAllData();
  }, []);

  // 訪客與權限模式保護：若處於訪客模式且目前頁籤為上傳或管理，或非管理員進入系統管理，自動導回總覽
  useEffect(() => {
    if (isGuest && (activeTab === 'library' || activeTab === 'catalog' || activeTab === 'system')) {
      setActiveTab('dashboard');
    } else if (!isAdmin && activeTab === 'system') {
      setActiveTab('dashboard');
    }
  }, [isGuest, isAdmin, activeTab]);

  // 依「是否開啟訪客瀏覽 (allowGuest)」過濾訪客可見的館藏分類與語音檔
  const visibleCategoriesForUser = React.useMemo(
    () => (isGuest ? categories.filter((c) => Boolean(c.allowGuest)) : categories),
    [isGuest, categories]
  );

  const visibleAudioItemsForUser = React.useMemo(() => {
    if (!isGuest) return audioItems;
    const allowedCatIds = new Set(visibleCategoriesForUser.map((c) => c.id));
    return audioItems.filter((a) => allowedCatIds.has(a.categoryId));
  }, [isGuest, audioItems, visibleCategoriesForUser]);

  useEffect(() => {
    if (!isGuest) return;
    if (
      activeAudioForPlayback &&
      !visibleAudioItemsForUser.some((a) => a.id === activeAudioForPlayback.id)
    ) {
      setActiveAudioForPlayback(visibleAudioItemsForUser[0] || null);
    } else if (!activeAudioForPlayback && visibleAudioItemsForUser.length > 0) {
      setActiveAudioForPlayback(visibleAudioItemsForUser[0]);
    }
  }, [isGuest, visibleAudioItemsForUser, activeAudioForPlayback]);

  // 新增分類
  const handleAddCategory = async (
    newCatData: Omit<Category, 'id' | 'createdAt' | 'order'>
  ) => {
    const newCat: Category = {
      ...newCatData,
      id: `cat_${Date.now()}`,
      order: categories.length + 1,
      createdAt: new Date().toISOString(),
    };
    const nextCats = [...categories, newCat];
    setCategories(nextCats);
    await saveCategoryItem(newCat, nextCats);
  };

  // 修改館藏分類
  const handleUpdateCategory = async (updatedCat: Category) => {
    const nextCats = categories.map((c) => (c.id === updatedCat.id ? updatedCat : c));
    setCategories(nextCats);
    await saveCategoryItem(updatedCat, nextCats);
  };

  // 移動館藏分類排列順序
  const handleReorderCategories = async (nextCategories: Category[]) => {
    setCategories(nextCategories);
    await Promise.all(
      nextCategories.map((cat) => saveCategoryItem(cat, nextCategories))
    );
  };

  // 刪除館藏分類（並將該分類下的語音檔自動遷移至指定分類）
  const handleDeleteCategory = async (
    categoryId: string,
    migrateToCategoryId?: string
  ) => {
    const remainingCats = categories
      .filter((c) => c.id !== categoryId)
      .map((c, idx) => ({ ...c, order: idx + 1 }));
    setCategories(remainingCats);
    await deleteCategoryItem(categoryId, remainingCats);

    const fallbackCatId = migrateToCategoryId || remainingCats[0]?.id;
    if (fallbackCatId) {
      const affectedItems = audioItems.filter((a) => a.categoryId === categoryId);
      if (affectedItems.length > 0) {
        const nextItems = audioItems.map((a) =>
          a.categoryId === categoryId
            ? {
                ...a,
                categoryId: fallbackCatId,
                updatedAt: new Date().toISOString(),
              }
            : a
        );
        setAudioItems(nextItems);
        await Promise.all(
          nextItems
            .filter((a) => affectedItems.some((old) => old.id === a.id))
            .map((item) => saveAudioItem(item, nextItems))
        );
      }
    }
  };

  // 批次移動語音檔至指定館藏分類
  const handleBatchMoveAudioCategory = async (
    itemIds: string[],
    targetCategoryId: string
  ) => {
    const idSet = new Set(itemIds);
    const now = new Date().toISOString();
    const nextItems = audioItems.map((a) =>
      idSet.has(a.id)
        ? { ...a, categoryId: targetCategoryId, updatedAt: now }
        : a
    );
    setAudioItems(nextItems);
    const updatedList = nextItems.filter((a) => idSet.has(a.id));
    await Promise.all(updatedList.map((item) => saveAudioItem(item, nextItems)));
  };

  // 從所有語音檔中移除指定類別標籤
  const handleRemoveTagFromAllAudioItems = async (tagToRemove: string) => {
    const clean = tagToRemove.trim();
    if (!clean) return;
    const now = new Date().toISOString();
    const affectedIds = new Set<string>();
    const nextItems = audioItems.map((a) => {
      const currentTags = a.tags || [];
      if (currentTags.includes(clean)) {
        affectedIds.add(a.id);
        return {
          ...a,
          tags: currentTags.filter((t) => t !== clean),
          updatedAt: now,
        };
      }
      return a;
    });

    if (affectedIds.size > 0) {
      setAudioItems(nextItems);
      const updatedList = nextItems.filter((a) => affectedIds.has(a.id));
      await Promise.all(updatedList.map((item) => saveAudioItem(item, nextItems)));
    }
  };

  // 儲存（新增或更新）語音檔
  const handleSaveAudioItem = async (item: AudioItem) => {
    const exists = audioItems.some((a) => a.id === item.id);
    const nextItems = exists
      ? audioItems.map((a) => (a.id === item.id ? item : a))
      : [item, ...audioItems];

    setAudioItems(nextItems);
    setActiveAudioForPlayback(item);
    await saveAudioItem(item, nextItems);
  };

  // 刪除語音檔（同時刪除 Firebase 資料與 Google 雲端硬碟內的實體檔案）
  const handleDeleteAudioItem = async (itemId: string) => {
    const targetItem = audioItems.find((a) => a.id === itemId);
    const nextItems = audioItems.filter((a) => a.id !== itemId);
    setAudioItems(nextItems);
    if (activeAudioForPlayback?.id === itemId) {
      setActiveAudioForPlayback(nextItems[0] || null);
    }
    return await removeAudioItem(itemId, nextItems, targetItem);
  };

  // 登入驗證防護：若尚未登入，顯示系統登入驗證畫面
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          reloadAllData();
        }}
        onGuestLogin={() => {
          const guest = getCurrentSessionUser() || GUEST_USER;
          setCurrentUser(guest);
          setActiveTab('dashboard');
          reloadAllData();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F1E7] text-[#2C221E]">
      {/* 頂部圖書館導覽列 */}
      <header className="sticky top-0 z-40 w-full bg-[#261A13] text-[#FAF5EC] border-b border-[#4A3427] shadow-md">
        <div className="w-full px-3 sm:px-5 lg:px-6 min-h-18 py-2.5 flex flex-wrap items-center justify-start gap-2.5 sm:gap-3.5">
          {/* 左側品牌標誌（與所有上方功能按鈕相同文字大小） */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer shrink-0 mr-1"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4A373] to-[#8B5A2B] flex items-center justify-center text-[#261A13] shadow-inner shrink-0">
              <Library className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="font-bold font-serif-tc text-base sm:text-lg tracking-wider text-[#FAF5EC] whitespace-nowrap">
              聲書閣
            </span>
          </div>

          {/* 主功能切換頁籤 (桌面版，靠左對齊，加大文字尺寸) */}
          <nav className="hidden lg:flex flex-wrap items-center gap-1.5 bg-[#1B120D] p-1.5 rounded-xl border border-[#3E2C22]">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-2 rounded-lg font-bold font-serif-tc text-base sm:text-lg tracking-wide flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                  : 'text-[#E6D7C3] hover:bg-white/10'
              }`}
            >
              <LayoutDashboard className="w-5 h-5 shrink-0 stroke-[2.2]" />
              <span>館藏總覽</span>
            </button>

            <button
              onClick={() => setActiveTab('screening')}
              className={`px-3.5 py-2 rounded-lg font-bold font-serif-tc text-base sm:text-lg tracking-wide flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                activeTab === 'screening'
                  ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                  : 'text-[#E6D7C3] hover:bg-white/10'
              }`}
            >
              <Radio className="w-5 h-5 shrink-0 stroke-[2.2]" />
              <span>放映室</span>
            </button>

            {!isGuest && (
              <>
                <button
                  onClick={() => {
                    setEditingAudioItem(null);
                    setActiveTab('library');
                  }}
                  className={`px-3.5 py-2 rounded-lg font-bold font-serif-tc text-base sm:text-lg tracking-wide flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'library'
                      ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                      : 'text-[#E6D7C3] hover:bg-white/10'
                  }`}
                >
                  <FolderKanban className="w-5 h-5 shrink-0 stroke-[2.2]" />
                  <span>語音檔案庫</span>
                </button>

                <button
                  onClick={() => setActiveTab('catalog')}
                  className={`px-3.5 py-2 rounded-lg font-bold font-serif-tc text-base sm:text-lg tracking-wide flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'catalog'
                      ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                      : 'text-[#E6D7C3] hover:bg-white/10'
                  }`}
                >
                  <Tags className="w-5 h-5 shrink-0 stroke-[2.2]" />
                  <span>館藏資料管理</span>
                </button>
              </>
            )}
          </nav>

          {/* 系統管理、登入人員與登出按鈕（靠左對齊，系統管理位於登入人員左方） */}
          <div className="flex flex-wrap items-center justify-start gap-2 sm:gap-2.5">
            {/* 系統管理按鈕（位於登入人員的左方，限管理員） */}
            {isAdmin && (
              <button
                onClick={() => {
                  setSystemInitialSubTab('accounts');
                  setActiveTab('system');
                }}
                className={`px-3.5 py-2 rounded-xl border font-bold font-serif-tc text-base sm:text-lg flex items-center gap-2 transition cursor-pointer shadow-xs whitespace-nowrap ${
                  activeTab === 'system'
                    ? 'bg-[#D4A373] text-[#261A13] border-[#E6C594] shadow-sm'
                    : 'bg-amber-600/30 hover:bg-amber-600/40 border-amber-500/40 text-amber-200'
                }`}
                title="系統管理（帳號管理、系統登入畫面維護、雲端連線）"
              >
                <Shield
                  className={`w-5 h-5 shrink-0 ${
                    activeTab === 'system' ? 'text-[#261A13]' : 'text-amber-400'
                  }`}
                />
                <span>系統管理</span>
              </button>
            )}

            {/* 使用者身分徽章（登入人員） */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/40 border border-[#4A3427] text-base sm:text-lg font-serif-tc whitespace-nowrap">
              {isAdmin ? (
                <>
                  <Shield className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="text-amber-200 font-bold">管理者 ({currentUser.username})</span>
                </>
              ) : isGuest ? (
                <>
                  <Compass className="w-5 h-5 text-amber-300 shrink-0" />
                  <span className="text-[#E6D7C3] font-bold">訪客模式</span>
                </>
              ) : (
                <>
                  <UserIcon className="w-5 h-5 text-stone-300 shrink-0" />
                  <span className="text-[#E6D7C3] font-bold truncate max-w-[140px]">
                    {currentUser.displayName || currentUser.username}
                  </span>
                </>
              )}
            </div>

            {/* 登出按鈕 */}
            <button
              onClick={() => {
                logout();
                setCurrentUser(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-base sm:text-lg font-bold font-serif-tc text-red-200 flex items-center gap-2 transition cursor-pointer whitespace-nowrap"
              title="登出系統"
            >
              <LogOut className="w-5 h-5 text-red-400 shrink-0" />
              <span>登出</span>
            </button>
          </div>
        </div>
      </header>

      {/* 平板與手機版頂部次導覽列 */}
      <div className="lg:hidden bg-[#332219] text-[#FAF5EC] px-2 sm:px-3 py-2 flex items-center justify-around gap-1.5 border-b border-[#4A3427]">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 px-1 rounded-lg text-sm sm:text-base font-bold font-serif-tc tracking-wider flex items-center justify-center gap-1.5 transition ${
            activeTab === 'dashboard' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
          }`}
        >
          <LayoutDashboard className="w-4.5 h-4.5 shrink-0 stroke-[2.2]" />
          <span>總覽</span>
        </button>
        <button
          onClick={() => setActiveTab('screening')}
          className={`flex-1 py-2 px-1 rounded-lg text-sm sm:text-base font-bold font-serif-tc tracking-wider flex items-center justify-center gap-1.5 transition ${
            activeTab === 'screening' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
          }`}
        >
          <Radio className="w-4.5 h-4.5 shrink-0 stroke-[2.2]" />
          <span>放映室</span>
        </button>
        {!isGuest && (
          <>
            <button
              onClick={() => {
                setEditingAudioItem(null);
                setActiveTab('library');
              }}
              className={`flex-1 py-2 px-1 rounded-lg text-sm sm:text-base font-bold font-serif-tc tracking-wider flex items-center justify-center gap-1.5 transition ${
                activeTab === 'library' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
              }`}
            >
              <FolderKanban className="w-4.5 h-4.5 shrink-0 stroke-[2.2]" />
              <span>語音檔案庫</span>
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex-1 py-2 px-1 rounded-lg text-sm sm:text-base font-bold font-serif-tc tracking-wider flex items-center justify-center gap-1.5 transition ${
                activeTab === 'catalog' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
              }`}
            >
              <Tags className="w-4.5 h-4.5 shrink-0 stroke-[2.2]" />
              <span>館藏管理</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab('system')}
                className={`flex-1 py-2 px-1 rounded-lg text-sm sm:text-base font-bold font-serif-tc tracking-wider flex items-center justify-center gap-1.5 transition ${
                  activeTab === 'system' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
                }`}
              >
                <Shield className="w-4.5 h-4.5 shrink-0 stroke-[2.2]" />
                <span>系統管理</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* 主內容區 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            categories={visibleCategoriesForUser}
            audioItems={visibleAudioItemsForUser}
            dataSource={dataSource}
            driveConnected={driveConnected}
            isGuest={isGuest}
            onSelectForPlayback={(item) => {
              setActiveAudioForPlayback(item);
              setScreeningInitialPlaylistIds([]);
              setScreeningInitialAutoPlay(true);
              setScreeningCategoryFilter(item.categoryId || 'all');
              setActiveTab('screening');
            }}
            onSelectForEdit={(item) => {
              setEditingAudioItem(item);
              setActiveTab('library');
            }}
            onNavigateToUpload={(catId) => {
              setDefaultUploadCategoryId(catId);
              setEditingAudioItem(null);
              setActiveTab('library');
            }}
            onNavigateToScreeningCategory={(catId) => {
              setScreeningCategoryFilter(catId);
              const firstInCat = visibleAudioItemsForUser.find((a) => a.categoryId === catId);
              if (firstInCat) setActiveAudioForPlayback(firstInCat);
              setActiveTab('screening');
            }}
            onStartShufflePlayback={handleStartShufflePlayback}
            onStartPlaylistPlayback={handleStartPlaylistPlayback}
            onAddCategory={handleAddCategory}
            onOpenCloudSettings={() => {
              if (isAdmin) {
                setSystemInitialSubTab('cloud');
                setActiveTab('system');
              } else {
                setIsCloudModalOpen(true);
              }
            }}
          />
        )}

        {activeTab === 'screening' && (
          <ScreeningRoomView
            categories={visibleCategoriesForUser}
            audioItems={visibleAudioItemsForUser}
            activeAudio={activeAudioForPlayback}
            initialCategoryFilter={screeningCategoryFilter}
            initialPlaylistIds={screeningInitialPlaylistIds}
            initialAutoPlay={screeningInitialAutoPlay}
            isGuest={isGuest}
            onClearInitialPlaylist={() => {
              setScreeningInitialPlaylistIds([]);
              setScreeningInitialAutoPlay(false);
            }}
            onSelectAudio={(item) => setActiveAudioForPlayback(item)}
            onEditAudio={(item) => {
              setEditingAudioItem(item);
              setActiveTab('library');
            }}
            onSaveAudioItem={handleSaveAudioItem}
          />
        )}

        {activeTab === 'library' && !isGuest && (
          <AudioLibraryView
            categories={categories}
            audioItems={audioItems}
            editingItem={editingAudioItem}
            defaultUploadCategoryId={defaultUploadCategoryId}
            onSaveAudioItem={handleSaveAudioItem}
            onDeleteAudioItem={handleDeleteAudioItem}
            onPlayInScreeningRoom={(item) => {
              setActiveAudioForPlayback(item);
              setScreeningInitialPlaylistIds([]);
              setScreeningInitialAutoPlay(true);
              setScreeningCategoryFilter(item.categoryId || 'all');
              setActiveTab('screening');
            }}
            onClearEditing={() => setEditingAudioItem(null)}
          />
        )}

        {activeTab === 'catalog' && !isGuest && (
          <CatalogManagementView
            categories={categories}
            audioItems={audioItems}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onReorderCategories={handleReorderCategories}
            onDeleteCategory={handleDeleteCategory}
            onSaveAudioItem={handleSaveAudioItem}
            onBatchMoveAudioCategory={handleBatchMoveAudioCategory}
            onRemoveTagFromAllAudioItems={handleRemoveTagFromAllAudioItems}
            onPlayInScreeningRoom={(item) => {
              setActiveAudioForPlayback(item);
              setScreeningInitialPlaylistIds([]);
              setScreeningInitialAutoPlay(true);
              setScreeningCategoryFilter(item.categoryId || 'all');
              setActiveTab('screening');
            }}
            onEditInAudioLibrary={(item) => {
              setEditingAudioItem(item);
              setActiveTab('library');
            }}
          />
        )}

        {activeTab === 'system' && isAdmin && (
          <SystemManagementView
            currentUserId={currentUser.id}
            loginConfig={loginScreenConfig}
            onUpdateLoginConfig={setLoginScreenConfig}
            onCloudSaved={reloadAllData}
            initialSubTab={systemInitialSubTab}
          />
        )}
      </main>

      {/* 頁尾資訊 */}
      <footer className="bg-[#261A13] text-[#C8B5A0] border-t border-[#4A3427] py-5 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Library className="w-4 h-4 text-[#D4A373]" />
            <span className="font-serif-tc font-semibold text-[#FAF5EC]">
              聲書閣 SoundBook Pavilion
            </span>
            <span>— 數位有聲圖書館典藏系統</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1">
              <Github className="w-3.5 h-3.5 text-[#D4A373]" />
              GitHub: <code>soundbook-library</code>
            </span>
            <span className="flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-[#D4A373]" />
              Firebase: <code>soundbook-library-db</code>
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-[#D4A373]" />
              Storage: <code>Google Drive Cloud</code>
            </span>
          </div>
        </div>
      </footer>

      {/* 雲端設定精靈 Modal */}
      <CloudSettingsModal
        isOpen={isCloudModalOpen}
        onClose={() => setIsCloudModalOpen(false)}
        onSaved={reloadAllData}
      />
    </div>
  );
}

export default App;
