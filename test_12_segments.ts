import path from 'path';
import fs from 'fs';
import { runFFmpegExport } from './server/ffmpegExporter';

async function test() {
  const videoPath = 'C:\\Export\\Clip\\Harvest of Kindness_ The Orchard’s Guardian Episode 1\\EP002.mp4';
  const outPath = path.join(process.cwd(), 'test_12_out.mp4');

  console.log('Fetching real TTS audio sample from localhost:3000/api/tts...');
  const res = await fetch('http://localhost:3000/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'ជំរាបសួរ អ្នកទាំងអស់គ្នា ជួបគ្នាសារជាថ្មី', voice: 'km-KH-PisethNeural' })
  });
  const audioBuffer = Buffer.from(await res.arrayBuffer());
  console.log('Got audio buffer, length:', audioBuffer.length);

  const subtitles = [];
  for (let i = 0; i < 12; i++) {
    subtitles.push({
      id: 'sub-' + i,
      startTime: i * 4.5,
      endTime: (i * 4.5) + 3.0,
      text: 'បន្ទាត់សន្ទនាទី ' + (i + 1),
      speed: 1.0,
      audioBase64: audioBuffer.toString('base64'),
    });
  }

  console.log('Testing 12 audio segments export on EP002.mp4...');
  try {
    const result = await runFFmpegExport({
      videoFilePath: videoPath,
      subtitles,
      burnSubtitles: false,
      encoder: 'copy',
      muteOriginalAudio: true,
      originalAudioVolume: 0,
      targetFilePath: outPath,
      returnBuffer: false
    }, (p, t) => console.log(`[${p}%] ${t}`));

    console.log('Export SUCCESS!', result);
    if (fs.existsSync(outPath)) {
      console.log('Output file size:', fs.statSync(outPath).size);
      fs.unlinkSync(outPath);
    }
  } catch (err) {
    console.error('Export FAILED:', err);
  }
}
test();
