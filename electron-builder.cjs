const path = require('path');
const os = require('os');

module.exports = {
  appId: "com.jaidubber.app",
  productName: "JAI DUBBER",
  publish: [
    {
      provider: "github",
      owner: "SavoeunVanda",
      repo: "JAI-DUBBER-APP",
      releaseType: "release"
    }
  ],
  asar: false,
  directories: {
    output: path.join(os.tmpdir(), 'jai-dubber-release')
  },
  files: [
    "dist/**/*",
    "!**/*.map",
    "electron/**/*",
    "public/**/*",
    "server/whisper_transcribe.py",
    "server/demucs_separate.py",
    "server/check_ai_engine.py",
    "server/audio_pitch_detector.py",
    "server/setup_ai_engine.ps1",
    "server/autodub/**/*",
    "assets/**/*",
    "package.json"
  ],
  extraResources: [
    {
      from: "bin",
      to: "bin",
      filter: ["ffmpeg.exe", "ffprobe.exe", "pickFolder.exe"]
    },
    {
      from: "server/whisper_transcribe.py",
      to: "server/whisper_transcribe.py"
    },
    {
      from: "server/demucs_separate.py",
      to: "server/demucs_separate.py"
    },
    {
      from: "server/check_ai_engine.py",
      to: "server/check_ai_engine.py"
    },
    {
      from: "server/audio_pitch_detector.py",
      to: "server/audio_pitch_detector.py"
    },
    {
      from: "server/setup_ai_engine.ps1",
      to: "server/setup_ai_engine.ps1"
    },
    {
      from: "server/autodub",
      to: "server/autodub"
    },
    {
      from: "assets",
      to: "assets"
    }
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      },
      {
        target: "portable",
        arch: ["x64"]
      }
    ],
    icon: "public/favicon.ico"
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "JAI DUBBER",
    artifactName: "${productName} ${version} Setup.${ext}",
    include: "build/installer.nsh"
  },
  portable: {
    artifactName: "${productName} ${version} Portable.${ext}"
  }
};
