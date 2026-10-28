import { AudioItem, Category } from '../types';
import { generateSampleWavDataUrl } from '../utils/audioSynth';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat_literature',
    name: '文學朗讀館',
    code: 'LIT-100',
    description: '世界名著、現代散文與經典詩詞朗讀典藏',
    themeColor: '#8B5A2B',
    icon: 'BookOpen',
    order: 1,
    createdAt: '2026-10-20T09:00:00Z',
  },
  {
    id: 'cat_history',
    name: '歷史人文廳',
    code: 'HIS-200',
    description: '歲月故事、地方口述歷史與人物傳記有聲紀錄',
    themeColor: '#2E5A44',
    icon: 'Landmark',
    order: 2,
    createdAt: '2026-10-20T09:05:00Z',
  },
  {
    id: 'cat_science',
    name: '科普新知閣',
    code: 'SCI-300',
    description: '自然科學、天文探索與生活知識有聲導覽',
    themeColor: '#2B4C7E',
    icon: 'Compass',
    order: 3,
    createdAt: '2026-10-20T09:10:00Z',
  },
  {
    id: 'cat_notes',
    name: '日常語音手札',
    code: 'MEM-400',
    description: '個人靈感隨筆、會議紀要與生活聲音明信片',
    themeColor: '#7A3E65',
    icon: 'Feather',
    order: 4,
    createdAt: '2026-10-20T09:15:00Z',
  },
];

export const INITIAL_AUDIO_ITEMS: AudioItem[] = [
  {
    id: 'audio_sample_1',
    title: '《小王子》B612 星球的玫瑰與日落',
    categoryId: 'cat_literature',
    description: '朗讀聖修伯里經典名作《小王子》精選章節，搭配星空與玫瑰插畫，適合夜晚靜心聆聽。',
    duration: 20,
    fileSize: 882044,
    mimeType: 'audio/wav',
    audioDriveFileId: 'demo_drive_file_001',
    audioUrl: generateSampleWavDataUrl(20, 392, 'warm'),
    coverImageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    playbackDisplay: {
      textContent: `[00:00] 第一節：B612 小行星的清晨
在小王子居住的那顆只比一間房子大一點點的星球上，只要把椅子稍微挪動幾步，就能隨時看見美麗的日落。

[00:07] 第二節：獨一無二的玫瑰
「正是因為你為你的玫瑰花費了時間，才使你的玫瑰變得如此重要。」狐狸輕聲對小王子說道。

[00:14] 第三節：用心才能看見真實
真正重要的事物，用眼睛是看不見的，唯有用心去傾聽，才能感受星空中微風般的笑聲。`,
      slides: [
        {
          id: 's1',
          imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1000&q=80',
          caption: '開場：B612 星球上靜謐的金色黃昏與玫瑰',
          timestampSec: 0,
        },
        {
          id: 's2',
          imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1000&q=80',
          caption: '中段：星空下與狐狸的對話，學會何謂「馴養」與羈絆',
          timestampSec: 7,
        },
        {
          id: 's3',
          imageUrl: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=1000&q=80',
          caption: '尾聲：仰望滿天繁星，每一顆星星都像在微笑',
          timestampSec: 14,
        },
      ],
    },
    createdAt: '2026-10-25T14:20:00Z',
    updatedAt: '2026-10-26T10:00:00Z',
  },
  {
    id: 'audio_sample_2',
    title: '老街百年茶行的歲月口述史',
    categoryId: 'cat_history',
    description: '實地訪談大稻埕老茶行第三代傳人，細數台灣烏龍茶外銷輝煌年代的焙茶工藝與碼頭故事。',
    duration: 16,
    fileSize: 705644,
    mimeType: 'audio/wav',
    audioDriveFileId: 'demo_drive_file_002',
    audioUrl: generateSampleWavDataUrl(16, 330, 'history'),
    coverImageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80',
    playbackDisplay: {
      textContent: `[00:00] 百年茶香的起點
清晨五點，木炭在焙籠下微微發紅，整條老街便瀰漫著溫潤的春茶香氣。

[00:08] 跨越海洋的茶箱記憶
每一口手工彩繪的木製茶箱，都承載著百年前製茶師傅對品質的堅持，從淡水河畔遠渡重洋。`,
      slides: [
        {
          id: 's2_1',
          imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1000&q=80',
          caption: '傳統炭火焙茶工序與溫潤茶湯',
          timestampSec: 0,
        },
        {
          id: 's2_2',
          imageUrl: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=1000&q=80',
          caption: '典藏於閣樓的百年茶葉錫罐與帳冊',
          timestampSec: 8,
        },
      ],
    },
    createdAt: '2026-10-26T18:30:00Z',
    updatedAt: '2026-10-26T18:30:00Z',
  },
  {
    id: 'audio_sample_3',
    title: '深海鯨歌：座頭鯨的跨洋交響曲',
    categoryId: 'cat_science',
    description: '解析座頭鯨如何透過低頻聲波在數千公里外的深海中傳遞訊息，並搭配深海觀測影像導覽。',
    duration: 18,
    fileSize: 793844,
    mimeType: 'audio/wav',
    audioDriveFileId: 'demo_drive_file_003',
    audioUrl: generateSampleWavDataUrl(18, 293.66, 'nature'),
    coverImageUrl: 'https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=800&q=80',
    playbackDisplay: {
      textContent: `[00:00] 海洋中的聲波通道 (SOFAR Channel)
在海平面下約一千公尺處，水溫與水壓交織出一條天然的聲波通道，讓鯨魚的歌聲得以環遊半個地球。

[00:09] 每年演變的海洋詩篇
同一海域的座頭鯨會共同傳唱相同的曲調，並在每年遷徙季節加入新的樂句，宛如海洋文明的口傳史詩。`,
      slides: [
        {
          id: 's3_1',
          imageUrl: 'https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=1000&q=80',
          caption: '蔚藍深海中潛行的座頭鯨身影',
          timestampSec: 0,
        },
        {
          id: 's3_2',
          imageUrl: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1000&q=80',
          caption: '陽光穿透海面折射出的深海聲波意象',
          timestampSec: 9,
        },
      ],
    },
    createdAt: '2026-10-27T11:15:00Z',
    updatedAt: '2026-10-27T11:15:00Z',
  },
  {
    id: 'audio_sample_4',
    title: '秋日山林漫步：午後雨聲與讀書筆記',
    categoryId: 'cat_notes',
    description: '在山間木屋錄下的午後陣雨聲，以及閱讀《湖濱散記》後的隨手語音靈感紀錄。',
    duration: 15,
    fileSize: 661544,
    mimeType: 'audio/wav',
    audioDriveFileId: 'demo_drive_file_004',
    audioUrl: generateSampleWavDataUrl(15, 440, 'story'),
    coverImageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
    playbackDisplay: {
      textContent: `[00:00] 森林木屋的窗邊
雨滴敲打在杉木屋簷上，泡上一杯熱咖啡，翻開書頁的瞬間，時間彷彿慢了下來。

[00:08] 隨手記下的一句話
「我們走入森林，是為了刻意且從容地面對生活的本質。」把這段話錄下來，留給未來的自己。`,
      slides: [
        {
          id: 's4_1',
          imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=80',
          caption: '薄霧籠罩的秋日杉木林步道',
          timestampSec: 0,
        },
      ],
    },
    createdAt: '2026-10-28T08:00:00Z',
    updatedAt: '2026-10-28T08:00:00Z',
  },
];
