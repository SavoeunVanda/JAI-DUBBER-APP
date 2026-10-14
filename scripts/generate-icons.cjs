const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const srcPng = path.join(rootDir, 'favicon.png');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(srcPng)) {
  console.error(`[Error] favicon.png not found at: ${srcPng}`);
  process.exit(1);
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log(`[Icon Generator] Reading source icon: ${srcPng}`);

// 1. Copy 512x512 PNG to public/favicon.png and public/icon.png
const targetFaviconPng = path.join(publicDir, 'favicon.png');
const targetIconPng = path.join(publicDir, 'icon.png');
fs.copyFileSync(srcPng, targetFaviconPng);
fs.copyFileSync(srcPng, targetIconPng);
console.log(`[Icon Generator] Created public/favicon.png and public/icon.png`);

// 2. Build multi-resolution ICO for Windows (16, 24, 32, 48, 64, 128, 256)
const ffmpegExe = path.join(rootDir, 'bin', 'ffmpeg.exe');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = [];

for (const s of sizes) {
  const tmpPath = path.join(rootDir, `tmp_${s}.png`);
  try {
    execSync(`"${ffmpegExe}" -y -i "${srcPng}" -vf "scale=${s}:${s}:flags=lanczos" "${tmpPath}"`, { stdio: 'ignore' });
    if (fs.existsSync(tmpPath)) {
      pngBuffers.push({ size: s, buf: fs.readFileSync(tmpPath) });
      fs.unlinkSync(tmpPath);
    }
  } catch (err) {
    console.warn(`[Icon Generator Warning] Failed to generate ${s}x${s} icon with ffmpeg:`, err.message);
  }
}

if (pngBuffers.length === 0) {
  console.error('[Error] No PNG sizes generated for ICO!');
  process.exit(1);
}

// Assemble standard ICO binary structure
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved, must be 0
header.writeUInt16LE(1, 2); // Image type: 1 = ICO
header.writeUInt16LE(pngBuffers.length, 4); // Number of images

let currentOffset = 6 + (16 * pngBuffers.length);
const dirEntries = [];

for (const item of pngBuffers) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 0); // Width: 0 means 256
  entry.writeUInt8(item.size === 256 ? 0 : item.size, 1); // Height: 0 means 256
  entry.writeUInt8(0, 2); // Color count in palette (0 for truecolor)
  entry.writeUInt8(0, 3); // Reserved, must be 0
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(item.buf.length, 8); // Size of image data
  entry.writeUInt32LE(currentOffset, 12); // Offset of image data
  dirEntries.push(entry);
  currentOffset += item.buf.length;
}

const finalIcoBuffer = Buffer.concat([
  header,
  ...dirEntries,
  ...pngBuffers.map((p) => p.buf),
]);

const targetFaviconIco = path.join(publicDir, 'favicon.ico');
fs.writeFileSync(targetFaviconIco, finalIcoBuffer);
console.log(`[Icon Generator] Created multi-resolution public/favicon.ico (${finalIcoBuffer.length} bytes, ${pngBuffers.length} sizes)`);

// 3. Also copy into dist/ if dist exists so live dev/preview picks it up immediately
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  fs.copyFileSync(targetFaviconIco, path.join(distDir, 'favicon.ico'));
  fs.copyFileSync(targetFaviconPng, path.join(distDir, 'favicon.png'));
  console.log(`[Icon Generator] Copied icons to dist/`);
}

console.log('[Icon Generator] All application icons successfully generated and updated!');
