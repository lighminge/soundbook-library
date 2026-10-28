# 聲書閣 SoundBook Pavilion (`soundbook-library`)

一套以「數位有聲圖書館」為設計概念的現代化網頁系統，整合 **Firebase Cloud Firestore (`soundbook-library-db`)** 資料庫與 **Google 雲端硬碟 (Google Drive)** 儲存空間，並支援一鍵部署至 **GitHub Pages**。

---

## 核心功能

1. **館藏總覽 Dashboard**
   - 依圖書館索書號（如 `LIT-100` 文學朗讀館、`HIS-200` 歷史人文廳、`SCI-300` 科普新知閣、`MEM-400` 日常語音手札）分區展示木質書架與有聲書卡片。
   - 支援在網頁上即時新增自訂分類廳館（自訂名稱、索書號、代表色與圖示）。
2. **放映室 (Screening Room)**
   - 依分類篩選或關鍵字搜尋已上傳的語音檔。
   - 具備專業音訊播放控制（播放/暫停、進度拖曳、±5 秒快轉倒退、0.75x~2x 語速調整、循環播放）。
   - **同步展演舞台**：播放語音時自動切換「播放時的圖片顯示（支援多張時間軸插圖）」與「播放時的文字顯示（自動高亮對應秒數段落，並支援小/中/大字閱讀模式）」。
3. **語音檔案庫 (Audio Library & Studio)**
   - **(1) 語音檔案上傳**：支援電腦與手機跨裝置選取語音檔上傳至系統的 Google 雲端硬碟，並內建「手機/電腦麥克風直接錄音上傳」功能。
   - **(2) 語音檔案編輯**：可隨時編輯每個語音檔的 **檔名/標題**、**分類**、**館藏說明內容**、**封面圖**、**播放時的文字顯示** 以及 **播放時的圖片顯示**。

---

## 快速啟動與開發

```bash
# 安裝套件
npm install

# 啟動本地開發伺服器
npm run dev

# 編譯生產版本
npm run build
```

---

## 雲端串接設定指南

您可以直接點擊網頁右上角的 **「雲端連線設定」** 按鈕，在介面中填入以下資訊：

1. **Google 雲端硬碟儲存設定**：
   - 複製專案根目錄 [`google-drive-uploader.gs`](./google-drive-uploader.gs)（或點擊網頁「雲端連線設定」中的一鍵複製按鈕）。
   - 前往 [Google Apps Script](https://script.google.com/) 建立新專案並貼上程式碼，點擊「部署 -> 新增部署作業 -> 網頁應用程式（誰可以存取：所有人）」。
   - 將取得的 Web App URL 與您的 Google Drive 資料夾 ID 貼回網頁設定即可。
2. **Firebase Firestore 設定 (`soundbook-library-db`)**：
   - 於 [Firebase Console](https://console.firebase.google.com/) 建立名為 `soundbook-library-db` 的專案並啟用 Firestore Database。
   - 將 Firebase 設定中的 `apiKey`、`projectId` 等貼入網頁「雲端連線設定」即可即時同步。
