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
  imageUrl: string;
  caption: string;
  timestampSec: number; // 對應播放秒數 (0 代表全程或起始)
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
