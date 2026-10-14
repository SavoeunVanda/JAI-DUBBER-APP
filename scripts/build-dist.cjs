const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const target = process.argv[2] || 'both';
console.log(`[Build] Building target: ${target}...`);

// 0. Generate latest icons from root favicon.png
try {
  execSync('node scripts/generate-icons.cjs', { stdio: 'inherit' });
} catch (e) {
  console.warn('[Build Warning] Icon generation warning:', e.message);
}

// 1. Build frontend and backend
execSync('npm run build', { stdio: 'inherit' });

// Remove any lingering source map files for security
const serverMap = path.join(__dirname, '..', 'dist', 'server.cjs.map');
if (fs.existsSync(serverMap)) {
  fs.unlinkSync(serverMap);
}

// Ensure server Python scripts are copied into dist/server/
const distServerDir = path.join(__dirname, '..', 'dist', 'server');
if (!fs.existsSync(distServerDir)) fs.mkdirSync(distServerDir, { recursive: true });
const pyScripts = ['whisper_transcribe.py', 'demucs_separate.py', 'check_ai_engine.py', 'audio_pitch_detector.py', 'setup_ai_engine.ps1'];
for (const pyFile of pyScripts) {
  const pySrc = path.join(__dirname, '..', 'server', pyFile);
  const pyDst = path.join(distServerDir, pyFile);
  if (fs.existsSync(pySrc)) {
    console.log(`[Build] Copying ${pyFile} -> dist/server/...`);
    fs.copyFileSync(pySrc, pyDst);
  }
}

// Copy server/autodub to dist/server/autodub
const autodubSrc = path.join(__dirname, '..', 'server', 'autodub');
const autodubDst = path.join(distServerDir, 'autodub');
if (fs.existsSync(autodubSrc)) {
  console.log('[Build] Copying server/autodub -> dist/server/autodub...');
  fs.cpSync(autodubSrc, autodubDst, { recursive: true });
}

// Copy assets to dist/assets
const assetsSrc = path.join(__dirname, '..', 'assets');
const distAssetsDir = path.join(__dirname, '..', 'dist', 'assets');
if (fs.existsSync(assetsSrc)) {
  console.log('[Build] Copying assets -> dist/assets...');
  fs.cpSync(assetsSrc, distAssetsDir, { recursive: true });
}

// Ensure bundled FFmpeg and FFprobe binaries are present in bin/
const binDir = path.join(__dirname, '..', 'bin');
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

const ffmpegSrc = 'C:\\Users\\voeun\\AppData\\Local\\Programs\\Multi Tool KH\\system\\ffmpeg';
for (const bName of ['ffmpeg.exe', 'ffprobe.exe']) {
  const targetPath = path.join(binDir, bName);
  if (!fs.existsSync(targetPath)) {
    const srcPath = path.join(ffmpegSrc, bName);
    if (fs.existsSync(srcPath)) {
      console.log(`[Build] Copying ${bName} from ${srcPath} -> ${targetPath}...`);
      fs.copyFileSync(srcPath, targetPath);
    } else {
      console.warn(`[Build Warning] Could not find ${bName} to bundle!`);
    }
  }
}

const tempOutputDir = path.join(os.tmpdir(), 'jai-dubber-release');
const projectReleaseDir = path.join(__dirname, '..', 'release');
if (!fs.existsSync(projectReleaseDir)) {
  fs.mkdirSync(projectReleaseDir, { recursive: true });
}

// 2. Package with electron-builder
if (target === 'portable' || target === 'both') {
  console.log('[Build] Packaging Portable Windows .exe...');
  execSync('npx electron-builder --config electron-builder.cjs --win portable', { stdio: 'inherit' });
}
if (target === 'nsis' || target === 'both') {
  console.log('[Build] Packaging NSIS Setup Installer .exe...');
  execSync('npx electron-builder --config electron-builder.cjs --win nsis', { stdio: 'inherit' });
}

// 3. Copy outputs to ./release
if (fs.existsSync(tempOutputDir)) {
  const files = fs.readdirSync(tempOutputDir);
  for (const file of files) {
    if (file.endsWith('.exe') || file.endsWith('.yml') || file.endsWith('.blockmap')) {
      const src = path.join(tempOutputDir, file);
      const dst = path.join(projectReleaseDir, file);
      let copied = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          fs.copyFileSync(src, dst);
          copied = true;
          console.log(`[Done] Copied ${file} -> release/${file}`);
          break;
        } catch (err) {
          if (attempt < 3) {
            console.log(`[Notice] ${file} is locked, retrying in 1s (attempt ${attempt}/3)...`);
            execSync('powershell -Command "Start-Sleep -Seconds 1"');
          } else {
            console.warn(`[Warning] Could not overwrite release/${file} (is the app currently running?): ${err.message}`);
            console.log(`[Info] Built file remains available at: ${src}`);
          }
        }
      }
    }
  }

  // Also ensure hyphenated installer name exists if latest.yml specifies it
  const latestYmlPath = path.join(projectReleaseDir, 'latest.yml');
  if (fs.existsSync(latestYmlPath)) {
    const content = fs.readFileSync(latestYmlPath, 'utf-8');
    const match = content.match(/url:\s*([^\r\n]+)/);
    if (match && match[1]) {
      const expectedName = match[1].trim();
      const expectedPath = path.join(projectReleaseDir, expectedName);
      if (!fs.existsSync(expectedPath)) {
        const spacedName = expectedName.replace(/-/g, ' ');
        const spacedPath = path.join(projectReleaseDir, spacedName);
        if (fs.existsSync(spacedPath)) {
          fs.copyFileSync(spacedPath, expectedPath);
          console.log(`[Done] Created GitHub-compatible alias: release/${expectedName}`);
        }
      }
    }
  }
}

console.log('[Success] All executables are available in the ./release directory!');
