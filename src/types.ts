export interface Category {
  id: string;
  name: string;
  code: string; // e.g. "LIT-100" 圖書館索書號風格
  description: string;
  themeColor: string;
  icon: string;
  order: number;
  createdAt: string;
  /** 是否開啟訪客瀏覽（當管理者勾選開啟後，訪客登入才能瀏覽與使用此館藏分類） */
  allowGuest?: boolean;
}

export interface PlaybackSlide {
  id: string;
  imageDriveId?: string;
  imageFileName?: string; // 使用圖片的檔案名稱（修改後同步至 Google 雲端硬碟）
  imageUrl: string;
  caption: string; // 自動對應 SRT 時間區段的文字內容
  timestampSec: number; // 起始秒數
  endTimestampSec?: number; // 結束秒數
  startSegmentIndex?: number; // 起始 SRT 區段序號 (1-based)
  endSegmentIndex?: number; // 結束 SRT 區段序號 (1-based)
}

export interface PlaybackDisplay {
  textContent: string; // 播放時顯示的文字內容（支援時間軸或全篇講稿）
  slides: PlaybackSlide[]; // 播放時顯示的圖片集
}

export interface AudioItem {
  id: string;
  title: string;
  categoryId: string;
  speaker?: string; // 主講人
  description: string;
  tags?: string[]; // 類別標籤（例如：['繪本', '小說', '童話', '科普']）
  duration: number; // 秒數
  fileSize?: number; // bytes
  mimeType?: string;
  audioDriveFileId?: string;
  audioUrl: string;
  coverImageDriveId?: string;
  coverImageUrl: string;
  playbackDisplay: PlaybackDisplay;
  createdAt: string;
  updatedAt: string;
}

export interface Speaker {
  id: string; // e.g. "speaker_1730592000000"
  name: string; // 主講人姓名
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface AudioTag {
  id: string; // e.g. "tag_1730592000000_ab12c"
  name: string; // 類別標籤名稱（如：繪本、小說）
  order: number; // 顯示排序
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface SavedPlaylist {
  id: string; // e.g. "playlist_1730592000000"
  name: string; // 播放清單名稱
  description?: string; // 播放清單說明
  audioItemIds: string[]; // 播放清單內語音檔案的 ID 排序列表
  createdAt: string; // ISO 8601 時間字串
  updatedAt: string; // ISO 8601 時間字串
}

export type UserRole = 'admin' | 'user' | 'guest';

export interface AppUser {
  id: string; // e.g. "user_admin" or "user_1730592000000"
  username: string; // 登入帳號（不重複，如 admin）
  password: string; // 密碼
  displayName: string; // 顯示姓名或職稱（如 系統管理者）
  role: 'admin' | 'user'; // 帳號角色
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isGuest?: boolean;
}

export interface LoginLogRecord {
  id: string; // e.g. "login_1730592000000_abc"
  userId: string; // e.g. "user_admin", "user_...", "guest", or "unknown"
  username: string; // 登入帳號
  displayName: string; // 顯示名稱
  role: UserRole; // 帳號角色 ('admin' | 'user' | 'guest')
  status: 'success' | 'failed'; // 登入狀態 ('success' | 'failed')
  message?: string; // 登入說明（如：帳號密碼驗證登入、訪客模式進入、密碼錯誤等）
  deviceInfo?: string; // 裝置與瀏覽器環境資訊
  loginAt: string; // ISO 8601 登入時間
}

export interface PlayLogRecord {
  id: string; // e.g. "play_1730592000000_abc12"
  audioId: string; // 語音檔 ID
  audioTitle: string; // 播放當下的語音檔標題（快照）
  categoryId: string; // 播放當下的館藏分類 ID（快照）
  speaker: string; // 播放當下的主講人（快照）
  tags: string[]; // 播放當下的類別標籤（快照）
  userId: string; // 播放者 ID
  username: string; // 播放者帳號
  playedSeconds: number; // 本次實際播放的秒數
  playedAt: string; // ISO 8601 播放時間
}

export interface LoginScreenConfig {
  icon: string; // e.g., 'BookOpen' (對應 50 個圖示選項)
  title: string; // 登入畫面圖示下方的標題文字（預設：有聲書樓放映閣）
  updatedAt?: string; // ISO 8601
}

export interface CloudConfig {
  // Firebase 設定
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  firebaseStorageBucket: string;
  firebaseMessagingSenderId: string;
  firebaseAppId: string;
  // Google 雲端硬碟設定 (GAS Web App URL 或 Google Drive API Folder)
  googleDriveScriptUrl: string;
  googleDriveFolderId: string;
  // Firebase App Check (reCAPTCHA Enterprise) 雲端防護金鑰
  recaptchaEnterpriseSiteKey?: string;
}
