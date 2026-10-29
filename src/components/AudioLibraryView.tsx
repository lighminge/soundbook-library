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
  AlertTriangle,
  Loader2,
  FileUp,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { AudioItem, Category, PlaybackSlide } from '../types';
import {
  getAudioFileDuration,
  uploadFileToGoogleDrive,
  fetchAudioBlobFromGoogleDrive,
} from '../services/storageService';
import { usePlayableAudioUrl } from '../utils/mediaCache';
import {
  SrtSegment,
  parseSrtContent,
  serializeSrtSegments,
  createSampleSrtSegments,
  secondsToSrtTime,
  srtTimeToSeconds,
  updateSegmentAndCascade,
  insertSegmentAt,
  reindexSegments,
} from '../utils/srtUtils';
import { formatDuration } from './DashboardView';

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

  // 編輯器基本表單狀態
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

  // ============================================================================
  // 區塊 3：播放時的文字顯示 (SRT 結構化時間區段編輯器) 狀態
  // ============================================================================
  const [srtSegments, setSrtSegments] = useState<SrtSegment[]>([]);
  // 目前正在編輯中的 SRT 區段 ID 與暫存欄位
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editSegStartSec, setEditSegStartSec] = useState<number>(0);
  const [editSegEndSec, setEditSegEndSec] = useState<number>(5);
  const [editSegStartSrt, setEditSegStartSrt] = useState<string>('00:00:00,000');
  const [editSegEndSrt, setEditSegEndSrt] = useState<string>('00:00:05,000');
  const [editSegText, setEditSegText] = useState<string>('');

  // ============================================================================
  // 區塊 4：播放時的圖片顯示 (支援選取 SRT 時間區段、修改、刪除確認、序號、10倍數分頁)
  // ============================================================================
  const [slides, setSlides] = useState<PlaybackSlide[]>([]);
  const [selectedSrtForNewSlide, setSelectedSrtForNewSlide] = useState<string>('0'); // 預設對應第 1 段或 'custom'
  const [newSlideCaption, setNewSlideCaption] = useState('');
  const [newSlideTimeSec, setNewSlideTimeSec] = useState(0);
  const [newSlideUrl, setNewSlideUrl] = useState('');

  // 單筆播放圖片的「修改」模式狀態
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editSlideCaption, setEditSlideCaption] = useState<string>('');
  const [editSlideTimeSec, setEditSlideTimeSec] = useState<number>(0);
  const [editSlideSrtChoice, setEditSlideSrtChoice] = useState<string>('custom');
  const [editSlideImageUrl, setEditSlideImageUrl] = useState<string>('');
  const [editSlideImageDriveId, setEditSlideImageDriveId] = useState<string | undefined>(
    undefined
  );

  // 單筆播放圖片的「刪除確認視窗」狀態
  const [slidePendingDelete, setSlidePendingDelete] = useState<{
    slide: PlaybackSlide;
    seqNumber: number;
  } | null>(null);

  // 播放圖片列表「分頁」狀態 (以 10 的倍數選取)
  const [slidePageSize, setSlidePageSize] = useState<number>(10);
  const [slideCurrentPage, setSlideCurrentPage] = useState<number>(1);

  // 圖書館風格「刪除整筆語音館藏確認視窗」狀態
  const [itemPendingDelete, setItemPendingDelete] = useState<AudioItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // 將編輯器中的 Google Drive 語音檔自動解析為瀏覽器 100% 可直接播放的 Blob/Data URL
  const { playableUrl: playableEditorAudioUrl, isLoadingAudio: isEditorAudioLoading } =
    usePlayableAudioUrl(audioUrl, audioDriveFileId, fetchAudioBlobFromGoogleDrive, formId);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
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

    const parsedSegments = parseSrtContent(
      item.playbackDisplay.textContent || '',
      item.duration || 20
    );
    const initialSegments =
      parsedSegments.length > 0 ? parsedSegments : createSampleSrtSegments(item.title);
    setSrtSegments(initialSegments);
    setEditingSegmentId(null);

    const itemSlides = item.playbackDisplay.slides || [];
    setSlides(itemSlides);
    setEditingSlideId(null);
    setSlideCurrentPage(1);

    if (initialSegments.length > 0) {
      setSelectedSrtForNewSlide(initialSegments[0].id);
      setNewSlideTimeSec(initialSegments[0].startSec);
    } else {
      setSelectedSrtForNewSlide('custom');
      setNewSlideTimeSec(0);
    }
  };

  // 當 srtSegments 變動且新增圖片選取的是某個 SRT 區段時，保持秒數同步
  useEffect(() => {
    if (selectedSrtForNewSlide !== 'custom') {
      const found = srtSegments.find((s) => s.id === selectedSrtForNewSlide);
      if (found) {
        setNewSlideTimeSec(found.startSec);
      } else if (srtSegments.length > 0) {
        setSelectedSrtForNewSlide(srtSegments[0].id);
        setNewSlideTimeSec(srtSegments[0].startSec);
      }
    }
  }, [srtSegments, selectedSrtForNewSlide]);

  /**
   * 啟動某一個 SRT 時間區段的「修改」模式
   */
  const startEditSrtSegment = (seg: SrtSegment) => {
    setEditingSegmentId(seg.id);
    setEditSegStartSec(seg.startSec);
    setEditSegEndSec(seg.endSec);
    setEditSegStartSrt(secondsToSrtTime(seg.startSec));
    setEditSegEndSrt(secondsToSrtTime(seg.endSec));
    setEditSegText(seg.text);
  };

  /**
   * 確認儲存某一個 SRT 時間區段的修改，並「同步修改後方受影響的所有區段時間」
   */
  const confirmEditSrtSegment = (targetIdx: number) => {
    const oldSeg = srtSegments[targetIdx];
    if (!oldSeg) return;

    const { updatedSegments, deltaSec } = updateSegmentAndCascade(
      srtSegments,
      targetIdx,
      editSegStartSec,
      editSegEndSec,
      editSegText
    );

    setSrtSegments(updatedSegments);
    setEditingSegmentId(null);

    // 若後方區段時間有推移，一併將綁定在後方時間的「播放時圖片」秒數同步推移
    if (deltaSec !== 0) {
      setSlides((prevSlides) =>
        prevSlides
          .map((sl) => {
            if (sl.timestampSec > oldSeg.startSec) {
              return {
                ...sl,
                timestampSec: Math.max(
                  0,
                  Math.round((sl.timestampSec + deltaSec) * 1000) / 1000
                ),
              };
            }
            if (sl.timestampSec === oldSeg.startSec) {
              return {
                ...sl,
                timestampSec: updatedSegments[targetIdx].startSec,
              };
            }
            return sl;
          })
          .sort((a, b) => a.timestampSec - b.timestampSec)
      );
    }

    const affectedCount = Math.max(0, updatedSegments.length - 1 - targetIdx);
    if (deltaSec !== 0 && affectedCount > 0) {
      showToast(
        `✅ 已更新第 #${targetIdx + 1} 區段，並自動同步推移後方 ${affectedCount} 個區段時間（${
          deltaSec > 0 ? `+${deltaSec}` : deltaSec
        } 秒）！`
      );
    } else {
      showToast(`✅ 已更新第 #${targetIdx + 1} 時間區段！`);
    }
  };

  /**
   * 在任一指定區段位置新增一個 SRT 時間段落，並自動開啟該段落的編輯模式
   */
  const handleInsertSrtAt = (insertIndex: number) => {
    const nextSegments = insertSegmentAt(srtSegments, insertIndex, 5);
    setSrtSegments(nextSegments);
    const created = nextSegments[insertIndex];
    if (created) {
      startEditSrtSegment(created);
    }
    showToast(`✅ 已於第 #${insertIndex + 1} 區段插入新時間段落，後方區段已自動順延！`);
  };

  /**
   * 刪除某一個 SRT 時間區段
   */
  const handleDeleteSrtSegment = (targetIdx: number) => {
    const seg = srtSegments[targetIdx];
    if (!seg) return;
    const remaining = reindexSegments(srtSegments.filter((_, i) => i !== targetIdx));
    setSrtSegments(remaining);
    if (editingSegmentId === seg.id) {
      setEditingSegmentId(null);
    }
    showToast(`已移除第 #${targetIdx + 1} 時間區段，並重新排列序號。`);
  };

  /**
   * 匯入使用者電腦/手機中的 .srt 字幕檔案
   */
  const handleImportSrtFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseSrtContent(content, duration);
      if (parsed.length === 0) {
        showToast('⚠️ 無法從檔案中解析出有效的 SRT 段落，請檢查檔案內容格式。');
        return;
      }
      setSrtSegments(parsed);
      setEditingSegmentId(null);
      setSelectedSrtForNewSlide(parsed[0].id);
      setNewSlideTimeSec(parsed[0].startSec);
      showToast(`✅ 成功匯入 SRT 檔案「${file.name}」（共 ${parsed.length} 個時間區段）！`);
    };
    reader.readAsText(file, 'utf-8');
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
      const sampleSegments = createSampleSrtSegments(cleanName);

      const newItem: AudioItem = {
        id: `audio_${Date.now()}`,
        title: cleanName,
        categoryId:
          defaultUploadCategoryId || categoryId || categories[0]?.id || 'cat_literature',
        description: `由裝置上傳之語音檔案（原始檔名：${file.name}）`,
        duration: detectedDuration,
        fileSize: file.size,
        mimeType: file.type || 'audio/mpeg',
        audioDriveFileId: uploadRes.fileId,
        audioUrl: uploadRes.directUrl,
        coverImageUrl: randomCover,
        playbackDisplay: {
          textContent: serializeSrtSegments(sampleSegments),
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
          ? '✅ 語音檔已成功寫入您的 Google 雲端硬碟！現在可編輯 SRT 時間段落與播放圖片。'
          : `⚠️ 語音檔已暫存於網頁，但尚未寫入 Google 雲端硬碟（原因：${
              uploadRes.errorReason || '尚未完成雲端硬碟連線設定'
            }）。`
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
          `現場錄音_${new Date()
            .toLocaleTimeString('zh-TW', { hour12: false })
            .replace(/:/g, '-')}.webm`,
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
    } catch {
      alert(
        '無法啟動麥克風錄音，請確認瀏覽器已授權麥克風權限，或直接使用「選取語音檔案上傳」。'
      );
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
      const matchedSrt = srtSegments.find((s) => s.id === selectedSrtForNewSlide);
      const targetSec = matchedSrt ? matchedSrt.startSec : Number(newSlideTimeSec) || 0;
      const defaultCap =
        newSlideCaption.trim() ||
        (matchedSrt
          ? matchedSrt.text.split('\n')[0].slice(0, 40)
          : file.name.replace(/\.[^/.]+$/, ''));

      const newSlide: PlaybackSlide = {
        id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        imageDriveId: res.fileId,
        imageUrl: res.directUrl,
        caption: defaultCap,
        timestampSec: targetSec,
      };
      setSlides((prev) =>
        [...prev, newSlide].sort((a, b) => a.timestampSec - b.timestampSec)
      );
      setNewSlideCaption('');
      showToast('✅ 已新增一張「播放時顯示圖片」！');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddSlideByUrl = () => {
    if (!newSlideUrl.trim()) return;
    const matchedSrt = srtSegments.find((s) => s.id === selectedSrtForNewSlide);
    const targetSec = matchedSrt ? matchedSrt.startSec : Number(newSlideTimeSec) || 0;
    const defaultCap =
      newSlideCaption.trim() ||
      (matchedSrt ? matchedSrt.text.split('\n')[0].slice(0, 40) : '播放展演插圖');

    const newSlide: PlaybackSlide = {
      id: `slide_${Date.now()}`,
      imageUrl: newSlideUrl.trim(),
      caption: defaultCap,
      timestampSec: targetSec,
    };
    setSlides((prev) =>
      [...prev, newSlide].sort((a, b) => a.timestampSec - b.timestampSec)
    );
    setNewSlideUrl('');
    setNewSlideCaption('');
    showToast('✅ 已加入播放展示圖片！');
  };

  /**
   * 啟動單筆「播放時圖片」的修改模式
   */
  const startEditSlide = (sl: PlaybackSlide) => {
    setEditingSlideId(sl.id);
    setEditSlideCaption(sl.caption);
    setEditSlideTimeSec(sl.timestampSec);
    setEditSlideImageUrl(sl.imageUrl);
    setEditSlideImageDriveId(sl.imageDriveId);

    const matchedSeg = srtSegments.find(
      (seg) => Math.abs(seg.startSec - sl.timestampSec) < 0.05
    );
    setEditSlideSrtChoice(matchedSeg ? matchedSeg.id : 'custom');
  };

  /**
   * 儲存單筆「播放時圖片」的修改
   */
  const confirmEditSlide = (slideId: string) => {
    setSlides((prev) =>
      prev
        .map((sl) =>
          sl.id === slideId
            ? {
                ...sl,
                caption: editSlideCaption.trim() || sl.caption,
                timestampSec: Math.max(0, Number(editSlideTimeSec) || 0),
                imageUrl: editSlideImageUrl.trim() || sl.imageUrl,
                imageDriveId: editSlideImageDriveId,
              }
            : sl
        )
        .sort((a, b) => a.timestampSec - b.timestampSec)
    );
    setEditingSlideId(null);
    showToast('✅ 已更新該筆播放圖片設定！');
  };

  /**
   * 在單筆播放圖片的「修改」模式中重新上傳圖片
   */
  const handleReplaceSlideImageInEdit = async (file: File) => {
    setIsUploading(true);
    try {
      const res = await uploadFileToGoogleDrive(file, (pct, text) => {
        setUploadProgress(pct);
        setUploadStatusText(text);
      });
      setEditSlideImageUrl(res.directUrl);
      setEditSlideImageDriveId(res.fileId);
      showToast('已上傳新圖片，請點擊「確認修改」完成套用！');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * 根據秒數找出對應或最接近的 SRT 時間區段描述
   */
  const findMatchingSrtLabel = (sec: number): string => {
    const exact = srtSegments.find((s) => Math.abs(s.startSec - sec) < 0.05);
    if (exact) {
      return `對應 SRT #${exact.index} [${secondsToSrtTime(
        exact.startSec
      )} --> ${secondsToSrtTime(exact.endSec)}]`;
    }
    const containing = srtSegments.find((s) => sec >= s.startSec && sec < s.endSec);
    if (containing) {
      return `位於 SRT #${containing.index} 區段內 (${secondsToSrtTime(sec)})`;
    }
    return `自訂出現時間：${secondsToSrtTime(sec)} (${sec} 秒)`;
  };

  const handleSaveEditorForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const serializedSrt = serializeSrtSegments(srtSegments);

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
        textContent: serializedSrt,
        slides:
          slides.length > 0
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
    showToast('✅ 語音檔案、SRT 時間段落與播放圖片設定已全部儲存！');
    onClearEditing();
    setActiveSubTab('list');
  };

  const filteredList =
    filterCategoryId === 'all'
      ? audioItems
      : audioItems.filter((item) => item.categoryId === filterCategoryId);

  // 播放圖片分頁計算 (以 10 的倍數分頁)
  const totalSlidesCount = slides.length;
  const totalSlidePages = Math.max(1, Math.ceil(totalSlidesCount / slidePageSize));
  const safeSlidePage = Math.min(slideCurrentPage, totalSlidePages);
  const slideStartIndex = (safeSlidePage - 1) * slidePageSize;
  const paginatedSlides = slides.slice(slideStartIndex, slideStartIndex + slidePageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* 儲存成功提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl bg-[#2E5A44] text-white shadow-2xl border border-emerald-400/30 animate-bounce max-w-md">
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
            支援電腦或手機上傳語音檔案至 Google 雲端硬碟，並以標準 SRT 時間區段編輯播放文字與圖片
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
          {/* 功能 b-(1)：語音檔案上傳區 */}
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
                  您可以先選擇要歸檔的「圖書館分類」，接著點擊下方按鈕從電腦或手機選取語音檔（支援 MP3, WAV, M4A, AAC, OGG, WebM），上傳完成後將自動開啟編輯器讓您設定封面圖、SRT 時間段落與播放圖片。
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

          {/* 已上傳語音檔案列表 */}
          <div className="parchment-card rounded-2xl p-6 shadow-md space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5D9C5] pb-4">
              <div>
                <h3 className="text-lg font-bold font-serif-tc text-[#2C221E]">
                  (2) 語音檔案編輯與館藏管理
                </h3>
                <p className="text-xs text-[#7A6855]">
                  點擊任一語音檔的「編輯檔名與播放圖文」即可修改檔名、說明內容、封面圖、SRT 時間段落文字與播放圖片
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
                        onClick={() => setItemPendingDelete(item)}
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
        /* 功能 b-(2)：語音檔案完整編輯器 */
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

            {/* 第一與第二區塊：基本資訊 & 封面圖 */}
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

            {/* 第三與第四區塊：播放時的文字顯示 (SRT 區段編輯器) & 播放時的圖片顯示 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* ====================================================================
                  3. 播放時的文字顯示 (SRT 格式時間區段獨立編輯區塊)
                 ==================================================================== */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#2E5A44] pl-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#2E5A44]" />
                    <span>3. 播放時的文字顯示 (SRT 時間區段編輯)</span>
                  </h4>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1a. 匯入 SRT 格式範本內容 */}
                    <button
                      type="button"
                      onClick={() => {
                        const samples = createSampleSrtSegments(title);
                        setSrtSegments(samples);
                        setEditingSegmentId(null);
                        showToast('✅ 已匯入標準 SRT 格式範本內容！');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#2E5A44]/15 text-[#2E5A44] hover:bg-[#2E5A44]/25 text-xs font-semibold cursor-pointer transition"
                    >
                      + 匯入 SRT 格式範本
                    </button>

                    {/* 1b. 匯入SRT檔案按鈕 */}
                    <label className="px-3 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-xs transition">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>匯入SRT檔案</span>
                      <input
                        type="file"
                        accept=".srt,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImportSrtFile(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C4938]">
                  <span>
                    共 <strong>{srtSegments.length}</strong> 個 SRT 時間區段 · 修改任一區段秒數將自動同步推移後方區段時間
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInsertSrtAt(0)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#C8B598] hover:border-[#2E5A44] text-[#2E5A44] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>在開頭新增第 #1 區段</span>
                  </button>
                </div>

                {/* SRT 每個時間段落的小編輯區塊清單 */}
                <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
                  {srtSegments.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border-2 border-dashed border-[#D5C5AE] bg-white/60 space-y-3">
                      <p className="text-xs text-[#7A6855]">
                        目前尚無時間區段，您可以點擊上方「匯入 SRT 格式範本」、「匯入SRT檔案」或直接新增第一段：
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInsertSrtAt(0)}
                        className="px-4 py-2 rounded-xl bg-[#2E5A44] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>新增第 #1 個時間區段</span>
                      </button>
                    </div>
                  ) : (
                    srtSegments.map((seg, idx) => {
                      const isEditingThis = editingSegmentId === seg.id;

                      return (
                        <div key={seg.id} className="space-y-2">
                          <div
                            className={`rounded-xl border transition-all p-3.5 ${
                              isEditingThis
                                ? 'bg-[#FFFDF7] border-2 border-[#2E5A44] shadow-md'
                                : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                            }`}
                          >
                            {/* 區塊頂部：序號 + SRT 起迄時間 + 修改/刪除/在後方新增按鈕 */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#EFE6D5]">
                              <div className="flex flex-wrap items-center gap-2">
                                {/* 1c. 前方序號 */}
                                <span className="px-2.5 py-0.5 rounded-md bg-[#3A2518] text-[#FAF5EC] font-mono text-xs font-bold">
                                  #{seg.index}
                                </span>
                                {/* 1c. SRT 起迄時間 */}
                                <span className="px-2.5 py-0.5 rounded-md bg-[#2E5A44]/10 text-[#2E5A44] font-mono text-xs font-semibold border border-[#2E5A44]/25">
                                  {secondsToSrtTime(seg.startSec)} {'-->'}{' '}
                                  {secondsToSrtTime(seg.endSec)}
                                </span>
                                <span className="text-[11px] text-[#7A6855] font-mono">
                                  ({seg.startSec}s ~ {seg.endSec}s)
                                </span>
                              </div>

                              {/* 1d. 每個小區塊的 修改、刪除、在此區段新增 按鈕 */}
                              <div className="flex items-center gap-1.5">
                                {!isEditingThis && (
                                  <button
                                    type="button"
                                    onClick={() => startEditSrtSegment(seg)}
                                    className="px-2.5 py-1 rounded-lg bg-[#8B5A2B]/15 hover:bg-[#8B5A2B] text-[#8B5A2B] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>修改</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleInsertSrtAt(idx + 1)}
                                  className="px-2.5 py-1 rounded-lg bg-[#2E5A44]/15 hover:bg-[#2E5A44] text-[#2E5A44] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                  title="在此時間區段後方插入一個新區段，並自動順延後續時間"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>在此後新增</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSrtSegment(idx)}
                                  className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                                  title="刪除此時間區段"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* 區塊內容：檢視模式 vs 修改模式 */}
                            {isEditingThis ? (
                              <div className="pt-3 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[#F4ECE0] border border-[#E2D5C1]">
                                  <div>
                                    <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                      起始時間 (秒數 / SRT 格式)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        value={editSegStartSec}
                                        onChange={(e) => {
                                          const val = Math.max(0, Number(e.target.value) || 0);
                                          const dur = Math.max(1, editSegEndSec - editSegStartSec);
                                          setEditSegStartSec(val);
                                          setEditSegStartSrt(secondsToSrtTime(val));
                                          // 若起始時間超過結束時間，自動維持原區段長度推算結束時間
                                          if (val >= editSegEndSec) {
                                            setEditSegEndSec(val + dur);
                                            setEditSegEndSrt(secondsToSrtTime(val + dur));
                                          }
                                        }}
                                        className="w-20 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                      />
                                      <span className="text-xs text-[#7A6855]">秒</span>
                                      <input
                                        type="text"
                                        value={editSegStartSrt}
                                        onChange={(e) => {
                                          setEditSegStartSrt(e.target.value);
                                          const parsed = srtTimeToSeconds(e.target.value);
                                          setEditSegStartSec(parsed);
                                        }}
                                        className="flex-1 min-w-0 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                        placeholder="00:00:00,000"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                      結束時間 (修改後自動推移後方區段)
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min={0.5}
                                        step={0.5}
                                        value={editSegEndSec}
                                        onChange={(e) => {
                                          const val = Math.max(0.5, Number(e.target.value) || 0);
                                          setEditSegEndSec(val);
                                          setEditSegEndSrt(secondsToSrtTime(val));
                                        }}
                                        className="w-20 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                      />
                                      <span className="text-xs text-[#7A6855]">秒</span>
                                      <input
                                        type="text"
                                        value={editSegEndSrt}
                                        onChange={(e) => {
                                          setEditSegEndSrt(e.target.value);
                                          const parsed = srtTimeToSeconds(e.target.value);
                                          setEditSegEndSec(parsed);
                                        }}
                                        className="flex-1 min-w-0 px-2 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                        placeholder="00:00:05,000"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                    本區段播放時顯示文字內容：
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={editSegText}
                                    onChange={(e) => setEditSegText(e.target.value)}
                                    className="w-full p-2.5 rounded-lg border border-[#C8B598] bg-white text-sm font-serif-tc focus:outline-none focus:border-[#2E5A44]"
                                    placeholder="請輸入此時間區段要顯示的字幕或導讀文字..."
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingSegmentId(null)}
                                    className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer"
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => confirmEditSrtSegment(idx)}
                                    className="px-3.5 py-1.5 rounded-lg bg-[#2E5A44] hover:bg-[#234735] text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>確認修改並同步後方時間</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-2.5">
                                <p className="text-sm text-[#2C221E] whitespace-pre-line font-serif-tc leading-relaxed">
                                  {seg.text || '（尚無文字內容，請點右上角「修改」輸入）'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ====================================================================
                  4. 播放時的圖片顯示 (支援選取 SRT 時間區段、修改、刪除確認、序號、10倍數分頁)
                 ==================================================================== */}
              <div className="lg:col-span-6 space-y-4">
                <h4 className="font-bold font-serif-tc text-base text-[#3A2518] border-l-4 border-[#2B4C7E] pl-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#2B4C7E]" />
                  <span>4. 播放時的圖片顯示 (支援綁定 SRT 時間區段與分頁管理)</span>
                </h4>

                {/* 新增播放圖片控制盒 (支援選取要加入的 SRT 時間區段) */}
                <div className="p-4 rounded-xl bg-[#F4ECE0] border border-[#E2D5C1] space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#2B4C7E] mb-1">
                      步驟 A：選取要加入的 SRT 時間區段 *
                    </label>
                    <select
                      value={selectedSrtForNewSlide}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSrtForNewSlide(val);
                        if (val !== 'custom') {
                          const seg = srtSegments.find((s) => s.id === val);
                          if (seg) {
                            setNewSlideTimeSec(seg.startSec);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-[#C8B598] bg-white text-xs font-medium text-[#2C221E] focus:outline-none focus:border-[#2B4C7E]"
                    >
                      {srtSegments.map((seg) => (
                        <option key={seg.id} value={seg.id}>
                          區段 #{seg.index} [{secondsToSrtTime(seg.startSec)} {'-->'}{' '}
                          {secondsToSrtTime(seg.endSec)}] —{' '}
                          {(seg.text || '').replace(/\n/g, ' ').slice(0, 28)}
                        </option>
                      ))}
                      <option value="custom">自訂出現秒數 (手動指定秒數)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                        步驟 B：圖片圖說文字 (Caption，選填)
                      </label>
                      <input
                        type="text"
                        value={newSlideCaption}
                        onChange={(e) => setNewSlideCaption(e.target.value)}
                        placeholder="若留空將自動帶入所選 SRT 區段文字摘要"
                        className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                        對應起始秒數 (秒)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={newSlideTimeSec}
                        disabled={selectedSrtForNewSlide !== 'custom'}
                        onChange={(e) => setNewSlideTimeSec(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white disabled:bg-[#EFE6D5] text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label className="flex-1 py-2.5 px-3 rounded-lg bg-[#2B4C7E] hover:bg-[#1E385F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>步驟 C：從電腦/手機上傳圖片至此時間區段</span>
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
                      placeholder="或直接貼上圖片網址 https://..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[#D5C5AE] bg-white text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddSlideByUrl}
                      className="px-3 py-1.5 rounded-lg bg-[#3A2518] text-white text-xs font-medium cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新增網址圖片</span>
                    </button>
                  </div>
                </div>

                {/* 2e. 總筆數統計與分頁數目選取 (10 的倍數) */}
                <div className="p-3 rounded-xl bg-[#EFE6D5] border border-[#DFCEB4] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-[#3A2518] font-semibold">
                    <span>
                      總筆數統計：共 <strong className="text-[#2B4C7E]">{totalSlidesCount}</strong> 筆圖片
                    </span>
                    {totalSlidesCount > 0 && (
                      <span className="text-[#7A6855] font-normal">
                        (顯示第 {slideStartIndex + 1} ~{' '}
                        {Math.min(slideStartIndex + slidePageSize, totalSlidesCount)} 筆)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-[#5C3A1B] font-medium">每頁顯示：</label>
                    <select
                      value={slidePageSize}
                      onChange={(e) => {
                        setSlidePageSize(Number(e.target.value));
                        setSlideCurrentPage(1);
                      }}
                      className="px-2 py-1 rounded-lg border border-[#C8B598] bg-white text-xs font-semibold text-[#2C221E]"
                    >
                      {[10, 20, 30, 40, 50].map((size) => (
                        <option key={size} value={size}>
                          {size} 筆 / 頁
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 已設定的播放時圖片列表（含前方序號、修改功能、刪除確認視窗） */}
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {paginatedSlides.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-dashed border-[#D5C5AE] bg-white/60 text-xs text-[#7A6855]">
                      目前尚無播放展示圖片，請由上方選取 SRT 時間區段並上傳圖片。
                    </div>
                  ) : (
                    paginatedSlides.map((sl, idxInPage) => {
                      const globalSeq = slideStartIndex + idxInPage + 1;
                      const isEditingThisSlide = editingSlideId === sl.id;

                      return (
                        <div
                          key={sl.id}
                          className={`rounded-xl border transition-all p-3 ${
                            isEditingThisSlide
                              ? 'bg-[#FFFDF7] border-2 border-[#2B4C7E] shadow-md'
                              : 'bg-white border-[#E2D5C1] hover:border-[#8B5A2B]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {/* 2d. 前方序號 */}
                              <span className="px-2.5 py-1 rounded-lg bg-[#2B4C7E] text-white font-mono text-xs font-bold shrink-0 mt-1">
                                #{globalSeq}
                              </span>

                              <img
                                src={isEditingThisSlide ? editSlideImageUrl : sl.imageUrl}
                                alt={sl.caption}
                                className="w-20 h-14 rounded-lg object-cover shrink-0 border border-[#D5C5AE]"
                              />

                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="inline-block px-2 py-0.5 rounded bg-[#2B4C7E]/10 text-[#2B4C7E] font-mono text-[11px] font-semibold">
                                  {findMatchingSrtLabel(sl.timestampSec)}
                                </span>
                                <p className="text-xs font-bold text-[#2C221E] line-clamp-2">
                                  {sl.caption || '（無圖說文字）'}
                                </p>
                              </div>
                            </div>

                            {/* 2b & 2c. 修改 與 刪除（彈出確認視窗）按鈕 */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isEditingThisSlide && (
                                <button
                                  type="button"
                                  onClick={() => startEditSlide(sl)}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#2B4C7E]/15 hover:bg-[#2B4C7E] text-[#2B4C7E] hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>修改</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setSlidePendingDelete({ slide: sl, seqNumber: globalSeq })
                                }
                                className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition cursor-pointer"
                                title="刪除此張播放圖片"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* 2b. 單筆圖片的「修改」展開面板 */}
                          {isEditingThisSlide && (
                            <div className="mt-3 pt-3 border-t border-[#EFE6D5] space-y-3 bg-[#FAF6EE] p-3 rounded-lg">
                              <div>
                                <label className="block text-[11px] font-semibold text-[#2B4C7E] mb-1">
                                  修改對應的 SRT 時間區段：
                                </label>
                                <select
                                  value={editSlideSrtChoice}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditSlideSrtChoice(val);
                                    if (val !== 'custom') {
                                      const seg = srtSegments.find((s) => s.id === val);
                                      if (seg) {
                                        setEditSlideTimeSec(seg.startSec);
                                      }
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs"
                                >
                                  {srtSegments.map((seg) => (
                                    <option key={seg.id} value={seg.id}>
                                      區段 #{seg.index} [{secondsToSrtTime(seg.startSec)} {'-->'}{' '}
                                      {secondsToSrtTime(seg.endSec)}] —{' '}
                                      {(seg.text || '').replace(/\n/g, ' ').slice(0, 26)}
                                    </option>
                                  ))}
                                  <option value="custom">自訂出現秒數</option>
                                </select>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                    修改圖片說明 (Caption)：
                                  </label>
                                  <input
                                    type="text"
                                    value={editSlideCaption}
                                    onChange={(e) => setEditSlideCaption(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-[#5C3A1B] mb-1">
                                    出現秒數 (秒)：
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={editSlideTimeSec}
                                    onChange={(e) => {
                                      setEditSlideSrtChoice('custom');
                                      setEditSlideTimeSec(Number(e.target.value) || 0);
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs font-mono"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <label className="px-3 py-1.5 rounded-lg bg-white border border-[#C8B598] hover:border-[#2B4C7E] text-[#2B4C7E] text-xs font-semibold cursor-pointer flex items-center gap-1">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>重新上傳替換此圖片</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleReplaceSlideImageInEdit(f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                <input
                                  type="url"
                                  value={editSlideImageUrl}
                                  onChange={(e) => setEditSlideImageUrl(e.target.value)}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-[#C8B598] bg-white text-xs"
                                  placeholder="圖片網址..."
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingSlideId(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[#D5C5AE] text-xs font-medium text-[#5C3A1B] hover:bg-[#EFE6D5] cursor-pointer"
                                >
                                  取消
                                </button>
                                <button
                                  type="button"
                                  onClick={() => confirmEditSlide(sl.id)}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#2B4C7E] hover:bg-[#1E385F] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>確認修改</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 2e. 分頁頁碼切換控制列 */}
                {totalSlidesCount > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#E5D9C5] text-xs">
                    <span className="text-[#7A6855]">
                      第 <strong>{safeSlidePage}</strong> / <strong>{totalSlidePages}</strong> 頁（共{' '}
                      {totalSlidesCount} 筆）
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeSlidePage <= 1}
                        onClick={() => setSlideCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>上一頁</span>
                      </button>

                      {Array.from({ length: totalSlidePages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          type="button"
                          key={pageNum}
                          onClick={() => setSlideCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded-lg font-mono font-semibold cursor-pointer ${
                            pageNum === safeSlidePage
                              ? 'bg-[#2B4C7E] text-white'
                              : 'bg-white border border-[#D5C5AE] text-[#5C3A1B] hover:bg-[#F4ECE0]'
                          }`}
                        >
                          {pageNum}
                        </button>
                      ))}

                      <button
                        type="button"
                        disabled={safeSlidePage >= totalSlidePages}
                        onClick={() =>
                          setSlideCurrentPage((p) => Math.min(totalSlidePages, p + 1))
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] disabled:opacity-45 text-[#3A2518] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <span>下一頁</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
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

      {/* ========================================================================
          2c. 圖書館典藏風格：「播放時圖片」刪除確認視窗 Modal
         ======================================================================== */}
      {slidePendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#2B4C7E] to-[#1E3557] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-200" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  移除播放展示圖片確認
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSlidePendingDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                確定要移除第 <strong>#{slidePendingDelete.seqNumber}</strong> 筆播放時顯示的圖片嗎？
              </p>

              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4]">
                <img
                  src={slidePendingDelete.slide.imageUrl}
                  alt={slidePendingDelete.slide.caption}
                  className="w-20 h-14 rounded-lg object-cover border border-[#C8B294] shrink-0 shadow-xs"
                />
                <div className="min-w-0 space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#2B4C7E] text-white">
                    序號 #{slidePendingDelete.seqNumber} ·{' '}
                    {secondsToSrtTime(slidePendingDelete.slide.timestampSec)}
                  </span>
                  <h4 className="font-bold font-serif-tc text-xs text-[#2C221E] line-clamp-2">
                    {slidePendingDelete.slide.caption || '（無圖說文字）'}
                  </h4>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  onClick={() => setSlidePendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] transition cursor-pointer"
                >
                  保留圖片 (取消)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = slidePendingDelete.slide.id;
                    const seq = slidePendingDelete.seqNumber;
                    setSlides((prev) => prev.filter((s) => s.id !== targetId));
                    if (editingSlideId === targetId) setEditingSlideId(null);
                    setSlidePendingDelete(null);
                    showToast(`✅ 已移除第 #${seq} 筆播放展示圖片！`);
                  }}
                  className="px-5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>確認刪除此圖片</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 圖書館典藏風格：刪除整筆語音館藏確認視窗 Modal */}
      {itemPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="parchment-card rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#D8C8B0] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#3A2218] to-[#522D20] text-[#FAF5EC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-300/30 flex items-center justify-center text-red-200">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="font-bold font-serif-tc text-base tracking-wide">
                  館藏撤架與雲端檔案刪除確認
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setItemPendingDelete(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-[#E6D7C3] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-[#3A2D25] leading-relaxed">
                您確定要從「聲書閣」撤下並刪除以下有聲書館藏嗎？
              </p>

              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#F4ECE0] border border-[#DFCEB4]">
                <img
                  src={itemPendingDelete.coverImageUrl}
                  alt={itemPendingDelete.title}
                  className="w-14 h-18 rounded-lg object-cover border border-[#C8B294] shrink-0 shadow-xs"
                />
                <div className="min-w-0 space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[#3A2518] text-[#F3D5B5]">
                    {categories.find((c) => c.id === itemPendingDelete.categoryId)?.name ||
                      '館藏作品'}
                  </span>
                  <h4 className="font-bold font-serif-tc text-sm text-[#2C221E] truncate">
                    {itemPendingDelete.title}
                  </h4>
                  <p className="text-xs text-[#7A6855] font-mono">
                    時長：{formatDuration(itemPendingDelete.duration)} · 展演圖片{' '}
                    {itemPendingDelete.playbackDisplay.slides.length} 張
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-[#6E4720] space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#8B5A2B] shrink-0" />
                  <span>將同步執行以下清理作業：</span>
                </p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] text-[#7A5835]">
                  <li>移除 Firebase 資料庫中的館藏紀錄與圖文設定</li>
                  <li>一併刪除 Google 雲端硬碟中關聯的語音檔與插圖檔案</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5D9C5]">
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={() => setItemPendingDelete(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#D5C5AE] bg-white hover:bg-[#F4ECE0] text-xs font-semibold text-[#5C3A1B] transition cursor-pointer"
                >
                  保留館藏 (取消)
                </button>
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={async () => {
                    if (!itemPendingDelete) return;
                    setIsDeletingItem(true);
                    try {
                      const target = itemPendingDelete;
                      const res = await onDeleteAudioItem(target.id);
                      setItemPendingDelete(null);
                      if (res.deletedOnDrive) {
                        showToast(
                          `✅ 已刪除「${target.title}」，並同步從 Google 雲端硬碟移除 ${res.deletedCount} 個關聯檔案！`
                        );
                      } else if (res.message) {
                        showToast(`⚠️ ${res.message}`);
                      } else {
                        showToast(`✅ 已刪除館藏「${target.title}」！`);
                      }
                    } finally {
                      setIsDeletingItem(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-60 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  {isDeletingItem ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在同步刪除雲端檔案...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>確認撤架並刪除雲端檔案</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
