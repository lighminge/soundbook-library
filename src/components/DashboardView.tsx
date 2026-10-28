import React, { useState } from 'react';
import {
  BookOpen,
  Landmark,
  Compass,
  Feather,
  Play,
  Edit3,
  Plus,
  Library,
  Clock,
  HardDrive,
  Database,
  Sparkles,
  FolderPlus,
  ChevronRight,
  Headphones,
} from 'lucide-react';
import { AudioItem, Category } from '../types';

interface DashboardViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  dataSource: 'firebase' | 'local';
  driveConnected: boolean;
  onSelectForPlayback: (item: AudioItem) => void;
  onSelectForEdit: (item: AudioItem) => void;
  onNavigateToUpload: (defaultCategoryId?: string) => void;
  onNavigateToScreeningCategory: (categoryId: string) => void;
  onAddCategory: (newCat: Omit<Category, 'id' | 'createdAt' | 'order'>) => void;
  onOpenCloudSettings: () => void;
}

export function getCategoryIcon(iconName: string, className = 'w-5 h-5') {
  switch (iconName) {
    case 'Landmark':
      return <Landmark className={className} />;
    case 'Compass':
      return <Compass className={className} />;
    case 'Feather':
      return <Feather className={className} />;
    case 'BookOpen':
    default:
      return <BookOpen className={className} />;
  }
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  categories,
  audioItems,
  dataSource,
  driveConnected,
  onSelectForPlayback,
  onSelectForEdit,
  onNavigateToUpload,
  onNavigateToScreeningCategory,
  onAddCategory,
  onOpenCloudSettings,
}) => {
  const [selectedAisle, setSelectedAisle] = useState<string>('all');
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#8B5A2B');
  const [newCatIcon, setNewCatIcon] = useState('BookOpen');

  const totalDurationSec = audioItems.reduce((acc, item) => acc + (item.duration || 0), 0);
  const totalMinutes = Math.max(1, Math.round(totalDurationSec / 60));

  const visibleCategories =
    selectedAisle === 'all'
      ? categories
      : categories.filter((c) => c.id === selectedAisle);

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    onAddCategory({
      name: newCatName.trim(),
      code: newCatCode.trim() || `CAT-${(categories.length + 1) * 100}`,
      description: newCatDesc.trim() || '自訂有聲書典藏分區',
      themeColor: newCatColor,
      icon: newCatIcon,
    });
    setNewCatName('');
    setNewCatCode('');
    setNewCatDesc('');
    setShowNewCatModal(false);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 圖書館迎賓橫幅 (Hero Banner) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2D1E17] via-[#432C20] to-[#5B3B28] text-[#FAF5EC] p-6 md:p-8 shadow-xl border border-[#724C35]">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8B5A2B]/40 border border-[#D4A373]/40 text-[#F3D5B5] text-xs font-medium tracking-wider">
              <Library className="w-3.5 h-3.5" />
              <span>DIGITAL SOUNDBOOK PAVILION · 數位有聲圖書館</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-bold font-serif-tc tracking-wide">
              聲書閣總覽 Dashboard
            </h1>
            <p className="text-[#E6D7C3] text-sm md:text-base leading-relaxed">
              漫步於分門別類的有聲書架之間。您可以隨時從手機或電腦上傳語音至 Google 雲端硬碟，為每段聲音編纂專屬封面、故事說明與同步放映圖文。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigateToUpload()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4A373] hover:bg-[#E2B485] text-[#2B1B11] font-semibold text-sm shadow-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>上傳新語音館藏</span>
            </button>
            <button
              onClick={() => setShowNewCatModal(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-[#FAF5EC] border border-white/20 text-sm font-medium transition cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>新增館藏分類</span>
            </button>
          </div>
        </div>
      </div>

      {/* 館藏統計指標卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="parchment-card rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#8B5A2B]/15 text-[#8B5A2B] flex items-center justify-center shrink-0">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#7A6855] uppercase tracking-wider">總館藏語音數</p>
            <p className="text-2xl font-bold font-serif-tc text-[#2C221E]">
              {audioItems.length} <span className="text-sm font-normal text-[#7A6855]">部作品</span>
            </p>
          </div>
        </div>

        <div className="parchment-card rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#2E5A44]/15 text-[#2E5A44] flex items-center justify-center shrink-0">
            <Library className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#7A6855] uppercase tracking-wider">圖書館主題分區</p>
            <p className="text-2xl font-bold font-serif-tc text-[#2C221E]">
              {categories.length} <span className="text-sm font-normal text-[#7A6855]">個廳館</span>
            </p>
          </div>
        </div>

        <div className="parchment-card rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#2B4C7E]/15 text-[#2B4C7E] flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-[#7A6855] uppercase tracking-wider">典藏總播放時長</p>
            <p className="text-2xl font-bold font-serif-tc text-[#2C221E]">
              {totalMinutes} <span className="text-sm font-normal text-[#7A6855]">分鐘 ({formatDuration(totalDurationSec)})</span>
            </p>
          </div>
        </div>

        <div
          onClick={onOpenCloudSettings}
          className="parchment-card rounded-xl p-5 shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-[#8B5A2B] transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#7A3E65]/15 text-[#7A3E65] flex items-center justify-center shrink-0">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-[#7A6855]">Firebase & Google 雲端硬碟</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                    dataSource === 'firebase'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <Database className="w-3 h-3" />
                  {dataSource === 'firebase' ? 'Firebase 已連線' : '本地展示/待填金鑰'}
                </span>
                {driveConnected && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    Drive 已連結
                  </span>
                )}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#8B5A2B] shrink-0" />
        </div>
      </div>

      {/* 圖書館分區導覽索引 (Category Hall Selector) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold font-serif-tc text-[#2C221E] flex items-center gap-2">
              <span>館藏主題分區導覽</span>
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[#E5D9C5] text-[#5C3A1B]">
                依圖書館索書號排列
              </span>
            </h2>
            <p className="text-xs text-[#7A6855]">
              點擊下方分類標籤可快速篩選特定展廳，或直接點選書架上的有聲書進入「放映室」播放。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedAisle('all')}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition shrink-0 cursor-pointer flex items-center gap-2 ${
              selectedAisle === 'all'
                ? 'bg-[#3A2518] text-[#FAF5EC] shadow-md'
                : 'bg-[#EFE6D5] text-[#5C3A1B] hover:bg-[#E4D6BE]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>全館展廳總覽 ({audioItems.length})</span>
          </button>

          {categories.map((cat) => {
            const count = audioItems.filter((item) => item.categoryId === cat.id).length;
            const isSelected = selectedAisle === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedAisle(cat.id)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition shrink-0 cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? 'text-white shadow-md border-transparent'
                    : 'bg-[#FFFDF9] text-[#3A2518] border-[#E2D5C1] hover:border-[#8B5A2B]'
                }`}
                style={isSelected ? { backgroundColor: cat.themeColor } : undefined}
              >
                {getCategoryIcon(cat.icon, 'w-4 h-4')}
                <span>{cat.name}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-md ${
                    isSelected ? 'bg-black/25 text-white' : 'bg-[#F2E9D8] text-[#6E5641]'
                  }`}
                >
                  {cat.code} · {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 各分類圖書館木質書架展示區 */}
      <div className="space-y-10">
        {visibleCategories.map((category) => {
          const itemsInCat = audioItems.filter((item) => item.categoryId === category.id);

          return (
            <section
              key={category.id}
              className="rounded-2xl overflow-hidden border border-[#DECGB4] bg-[#FDFBF7] shadow-md"
            >
              {/* 分類廳館木牌標頭 */}
              <div
                className="p-5 md:px-7 flex flex-col md:flex-row md:items-center justify-between gap-4 text-white"
                style={{
                  background: `linear-gradient(135deg, ${category.themeColor} 0%, #2B1B11 100%)`,
                }}
              >
                <div className="flex items-start md:items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25 shrink-0">
                    {getCategoryIcon(category.icon, 'w-6 h-6 text-white')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-0.5 rounded bg-black/30 text-xs font-mono tracking-wider text-amber-200 border border-amber-200/30">
                        索書號 {category.code}
                      </span>
                      <h3 className="text-xl font-bold font-serif-tc tracking-wide">
                        {category.name}
                      </h3>
                    </div>
                    <p className="text-xs md:text-sm text-white/85 mt-1">{category.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end md:self-center">
                  <button
                    onClick={() => onNavigateToScreeningCategory(category.id)}
                    className="px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium flex items-center gap-1.5 backdrop-blur-sm transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>進入本廳放映室</span>
                  </button>
                  <button
                    onClick={() => onNavigateToUpload(category.id)}
                    className="px-3.5 py-2 rounded-lg bg-[#FAF5EC] hover:bg-white text-[#2B1B11] text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>在此分類上傳語音</span>
                  </button>
                </div>
              </div>

              {/* 書架展示層 */}
              <div className="p-6 pb-4 bg-gradient-to-b from-[#F8F3E8] to-[#EFE6D5]">
                {itemsInCat.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-[#D5C5AE] rounded-xl bg-[#FAF6EE]">
                    <p className="text-[#7A6855] text-sm mb-3">
                      「{category.name}」書架目前尚無語音館藏
                    </p>
                    <button
                      onClick={() => onNavigateToUpload(category.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#8B5A2B] text-white text-xs font-medium hover:bg-[#70461F] transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>立即上傳第一部語音檔</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {itemsInCat.map((item, idx) => (
                      <div
                        key={item.id}
                        className="group relative flex flex-col rounded-r-xl rounded-l-md bg-[#FFFDF9] book-spine-effect overflow-hidden border border-[#DFD2BE] hover:-translate-y-1.5 transition-all duration-200"
                      >
                        {/* 左側精裝書背裝飾條 */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-3 z-10"
                          style={{ backgroundColor: category.themeColor }}
                        />

                        {/* 封面圖與快速播放按鈕 */}
                        <div className="relative h-44 w-full pl-3 overflow-hidden bg-[#2C221E]">
                          <img
                            src={item.coverImageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                          {/* 索書號標籤 */}
                          <span className="absolute top-2.5 left-5 px-2 py-0.5 rounded bg-black/65 text-[#F6E6D2] font-mono text-[11px] backdrop-blur-xs">
                            {category.code}-{String(idx + 1).padStart(2, '0')}
                          </span>

                          {/* 時長與插圖數量 */}
                          <div className="absolute bottom-2.5 left-5 right-3 flex items-center justify-between text-white text-xs">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs">
                              <Clock className="w-3 h-3 text-amber-300" />
                              {formatDuration(item.duration)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-black/60 text-[11px] text-amber-200">
                              {item.playbackDisplay.slides.length} 張展演圖
                            </span>
                          </div>
                        </div>

                        {/* 書籍資訊內容 */}
                        <div className="flex-1 p-4 pl-5 flex flex-col justify-between space-y-3">
                          <div>
                            <h4 className="font-bold font-serif-tc text-base text-[#2C221E] line-clamp-1 group-hover:text-[#8B5A2B] transition-colors">
                              {item.title}
                            </h4>
                            <p className="text-xs text-[#6E5D4F] mt-1.5 line-clamp-2 leading-relaxed">
                              {item.description || '尚無館藏說明'}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-[#EFE6D5] flex items-center justify-between gap-2">
                            <button
                              onClick={() => onSelectForPlayback(item)}
                              className="flex-1 py-2 px-3 rounded-lg bg-[#3A2518] hover:bg-[#593824] text-[#FAF5EC] text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>放映室播放</span>
                            </button>
                            <button
                              onClick={() => onSelectForEdit(item)}
                              title="編輯語音檔、封面與播放圖文"
                              className="p-2 rounded-lg border border-[#DCCB88] bg-[#FAF4E8] hover:bg-[#EFE2C8] text-[#5C3A1B] transition cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 實體木質書架底座橫樑視覺 */}
              <div className="h-4 wood-shelf" />
            </section>
          );
        })}
      </div>

      {/* 新增館藏分類 Modal */}
      {showNewCatModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-[#DECGB4] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#EFE6D5] pb-3">
              <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                新增圖書館主題分類廳
              </h3>
              <button
                onClick={() => setShowNewCatModal(false)}
                className="text-sm text-[#7A6855] hover:text-[#2C221E] cursor-pointer"
              >
                關閉
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  分類廳館名稱 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：外語學習廳、兒童床邊故事館"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-sm focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    圖書館索書號代碼
                  </label>
                  <input
                    type="text"
                    placeholder="例如：LAN-500"
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-sm font-mono focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    代表主題色
                  </label>
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#D5C5AE] bg-white p-1 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  代表圖示
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['BookOpen', 'Landmark', 'Compass', 'Feather'] as const).map((ic) => (
                    <button
                      type="button"
                      key={ic}
                      onClick={() => setNewCatIcon(ic)}
                      className={`py-2 rounded-lg border flex flex-col items-center gap-1 text-xs cursor-pointer ${
                        newCatIcon === ic
                          ? 'border-[#8B5A2B] bg-[#8B5A2B]/10 text-[#8B5A2B] font-semibold'
                          : 'border-[#E2D5C1] text-[#6E5D4F]'
                      }`}
                    >
                      {getCategoryIcon(ic, 'w-4 h-4')}
                      <span>{ic}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                  分類簡介說明
                </label>
                <textarea
                  rows={2}
                  placeholder="簡述此館藏分類收錄的語音內容..."
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-[#D5C5AE] bg-white text-sm focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCatModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold cursor-pointer"
                >
                  建立分類廳館
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
