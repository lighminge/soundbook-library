/**
 * 產生柔和的雙聲道/單聲道 WAV Data URL，讓預設館藏語音檔可直接播放並支援進度條拖曳
 */
export function generateSampleWavDataUrl(
  durationSec: number = 18,
  baseFreq: number = 440,
  chordType: 'warm' | 'story' | 'nature' | 'history' = 'warm'
): string {
  const sampleRate = 22050;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const notes =
    chordType === 'warm'
      ? [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2]
      : chordType === 'story'
      ? [baseFreq, baseFreq * 1.189, baseFreq * 1.498, baseFreq * 1.782]
      : chordType === 'nature'
      ? [baseFreq * 0.75, baseFreq, baseFreq * 1.33, baseFreq * 1.5]
      : [baseFreq * 0.8, baseFreq * 1.2, baseFreq * 1.5, baseFreq * 1.6];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIndex = Math.floor(t / 2.5) % notes.length;
    const freq = notes[noteIndex];
    const localT = t % 2.5;
    const envelope = Math.min(1, localT / 0.15) * Math.exp(-localT * 1.1);
    const wave =
      0.55 * Math.sin(2 * Math.PI * freq * t) +
      0.28 * Math.sin(2 * Math.PI * (freq * 1.5) * t) +
      0.17 * Math.sin(2 * Math.PI * (freq * 0.5) * t);

    const sample = Math.max(-1, Math.min(1, wave * envelope * 0.35));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}
