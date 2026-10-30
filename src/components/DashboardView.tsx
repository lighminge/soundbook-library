import React, { useState } from 'react';
import {
  BookOpen,
  Landmark,
  Compass,
  Feather,
  Music,
  Globe,
  Mic,
  Headphones,
  Sparkles,
  Heart,
  Star,
  Award,
  Scroll,
  GraduationCap,
  Palette,
  Film,
  Coffee,
  Sun,
  Moon,
  Trees,
  Book,
  Bookmark,
  Crown,
  Gem,
  Flame,
  Cloud,
  Umbrella,
  Anchor,
  Ship,
  Plane,
  Train,
  Car,
  Bike,
  Camera,
  Video,
  Radio,
  Tv,
  Speaker,
  Bell,
  Gift,
  Key,
  Lock,
  Shield,
  Trophy,
  Flag,
  Map,
  Navigation,
  Mountain,
  Flower2,
  Leaf,
  Play,
  Edit3,
  Plus,
  Library,
  Clock,
  HardDrive,
  Database,
  FolderPlus,
  ChevronRight,
} from 'lucide-react';
import { AudioItem, Category } from '../types';

export const THEME_COLOR_OPTIONS = [
  { label: '1. 古銅胡桃棕 (#8B5A2B)', value: '#8B5A2B' },
  { label: '2. 典藏松針綠 (#2E5A44)', value: '#2E5A44' },
  { label: '3. 深海學院藍 (#2B4C7E)', value: '#2B4C7E' },
  { label: '4. 胭脂紫檀紅 (#7A3E65)', value: '#7A3E65' },
  { label: '5. 琥珀焦糖金 (#B46528)', value: '#B46528' },
  { label: '6. 沉穩石墨灰 (#3E4C59)', value: '#3E4C59' },
  { label: '7. 緋紅硃砂印 (#9E2A2B)', value: '#9E2A2B' },
  { label: '8. 翡翠青瓷綠 (#2A6F68)', value: '#2A6F68' },
  { label: '9. 皇家靛青藍 (#3B3561)', value: '#3B3561' },
  { label: '10. 栗木深褐紅 (#6F3B2A)', value: '#6F3B2A' },
  { label: '11. 橄欖苔原綠 (#556B2F)', value: '#556B2F' },
  { label: '12. 暮光紫羅蘭 (#5E3A73)', value: '#5E3A73' },
  { label: '13. 復古磚窯橘 (#B85D3B)', value: '#B85D3B' },
  { label: '14. 孔雀藍綠釉 (#1F618D)', value: '#1F618D' },
  { label: '15. 玫瑰暗酒紅 (#802F48)', value: '#802F48' },
  { label: '16. 暖砂駝絨棕 (#9A7B4F)', value: '#9A7B4F' },
  { label: '17. 森林冷杉綠 (#1E4631)', value: '#1E4631' },
  { label: '18. 午夜星空藍 (#1B263B)', value: '#1B263B' },
  { label: '19. 赭石陶土橘 (#A44A3F)', value: '#A44A3F' },
  { label: '20. 黑檀墨玉色 (#3A2518)', value: '#3A2518' },
  { label: '21. 勃艮第酒紅 (#722F37)', value: '#722F37' },
  { label: '22. 普魯士深藍 (#003153)', value: '#003153' },
  { label: '23. 帝王祖母綠 (#046307)', value: '#046307' },
  { label: '24. 拜占庭皇紫 (#702963)', value: '#702963' },
  { label: '25. 蜜蠟琥珀黃 (#C68B2C)', value: '#C68B2C' },
  { label: '26. 鐵鏽赤銅紅 (#8B3103)', value: '#8B3103' },
  { label: '27. 鼠尾草灰綠 (#4F6D5A)', value: '#4F6D5A' },
  { label: '28. 牛津學院藍 (#14213D)', value: '#14213D' },
  { label: '29. 丁香煙燻紫 (#6D597A)', value: '#6D597A' },
  { label: '30. 珊瑚暖茜紅 (#B56576)', value: '#B56576' },
  { label: '31. 焦糖瑪奇朵 (#7F4F24)', value: '#7F4F24' },
  { label: '32. 摩卡咖啡褐 (#582F0E)', value: '#582F0E' },
  { label: '33. 迷迭香深綠 (#333D29)', value: '#333D29' },
  { label: '34. 柏樹青苔綠 (#414833)', value: '#414833' },
  { label: '35. 愛琴海湛藍 (#1D4E89)', value: '#1D4E89' },
  { label: '36. 冰河鋼鐵藍 (#3D5A80)', value: '#3D5A80' },
  { label: '37. 丹霞赤岩紅 (#9B2226)', value: '#9B2226' },
  { label: '38. 金秋楓葉橘 (#BB3E03)', value: '#BB3E03' },
  { label: '39. 桂花薑黃色 (#CA6702)', value: '#CA6702' },
  { label: '40. 碧波松石綠 (#0A9396)', value: '#0A9396' },
  { label: '41. 墨池深海青 (#005F73)', value: '#005F73' },
  { label: '42. 桑椹漿果紫 (#5A189A)', value: '#5A189A' },
  { label: '43. 鳶尾花藍紫 (#3C096C)', value: '#3C096C' },
  { label: '44. 櫻桃木深紅 (#641220)', value: '#641220' },
  { label: '45. 玫瑰木棕紅 (#85182A)', value: '#85182A' },
  { label: '46. 檀香金棕色 (#99582A)', value: '#99582A' },
  { label: '47. 亞麻古董褐 (#6C584C)', value: '#6C584C' },
  { label: '48. 鉛錫典藏灰 (#4A4E69)', value: '#4A4E69' },
  { label: '49. 玄武岩深灰 (#2B2D42)', value: '#2B2D42' },
  { label: '50. 曜石黑金棕 (#261A13)', value: '#261A13' },
];

export const ICON_OPTIONS = [
  { label: '1. 書籍典藏 (BookOpen)', value: 'BookOpen' },
  { label: '2. 歷史殿堂 (Landmark)', value: 'Landmark' },
  { label: '3. 探索羅盤 (Compass)', value: 'Compass' },
  { label: '4. 文學羽毛筆 (Feather)', value: 'Feather' },
  { label: '5. 音樂旋律 (Music)', value: 'Music' },
  { label: '6. 世界寰宇 (Globe)', value: 'Globe' },
  { label: '7. 語音麥克風 (Mic)', value: 'Mic' },
  { label: '8. 聆聽耳機 (Headphones)', value: 'Headphones' },
  { label: '9. 靈感星光 (Sparkles)', value: 'Sparkles' },
  { label: '10. 溫馨愛心 (Heart)', value: 'Heart' },
  { label: '11. 精選星標 (Star)', value: 'Star' },
  { label: '12. 榮譽獎章 (Award)', value: 'Award' },
  { label: '13. 古典卷軸 (Scroll)', value: 'Scroll' },
  { label: '14. 學術教育 (GraduationCap)', value: 'GraduationCap' },
  { label: '15. 藝術調色盤 (Palette)', value: 'Palette' },
  { label: '16. 影像劇院 (Film)', value: 'Film' },
  { label: '17. 午後咖啡 (Coffee)', value: 'Coffee' },
  { label: '18. 晨光暖陽 (Sun)', value: 'Sun' },
  { label: '19. 夜讀月光 (Moon)', value: 'Moon' },
  { label: '20. 自然山林 (Trees)', value: 'Trees' },
  { label: '21. 精裝書冊 (Book)', value: 'Book' },
  { label: '22. 典藏書籤 (Bookmark)', value: 'Bookmark' },
  { label: '23. 皇家王冠 (Crown)', value: 'Crown' },
  { label: '24. 璀璨寶石 (Gem)', value: 'Gem' },
  { label: '25. 熱情火炬 (Flame)', value: 'Flame' },
  { label: '26. 雲端漫遊 (Cloud)', value: 'Cloud' },
  { label: '27. 雨天故事 (Umbrella)', value: 'Umbrella' },
  { label: '28. 航海船錨 (Anchor)', value: 'Anchor' },
  { label: '29. 遠洋帆船 (Ship)', value: 'Ship' },
  { label: '30. 環球飛行 (Plane)', value: 'Plane' },
  { label: '31. 鐵道列車 (Train)', value: 'Train' },
  { label: '32. 公路旅行 (Car)', value: 'Car' },
  { label: '33. 單車漫遊 (Bike)', value: 'Bike' },
  { label: '34. 攝影紀實 (Camera)', value: 'Camera' },
  { label: '35. 影音錄像 (Video)', value: 'Video' },
  { label: '36. 廣播電台 (Radio)', value: 'Radio' },
  { label: '37. 電視頻道 (Tv)', value: 'Tv' },
  { label: '38. 音響劇院 (Speaker)', value: 'Speaker' },
  { label: '39. 館藏鐘聲 (Bell)', value: 'Bell' },
  { label: '40. 驚喜禮盒 (Gift)', value: 'Gift' },
  { label: '41. 智慧之鑰 (Key)', value: 'Key' },
  { label: '42. 秘藏封印 (Lock)', value: 'Lock' },
  { label: '43. 守護盾牌 (Shield)', value: 'Shield' },
  { label: '44. 冠軍獎盃 (Trophy)', value: 'Trophy' },
  { label: '45. 領航旗幟 (Flag)', value: 'Flag' },
  { label: '46. 探索地圖 (Map)', value: 'Map' },
  { label: '47. 方向導航 (Navigation)', value: 'Navigation' },
  { label: '48. 壯麗山岳 (Mountain)', value: 'Mountain' },
  { label: '49. 花園綻放 (Flower2)', value: 'Flower2' },
  { label: '50. 綠葉生態 (Leaf)', value: 'Leaf' },
];

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
    case 'Music':
      return <Music className={className} />;
    case 'Globe':
      return <Globe className={className} />;
    case 'Mic':
      return <Mic className={className} />;
    case 'Headphones':
      return <Headphones className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Heart':
      return <Heart className={className} />;
    case 'Star':
      return <Star className={className} />;
    case 'Award':
      return <Award className={className} />;
    case 'Scroll':
      return <Scroll className={className} />;
    case 'GraduationCap':
      return <GraduationCap className={className} />;
    case 'Palette':
      return <Palette className={className} />;
    case 'Film':
      return <Film className={className} />;
    case 'Coffee':
      return <Coffee className={className} />;
    case 'Sun':
      return <Sun className={className} />;
    case 'Moon':
      return <Moon className={className} />;
    case 'Trees':
      return <Trees className={className} />;
    case 'Book':
      return <Book className={className} />;
    case 'Bookmark':
      return <Bookmark className={className} />;
    case 'Crown':
      return <Crown className={className} />;
    case 'Gem':
      return <Gem className={className} />;
    case 'Flame':
      return <Flame className={className} />;
    case 'Cloud':
      return <Cloud className={className} />;
    case 'Umbrella':
      return <Umbrella className={className} />;
    case 'Anchor':
      return <Anchor className={className} />;
    case 'Ship':
      return <Ship className={className} />;
    case 'Plane':
      return <Plane className={className} />;
    case 'Train':
      return <Train className={className} />;
    case 'Car':
      return <Car className={className} />;
    case 'Bike':
      return <Bike className={className} />;
    case 'Camera':
      return <Camera className={className} />;
    case 'Video':
      return <Video className={className} />;
    case 'Radio':
      return <Radio className={className} />;
    case 'Tv':
      return <Tv className={className} />;
    case 'Speaker':
      return <Speaker className={className} />;
    case 'Bell':
      return <Bell className={className} />;
    case 'Gift':
      return <Gift className={className} />;
    case 'Key':
      return <Key className={className} />;
    case 'Lock':
      return <Lock className={className} />;
    case 'Shield':
      return <Shield className={className} />;
    case 'Trophy':
      return <Trophy className={className} />;
    case 'Flag':
      return <Flag className={className} />;
    case 'Map':
      return <Map className={className} />;
    case 'Navigation':
      return <Navigation className={className} />;
    case 'Mountain':
      return <Mountain className={className} />;
    case 'Flower2':
      return <Flower2 className={className} />;
    case 'Leaf':
      return <Leaf className={className} />;
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    代表色系 (共 20 色)
                  </label>
                  <select
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-medium focus:outline-none focus:border-[#8B5A2B]"
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
                    館廳圖示 (共 20 款)
                  </label>
                  <select
                    value={newCatIcon}
                    onChange={(e) => setNewCatIcon(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#D5C5AE] bg-white text-xs font-medium focus:outline-none focus:border-[#8B5A2B]"
                  >
                    {ICON_OPTIONS.map((ic) => (
                      <option key={ic.value} value={ic.value}>
                        {ic.label}
                      </option>
                    ))}
                  </select>
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
