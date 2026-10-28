import React, { useEffect, useState } from 'react';
import {
  Library,
  LayoutDashboard,
  Radio,
  FolderKanban,
  Settings,
  Github,
  Database,
  HardDrive,
} from 'lucide-react';
import { AudioItem, Category } from './types';
import {
  isGoogleDriveConfigured,
  loadLibraryData,
  removeAudioItem,
  saveAudioItem,
  saveCategoryItem,
} from './services/storageService';
import { DashboardView } from './components/DashboardView';
import { ScreeningRoomView } from './components/ScreeningRoomView';
import { AudioLibraryView } from './components/AudioLibraryView';
import { CloudSettingsModal } from './components/CloudSettingsModal';

type NavTab = 'dashboard' | 'screening' | 'library';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [categories, setCategories] = useState<Category[]>([]);
  const [audioItems, setAudioItems] = useState<AudioItem[]>([]);
  const [dataSource, setDataSource] = useState<'firebase' | 'local'>('local');
  const [driveConnected, setDriveConnected] = useState<boolean>(false);

  // 放映室目前選取播放的語音檔與分類篩選
  const [activeAudioForPlayback, setActiveAudioForPlayback] = useState<AudioItem | null>(null);
  const [screeningCategoryFilter, setScreeningCategoryFilter] = useState<string>('all');

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
    if (!activeAudioForPlayback && res.audioItems.length > 0) {
      setActiveAudioForPlayback(res.audioItems[0]);
    }
  };

  useEffect(() => {
    reloadAllData();
  }, []);

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

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F1E7] text-[#2C221E]">
      {/* 頂部圖書館導覽列 */}
      <header className="sticky top-0 z-40 bg-[#261A13] text-[#FAF5EC] border-b border-[#4A3427] shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* 左側品牌標誌 */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4A373] to-[#8B5A2B] flex items-center justify-center text-[#261A13] shadow-inner">
              <Library className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold font-serif-tc text-lg tracking-wider text-[#FAF5EC]">
                  聲書閣
                </span>
                <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-[#8B5A2B]/40 text-[#F3D5B5] border border-[#D4A373]/30 font-mono">
                  soundbook-library
                </span>
              </div>
              <p className="text-[11px] text-[#C8B5A0] hidden sm:block">
                數位有聲圖書館 · Firebase & Google Drive 典藏系統
              </p>
            </div>
          </div>

          {/* 中間主功能切換頁籤 (桌面版) */}
          <nav className="hidden md:flex items-center gap-1.5 bg-[#1B120D] p-1.5 rounded-xl border border-[#3E2C22]">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                  : 'text-[#E6D7C3] hover:bg-white/10'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>1. 館藏總覽 Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('screening')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'screening'
                  ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                  : 'text-[#E6D7C3] hover:bg-white/10'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>2. 放映室 (Screening Room)</span>
            </button>

            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-[#D4A373] text-[#261A13] shadow-sm'
                  : 'text-[#E6D7C3] hover:bg-white/10'
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span>3. 語音檔案庫 (上傳與編輯)</span>
            </button>
          </nav>

          {/* 右側雲端連線設定按鈕 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCloudModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-medium text-[#F3D5B5] flex items-center gap-2 transition cursor-pointer"
              title="設定 Firebase (soundbook-library-db) 與 Google 雲端硬碟"
            >
              <Settings className="w-4 h-4 text-[#D4A373]" />
              <span className="hidden sm:inline">雲端連線設定</span>
            </button>
          </div>
        </div>
      </header>

      {/* 手機版頂部次導覽列 */}
      <div className="md:hidden bg-[#332219] text-[#FAF5EC] px-3 py-2 flex items-center justify-around gap-1 border-b border-[#4A3427]">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            activeTab === 'dashboard' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>總覽</span>
        </button>
        <button
          onClick={() => setActiveTab('screening')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            activeTab === 'screening' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>放映室</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            activeTab === 'library' ? 'bg-[#D4A373] text-[#261A13]' : 'text-[#E6D7C3]'
          }`}
        >
          <FolderKanban className="w-3.5 h-3.5" />
          <span>語音檔案庫</span>
        </button>
      </div>

      {/* 主內容區 */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            categories={categories}
            audioItems={audioItems}
            dataSource={dataSource}
            driveConnected={driveConnected}
            onSelectForPlayback={(item) => {
              setActiveAudioForPlayback(item);
              setScreeningCategoryFilter('all');
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
              const firstInCat = audioItems.find((a) => a.categoryId === catId);
              if (firstInCat) setActiveAudioForPlayback(firstInCat);
              setActiveTab('screening');
            }}
            onAddCategory={handleAddCategory}
            onOpenCloudSettings={() => setIsCloudModalOpen(true)}
          />
        )}

        {activeTab === 'screening' && (
          <ScreeningRoomView
            categories={categories}
            audioItems={audioItems}
            activeAudio={activeAudioForPlayback}
            initialCategoryFilter={screeningCategoryFilter}
            onSelectAudio={(item) => setActiveAudioForPlayback(item)}
            onEditAudio={(item) => {
              setEditingAudioItem(item);
              setActiveTab('library');
            }}
          />
        )}

        {activeTab === 'library' && (
          <AudioLibraryView
            categories={categories}
            audioItems={audioItems}
            editingItem={editingAudioItem}
            defaultUploadCategoryId={defaultUploadCategoryId}
            onSaveAudioItem={handleSaveAudioItem}
            onDeleteAudioItem={handleDeleteAudioItem}
            onPlayInScreeningRoom={(item) => {
              setActiveAudioForPlayback(item);
              setActiveTab('screening');
            }}
            onClearEditing={() => setEditingAudioItem(null)}
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
