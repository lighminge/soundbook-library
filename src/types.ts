export interface Category {
  id: string;
  name: string;
  code: string; // e.g. "LIT-100" 圖書館索書號風格
  description: string;
  themeColor: string;
  icon: string;
  order: number;
  createdAt: string;
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
}
