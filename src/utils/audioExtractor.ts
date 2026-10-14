// Extract and compress audio track from video files into 16kHz Mono WAV format
// This reduces 50MB+ video files down to 1-5MB audio files for fast, reliable AI transcription.

export async function extractAudioFromVideo(file: File): Promise<{ base64: string; mimeType: string; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();
  
  // 1. Decode original audio track from video/audio file
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  const tempCtx = new AudioCtxClass();
  
  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error('Failed to decode audio track from video file:', err);
    throw new Error('មិនអាចទាញយកសំឡេងពីវីដេអូនេះបានទេ។ សូមពិនិត្យមើលទ្រង់ទ្រាយវីដេអូរបស់អ្នក។');
  } finally {
    await tempCtx.close();
  }

  // 2. Resample to 16,000 Hz Mono for optimal speech recognition
  const targetSampleRate = 16000;
  const duration = decodedBuffer.duration;
  const totalSamples = Math.ceil(duration * targetSampleRate);

  const offlineCtx = new OfflineAudioContext(1, totalSamples, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = decodedBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const resampledBuffer = await offlineCtx.startRendering();
  const channelData = resampledBuffer.getChannelData(0);

  // 3. Convert to 16-bit PCM WAV ArrayBuffer
  const wavArrayBuffer = encodeWAV(channelData, targetSampleRate);
  const blob = new Blob([wavArrayBuffer], { type: 'audio/wav' });

  // 4. Convert Blob to Base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve({
        base64,
        mimeType: 'audio/wav',
        duration,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM = 1) */
  view.setUint16(20, 1, true);
  /* channel count (1 = mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample (16-bit) */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Float32 to Int16 PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
