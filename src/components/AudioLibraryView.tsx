import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Mic,
  Square,
  Edit3,
  Trash2,
  Play,
  Plus,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  HardDrive,
  Sparkles,
  Clock,
  FolderOpen,
  Save,
  X,
} from 'lucide-react';
import { AudioItem, Category, PlaybackSlide } from '../types';
import {
  getAudioFileDuration,
  uploadFileToGoogleDrive,
  fetchAudioBlobFromGoogleDrive,
} from '../services/storageService';
import { usePlayableAudioUrl } from '../utils/mediaCache';
import { formatDuration, getCategoryIcon } from './DashboardView';

interface AudioLibraryViewProps {
  categories: Category[];
  audioItems: AudioItem[];
  editingItem: AudioItem | null;
  defaultUploadCategoryId?: string;
  onSaveAudioItem: (item: AudioItem) => Promise<void>;
  onDeleteAudioItem: (itemId: string) => Promise<{
    deletedOnDrive: boolean;
    deletedCount: number;
    message?: string;
  }>;
  onPlayInScreeningRoom: (item: AudioItem) => void;
  onClearEditing: () => void;
}

const DEFAULT_COVER_IMAGES = [
  'https://images.unsplash.com/photo-1507842229356-51c61504d3ab?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=800&q=80',
];

export const AudioLibraryView: React.FC<AudioLibraryViewProps> = ({
  categories,
  audioItems,
  editingItem,
  defaultUploadCategoryId,
  onSaveAudioItem,
  onDeleteAudioItem,
  onPlayInScreeningRoom,
  onClearEditing,
}) => {
  // 決定目前開啟的分頁：'list' (館藏列表與上傳) 或 'editor' (編輯/新建語音檔詳細設定)
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'editor'>('list');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');

  // 上傳進度狀態
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 手機/電腦麥克風即時錄音狀態
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // 編輯器表單狀態
  const [formId, setFormId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>(
    defaultUploadCategoryId || categories[0]?.id || 'cat_literature'
  );
  const [description, setDescription] = useState<string>('');
  const [duration, setDuration] = useState<number>(20);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioDriveFileId, setAudioDriveFileId] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string>(DEFAULT_COVER_IMAGES[0]);
  const [coverImageDriveId, setCoverImageDriveId] = useState<string>('');
  const [playbackText, setPlaybackText] = useState<string>('');
  const [slides, setSlides] = useState<PlaybackSlide[]>([]);

  // 新增單張播放圖片的暫存狀態
  const [newSlideCaption, setNewSlideCaption] = useState('');
  const [newSlideTimeSec, setNewSlideTimeSec] = useState(0);
  const [newSlideUrl, setNewSlideUrl] = useState('');

  // 將編輯器中的 Google Drive 語音檔自動解析為瀏覽器 100% 可直接播放的 Blob/Data URL
  const { playableUrl: playableEditorAudioUrl, isLoadingAudio: isEditorAudioLoading } =
    usePlayableAudioUrl(audioUrl, audioDriveFileId, fetchAudioBlobFromGoogleDrive);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 當外部傳入 editingItem 時，自動載入至編輯器
  useEffect(() => {
    if (editingItem) {
      loadItemIntoEditor(editingItem);
      setActiveSubTab('editor');
    }
  }, [editingItem]);

  useEffect(() => {
    if (defaultUploadCategoryId) {
      setCategoryId(defaultUploadCategoryId);
    }
  }, [defaultUploadCategoryId]);

  const loadItemIntoEditor = (item: AudioItem) => {
    setFormId(item.id);
    setTitle(item.title);
    setCategoryId(item.categoryId);
    setDescription(item.description);
    setDuration(item.duration);
    setAudioUrl(item.audioUrl);
    setAudioDriveFileId(item.audioDriveFileId || '');
    setCoverImageUrl(item.coverImageUrl);
    setCoverImageDriveId(item.coverImageDriveId || '');
    setPlaybackText(item.playbackDisplay.textContent || '');
    setSlides(item.playbackDisplay.slides || []);
  };

  /**
   * 處理電腦或手機選取語音檔案上傳至 Google 雲端硬碟
   */
  const handleAudioFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(5);
    setUploadStatusText(`準備上傳語音檔：${file.name}`);

    try {
      const [uploadRes, detectedDuration] = await Promise.all([
        uploadFileToGoogleDrive(file, (pct, text) => {
          setUploadProgress(pct);
          setUploadStatusText(text);
        }),
        getAudioFileDuration(file),
      ]);

      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const randomCover =
        DEFAULT_COVER_IMAGES[Math.floor(Math.random() * DEFAULT_COVER_IMAGES.length)];

      const newItem: AudioItem = {
        id: `audio_${Date.now()}`,
        title: cleanName,
        categoryId: defaultUploadCategoryId || categoryId || categories[0]?.id || 'cat_literature',
        description: `由裝置上傳之語音檔案（原始檔名：${file.name}）`,
        duration: detectedDuration,
        fileSize: file.size,
        mimeType: file.type || 'audio/mpeg',
        audioDriveFileId: uploadRes.fileId,
        audioUrl: uploadRes.directUrl,
        coverImageUrl: randomCover,
        playbackDisplay: {
          textContent: `[00:00] 開始播放：${cleanName}\n請在此輸入播放時同步顯示的導讀文字、逐字稿或故事段落。`,
          slides: [
            {
              id: `slide_${Date.now()}`,
              imageUrl: randomCover,
              caption: `${cleanName} — 開場展示畫面`,
              timestampSec: 0,
            },
          ],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveAudioItem(newItem);
      loadItemIntoEditor(newItem);
      setActiveSubTab('editor');
      showToast(
        uploadRes.mode === 'google_drive'
          ? '✅ 語音檔已成功寫入您的 Google 雲端硬碟！現在可編輯封面與播放圖文。'
          : `⚠️ 語音檔已暫存於網頁，但尚未寫入 Google 雲端硬碟（原因：${uploadRes.errorReason || '尚未完成雲端硬碟連線設定'}）。請點右上角「雲端連線設定」檢測！`
      );
    } catch (err) {
      console.error('上傳語音檔失敗:', err);
      showToast('上傳發生錯誤，請確認檔案格式。');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 手機 / 電腦直接麥克風錄音並轉成語音檔上傳
   */
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const file = new File(
          [blob],
          `現場錄音_${new Date().toLocaleTimeString('zh-TW', { hour12: false }).replace(/:/g, '-')}.webm`,
          { type: 'audio/webm' }
        );
        await handleAudioFileUpload(file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      alert('無法啟動麥克風錄音，請確認瀏覽器已授權麥克風權限，或直接使用「選取語音檔案上傳」。');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  /**
   * 編輯器內：更換語音檔案本身
   */
  const handleReplaceAudioInEditor = async (file: File) => {
    setIsUploading(true);
    try {
      const [uploadRes, detectedDuration] = await Promise.all([
        uploadFileToGoogleDrive(file, (pct, text) => {
          setUploadProgress(pct);
          setUploadStatusText(text);
        }),
        getAudioFileDuration(file),
      ]);
      setAudioUrl(uploadRes.directUrl);
      setAudioDriveFileId(uploadRes.fileId);
      setDuration(detectedDuration);
      showToast('已更新語音檔案！');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 編輯器內：上傳「封面圖」至 Google 雲端硬碟
   */
  const handleCoverImageUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const res = await uploadFileToGoogleDrive(file, (pct, text) => {
        setUploadProgress(pct);
        setUploadStatusText(text);
      });
      setCoverImageUrl(res.directUrl);
      setCoverImageDriveId(res.fileId);
      showToast('封面圖已上傳並更新！');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 編輯器內：上傳「播放時顯示的圖片 (Slide)」至 Google 雲端硬碟
   */
  const handleSlideImageUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const res = await uploadFileToGoogleDrive(file, (pct, text) => {
        setUploadProgress(pct);
        setUploadStatusText(text);
      });
      const newSlide: PlaybackSlide = {
        id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        imageDriveId: res.fileId,
        imageUrl: res.directUrl,
        caption: newSlideCaption.trim() || file.name.replace(/\.[^/.]+$/, ''),
        timestampSec: Number(newSlideTimeSec) || 0,
      };
      setSlides((prev) =>
        [...prev, newSlide].sort((a, b) => a.timestampSec - b.timestampSec)
      );
      setNewSlideCaption('');
      showToast('已新增一張「播放時顯示圖片」！');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddSlideByUrl = () => {
    if (!newSlideUrl.trim()) return;
    const newSlide: PlaybackSlide = {
      id: `slide_${Date.now()}`,
      imageUrl: newSlideUrl.trim(),
      caption: newSlideCaption.trim() || '播放展演插圖',
      timestampSec: Number(newSlideTimeSec) || 0,
    };
    setSlides((prev) =>
      [...prev, newSlide].sort((a, b) => a.timestampSec - b.timestampSec)
    );
    setNewSlideUrl('');
    setNewSlideCaption('');
    showToast('已加入播放展示圖片！');
  };

  const handleSaveEditorForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const updatedItem: AudioItem = {
      id: formId || `audio_${Date.now()}`,
      title: title.trim(),
      categoryId,
      description: description.trim(),
      duration: Number(duration) || 20,
      audioDriveFileId,
      audioUrl,
      coverImageDriveId,
      coverImageUrl: coverImageUrl || DEFAULT_COVER_IMAGES[0],
      playbackDisplay: {
        textContent: playbackText,
        slides: slides.length > 0
          ? slides
          : [
              {
                id: `slide_default_${Date.now()}`,
                imageUrl: coverImageUrl || DEFAULT_COVER_IMAGES[0],
                caption: title.trim(),
                timestampSec: 0,
              },
            ],
      },
      createdAt: editingItem?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveAudioItem(updatedItem);
    showToast('語音檔案與播放圖文設定已儲存！');
    onClearEditing();
    setActiveSubTab('list');
  };

  const filteredList =
    filterCategoryId === 'all'
      ? audioItems
      : audioItems.filter((item) => item.categoryId === filterCategoryId);

  return (
    <div className="space-y-6 pb-12">
      {/* 儲存成功提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#2E5A44] text-white shadow-2xl border border-emerald-400/30 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 頂部切換列：館藏管理 & 上傳 vs 語音檔案詳細編輯器 */}
      <div className="parchment-card rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif-tc text-[#2C221E]">
            語音檔案庫 (Audio Library & Studio)
          </h2>
          <p className="text-xs text-[#7A6855] mt-0.5">
            支援電腦或手機上傳語音檔案至 Google 雲端硬碟，並自由編輯檔名、說明、封面圖、播放時文字與播放時圖片
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => {
              onClearEditing();
              setActiveSubTab('list');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'list'
                ? 'bg-[#3A2518] text-white shadow-sm'
                : 'bg-[#EFE6D5] text-[#5C3A1B] hover:bg-[#E2D4BC]'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>語音上傳與館藏清單 ({audioItems.length})</span>
          </button>

          {formId && (
            <button
              onClick={() => setActiveSubTab('editor')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'editor'
                  ? 'bg-[#8B5A2B] text-white shadow-sm'
                  : 'bg-[#EFE6D5] text-[#5C3A1B] hover:bg-[#E2D4BC]'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span>正在編輯：{title || '語音館藏'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 上傳進度橫幅 */}
      {isUploading && (
        <div className="parchment-card rounded-2xl p-5 border-2 border-[#8B5A2B] shadow-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#5C3A1B]">
            <span className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 animate-spin text-[#8B5A2B]" />
              {uploadStatusText}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#E5D9C5] overflow-hidden">
            <div
              className="h-full bg-[#8B5A2B] transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {activeSubTab === 'list' ? (
        <div className="space-y-8">
          {/* 功能 b-(1)：語音檔案上傳區（支援電腦拖曳、手機選取檔案、手機/電腦直接錄音） */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 parchment-card rounded-2xl p-6 shadow-md border-2 border-dashed border-[#C8B294] hover:border-[#8B5A2B] transition flex flex-col justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#8B5A2B]/15 text-[#8B5A2B] text-xs font-semibold">
                  <Upload className="w-3.5 h-3.5" />
                  <span>(1) 語音檔案上傳 · 支援電腦與手機跨裝置</span>
                </div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  上傳語音檔案至系統 Google 雲端硬碟
                </h3>
                <p className="text-xs text-[#6E5D4F] leading-relaxed">
                  您可以先選擇要歸檔的「圖書館分類」，接著點擊下方按鈕從電腦或手機選取語音檔（支援 MP3, WAV, M4A, AAC, OGG, WebM），上傳完成後將自動開啟編輯器讓您設定封面圖與播放時顯示的圖文。
                </p>
              </div>

              <div className="my-5 flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="text-xs font-semibold text-[#5C3A1B] shrink-0">
                  預先指定館藏分類：
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-[#D5C5AE] bg-white text-sm font-medium text-[#2C221E] focus:outline-none focus:border-[#8B5A2B]"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      [{cat.code}] {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="w-full py-8 px-4 rounded-xl bg-[#FAF4E8] hover:bg-[#F3E9D6] border border-[#DFCEB4] flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center">
                <div className="w-12 h-12 rounded-full bg-[#8B5A2B] text-white flex items-center justify-center shadow-md">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-bold font-serif-tc text-base text-[#2C221E]">
                  點擊從電腦或手機選取語音檔案上傳
                </span>
                <span className="text-xs text-[#7A6855]">
                  支援 MP3 / M4A / WAV / OGG（手機可直接從檔案或錄音檔選取）
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioFileUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {/* 手機 / 電腦即時錄音上傳卡 */}
            <div className="lg:col-span-4 parchment-card rounded-2xl p-6 shadow-md flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#2E5A44]/15 text-[#2E5A44] text-xs font-semibold">
                  <Mic className="w-3.5 h-3.5" />
                  <span>行動端快速收錄</span>
                </div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  手機 / 電腦直接錄音上傳
                </h3>
                <p className="text-xs text-[#6E5D4F] leading-relaxed">
                  除了上傳現有音檔外，您也可以直接使用手機或電腦麥克風錄製口述故事或語音筆記，錄製完成後自動上傳至雲端硬碟並進入圖文編輯器。
                </p>
              </div>

              <div className="p-5 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] flex flex-col items-center justify-center gap-3">
                {isRecording ? (
                  <>
                    <div className="flex items-center gap-2 text-red-600 font-mono text-lg font-bold animate-pulse">
                      <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                      <span>錄音中 {formatDuration(recordingSeconds)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>停止錄音並上傳至雲端硬碟</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="w-full py-3.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>開始現場錄音</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 已上傳語音檔案列表（點擊任一項目進入功能 b-(2) 語音檔案編輯） */}
          <div className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5D9C5] pb-4">
              <div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  (2) 語音檔案編輯與館藏管理
                </h3>
                <p className="text-xs text-[#7A6855]">
                  點擊任一語音檔的「編輯檔名與播放圖文」即可修改檔名、說明內容、封面圖、播放時文字與播放時圖片
                </p>
              </div>

              {/* 分類過濾 */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setFilterCategoryId('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    filterCategoryId === 'all'
                      ? 'bg-[#3A2518] text-white'
                      : 'bg-[#EFE6D5] text-[#5C3A1B]'
                  }`}
                >
                  全部 ({audioItems.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                      filterCategoryId === cat.id
                        ? 'text-white'
                        : 'bg-[#EFE6D5] text-[#5C3A1B]'
                    }`}
                    style={
                      filterCategoryId === cat.id
                        ? { backgroundColor: cat.themeColor }
                        : undefined
                    }
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredList.map((item) => {
                const cat = categories.find((c) => c.id === item.categoryId);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-[#E2D5C1] hover:border-[#8B5A2B] transition shadow-xs"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={item.coverImageUrl}
                        alt={item.title}
                        className="w-16 h-20 rounded-lg object-cover shrink-0 border border-[#D5C5AE]"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {cat && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                              style={{ backgroundColor: cat.themeColor }}
                            >
                              {cat.name}
                            </span>
                          )}
                          <span className="text-xs font-mono text-[#7A6855] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration)}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-[#F3ECE0] text-[#6E5641]">
                            播放圖片 {item.playbackDisplay.slides.length} 張
                          </span>
                        </div>
                        <h4 className="font-bold font-serif-tc text-base text-[#2C221E] truncate">
                          {item.title}
                        </h4>
                        <p className="text-xs text-[#6E5D4F] line-clamp-1">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => onPlayInScreeningRoom(item)}
                        className="px-3 py-2 rounded-lg bg-[#EFE6D5] hover:bg-[#E2D4BC] text-[#3A2518] text-xs font-medium flex items-center gap-1 cursor-pointer"
                        title="在放映室播放"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>預覽播放</span>
                      </button>
                      <button
                        onClick={() => {
                          loadItemIntoEditor(item);
                          setActiveSubTab('editor');
                        }}
                        className="px-3.5 py-2 rounded-lg bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>編輯檔名與播放圖文</span>
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              `確定要刪除「${item.title}」嗎？\n（系統將一併刪除 Google 雲端硬碟中關聯的語音檔與圖片）`
                            )
                          ) {
                            const res = await onDeleteAudioItem(item.id);
                            if (res.deletedOnDrive) {
                              showToast(
                                `✅ 已刪除「${item.title}」，並同步從 Google 雲端硬碟移除 ${res.deletedCount} 個關聯檔案！`
                              );
                            } else if (res.message) {
                              showToast(`⚠️ ${res.message}`);
                            } else {
                              showToast(`✅ 已刪除館藏「${item.title}」！`);
                            }
                          }
                        }}
                        className="p-2 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                        title="刪除此語音檔與雲端硬碟檔案"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* 功能 b-(2)：語音檔案完整編輯器 (檔名、分類、說明、封面圖、播放時文字、播放時圖片) */
        <form onSubmit={handleSaveEditorForm} className="space-y-6">
          <div className="parchment-card rounded-2xl p-6 shadow-lg space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5D9C5] pb-4">
              <div>
                <span className="text-xs font-semibold text-[#8B5A2B] uppercase tracking-wider">
                  AUDIO ITEM EDITOR · 館藏語音全功能編輯器
                </span>
                <h3 className="text-xl font-bold font-serif-tc text-[#2C221E] mt-0.5">
                  編輯語音檔：{title || '未命名語音'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearEditing();
                    setActiveSubTab('list');
                  }}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  <span>返回列表</span>
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>儲存全部變更</span>
                </button>
              </div>
            </div>

            {/* 第一區塊：基本資訊（檔名、分類、說明內容、更換音檔） */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#8B5A2B] pl-3">
                  1. 語音檔名、分類與說明內容
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      語音檔案名稱 / 標題 *
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="請輸入語音標題..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm font-medium focus:outline-none focus:border-[#8B5A2B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                      所屬圖書館分類 *
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm font-medium focus:outline-none focus:border-[#8B5A2B]"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          [{cat.code}] {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#5C3A1B] mb-1">
                    館藏說明內容（顯示於書架卡片與放映室簡介）
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="輸入這段語音的背景說明、錄製者或摘要介紹..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5C5AE] bg-white text-sm focus:outline-none focus:border-[#8B5A2B]"
                  />
                </div>

                {/* 音訊預覽與重新上傳音檔 */}
                <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#5C3A1B]">
                      目前綁定語音檔（時長：{formatDuration(duration)}）
                      {isEditorAudioLoading && (
                        <span className="ml-2 text-[#8B5A2B] animate-pulse">
                          正在從雲端硬碟載入音訊串流...
                        </span>
                      )}
                    </span>
                    <label className="px-3 py-1 rounded-lg bg-white border border-[#C8B598] hover:border-[#8B5A2B] text-xs font-medium text-[#5C3A1B] cursor-pointer flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>重新上傳替換語音檔</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleReplaceAudioInEditor(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <audio
                    key={playableEditorAudioUrl}
                    controls
                    src={playableEditorAudioUrl}
                    className="w-full h-9"
                  />
                </div>
              </div>

              {/* 第二區塊：封面圖設定 */}
              <div className="lg:col-span-5 space-y-4">
                <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#8B5A2B] pl-3">
                  2. 語音檔案封面圖 (Cover Image)
                </h4>

                <div className="flex flex-col sm:flex-row gap-4 items-center p-4 rounded-xl bg-white border border-[#E2D5C1]">
                  <img
                    src={coverImageUrl}
                    alt="封面預覽"
                    className="w-32 h-40 rounded-lg object-cover shadow-md border border-[#D5C5AE] shrink-0"
                  />
                  <div className="space-y-3 flex-1 w-full">
                    <label className="w-full py-2.5 px-3 rounded-xl bg-[#8B5A2B] hover:bg-[#70461F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition">
                      <Upload className="w-4 h-4" />
                      <span>從電腦/手機上傳封面圖至雲端硬碟</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleCoverImageUpload(f);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <div>
                      <label className="block text-[11px] text-[#7A6855] mb-1">
                        或直接貼上封面圖片網址：
                      </label>
                      <input
                        type="url"
                        value={coverImageUrl}
                        onChange={(e) => setCoverImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs focus:outline-none focus:border-[#8B5A2B]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr className="border-[#E5D9C5]" />

            {/* 第三區塊：播放時的文字顯示 & 播放時的圖片顯示 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 播放時的文字顯示 */}
              <div className="lg:col-span-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#2E5A44] pl-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#2E5A44]" />
                    <span>3. 播放時的文字顯示 (講稿 / 字幕 / 故事內容)</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaybackText((prev) =>
                        `${prev ? prev + '\n\n' : ''}[00:10] 新段落標題\n請輸入此段落播放時要顯示的文字...`
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#2E5A44]/15 text-[#2E5A44] hover:bg-[#2E5A44]/25 text-xs font-semibold cursor-pointer"
                  >
                    + 插入時間段落範本
                  </button>
                </div>

                <p className="text-xs text-[#7A6855]">
                  支援全篇文字或以空行分隔的 `[分:秒]` 段落（例如 `[00:08]`），放映室播放時將自動高亮對應秒數的文字段落！
                </p>

                <textarea
                  rows={11}
                  value={playbackText}
                  onChange={(e) => setPlaybackText(e.target.value)}
                  placeholder={`[00:00] 第一段：開場白\n在此輸入語音開始播放時顯示的文字...\n\n[00:10] 第二段：重點內容\n當語音播放到第 10 秒時，放映室會自動高亮這段文字！`}
                  className="w-full p-4 rounded-xl border border-[#D5C5AE] bg-white text-sm font-serif-tc leading-relaxed focus:outline-none focus:border-[#8B5A2B]"
                />
              </div>

              {/* 播放時的圖片顯示 (Playback Slides) */}
              <div className="lg:col-span-6 space-y-4">
                <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#2B4C7E] pl-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#2B4C7E]" />
                  <span>4. 播放時的圖片顯示 (可設定單張或多張隨時間切換)</span>
                </h4>

                <p className="text-xs text-[#7A6855]">
                  設定在「放映室」播放語音時舞台中央顯示的插圖或投影片，可指定每張圖出現的秒數與圖說。
                </p>

                {/* 新增播放圖片控制盒 */}
                <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                        新增圖片的圖說文字 (Caption)
                      </label>
                      <input
                        type="text"
                        value={newSlideCaption}
                        onChange={(e) => setNewSlideCaption(e.target.value)}
                        placeholder="例如：第二幕插畫 — 星夜下的森林"
                        className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                        出現秒數 (秒)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newSlideTimeSec}
                        onChange={(e) => setNewSlideTimeSec(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex-1 py-2 px-3 rounded-lg bg-[#2B4C7E] hover:bg-[#1E385F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5" />
                      <span>從電腦/手機上傳播放圖片至雲端硬碟</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleSlideImageUpload(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="url"
                      value={newSlideUrl}
                      onChange={(e) => setNewSlideUrl(e.target.value)}
                      placeholder="或貼上圖片網址 https://..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddSlideByUrl}
                      className="px-3 py-1.5 rounded-lg bg-[#3A2518] text-white text-xs font-medium cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新增網址圖片</span>
                    </button>
                  </div>
                </div>

                {/* 已設定的播放時圖片列表 */}
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {slides.map((sl, index) => (
                    <div
                      key={sl.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E2D5C1]"
                    >
                      <img
                        src={sl.imageUrl}
                        alt={sl.caption}
                        className="w-16 h-12 rounded object-cover shrink-0 border border-[#D5C5AE]"
                      />
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={sl.caption}
                          onChange={(e) => {
                            const updated = [...slides];
                            updated[index] = { ...sl, caption: e.target.value };
                            setSlides(updated);
                          }}
                          className="sm:col-span-2 px-2.5 py-1 rounded border border-[#E2D5C1] text-xs"
                          placeholder="圖片說明..."
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            value={sl.timestampSec}
                            onChange={(e) => {
                              const updated = [...slides];
                              updated[index] = {
                                ...sl,
                                timestampSec: Number(e.target.value) || 0,
                              };
                              setSlides(updated);
                            }}
                            className="w-16 px-2 py-1 rounded border border-[#E2D5C1] text-xs font-mono"
                          />
                          <span className="text-[11px] text-[#7A6855]">秒</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSlides(slides.filter((s) => s.id !== sl.id))}
                        className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
                        title="移除此張播放圖片"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 底部儲存按鈕列 */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5D9C5]">
              <button
                type="button"
                onClick={() => {
                  onClearEditing();
                  setActiveSubTab('list');
                }}
                className="px-5 py-2.5 rounded-xl border border-[#D5C5AE] text-xs font-semibold text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#2E5A44] hover:bg-[#234735] text-white text-sm font-semibold shadow-md cursor-pointer flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>儲存語音檔案設定</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
