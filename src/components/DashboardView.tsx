import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Library,
  BookMarked,
  NotebookPen,
  FileText,
  FileAudio,
  Disc,
  Volume2,
  Podcast,
  Theater,
  Clapperboard,
  Brush,
  PenTool,
  Wand2,
  Lightbulb,
  Brain,
  Atom,
  Microscope,
  Telescope,
  Rocket,
  Orbit,
  Sunrise,
  Sunset,
  Rainbow,
  Snowflake,
  Wind,
  Waves,
  Droplets,
  Sprout,
  TreePine,
  Bird,
  Fish,
  Cat,
  Dog,
  Rabbit,
  Squirrel,
  Turtle,
  Bug,
  Shell,
  Castle,
  Church,
  Building2,
  Home,
  Tent,
  Compass as CompassIcon,
  Hourglass,
  Watch,
  Calendar,
  Mail,
  Send,
  MessageCircle,
  Smile,
  ThumbsUp,
  Handshake,
  Users,
  Sparkle,
  Medal,
  Target,
  Puzzle,
  Gamepad2,
  Play,
  Edit3,
  Plus,
  Clock,
  HardDrive,
  Database,
  FolderPlus,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Tag,
  ChevronDown,
  ChevronUp,
  Layers,
  Shuffle,
  User,
  CheckSquare,
  Square,
  ListMusic,
  Check,
  Share2,
  Copy,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import { AudioItem, Category } from '../types';
import { getAudioItemCallNumberMap } from '../utils/audioFileUtils';

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
  { label: '51. 紫禁城宮牆紅 (#8C1D40)', value: '#8C1D40' },
  { label: '52. 敦煌飛天赭 (#A64B2A)', value: '#A64B2A' },
  { label: '53. 龍泉青瓷釉 (#3B7A57)', value: '#3B7A57' },
  { label: '54. 景泰藍寶色 (#0F4C81)', value: '#0F4C81' },
  { label: '55. 宣紙古墨灰 (#36454F)', value: '#36454F' },
  { label: '56. 沉香木琥珀 (#7B4B27)', value: '#7B4B27' },
  { label: '57. 楠木金絲棕 (#8D5B4C)', value: '#8D5B4C' },
  { label: '58. 碧玉翡翠綠 (#1B4D3E)', value: '#1B4D3E' },
  { label: '59. 琉璃瓦琉金 (#B37D14)', value: '#B37D14' },
  { label: '60. 藏青唐卡藍 (#192A56)', value: '#192A56' },
  { label: '61. 胭脂海棠紅 (#9E364A)', value: '#9E364A' },
  { label: '62. 蘇木古韻紫 (#6C3483)', value: '#6C3483' },
  { label: '63. 竹林幽篁綠 (#2D6A4F)', value: '#2D6A4F' },
  { label: '64. 遠山黛青色 (#34495E)', value: '#34495E' },
  { label: '65. 秋菊流金銅 (#B7791F)', value: '#B7791F' },
  { label: '66. 落日餘暉橘 (#C05621)', value: '#C05621' },
  { label: '67. 紅檜原木褐 (#744210)', value: '#744210' },
  { label: '68. 錫蘭紅茶棕 (#8C3820)', value: '#8C3820' },
  { label: '69. 大吉嶺茶褐 (#6E2C00)', value: '#6E2C00' },
  { label: '70. 抹茶宇治綠 (#3F6212)', value: '#3F6212' },
  { label: '71. 焙茶溫潤棕 (#5C4033)', value: '#5C4033' },
  { label: '72. 伯爵佛手柑 (#4A5568)', value: '#4A5568' },
  { label: '73. 薰衣草莊園 (#553C9A)', value: '#553C9A' },
  { label: '74. 波爾多醇酒 (#581845)', value: '#581845' },
  { label: '75. 威尼斯暗紅 (#781D1D)', value: '#781D1D' },
  { label: '76. 佛羅倫斯棕 (#6D3B24)', value: '#6D3B24' },
  { label: '77. 劍橋古院綠 (#1A4731)', value: '#1A4731' },
  { label: '78. 溫莎皇室藍 (#1E3A8A)', value: '#1E3A8A' },
  { label: '79. 蘇格蘭格紋綠 (#14532D)', value: '#14532D' },
  { label: '80. 愛爾蘭翡翠 (#065F46)', value: '#065F46' },
  { label: '81. 北歐峽灣藍 (#0C4A6E)', value: '#0C4A6E' },
  { label: '82. 阿爾卑斯松 (#115E59)', value: '#115E59' },
  { label: '83. 多瑙河深藍 (#1E40AF)', value: '#1E40AF' },
  { label: '84. 萊茵河古堡灰 (#374151)', value: '#374151' },
  { label: '85. 維也納金色 (#A16207)', value: '#A16207' },
  { label: '86. 布拉格紅瓦 (#991B1B)', value: '#991B1B' },
  { label: '87. 雅典衛城褐 (#78350F)', value: '#78350F' },
  { label: '88. 羅馬競技石 (#57534E)', value: '#57534E' },
  { label: '89. 撒哈拉沙金 (#92400E)', value: '#92400E' },
  { label: '90. 尼羅河藍綠 (#155E75)', value: '#155E75' },
  { label: '91. 亞馬遜雨林 (#166534)', value: '#166534' },
  { label: '92. 安地斯山岩 (#44403C)', value: '#44403C' },
  { label: '93. 京都古剎紅 (#7F1D1D)', value: '#7F1D1D' },
  { label: '94. 奈良古木棕 (#533A26)', value: '#533A26' },
  { label: '95. 富士山紺青 (#1E293B)', value: '#1E293B' },
  { label: '96. 櫻吹雪深茜 (#831843)', value: '#831843' },
  { label: '97. 紫藤花古紫 (#4C1D95)', value: '#4C1D95' },
  { label: '98. 銀杏秋葉金 (#854D0E)', value: '#854D0E' },
  { label: '99. 玉山冷杉青 (#0F766E)', value: '#0F766E' },
  { label: '100. 阿里山神木棕 (#451A03)', value: '#451A03' },
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
  { label: '27. 晴雨故事 (Umbrella)', value: 'Umbrella' },
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
  { label: '51. 圖書總館 (Library)', value: 'Library' },
  { label: '52. 珍藏書冊 (BookMarked)', value: 'BookMarked' },
  { label: '53. 讀書筆記 (NotebookPen)', value: 'NotebookPen' },
  { label: '54. 文獻篇章 (FileText)', value: 'FileText' },
  { label: '55. 有聲檔案 (FileAudio)', value: 'FileAudio' },
  { label: '56. 黑膠唱片 (Disc)', value: 'Disc' },
  { label: '57. 聲波放送 (Volume2)', value: 'Volume2' },
  { label: '58. 播客節目 (Podcast)', value: 'Podcast' },
  { label: '59. 戲劇舞台 (Theater)', value: 'Theater' },
  { label: '60. 電影場記 (Clapperboard)', value: 'Clapperboard' },
  { label: '61. 水彩畫筆 (Brush)', value: 'Brush' },
  { label: '62. 鋼筆創作 (PenTool)', value: 'PenTool' },
  { label: '63. 奇幻魔法 (Wand2)', value: 'Wand2' },
  { label: '64. 創意靈感 (Lightbulb)', value: 'Lightbulb' },
  { label: '65. 思維哲學 (Brain)', value: 'Brain' },
  { label: '66. 科普原子 (Atom)', value: 'Atom' },
  { label: '67. 科學顯微 (Microscope)', value: 'Microscope' },
  { label: '68. 天文觀測 (Telescope)', value: 'Telescope' },
  { label: '69. 太空火箭 (Rocket)', value: 'Rocket' },
  { label: '70. 星球軌道 (Orbit)', value: 'Orbit' },
  { label: '71. 破曉日出 (Sunrise)', value: 'Sunrise' },
  { label: '72. 黃昏夕陽 (Sunset)', value: 'Sunset' },
  { label: '73. 希望彩虹 (Rainbow)', value: 'Rainbow' },
  { label: '74. 冬日雪花 (Snowflake)', value: 'Snowflake' },
  { label: '75. 清風徐來 (Wind)', value: 'Wind' },
  { label: '76. 海洋潮汐 (Waves)', value: 'Waves' },
  { label: '77. 甘露水滴 (Droplets)', value: 'Droplets' },
  { label: '78. 春芽新生 (Sprout)', value: 'Sprout' },
  { label: '79. 蒼翠松柏 (TreePine)', value: 'TreePine' },
  { label: '80. 飛鳥鳴啼 (Bird)', value: 'Bird' },
  { label: '81. 悠游魚群 (Fish)', value: 'Fish' },
  { label: '82. 溫馴貓咪 (Cat)', value: 'Cat' },
  { label: '83. 忠實小狗 (Dog)', value: 'Dog' },
  { label: '84. 童話白兔 (Rabbit)', value: 'Rabbit' },
  { label: '85. 森林松鼠 (Squirrel)', value: 'Squirrel' },
  { label: '86. 長壽靈龜 (Turtle)', value: 'Turtle' },
  { label: '87. 昆蟲百科 (Bug)', value: 'Bug' },
  { label: '88. 海洋貝殼 (Shell)', value: 'Shell' },
  { label: '89. 童話城堡 (Castle)', value: 'Castle' },
  { label: '90. 古典禮堂 (Church)', value: 'Church' },
  { label: '91. 現代建築 (Building2)', value: 'Building2' },
  { label: '92. 溫馨家園 (Home)', value: 'Home' },
  { label: '93. 露營帳篷 (Tent)', value: 'Tent' },
  { label: '94. 榮耀勳章 (Medal)', value: 'Medal' },
  { label: '95. 時光沙漏 (Hourglass)', value: 'Hourglass' },
  { label: '96. 經典懷錶 (Watch)', value: 'Watch' },
  { label: '97. 歲月日曆 (Calendar)', value: 'Calendar' },
  { label: '98. 書信傳情 (Mail)', value: 'Mail' },
  { label: '99. 益智拼圖 (Puzzle)', value: 'Puzzle' },
  { label: '100. 互動樂園 (Gamepad2)', value: 'Gamepad2' },
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
  onStartShufflePlayback: (items: AudioItem[], categoryId?: string) => void;
  onStartPlaylistPlayback: (items: AudioItem[], categoryId?: string) => void;
  onAddCategory: (newCat: Omit<Category, 'id' | 'createdAt' | 'order'>) => void;
  onOpenCloudSettings: () => void;
  isGuest?: boolean;
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
    case 'Library':
      return <Library className={className} />;
    case 'BookMarked':
      return <BookMarked className={className} />;
    case 'NotebookPen':
      return <NotebookPen className={className} />;
    case 'FileText':
      return <FileText className={className} />;
    case 'FileAudio':
      return <FileAudio className={className} />;
    case 'Disc':
      return <Disc className={className} />;
    case 'Volume2':
      return <Volume2 className={className} />;
    case 'Podcast':
      return <Podcast className={className} />;
    case 'Theater':
      return <Theater className={className} />;
    case 'Clapperboard':
      return <Clapperboard className={className} />;
    case 'Brush':
      return <Brush className={className} />;
    case 'PenTool':
      return <PenTool className={className} />;
    case 'Wand2':
      return <Wand2 className={className} />;
    case 'Lightbulb':
      return <Lightbulb className={className} />;
    case 'Brain':
      return <Brain className={className} />;
    case 'Atom':
      return <Atom className={className} />;
    case 'Microscope':
      return <Microscope className={className} />;
    case 'Telescope':
      return <Telescope className={className} />;
    case 'Rocket':
      return <Rocket className={className} />;
    case 'Orbit':
      return <Orbit className={className} />;
    case 'Sunrise':
      return <Sunrise className={className} />;
    case 'Sunset':
      return <Sunset className={className} />;
    case 'Rainbow':
      return <Rainbow className={className} />;
    case 'Snowflake':
      return <Snowflake className={className} />;
    case 'Wind':
      return <Wind className={className} />;
    case 'Waves':
      return <Waves className={className} />;
    case 'Droplets':
      return <Droplets className={className} />;
    case 'Sprout':
      return <Sprout className={className} />;
    case 'TreePine':
      return <TreePine className={className} />;
    case 'Bird':
      return <Bird className={className} />;
    case 'Fish':
      return <Fish className={className} />;
    case 'Cat':
      return <Cat className={className} />;
    case 'Dog':
      return <Dog className={className} />;
    case 'Rabbit':
      return <Rabbit className={className} />;
    case 'Squirrel':
      return <Squirrel className={className} />;
    case 'Turtle':
      return <Turtle className={className} />;
    case 'Bug':
      return <Bug className={className} />;
    case 'Shell':
      return <Shell className={className} />;
    case 'Castle':
      return <Castle className={className} />;
    case 'Church':
      return <Church className={className} />;
    case 'Building2':
      return <Building2 className={className} />;
    case 'Home':
      return <Home className={className} />;
    case 'Tent':
      return <Tent className={className} />;
    case 'Medal':
      return <Medal className={className} />;
    case 'Hourglass':
      return <Hourglass className={className} />;
    case 'Watch':
      return <Watch className={className} />;
    case 'Calendar':
      return <Calendar className={className} />;
    case 'Mail':
      return <Mail className={className} />;
    case 'Puzzle':
      return <Puzzle className={className} />;
    case 'Gamepad2':
      return <Gamepad2 className={className} />;
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

interface BookshelfCardTitleProps {
  title: string;
  size?: 'base' | 'sm';
}

/**
 * 書架語音檔名過長跑馬燈與展開顯示組件
 * 當檔名超過卡片寬度時：
 * 1. 滑鼠懸停（Hover）或觸控啟用時，自動啟動平滑水平跑馬燈滾動（左右往返巡航）
 * 2. 檔名右側提供「完整」快捷展開按鈕，點擊可直接切換為完整多行檔名
 * 3. 具備原生 title 屬性提供瀏覽器原生提示
 */
export const BookshelfCardTitle: React.FC<BookshelfCardTitleProps> = ({ title, size = 'base' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [scrollDist, setScrollDist] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        if (textWidth > containerWidth + 2) {
          setIsOverflow(true);
          // 額外加上 48px 安全餘裕距離，並配合 pr-12，確保跑馬燈滾動到最末端時，
          // 最後一個字能夠完全脫離右側邊界與「完整」按鈕，毫無遮擋、完全清晰呈現在可視範圍內
          setScrollDist(textWidth - containerWidth + 48);
        } else {
          setIsOverflow(false);
          setScrollDist(0);
        }
      }
    };

    checkOverflow();

    // 監聽字體載入完成，重新計算正確寬度
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(checkOverflow);
    }

    // 使用 ResizeObserver 進行精確容器與文字尺寸監聽
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
    <div className="relative group/title w-full">
      {isExpanded ? (
        <div className="space-y-1">
          <h4
            className={`font-bold font-serif-tc text-[#2C221E] break-words leading-snug cursor-text ${
              size === 'sm' ? 'text-sm' : 'text-base'
            }`}
            title={title}
          >
            {title}
          </h4>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="text-[10px] text-[#8B5A2B] hover:text-[#5C3A1B] font-semibold underline cursor-pointer"
          >
            收合標題
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            ref={containerRef}
            className="relative flex-1 min-w-0 overflow-hidden"
            title={title}
          >
            <h4
              ref={textRef}
              className={`font-bold font-serif-tc text-[#2C221E] whitespace-nowrap inline-block transition-colors group-hover:text-[#8B5A2B] ${
                size === 'sm' ? 'text-sm' : 'text-base'
              } ${isOverflow ? 'animate-marquee-on-hover pr-12' : ''}`}
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

            {/* 若檔名過長超出卡片寬度，靜止時右側增加淡出微漸層作為指引；跑馬燈滾動/滑鼠移入時完全隱藏不擋字 */}
            {isOverflow && (
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/90 sm:from-[#FFFDF9]/90 to-transparent pointer-events-none group-hover:opacity-0 group-hover/title:opacity-0 group-hover:hidden group-hover/title:hidden transition-opacity" />
            )}
          </div>

          {/* 檔名過長時，提供「完整」展開按鈕，方便使用者直接查閱全名 */}
          {isOverflow && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-[#FAF4E8] hover:bg-[#EFE6D5] text-[#8B5A2B] border border-[#DFCEB4] cursor-pointer transition font-mono font-medium shadow-2xs hover:border-[#8B5A2B] select-none"
              title="檔名過長，點擊可直接展開查看全部語音檔名"
            >
              完整
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  categories,
  audioItems,
  dataSource,
  driveConnected,
  onSelectForPlayback,
  onSelectForEdit,
  onNavigateToUpload,
  onNavigateToScreeningCategory,
  onStartShufflePlayback,
  onStartPlaylistPlayback,
  onAddCategory,
  onOpenCloudSettings,
  isGuest = false,
}) => {
  const [selectedAisle, setSelectedAisle] = useState<string>('all');
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#8B5A2B');
  const [newCatIcon, setNewCatIcon] = useState('BookOpen');
  const [newCatAllowGuest, setNewCatAllowGuest] = useState(false);

  // 手動點選語音檔卡片選取多筆語音檔（依選取先後順序組成播放清單到放映室播放）
  const [selectedAudioIds, setSelectedAudioIds] = useState<string[]>([]);

  const selectedAudioItems = useMemo(() => {
    const itemMap: Record<string, AudioItem> = {};
    audioItems.forEach((i) => {
      itemMap[i.id] = i;
    });
    return selectedAudioIds.map((id) => itemMap[id]).filter(Boolean) as AudioItem[];
  }, [selectedAudioIds, audioItems]);

  const selectedTotalDurationSec = useMemo(
    () => selectedAudioItems.reduce((acc, item) => acc + (item.duration || 0), 0),
    [selectedAudioItems]
  );

  const toggleSelectAudioItem = (itemId: string) => {
    setSelectedAudioIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleToggleSelectBatch = (items: AudioItem[]) => {
    if (items.length === 0) return;
    const allSelected = items.every((item) => selectedAudioIds.includes(item.id));
    if (allSelected) {
      const removeSet = new Set(items.map((i) => i.id));
      setSelectedAudioIds((prev) => prev.filter((id) => !removeSet.has(id)));
    } else {
      setSelectedAudioIds((prev) => {
        const next = [...prev];
        items.forEach((item) => {
          if (!next.includes(item.id)) next.push(item.id);
        });
        return next;
      });
    }
  };

  const handlePlaySelectedInScreeningRoom = (categoryId?: string) => {
    if (selectedAudioItems.length === 0) return;
    onStartPlaylistPlayback(selectedAudioItems, categoryId);
  };

  // 計算所有已經上傳完成的語音檔案的時間長度總和（秒數與分鐘數）
  const totalDurationSec = useMemo(() => {
    return audioItems.reduce((acc, item) => {
      if (!item.audioUrl && !item.audioDriveFileId) return acc;
      const d = Number(item.duration);
      return acc + (Number.isFinite(d) && d > 0 ? d : 0);
    }, 0);
  }, [audioItems]);
  const totalMinutes = totalDurationSec > 0 ? Math.max(1, Math.round(totalDurationSec / 60)) : 0;

  // 依據「館藏分類編號 + 流水號 (號碼從 1 開始，依語音檔案上傳順序)」建立每筆語音檔之獨立編號
  const audioCallNumberMap = useMemo(
    () => getAudioItemCallNumberMap(audioItems, categories),
    [audioItems, categories]
  );

  // 「聲書閣總覽 Dashboard」專屬快速檢索狀態（關鍵字、館藏分類、主講人、類別標籤下拉選單）
  const [quickSearchKeyword, setQuickSearchKeyword] = useState('');
  const [quickSearchCategory, setQuickSearchCategory] = useState('');
  const [quickSearchTag, setQuickSearchTag] = useState('');
  const [quickSearchSpeaker, setQuickSearchSpeaker] = useState('');

  // 每個館藏主題書架之分頁狀態（當前頁碼與每頁數量，預設每頁 8 部）
  const [categoryPageMap, setCategoryPageMap] = useState<Record<string, number>>({});
  const [categoryPageSizeMap, setCategoryPageSizeMap] = useState<Record<string, number>>({});
  // 每個館藏主題書架之主講人篩選狀態（點擊標題列主講人統計標籤即可快速切換）
  const [categorySpeakerFilterMap, setCategorySpeakerFilterMap] = useState<Record<string, string>>({});
  // 每個館藏主題書架之「查詢」關鍵字狀態與「類別標籤」下拉篩選狀態
  const [categorySearchQueryMap, setCategorySearchQueryMap] = useState<Record<string, string>>({});
  const [categoryTagFilterMap, setCategoryTagFilterMap] = useState<Record<string, string>>({});
  // 每個館藏主題書架之「收合」狀態（支援一鍵收合/展開各分類書架）
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Record<string, boolean>>({});

  // 語音檔案卡片「分享」功能狀態
  const [shareModalItem, setShareModalItem] = useState<{ item: AudioItem; category: Category } | null>(null);
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const [dashboardToast, setDashboardToast] = useState<string | null>(null);

  const showDashboardToast = (msg: string) => {
    setDashboardToast(msg);
    setTimeout(() => setDashboardToast(null), 3500);
  };

  const handleOpenShareModal = (item: AudioItem, category: Category) => {
    setShareModalItem({ item, category });
    setShareCopied(false);
  };

  const currentDashboardShareUrl = useMemo(() => {
    if (!shareModalItem) return '';
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    return `${origin}${pathname}?tab=screening&audioId=${shareModalItem.item.id}&shared=1`;
  }, [shareModalItem]);

  const handleCopyDashboardShareUrl = async () => {
    if (!currentDashboardShareUrl) return;
    try {
      await navigator.clipboard.writeText(currentDashboardShareUrl);
      setShareCopied(true);
      showDashboardToast('📋 已複製分享連結！可直接傳送給好友觀看此語音檔。');
      setTimeout(() => setShareCopied(false), 3000);
    } catch {
      showDashboardToast('⚠️ 複製失敗，請手動複製連結');
    }
  };

  const handleDashboardNativeShare = async () => {
    if (!shareModalItem || !currentDashboardShareUrl) return;
    const item = shareModalItem.item;
    const shareTitle = `聲書閣放映室 - ${item.title}`;
    const shareText = `邀請您一同在「聲書閣」觀賞聆聽：《${item.title}》${
      item.speaker ? ` (主講：${item.speaker})` : ''
    }`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: currentDashboardShareUrl,
        });
      } catch {
        // 使用者取消分享不報錯
      }
    } else {
      handleCopyDashboardShareUrl();
    }
  };

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategoryIds((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleToggleCategorySpeakerFilter = (catId: string, speaker: string) => {
    setCategorySpeakerFilterMap((prev) => {
      const current = prev[catId];
      if (current === speaker) {
        const next = { ...prev };
        delete next[catId];
        return next;
      }
      return { ...prev, [catId]: speaker };
    });
    setCategoryPageMap((prev) => ({ ...prev, [catId]: 1 }));
  };

  const handleClearCategorySpeakerFilter = (catId: string) => {
    setCategorySpeakerFilterMap((prev) => {
      const next = { ...prev };
      delete next[catId];
      return next;
    });
    setCategoryPageMap((prev) => ({ ...prev, [catId]: 1 }));
  };

  // 統計「聲書閣總覽 Dashboard」館藏語音快速檢索可用主講人與筆數（若有選取館藏分類，則以該分類之語音為主）
  const availableDashboardSpeakers = useMemo(() => {
    const speakerCountMap: Record<string, number> = {};
    let unassignedCount = 0;
    const targetItems = quickSearchCategory
      ? audioItems.filter((item) => item.categoryId === quickSearchCategory)
      : audioItems;

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
  }, [audioItems, quickSearchCategory]);

  // 統計「聲書閣總覽 Dashboard」館藏語音快速檢索可用類別標籤與筆數（受所選館藏分類與主講人連動篩選）
  const availableDashboardTags = useMemo(() => {
    const tagCountMap: Record<string, number> = {};
    const targetItems = audioItems.filter((item) => {
      if (quickSearchCategory && item.categoryId !== quickSearchCategory) {
        return false;
      }
      if (!quickSearchSpeaker) return true;
      if (quickSearchSpeaker === '__unassigned__') {
        return !item.speaker || !item.speaker.trim();
      }
      return item.speaker?.trim() === quickSearchSpeaker.trim();
    });

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
  }, [audioItems, quickSearchCategory, quickSearchSpeaker]);

  // 當選取的館藏分類或主講人變更時，若已選取的類別標籤不在篩選範圍內，自動重設標籤選取
  useEffect(() => {
    if (quickSearchTag) {
      const tagExists = availableDashboardTags.some((t) => t.tag === quickSearchTag);
      if (!tagExists) {
        setQuickSearchTag('');
      }
    }
  }, [availableDashboardTags, quickSearchTag]);

  // 當選取的館藏分類變更時，若已選取的主講人不在該館藏分類中，自動重設主講人選取
  useEffect(() => {
    if (quickSearchCategory && quickSearchSpeaker) {
      if (quickSearchSpeaker === '__unassigned__') {
        if (availableDashboardSpeakers.unassignedCount === 0) setQuickSearchSpeaker('');
      } else {
        const speakerExists = availableDashboardSpeakers.speakers.some((s) => s.speaker === quickSearchSpeaker);
        if (!speakerExists) setQuickSearchSpeaker('');
      }
    }
  }, [quickSearchCategory, availableDashboardSpeakers, quickSearchSpeaker]);

  // 快速檢索篩選：比對語音檔案名稱、館藏分類、主講人、類別標籤下拉選取與故事說明內容
  const matchedAudioItems = useMemo(() => {
    const q = quickSearchKeyword.trim().toLowerCase();
    const c = quickSearchCategory.trim();
    const t = quickSearchTag.trim();
    const s = quickSearchSpeaker.trim();
    if (!q && !c && !t && !s) return [];

    return audioItems.filter((item) => {
      // 1. 館藏分類下拉比對 (若有選取)
      if (c && item.categoryId !== c) {
        return false;
      }

      // 2. 關鍵字比對 (若有輸入)
      let matchKw = true;
      if (q) {
        const matchTitle = (item.title || '').toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        const matchTags = (item.tags || []).some((tag) => tag.toLowerCase().includes(q));
        const matchSpeaker = (item.speaker || '').toLowerCase().includes(q);
        const cat = categories.find((catItem) => catItem.id === item.categoryId);
        const matchCat = cat
          ? cat.name.toLowerCase().includes(q) || cat.code.toLowerCase().includes(q)
          : false;
        matchKw = matchTitle || matchDesc || matchTags || matchSpeaker || matchCat;
      }

      // 3. 類別標籤下拉選取比對 (若有選取)
      let matchTag = true;
      if (t) {
        matchTag = (item.tags || []).includes(t);
      }

      // 4. 主講人下拉選單比對 (若有選取)
      let matchSpeaker = true;
      if (s === '__unassigned__') {
        matchSpeaker = !item.speaker || !item.speaker.trim();
      } else if (s) {
        matchSpeaker = item.speaker?.trim() === s;
      }

      return matchKw && matchTag && matchSpeaker;
    });
  }, [audioItems, categories, quickSearchKeyword, quickSearchCategory, quickSearchTag, quickSearchSpeaker]);

  const visibleCategories =
    selectedAisle === 'all'
      ? categories
      : categories.filter((c) => c.id === selectedAisle);

  // 點選「主題館藏數量分佈」分類按鈕後，畫面平滑滾動至下方對應館藏書架位置
  const handleScrollToCategory = (catId: string) => {
    if (selectedAisle !== 'all' && selectedAisle !== catId) {
      setSelectedAisle('all');
    }
    setTimeout(() => {
      const el = document.getElementById(`category-shelf-${catId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    onAddCategory({
      name: newCatName.trim(),
      code: newCatCode.trim() || `CAT-${(categories.length + 1) * 100}`,
      description: newCatDesc.trim() || '自訂有聲書典藏分區',
      themeColor: newCatColor,
      icon: newCatIcon,
      allowGuest: newCatAllowGuest,
    });
    setNewCatName('');
    setNewCatCode('');
    setNewCatDesc('');
    setNewCatAllowGuest(false);
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

          {!isGuest ? (
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
          ) : (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-[#FAF5EC] text-xs">
              <Compass className="w-4 h-4 text-[#D4A373]" />
              <span>訪客瀏覽模式 · 歡迎自由檢索與聆聽館藏</span>
            </div>
          )}
        </div>
      </div>

      {/* 聲書閣總覽 Dashboard 專屬快速檢索區塊 */}
      <div className="parchment-card rounded-2xl p-5 shadow-md border border-[#DFCEB4] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#8B5A2B]/15 text-[#8B5A2B]">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-serif-tc text-[#2C221E] flex flex-wrap items-center gap-2">
                <span>館藏語音快速檢索</span>
                {(quickSearchKeyword.trim() || quickSearchTag || quickSearchSpeaker) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#8B5A2B] text-white font-mono font-medium">
                    找到 {matchedAudioItems.length} 筆
                  </span>
                )}
                {selectedAudioItems.length > 0 && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#2E5A44] text-white font-bold">
                    已選取 {selectedAudioItems.length} 部語音檔
                  </span>
                )}
              </h2>
              <p className="text-xs text-[#7A6855]">
                輸入關鍵字或選取主講人、類別標籤檢索；直接點選下方語音檔卡片即可選取多筆語音檔，一併到放映室當作播放清單放映
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {/* 檢索結果全選 / 取消全選 */}
            {matchedAudioItems.length > 0 && (
              <button
                type="button"
                onClick={() => handleToggleSelectBatch(matchedAudioItems)}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#C8B598] hover:border-[#2E5A44] text-[#2E5A44] text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                title="全選或取消全選目前檢索結果中的所有語音檔"
              >
                {matchedAudioItems.every((item) => selectedAudioIds.includes(item.id)) ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>取消全選檢索 ({matchedAudioItems.length})</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>全選檢索結果 ({matchedAudioItems.length})</span>
                  </>
                )}
              </button>
            )}

            {/* 將已選取的多筆語音檔一併到放映室當作播放清單播放 */}
            <button
              type="button"
              disabled={selectedAudioItems.length === 0}
              onClick={() => handlePlaySelectedInScreeningRoom('all')}
              className="px-3.5 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="將點選的語音檔依選取順序當作播放清單，一併到放映室播放"
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>
                到放映室播放已選 {selectedAudioItems.length > 0 ? `(${selectedAudioItems.length} 部)` : ''}
              </span>
            </button>

            {selectedAudioItems.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedAudioIds([])}
                className="px-2.5 py-1.5 rounded-lg bg-[#EFE6D5] hover:bg-[#E2D5C1] text-[#5C3A1B] text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                title="清空目前已選取的所有語音檔"
              >
                <X className="w-3.5 h-3.5" />
                <span>清空已選</span>
              </button>
            )}

            {/* 快速檢索結果「隨機播放」功能 */}
            <button
              type="button"
              disabled={matchedAudioItems.length === 0}
              onClick={() => onStartShufflePlayback(matchedAudioItems, 'all')}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="將檢索結果隨機排列並進入放映室立即播放"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>隨機播放 {matchedAudioItems.length > 0 ? `(${matchedAudioItems.length})` : ''}</span>
            </button>

            {(quickSearchKeyword || quickSearchCategory || quickSearchTag || quickSearchSpeaker) && (
              <button
                type="button"
                onClick={() => {
                  setQuickSearchKeyword('');
                  setQuickSearchCategory('');
                  setQuickSearchTag('');
                  setQuickSearchSpeaker('');
                }}
                className="text-xs text-[#8B5A2B] hover:text-[#5C3A1B] flex items-center gap-1 font-medium cursor-pointer bg-[#EFE6D5] px-2.5 py-1.5 rounded-lg transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>重置檢索條件</span>
              </button>
            )}
          </div>
        </div>

        {/* 檢索輸入與館藏分類、主講人、類別標籤下拉選取列 */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* 1. 關鍵字輸入 */}
          <div className="relative sm:col-span-12 md:col-span-6 lg:col-span-3">
            <Search className="w-4 h-4 text-[#8B735B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="輸入關鍵字（童話、歷史、標題）..."
              value={quickSearchKeyword}
              onChange={(e) => setQuickSearchKeyword(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner"
            />
            {quickSearchKeyword && (
              <button
                type="button"
                onClick={() => setQuickSearchKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8B735B] hover:text-[#2C221E] cursor-pointer"
                title="清除關鍵字"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 2. 館藏分類下拉選單 */}
          <div className="relative sm:col-span-6 md:col-span-3 lg:col-span-3">
            <Layers className="w-4 h-4 text-[#8B735B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={quickSearchCategory}
              onChange={(e) => setQuickSearchCategory(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner cursor-pointer appearance-none truncate font-medium"
            >
              <option value="">全部館藏分類 (不限)</option>
              {categories.map((c) => {
                const countInCat = audioItems.filter((i) => i.categoryId === c.id).length;
                return (
                  <option key={c.id} value={c.id}>
                    🏛️ [{c.code}] {c.name} ({countInCat} 部)
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8B735B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 3. 主講人下拉選單 */}
          <div className="relative sm:col-span-6 md:col-span-3 lg:col-span-3">
            <User className="w-4 h-4 text-[#8B735B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={quickSearchSpeaker}
              onChange={(e) => setQuickSearchSpeaker(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner cursor-pointer appearance-none truncate font-medium"
            >
              <option value="">
                全部主講人 {availableDashboardSpeakers.speakers.length === 0 ? '(尚無主講人)' : '(不限)'}
              </option>
              {availableDashboardSpeakers.speakers.map(({ speaker, count }) => (
                <option key={speaker} value={speaker}>
                  🎙️ {speaker} ({count} 部)
                </option>
              ))}
              {availableDashboardSpeakers.unassignedCount > 0 && (
                <option value="__unassigned__">
                  ❓ 尚未指定主講人 ({availableDashboardSpeakers.unassignedCount} 部)
                </option>
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8B735B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* 4. 類別標籤下拉選單 */}
          <div className="relative sm:col-span-6 md:col-span-3 lg:col-span-3">
            <Tag className="w-4 h-4 text-[#8B735B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={quickSearchTag}
              onChange={(e) => setQuickSearchTag(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-xs md:text-sm text-[#2C221E] focus:outline-none focus:border-[#8B5A2B] shadow-inner cursor-pointer appearance-none truncate font-medium"
            >
              <option value="">
                {quickSearchSpeaker
                  ? `🏷️ 該主講人所有標籤 (${availableDashboardTags.length > 0 ? `共 ${availableDashboardTags.length} 種` : '無標籤'})`
                  : `🏷️ 全部類別標籤 ${availableDashboardTags.length === 0 ? '(尚無標籤)' : '(不限)'}`}
              </option>
              {availableDashboardTags.map(({ tag, count }) => (
                <option key={tag} value={tag}>
                  🏷️ #{tag} ({count} 部)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#8B735B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 檢索結果展示 */}
        {quickSearchKeyword.trim() || quickSearchCategory || quickSearchTag || quickSearchSpeaker ? (
          matchedAudioItems.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-[#FAF6EE] border border-dashed border-[#D5C5AE] text-[#7A6855] text-xs space-y-1">
              <p className="font-semibold text-sm text-[#5C3A1B]">
                找不到符合條件的語音檔
                {quickSearchKeyword && `「${quickSearchKeyword}」`}
                {quickSearchCategory && ` [分類: ${categories.find(c => c.id === quickSearchCategory)?.name || quickSearchCategory}]`}
                {quickSearchSpeaker && ` [主講人: ${quickSearchSpeaker === '__unassigned__' ? '尚未指定' : quickSearchSpeaker}]`}
                {quickSearchTag && ` [標籤: #${quickSearchTag}]`}
              </p>
              <p>請嘗試其他關鍵字或切換館藏分類、主講人、類別標籤，或確認該館藏是否已在「語音檔案庫」中建立。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1 max-h-[500px] overflow-y-auto pr-1">
              {matchedAudioItems.map((item, idx) => {
                const cat = categories.find((c) => c.id === item.categoryId);
                const catColor = cat?.themeColor || '#8B5A2B';
                const selectedOrder = selectedAudioIds.indexOf(item.id) + 1;
                const isSelected = selectedOrder > 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelectAudioItem(item.id)}
                    style={{
                      borderLeftColor: catColor,
                      borderLeftWidth: '5px',
                      background: isSelected
                        ? undefined
                        : `linear-gradient(to right, ${catColor}12 0%, #FFFFFF 25%)`,
                    }}
                    className={`group relative flex items-start gap-3 p-3 rounded-xl transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md ${
                      isSelected
                        ? 'bg-[#F1F8F4] border-t-2 border-r-2 border-b-2 border-[#2E5A44] ring-2 ring-[#2E5A44]/25 shadow-md'
                        : 'border-t border-r border-b border-[#E5D9C5] hover:-translate-y-0.5'
                    }`}
                    title={`點選卡片以選取此語音檔（所屬館藏：[${cat?.code || ''}] ${cat?.name || '未分類'}）`}
                  >
                    {/* 左側精裝書脊分類色彩標記條 */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
                      style={{ backgroundColor: catColor }}
                    />
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[#2C221E]">
                      <img
                        src={item.coverImageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                      <div
                        className={`absolute inset-0 flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-[#2E5A44]/65 opacity-100'
                            : 'bg-black/35 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isSelected ? (
                          <Check className="w-6 h-6 text-white stroke-[3]" />
                        ) : (
                          <CheckSquare className="w-5 h-5 text-white" />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* 選取狀態標記 */}
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                              isSelected
                                ? 'bg-[#2E5A44] text-white shadow-2xs'
                                : 'bg-[#EFE6D5] text-[#5C3A1B]'
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <CheckSquare className="w-3 h-3" />
                                <span>已選 #{selectedOrder}</span>
                              </>
                            ) : (
                              <>
                                <Square className="w-3 h-3" />
                                <span>點選選取</span>
                              </>
                            )}
                          </span>
                          {/* 檢索清單序號（從 1 開始） */}
                          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-[#3A2518] text-white">
                            #{idx + 1}
                          </span>
                          {/* 獨立語音檔編號 */}
                          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-[#FAF4E8] border border-[#D5C5AE] text-[#5C3A1B] shadow-xs">
                            {audioCallNumberMap.get(item.id) || (cat ? `${cat.code}-1` : 'CAT-1')}
                          </span>
                          {cat && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                              style={{ backgroundColor: cat.themeColor }}
                            >
                              [{cat.code}] {cat.name}
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-[#7A6855] flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectForPlayback(item);
                            }}
                            className="px-2 py-0.5 rounded bg-[#3A2518] hover:bg-[#593824] text-[#FAF5EC] text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition"
                            title="直接單獨播放此語音檔"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>單曲播放</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const targetCat = cat || {
                                id: item.categoryId,
                                name: '未指定分類',
                                code: 'CAT',
                                themeColor: '#8B5A2B',
                                icon: 'BookOpen',
                                description: '',
                                createdAt: '',
                                order: 99,
                                allowGuest: false,
                              };
                              handleOpenShareModal(item, targetCat);
                            }}
                            className="p-1 rounded bg-[#FAF4E8] hover:bg-amber-100 border border-[#D5C5AE] text-[#8B5A2B] text-[10px] flex items-center justify-center shrink-0 cursor-pointer transition"
                            title="分享此語音檔給他人觀看"
                          >
                            <Share2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <BookshelfCardTitle title={item.title} size="sm" />
                      <p className="text-xs text-[#6E5D4F] line-clamp-1 mt-0.5">
                        {item.description}
                      </p>

                      {/* 主講人與標籤展示 */}
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {item.speaker && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickSearchSpeaker(item.speaker!);
                            }}
                            className={`text-[10px] px-1.5 py-0.2 rounded border transition cursor-pointer flex items-center gap-0.5 font-medium ${
                              quickSearchSpeaker === item.speaker
                                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                : 'bg-[#F2E8DC] border-[#D8C7B2] text-[#5C3A1B] hover:bg-[#EAE0D2]'
                            }`}
                            title={`主講人：${item.speaker}（點擊過濾此主講人）`}
                          >
                            <User className="w-2.5 h-2.5" />
                            <span>{item.speaker}</span>
                          </button>
                        )}
                        {item.tags && item.tags.slice(0, 3).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickSearchTag(tag);
                            }}
                            className={`text-[10px] px-1.5 py-0.2 rounded border transition cursor-pointer ${
                              quickSearchTag === tag
                                ? 'bg-[#8B5A2B] text-white border-[#8B5A2B]'
                                : 'bg-[#FAF4E8] border-[#DFCEB4] text-[#5C3A1B] hover:bg-[#EFE6D5]'
                            }`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
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
            <p className="text-xs font-medium text-[#7A6855] uppercase tracking-wider">典藏總語音檔時長</p>
            <p className="text-2xl font-bold font-serif-tc text-[#2C221E]">
              {totalMinutes} <span className="text-sm font-normal text-[#7A6855]">分鐘 ({formatDuration(totalDurationSec)})</span>
            </p>
          </div>
        </div>

        <div className="parchment-card rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#7A3E65]/15 text-[#7A3E65] flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#7A6855] uppercase tracking-wider">各館藏主題語音數</p>
              <p className="text-sm font-bold font-serif-tc text-[#2C221E] truncate">
                主題館藏數量分佈
              </p>
            </div>
          </div>

          {/* 每個館藏主題語音檔數量 */}
          <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto scrollbar-thin mt-2 pt-2 border-t border-[#EFE6D5]">
            {categories.length === 0 ? (
              <span className="text-xs text-[#7A6855]">尚未建立館藏主題</span>
            ) : (
              categories.map((cat) => {
                const count = audioItems.filter((item) => item.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleScrollToCategory(cat.id)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-white shadow-2xs hover:opacity-90 transition cursor-pointer"
                    style={{ backgroundColor: cat.themeColor }}
                    title={`點選移動至「${cat.name}」館藏書架位置，共 ${count} 部語音`}
                  >
                    <span className="truncate max-w-[85px]">{cat.name}</span>
                    <span className="font-mono font-bold bg-black/25 px-1 py-0.2 rounded text-[10px]">
                      {count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 圖書館分區導覽索引 (Category Hall Selector) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-serif-tc text-[#2C221E] flex flex-wrap items-center gap-2">
              <span>館藏主題分區導覽</span>
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-[#E5D9C5] text-[#5C3A1B]">
                依圖書館索書號排列
              </span>
              {selectedAudioItems.length > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#2E5A44] text-white font-bold">
                  已選取 {selectedAudioItems.length} 部語音檔
                </span>
              )}
            </h2>
            <p className="text-xs text-[#7A6855]">
              點選書架上的語音檔卡片即可選取（支援選取多筆語音檔），選取後點擊「到放映室播放已選」即可一併當作播放清單放映。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedAudioItems.length === 0}
              onClick={() => handlePlaySelectedInScreeningRoom(selectedAisle)}
              className="px-4 py-2 rounded-xl bg-[#2E5A44] hover:bg-[#234735] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              title="將點選的多筆語音檔依選取順序當作播放清單，一併到放映室播放"
            >
              <ListMusic className="w-4 h-4" />
              <span>
                到放映室播放已選 {selectedAudioItems.length > 0 ? `(${selectedAudioItems.length} 部)` : ''}
              </span>
            </button>
            {selectedAudioItems.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedAudioIds([])}
                className="px-3 py-2 rounded-xl bg-[#EFE6D5] hover:bg-[#E2D5C1] text-[#5C3A1B] text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>清空已選</span>
              </button>
            )}

            {/* 一鍵全部收合 / 全部展開所有分類書架 */}
            {visibleCategories.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const allCollapsed = visibleCategories.every((cat) => Boolean(collapsedCategoryIds[cat.id]));
                  const nextState: Record<string, boolean> = {};
                  visibleCategories.forEach((cat) => {
                    nextState[cat.id] = !allCollapsed;
                  });
                  setCollapsedCategoryIds(nextState);
                }}
                className="px-3 py-2 rounded-xl bg-[#EFE6D5] hover:bg-[#E2D5C1] text-[#5C3A1B] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="一鍵全部收合或全部展開各分類主題書架"
              >
                {visibleCategories.every((cat) => Boolean(collapsedCategoryIds[cat.id])) ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-[#8B5A2B]" />
                    <span>全部展開</span>
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-[#8B5A2B]" />
                    <span>全部收合</span>
                  </>
                )}
              </button>
            )}
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
        {visibleCategories.length === 0 ? (
          <div className="py-14 px-6 text-center rounded-2xl border-2 border-dashed border-[#D5C5AE] bg-[#FFFDF9] shadow-xs space-y-2">
            <Lock className="w-8 h-8 text-[#8B5A2B] mx-auto mb-2 opacity-80" />
            <h3 className="text-base sm:text-lg font-bold font-serif-tc text-[#2C221E]">
              {isGuest ? '目前尚無開放訪客瀏覽的館藏分類' : '目前尚無館藏分類'}
            </h3>
            <p className="text-xs sm:text-sm text-[#6E5D4F] max-w-lg mx-auto">
              {isGuest
                ? '請使用正式帳號登入，或由管理者於「館藏資料管理 ➔ 館藏分類管理」中勾選「是否開啟訪客瀏覽」後，訪客即可瀏覽使用。'
                : '請點擊上方「新增分類廳」建立第一個館藏分類。'}
            </p>
          </div>
        ) : null}
        {visibleCategories.map((category) => {
          const itemsInCat = audioItems
            .filter((item) => item.categoryId === category.id)
            .sort((a, b) => {
              const timeA = new Date(a.createdAt || 0).getTime();
              const timeB = new Date(b.createdAt || 0).getTime();
              if (timeA !== timeB) return timeA - timeB;
              return a.id.localeCompare(b.id);
            });

          // 統計本主題館藏每位主講人的語音檔案數
          const speakerCountMap: Record<string, number> = {};
          let unassignedSpeakerCount = 0;
          itemsInCat.forEach((item) => {
            const sp = item.speaker?.trim();
            if (sp) {
              speakerCountMap[sp] = (speakerCountMap[sp] || 0) + 1;
            } else {
              unassignedSpeakerCount++;
            }
          });
          const sortedSpeakerStats = Object.entries(speakerCountMap)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-TW'))
            .map(([speaker, count]) => ({ speaker, count }));

          // 統計本主題館藏所有的類別標籤與筆數
          const categoryTagCountMap: Record<string, number> = {};
          itemsInCat.forEach((item) => {
            (item.tags || []).forEach((t) => {
              const trimmed = t.trim();
              if (trimmed) {
                categoryTagCountMap[trimmed] = (categoryTagCountMap[trimmed] || 0) + 1;
              }
            });
          });
          const categoryTags = Object.keys(categoryTagCountMap)
            .sort((a, b) => a.localeCompare(b, 'zh-TW'))
            .map((tag) => ({
              tag,
              count: categoryTagCountMap[tag],
            }));

          const activeSpeakerFilter = categorySpeakerFilterMap[category.id] || '';
          const activeTagFilter = categoryTagFilterMap[category.id] || '';
          const activeSearchQuery = (categorySearchQueryMap[category.id] || '').trim().toLowerCase();

          const filteredCategoryItems = itemsInCat.filter((item) => {
            // 1. 主講人篩選
            if (activeSpeakerFilter) {
              if (activeSpeakerFilter === '__unassigned__') {
                if (item.speaker && item.speaker.trim()) return false;
              } else if (item.speaker?.trim() !== activeSpeakerFilter) {
                return false;
              }
            }

            // 2. 類別標籤篩選
            if (activeTagFilter) {
              if (!item.tags || !item.tags.includes(activeTagFilter)) {
                return false;
              }
            }

            // 3. 關鍵字查詢 (搜尋檔名、主講人、故事描述、標籤)
            if (activeSearchQuery) {
              const matchTitle = (item.title || '').toLowerCase().includes(activeSearchQuery);
              const matchDesc = (item.description || '').toLowerCase().includes(activeSearchQuery);
              const matchSpeaker = (item.speaker || '').toLowerCase().includes(activeSearchQuery);
              const matchTags = (item.tags || []).some((tg) => tg.toLowerCase().includes(activeSearchQuery));
              if (!matchTitle && !matchDesc && !matchSpeaker && !matchTags) {
                return false;
              }
            }

            return true;
          });

          // 本分類專屬分頁計算（預設每頁 8 部，亦可自選 4, 8, 12, 16 或全部）
          const pageSize = categoryPageSizeMap[category.id] || 8;
          const totalCount = filteredCategoryItems.length;
          const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
          const currentPage = categoryPageMap[category.id] || 1;
          const safePage = Math.min(currentPage, totalPages);
          const paginatedItems = filteredCategoryItems.slice((safePage - 1) * pageSize, safePage * pageSize);
          const isCollapsed = Boolean(collapsedCategoryIds[category.id]);

          return (
            <section
              key={category.id}
              id={`category-shelf-${category.id}`}
              className="rounded-2xl overflow-hidden border border-[#DECGB4] bg-[#FDFBF7] shadow-md scroll-mt-24 transition-all"
            >
              {/* 分類廳館木牌標頭 */}
              <div
                className={`p-5 md:px-7 flex flex-col md:flex-row md:items-center justify-between gap-4 text-white transition-all ${
                  isCollapsed ? 'rounded-2xl' : ''
                }`}
                style={{
                  background: `linear-gradient(135deg, ${category.themeColor} 0%, #2B1B11 100%)`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3.5 sm:gap-4">
                    {/* (2) 館藏分類圖示與其正下方的「收合」功能 */}
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25 shadow-xs">
                        {getCategoryIcon(category.icon, 'w-6 h-6 text-white')}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCategoryCollapse(category.id)}
                        className="inline-flex items-center justify-center gap-0.5 px-2 py-0.5 rounded-full bg-black/35 hover:bg-black/55 text-amber-200 text-[11px] font-medium border border-white/20 transition cursor-pointer shadow-2xs whitespace-nowrap"
                        title={isCollapsed ? `展開「${category.name}」主題館藏書架` : `收合「${category.name}」主題館藏書架`}
                      >
                        {isCollapsed ? (
                          <>
                            <ChevronDown className="w-3 h-3 text-amber-300" />
                            <span>展開</span>
                          </>
                        ) : (
                          <>
                            <ChevronUp className="w-3 h-3 text-amber-300" />
                            <span>收合</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="px-2.5 py-0.5 rounded bg-black/30 text-xs font-mono tracking-wider text-amber-200 border border-amber-200/30">
                          索書號 {category.code}
                        </span>
                        <h3 className="text-xl font-bold font-serif-tc tracking-wide">
                          {category.name}
                        </h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-mono">
                          共 {itemsInCat.length} 部
                        </span>
                        {activeSpeakerFilter && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400 text-[#2B1B11] font-bold shadow-xs">
                            主講人：{activeSpeakerFilter === '__unassigned__' ? '未指定' : activeSpeakerFilter}
                          </span>
                        )}
                        {activeTagFilter && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-300 text-[#2B1B11] font-bold shadow-xs">
                            標籤：#{activeTagFilter}
                          </span>
                        )}
                        {activeSearchQuery && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/30 text-white font-bold shadow-xs">
                            關鍵字：「{activeSearchQuery}」
                          </span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-white/85 mt-1">{category.description}</p>
                    </div>
                  </div>

                  {/* 主講人語音檔案數統計徽章列 */}
                  {itemsInCat.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-white/20 text-xs">
                      <span className="text-[11px] text-amber-200/90 font-semibold flex items-center gap-1 shrink-0">
                        <User className="w-3.5 h-3.5 text-amber-300" />
                        <span>主講人統計：</span>
                      </span>
                      {sortedSpeakerStats.length > 0 ? (
                        sortedSpeakerStats.map(({ speaker, count }) => {
                          const isFilterActive = activeSpeakerFilter === speaker;
                          return (
                            <button
                              key={speaker}
                              type="button"
                              onClick={() => handleToggleCategorySpeakerFilter(category.id, speaker)}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] backdrop-blur-xs transition cursor-pointer border ${
                                isFilterActive
                                  ? 'bg-amber-400 text-[#2B1B11] border-amber-300 font-bold shadow-xs ring-2 ring-white/40'
                                  : 'bg-black/30 hover:bg-black/45 text-[#FAF5EC] border-white/20'
                              }`}
                              title={`主講人「${speaker}」在此主題共 ${count} 部語音（點擊可篩選）`}
                            >
                              <span>{speaker}</span>
                              <span className={isFilterActive ? 'text-[#2B1B11] font-mono font-bold' : 'text-amber-300 font-mono font-bold'}>
                                ({count} 部)
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-white/70 italic">尚無指定主講人</span>
                      )}

                      {unassignedSpeakerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleToggleCategorySpeakerFilter(category.id, '__unassigned__')}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] backdrop-blur-xs transition cursor-pointer border ${
                            activeSpeakerFilter === '__unassigned__'
                              ? 'bg-amber-400 text-[#2B1B11] border-amber-300 font-bold shadow-xs ring-2 ring-white/40'
                              : 'bg-black/25 hover:bg-black/40 text-white/80 border-white/15'
                          }`}
                          title={`尚未指定主講人的語音共 ${unassignedSpeakerCount} 部（點擊可篩選）`}
                        >
                          <span>未指定</span>
                          <span className={activeSpeakerFilter === '__unassigned__' ? 'text-[#2B1B11] font-mono font-bold' : 'text-amber-200/90 font-mono font-bold'}>
                            ({unassignedSpeakerCount} 部)
                          </span>
                        </button>
                      )}

                      {activeSpeakerFilter && (
                        <button
                          type="button"
                          onClick={() => handleClearCategorySpeakerFilter(category.id)}
                          className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full bg-white/25 hover:bg-white/35 text-[11px] text-white border border-white/30 cursor-pointer transition font-medium ml-1"
                          title="清除主講人篩選，顯示本主題全部語音"
                        >
                          <X className="w-3 h-3" />
                          <span>清除主講人篩選</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 標頭右側控制區：(1) 右上方置入「收合本廳」功能（位於類別標籤下拉選單上方），(2) 查詢功能列與類別標籤選單，(3) 下排分頁與各項操作按鈕 */}
                <div className="flex flex-col items-start md:items-end gap-2 shrink-0 w-full md:w-auto">
                  {/* (1) 收合本廳功能（移動到「類別標籤」下拉選單的上方） */}
                  <div className="w-full flex justify-start md:justify-end">
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapse(category.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-black/35 hover:bg-black/55 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm transition cursor-pointer border border-white/25 shadow-xs"
                      title={isCollapsed ? `展開「${category.name}」主題館藏書架` : `收合「${category.name}」主題館藏書架`}
                    >
                      {isCollapsed ? (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 text-amber-300" />
                          <span>展開本廳</span>
                        </>
                      ) : (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 text-amber-300" />
                          <span>收合本廳</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* (2) 查詢功能列 + (3) 右方類別標籤選單（置於分頁下拉功能的上方） */}
                  {itemsInCat.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs w-full md:w-auto justify-start md:justify-end">
                      {/* 關鍵字查詢輸入框 */}
                      <div className="relative min-w-[180px] sm:min-w-[210px] flex-1 md:flex-initial">
                        <Search className="w-3.5 h-3.5 text-white/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          placeholder={`在「${category.name}」中查詢...`}
                          value={categorySearchQueryMap[category.id] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCategorySearchQueryMap((prev) => ({ ...prev, [category.id]: val }));
                            setCategoryPageMap((prev) => ({ ...prev, [category.id]: 1 }));
                          }}
                          className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-black/35 hover:bg-black/45 focus:bg-black/55 text-white placeholder-white/60 text-xs border border-white/25 focus:outline-none focus:border-amber-300 transition"
                        />
                        {categorySearchQueryMap[category.id] && (
                          <button
                            type="button"
                            onClick={() => {
                              setCategorySearchQueryMap((prev) => ({ ...prev, [category.id]: '' }));
                              setCategoryPageMap((prev) => ({ ...prev, [category.id]: 1 }));
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-0.5 cursor-pointer"
                            title="清除查詢關鍵字"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* 類別標籤下拉選單（置於查詢功能列的右方） */}
                      <div className="relative min-w-[150px] sm:min-w-[170px] flex-1 md:flex-initial">
                        <Tag className="w-3.5 h-3.5 text-white/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <select
                          value={categoryTagFilterMap[category.id] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCategoryTagFilterMap((prev) => ({ ...prev, [category.id]: val }));
                            setCategoryPageMap((prev) => ({ ...prev, [category.id]: 1 }));
                          }}
                          className="w-full pl-7 pr-7 py-1.5 rounded-lg bg-black/35 hover:bg-black/45 focus:bg-black/55 text-white text-xs border border-white/25 focus:outline-none focus:border-amber-300 cursor-pointer appearance-none font-medium truncate"
                        >
                          <option value="" className="bg-[#2B1B11] text-white">
                            全部類別標籤 {categoryTags.length > 0 ? `(${categoryTags.length} 種)` : '(無標籤)'}
                          </option>
                          {categoryTags.map(({ tag, count }) => (
                            <option key={tag} value={tag} className="bg-[#2B1B11] text-white">
                              🏷️ #{tag} ({count} 部)
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-white/70 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      {/* 清除篩選條件按鈕 */}
                      {(Boolean(categorySearchQueryMap[category.id]) || Boolean(categoryTagFilterMap[category.id])) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCategorySearchQueryMap((prev) => ({ ...prev, [category.id]: '' }));
                            setCategoryTagFilterMap((prev) => ({ ...prev, [category.id]: '' }));
                            setCategoryPageMap((prev) => ({ ...prev, [category.id]: 1 }));
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold cursor-pointer border border-white/30 transition shadow-2xs shrink-0"
                          title="清除本館查詢與標籤篩選"
                        >
                          <X className="w-3 h-3" />
                          <span>清除</span>
                        </button>
                      )}

                      {/* 符合筆數即時指示 */}
                      {(Boolean(categorySearchQueryMap[category.id]) || Boolean(categoryTagFilterMap[category.id]) || activeSpeakerFilter) && (
                        <span className="text-[11px] text-amber-200/95 font-mono whitespace-nowrap shrink-0">
                          符合：<strong className="text-white font-bold">{filteredCategoryItems.length}</strong>/{itemsInCat.length}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 下排：分頁控制項與各項操作按鈕（置於查詢與標籤列的下方） */}
                  <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-start md:justify-end">
                    {/* 標題列分頁控制項 */}
                    {totalCount > 0 && (
                      <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-white/25 text-xs shadow-xs">
                        {/* 每頁部數下拉選單 */}
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            const newSize = Number(e.target.value);
                            setCategoryPageSizeMap((prev) => ({ ...prev, [category.id]: newSize }));
                            setCategoryPageMap((prev) => ({ ...prev, [category.id]: 1 }));
                          }}
                          className="bg-black/50 text-white text-[11px] font-medium rounded px-1.5 py-0.5 border border-white/25 focus:outline-none cursor-pointer"
                          title="切換每頁顯示館藏數量"
                        >
                          <option value={4} className="bg-[#2B1B11] text-white">每頁 4 部</option>
                          <option value={8} className="bg-[#2B1B11] text-white">每頁 8 部</option>
                          <option value={12} className="bg-[#2B1B11] text-white">每頁 12 部</option>
                          <option value={16} className="bg-[#2B1B11] text-white">每頁 16 部</option>
                          <option value={9999} className="bg-[#2B1B11] text-white">顯示全部</option>
                        </select>

                        {/* 翻頁按鈕與頁碼 */}
                        <div className="flex items-center gap-0.5 pl-1 border-l border-white/20">
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() =>
                              setCategoryPageMap((prev) => ({
                                ...prev,
                                [category.id]: Math.max(1, safePage - 1),
                              }))
                            }
                            className="p-1 rounded hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                            title="上一頁"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[11px] font-mono px-1 font-semibold whitespace-nowrap">
                            {safePage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() =>
                              setCategoryPageMap((prev) => ({
                                ...prev,
                                [category.id]: Math.min(totalPages, safePage + 1),
                              }))
                            }
                            className="p-1 rounded hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                            title="下一頁"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 全選 / 取消全選本廳語音 */}
                    {filteredCategoryItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleToggleSelectBatch(filteredCategoryItems)}
                        className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm transition cursor-pointer border border-white/25"
                        title={`全選或取消全選「${category.name}」主題館藏語音`}
                      >
                        {filteredCategoryItems.every((item) => selectedAudioIds.includes(item.id)) ? (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 text-amber-300" />
                            <span>取消本廳全選</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-3.5 h-3.5" />
                            <span>全選本廳 ({filteredCategoryItems.length})</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* 將已選取的多筆語音檔一併到放映室播放 */}
                    {selectedAudioItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handlePlaySelectedInScreeningRoom(category.id)}
                        className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer border border-emerald-300/40"
                        title="將目前已選取的多筆語音檔當作播放清單，一併到放映室播放"
                      >
                        <ListMusic className="w-3.5 h-3.5" />
                        <span>播放已選 ({selectedAudioItems.length} 部)</span>
                      </button>
                    )}

                    {/* 隨機播放本主題館藏語音（位於進入本廳放映室左方） */}
                    <button
                      type="button"
                      disabled={filteredCategoryItems.length === 0}
                      onClick={() => onStartShufflePlayback(filteredCategoryItems, category.id)}
                      className="px-3.5 py-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm transition cursor-pointer border border-white/25 shadow-xs"
                      title={`隨機排列並播放「${category.name}」主題館藏語音`}
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>隨機播放 {filteredCategoryItems.length > 0 ? `(${filteredCategoryItems.length})` : ''}</span>
                    </button>

                    <button
                      onClick={() => onNavigateToScreeningCategory(category.id)}
                      className="px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium flex items-center gap-1.5 backdrop-blur-sm transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>進入本廳放映室</span>
                    </button>
                    {!isGuest && (
                      <button
                        onClick={() => onNavigateToUpload(category.id)}
                        className="px-3.5 py-2 rounded-lg bg-[#FAF5EC] hover:bg-white text-[#2B1B11] text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>在此分類上傳語音</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 書架展示層（支援一鍵收合，收合時隱藏書架與底座橫樑） */}
              {!isCollapsed && (
                <>
                  <div className="p-6 pb-4 bg-gradient-to-b from-[#F8F3E8] to-[#EFE6D5]">
                {filteredCategoryItems.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-[#D5C5AE] rounded-xl bg-[#FAF6EE]">
                    <p className="text-[#7A6855] text-sm mb-3">
                      {activeSpeakerFilter || activeTagFilter || activeSearchQuery
                        ? '目前在此主題館藏中查無符合查詢或標籤條件的語音檔'
                        : `「${category.name}」書架目前尚無語音館藏`}
                    </p>
                    {activeSpeakerFilter || activeTagFilter || activeSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCategorySearchQueryMap((prev) => ({ ...prev, [category.id]: '' }));
                          setCategoryTagFilterMap((prev) => ({ ...prev, [category.id]: '' }));
                          handleClearCategorySpeakerFilter(category.id);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#8B5A2B] text-white text-xs font-medium hover:bg-[#70461F] transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>清除本館所有篩選 (顯示全部 {itemsInCat.length} 部)</span>
                      </button>
                    ) : !isGuest ? (
                      <button
                        type="button"
                        onClick={() => onNavigateToUpload(category.id)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#8B5A2B] text-white text-xs font-medium hover:bg-[#70461F] transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>立即上傳第一部語音檔</span>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {paginatedItems.map((item) => {
                        const callNumber =
                          audioCallNumberMap.get(item.id) || `${category.code}-1`;
                        const selectedOrder = selectedAudioIds.indexOf(item.id) + 1;
                        const isSelected = selectedOrder > 0;
                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleSelectAudioItem(item.id)}
                            title="點選卡片以選取或取消選取此語音檔（可選取多筆後一併到放映室播放）"
                            className={`group relative flex flex-col rounded-r-xl rounded-l-md book-spine-effect overflow-hidden transition-all duration-200 cursor-pointer ${
                              isSelected
                                ? 'bg-[#F2FAF5] border-2 border-[#2E5A44] ring-3 ring-[#2E5A44]/25 -translate-y-1.5 shadow-lg'
                                : 'bg-[#FFFDF9] border border-[#DFD2BE] hover:border-[#2E5A44] hover:-translate-y-1.5'
                            }`}
                          >
                            {/* 左側精裝書背裝飾條 */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-3 z-10"
                              style={{ backgroundColor: isSelected ? '#2E5A44' : category.themeColor }}
                            />

                            {/* 封面圖與快速播放按鈕 */}
                            <div className="relative h-44 w-full pl-3 overflow-hidden bg-[#2C221E]">
                              <img
                                src={item.coverImageUrl}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                              {/* 語音檔獨立編號（館藏分類編號 + 上傳順序流水號） */}
                              <span className="absolute top-2.5 left-5 px-2.5 py-0.5 rounded bg-black/75 text-[#F6E6D2] font-mono text-[11px] backdrop-blur-xs flex items-center shadow-sm">
                                <span className="text-amber-300 font-bold tracking-wider">{callNumber}</span>
                              </span>

                              {/* 右上角選取狀態徽章 */}
                              <span
                                className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shadow-md transition ${
                                  isSelected
                                    ? 'bg-[#2E5A44] text-white ring-2 ring-white/80'
                                    : 'bg-black/65 text-white/90 group-hover:bg-[#2E5A44] group-hover:text-white'
                                }`}
                              >
                                {isSelected ? (
                                  <>
                                    <CheckSquare className="w-3.5 h-3.5 text-amber-300" />
                                    <span>已選取 #{selectedOrder}</span>
                                  </>
                                ) : (
                                  <>
                                    <Square className="w-3.5 h-3.5" />
                                    <span>點選選取</span>
                                  </>
                                )}
                              </span>

                              {/* 時長、主講人與插圖數量（時長與展演圖中間顯示主講人） */}
                              <div className="absolute bottom-2.5 left-5 right-3 flex items-center justify-between gap-1 text-white text-xs">
                                {/* 時長 */}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs shrink-0 shadow-xs">
                                  <Clock className="w-3 h-3 text-amber-300" />
                                  <span className="font-mono text-[11px]">{formatDuration(item.duration)}</span>
                                </span>

                                {/* 顯示主講人（位於時長與展演圖中間） */}
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs text-[11px] max-w-[110px] truncate shrink-0 shadow-xs border border-white/10"
                                  title={item.speaker ? `主講人：${item.speaker}` : '主講人：尚未指定'}
                                >
                                  <User className="w-3 h-3 text-amber-300 shrink-0" />
                                  <span className={`truncate ${item.speaker ? 'text-[#F3D5B5] font-medium' : 'text-white/60 italic'}`}>
                                    {item.speaker || '未指定'}
                                  </span>
                                </span>

                                {/* 展演圖數量 */}
                                <span className="px-2 py-0.5 rounded bg-black/65 backdrop-blur-xs text-[11px] text-amber-200 shrink-0 shadow-xs">
                                  {item.playbackDisplay.slides.length} 張展演圖
                                </span>
                              </div>
                            </div>

                            {/* 書籍資訊內容 */}
                            <div className="flex-1 p-4 pl-5 flex flex-col justify-between space-y-3">
                              <div>
                                {/* 語音檔獨立編號與所屬館藏分類 + 主講人 */}
                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                  <span className="px-2 py-0.5 rounded bg-[#FAF4E8] border border-[#D5C5AE] text-[#5C3A1B] font-mono text-[10px] font-bold shadow-xs">
                                    {callNumber}
                                  </span>
                                  <span
                                    className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                                    style={{ backgroundColor: category.themeColor }}
                                  >
                                    [{category.code}] {category.name}
                                  </span>
                                  {item.speaker && (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium bg-[#F0E6D8] text-[#5C3A1B] border border-[#D8C7B2]"
                                      title={`主講人：${item.speaker}`}
                                    >
                                      <User className="w-2.5 h-2.5" />
                                      <span>{item.speaker}</span>
                                    </span>
                                  )}
                                </div>
                                <BookshelfCardTitle title={item.title} size="base" />
                                <p className="text-xs text-[#6E5D4F] mt-1.5 line-clamp-2 leading-relaxed">
                                  {item.description || '尚無館藏說明'}
                                </p>
                              </div>

                              <div className="pt-2 border-t border-[#EFE6D5] flex items-center justify-between gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectAudioItem(item.id);
                                  }}
                                  className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#2E5A44] hover:bg-[#234735] text-white shadow-xs'
                                      : 'bg-[#EFE6D5] hover:bg-[#E2D5C1] text-[#3A2518]'
                                  }`}
                                >
                                  {isSelected ? (
                                    <>
                                      <CheckSquare className="w-3.5 h-3.5" />
                                      <span>已選 (#{selectedOrder})</span>
                                    </>
                                  ) : (
                                    <>
                                      <Square className="w-3.5 h-3.5" />
                                      <span>選取語音</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectForPlayback(item);
                                  }}
                                  title="直接單獨播放此語音檔"
                                  className="py-2 px-2.5 rounded-lg bg-[#3A2518] hover:bg-[#593824] text-[#FAF5EC] text-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>單曲播放</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenShareModal(item, category);
                                  }}
                                  title="分享此語音檔給他人觀看"
                                  className="p-2 rounded-lg border border-[#DCCB88] bg-[#FAF4E8] hover:bg-amber-100 text-[#8B5A2B] transition cursor-pointer shrink-0"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                {!isGuest && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectForEdit(item);
                                    }}
                                    title="編輯語音檔、封面與播放圖文"
                                    className="p-2 rounded-lg border border-[#DCCB88] bg-[#FAF4E8] hover:bg-[#EFE2C8] text-[#5C3A1B] transition cursor-pointer"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 書架底部翻頁工具列（當主題館藏超過一頁時顯示） */}
                    {totalPages > 1 && (
                      <div className="mt-6 pt-4 border-t border-[#DFD2BE] flex flex-wrap items-center justify-between gap-3 text-xs text-[#5C3A1B]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            顯示第 {(safePage - 1) * pageSize + 1} 至 {Math.min(safePage * pageSize, totalCount)} 部
                            （{activeSpeakerFilter ? `主講人篩選共 ${totalCount} 部，本主題總計 ${itemsInCat.length} 部` : `本主題共 ${itemsInCat.length} 部`}）
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() => {
                              setCategoryPageMap((prev) => ({
                                ...prev,
                                [category.id]: Math.max(1, safePage - 1),
                              }));
                              document.getElementById(`category-shelf-${category.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 font-medium text-xs flex items-center gap-1 cursor-pointer transition shadow-2xs"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>上一頁</span>
                          </button>

                          <span className="px-3 py-1 rounded-lg bg-[#FAF4E8] border border-[#D5C5AE] font-mono font-bold text-xs text-[#5C3A1B]">
                            第 {safePage} / {totalPages} 頁
                          </span>

                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() => {
                              setCategoryPageMap((prev) => ({
                                ...prev,
                                [category.id]: Math.min(totalPages, safePage + 1),
                              }));
                              document.getElementById(`category-shelf-${category.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#FAF4E8] disabled:opacity-40 font-medium text-xs flex items-center gap-1 cursor-pointer transition shadow-2xs"
                          >
                            <span>下一頁</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 實體木質書架底座橫樑視覺 */}
              <div className="h-4 wood-shelf" />
            </>
          )}
        </section>
          );
        })}
      </div>

      {/* 底部浮動「已選取多筆語音檔播放清單」工具列 */}
      {selectedAudioItems.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-5xl mx-auto">
          <div className="rounded-2xl bg-[#261A13]/95 backdrop-blur-md text-[#FAF5EC] border-2 border-[#2E5A44] shadow-2xl p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#2E5A44] text-white text-xs font-bold">
                  <CheckSquare className="w-3.5 h-3.5 text-amber-300" />
                  <span>已手動選取 {selectedAudioItems.length} 部語音檔</span>
                </span>
                <span className="text-xs text-[#E6D7C3] font-mono">
                  總播放時長：{formatDuration(selectedTotalDurationSec)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {selectedAudioItems.map((item, idx) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 border border-white/20 text-[11px] text-[#FAF5EC] shrink-0"
                  >
                    <span className="text-amber-300 font-mono font-bold">#{idx + 1}</span>
                    <span className="truncate max-w-[130px]">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => toggleSelectAudioItem(item.id)}
                      className="text-white/70 hover:text-white ml-0.5 cursor-pointer"
                      title="取消選取此語音檔"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedAudioIds([])}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[#E6D7C3] text-xs font-semibold flex items-center gap-1 transition cursor-pointer border border-white/15"
              >
                <X className="w-3.5 h-3.5" />
                <span>清空重選</span>
              </button>
              <button
                type="button"
                onClick={() => onStartShufflePlayback(selectedAudioItems, selectedAisle)}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                title="將已選取的語音檔隨機排列並進入放映室播放"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>隨機播放已選 ({selectedAudioItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handlePlaySelectedInScreeningRoom(selectedAisle)}
                className="px-4 py-2 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer ring-2 ring-emerald-400/40"
                title="將已選取的多筆語音檔當作播放清單，一併到放映室播放"
              >
                <Play className="w-4 h-4 fill-current text-amber-300" />
                <span>一併到放映室播放 ({selectedAudioItems.length} 部)</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                    代表色系 (共 {THEME_COLOR_OPTIONS.length} 色)
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
                    館廳圖示 (共 {ICON_OPTIONS.length} 款)
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

              <div className="p-3 rounded-lg bg-[#FAF4E8] border border-[#D5C5AE]">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCatAllowGuest}
                    onChange={(e) => setNewCatAllowGuest(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#8B5A2B] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-[#2C221E]">
                    是否開啟訪客瀏覽
                  </span>
                  <span className="text-[11px] text-[#6E5D4F]">
                    （勾選後，訪客登入才能使用）
                  </span>
                </label>
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

      {/* 提示訊息 Toast */}
      {dashboardToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#2E5A44] text-white shadow-2xl border border-emerald-400/30 animate-bounce max-w-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-medium">{dashboardToast}</span>
        </div>
      )}

      {/* 語音檔案卡片「分享」彈出視窗 */}
      {shareModalItem && (
        <div className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
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
                    分享給朋友、社群或跨裝置一同觀賞聆聽
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareModalItem(null)}
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
                  src={shareModalItem.item.coverImageUrl}
                  alt={shareModalItem.item.title}
                  className="w-14 h-14 rounded-lg object-cover border border-[#C8B598] shrink-0 shadow-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded text-white font-medium flex items-center gap-1 shrink-0"
                      style={{ backgroundColor: shareModalItem.category.themeColor }}
                    >
                      {getCategoryIcon(shareModalItem.category.icon, 'w-3 h-3')}
                      <span>{shareModalItem.category.name}</span>
                    </span>
                    {shareModalItem.item.speaker && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#EAE0D0] text-[#5C3A1B] font-medium flex items-center gap-1">
                        <User className="w-3 h-3 text-[#8B5A2B]" />
                        <span>{shareModalItem.item.speaker}</span>
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-[#2C221E] truncate" title={shareModalItem.item.title}>
                    {shareModalItem.item.title}
                  </h4>
                  <p className="text-[11px] text-[#7A6855] font-mono mt-0.5">
                    索書號：{audioCallNumberMap.get(shareModalItem.item.id) || `${shareModalItem.category.code}-1`} · 時長：{formatDuration(shareModalItem.item.duration)}
                  </p>
                </div>
              </div>

              {/* 訪客瀏覽權限狀態說明 */}
              {Boolean(shareModalItem.category.allowGuest) ? (
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
                    value={currentDashboardShareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#D5C5AE] bg-white text-[#2C221E] font-mono select-all focus:outline-none focus:ring-2 focus:ring-[#8B5A2B]"
                  />
                  <button
                    type="button"
                    onClick={handleCopyDashboardShareUrl}
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
                  <button
                    type="button"
                    onClick={() => {
                      const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(currentDashboardShareUrl)}`;
                      window.open(lineUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="p-2.5 rounded-xl bg-[#06C755]/10 hover:bg-[#06C755]/20 border border-[#06C755]/30 text-[#06C755] font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    title="分享至 LINE"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#06C755] text-white text-[10px] font-bold flex items-center justify-center leading-none">L</span>
                    <span>LINE</span>
                  </button>

                  {/* Facebook */}
                  <button
                    type="button"
                    onClick={() => {
                      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentDashboardShareUrl)}`;
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
                      const tweetText = `邀請您在聲書閣觀賞聆聽：《${shareModalItem.item.title}》`;
                      const xUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentDashboardShareUrl)}&text=${encodeURIComponent(tweetText)}`;
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
                      const emailSubject = `聲書閣語音檔分享：《${shareModalItem.item.title}》`;
                      const emailBody = `邀請您在「聲書閣」觀賞聆聽此部作品：《${shareModalItem.item.title}》${
                        shareModalItem.item.speaker ? ` (主講：${shareModalItem.item.speaker})` : ''
                      }\n\n立即開啟放映室觀賞：\n${currentDashboardShareUrl}`;
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
                    onClick={handleDashboardNativeShare}
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
                      currentDashboardShareUrl
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
                onClick={() => setShareModalItem(null)}
                className="px-4 py-2 rounded-xl bg-[#3A2518] hover:bg-[#523522] text-white text-xs font-semibold cursor-pointer transition shadow-xs"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
