@echo off
title JAI DUBBER - Launching...
cd /d "%~dp0"

echo ===================================================
echo     JAI DUBBER - AI Video Dubbing to Khmer
echo ===================================================
echo Starting Backend Server & Frontend Application...

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] First time setup: Installing dependencies...
    npm install
)

:: Check if build exists
if not exist "dist\server.cjs" (
    echo [INFO] Building application...
    npm run build
)

:: Launch Server and automatically open default browser
echo [OK] Launching JAI DUBBER at http://localhost:3000
start "" http://localhost:3000
npm start
