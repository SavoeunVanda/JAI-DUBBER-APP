param(
    [string]$InstDir = ""
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "=================================================================="
Write-Host "[JAI DUBBER] Starting Automated AI Engine Setup..."
Write-Host "=================================================================="

function Download-FileFast {
    param(
        [string]$Url,
        [string]$Dest
    )
    if (Test-Path $Dest) {
        Remove-Item $Dest -Force -ErrorAction SilentlyContinue
    }
    $curlExe = "$env:SystemRoot\System32\curl.exe"
    if (Test-Path $curlExe) {
        Write-Host "-> Downloading: $Url"
        & $curlExe -L --retry 3 --connect-timeout 20 -o "$Dest" "$Url"
        if ($LASTEXITCODE -eq 0 -and (Test-Path $Dest) -and ((Get-Item $Dest).Length -gt 10000)) {
            return $true
        }
    }
    try {
        Write-Host "-> Downloading via WebClient: $Url"
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($Url, $Dest)
        if ((Test-Path $Dest) -and ((Get-Item $Dest).Length -gt 10000)) {
            return $true
        }
    } catch {
        Write-Host "[WARN] Download error: $($_.Exception.Message)"
    }
    return $false
}

function Install-VcRedist {
    Write-Host "[Step 1/6] Checking Microsoft Visual C++ Redistributable (x64)..."
    $vcRuntime1 = "$env:SystemRoot\System32\vcruntime140_1.dll"
    $vcOmp = "$env:SystemRoot\System32\vcomp140.dll"
    if ((Test-Path $vcRuntime1) -and (Test-Path $vcOmp)) {
        Write-Host "[OK] Visual C++ Redistributable (x64) is already present."
        return
    }
    Write-Host "-> Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)..."
    $vcInstaller = Join-Path $env:TEMP "jai_vc_redist.x64.exe"
    $downloaded = Download-FileFast -Url "https://aka.ms/vs/17/release/vc_redist.x64.exe" -Dest $vcInstaller
    if ($downloaded -and (Test-Path $vcInstaller)) {
        $proc = Start-Process -FilePath $vcInstaller -ArgumentList "/install /quiet /norestart" -Wait -PassThru -WindowStyle Hidden
        Write-Host "[OK] Visual C++ Redistributable installer finished (Code: $($proc.ExitCode))."
        Remove-Item $vcInstaller -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[WARN] Could not download Visual C++ Redistributable. Continuing..."
    }
}

function Find-ValidPython {
    $localApp = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
    $progFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { "C:\Program Files" }

    $savedPathFile = Join-Path $localApp "JAI DUBBER\python-path.txt"
    $candidates = @()
    if (Test-Path $savedPathFile) {
        $saved = (Get-Content $savedPathFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($saved) { $candidates += $saved.Trim() }
    }

    $candidates += @(
        (Join-Path $localApp "Programs\Python\Python311\python.exe"),
        (Join-Path $localApp "Programs\Python\Python312\python.exe"),
        (Join-Path $localApp "Programs\Python\Python310\python.exe"),
        (Join-Path $localApp "Programs\Python\Python313\python.exe"),
        (Join-Path $progFiles "Python311\python.exe"),
        (Join-Path $progFiles "Python312\python.exe"),
        (Join-Path $progFiles "Python310\python.exe"),
        (Join-Path $progFiles "Python313\python.exe"),
        "C:\Python311\python.exe",
        "C:\Python312\python.exe",
        "C:\Python310\python.exe",
        "C:\Python313\python.exe",
        "python",
        "python3"
    )

    foreach ($cand in $candidates) {
        try {
            if ($cand -match "\\") {
                if (-not (Test-Path $cand)) { continue }
            }
            $out = & $cand -c "import sys; print(sys.executable + '|' + sys.version.split()[0])" 2>$null
            if ($LASTEXITCODE -eq 0 -and $out -and ($out -match "\|3\.(10|11|12|13)\.")) {
                $parts = $out.Trim().Split("|")
                $exePath = $parts[0].Trim()
                if ($exePath -notmatch "WindowsApps") {
                    return $exePath
                }
            }
        } catch {
            continue
        }
    }
    return $null
}

function Save-PythonPath {
    param([string]$PythonExe)
    try {
        $localApp = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
        $jaiDir = Join-Path $localApp "JAI DUBBER"
        if (-not (Test-Path $jaiDir)) {
            New-Item -ItemType Directory -Path $jaiDir -Force | Out-Null
        }
        $file1 = Join-Path $jaiDir "python-path.txt"
        Set-Content -Path $file1 -Value $PythonExe -Encoding UTF8 -Force

        if ($InstDir -and (Test-Path $InstDir)) {
            $serverDir = Join-Path $InstDir "resources\server"
            if (Test-Path $serverDir) {
                $file2 = Join-Path $serverDir "python-path.txt"
                Set-Content -Path $file2 -Value $PythonExe -Encoding UTF8 -Force
            }
        }
    } catch {
        Write-Host "[WARN] Could not save python-path.txt: $($_.Exception.Message)"
    }
}

# 1. Visual C++ Redistributable
Install-VcRedist

# 2. Check / Install Python 3.11
Write-Host "[Step 2/6] Checking Python environment (Python 3.10 - 3.13)..."
$pythonExe = Find-ValidPython

if (-not $pythonExe) {
    Write-Host "-> Python not found. Downloading & installing Python 3.11.9 (64-bit)..."
    $pyInstaller = Join-Path $env:TEMP "python-3.11.9-amd64.exe"
    $dlOk = Download-FileFast -Url "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -Dest $pyInstaller
    if ($dlOk -and (Test-Path $pyInstaller)) {
        Write-Host "-> Running Python 3.11.9 silent installer (please wait 30-60s)..."
        $p = Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0" -Wait -PassThru -WindowStyle Hidden
        Write-Host "-> Python installer finished (Exit Code: $($p.ExitCode))."
        Remove-Item $pyInstaller -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    $pythonExe = Find-ValidPython
}

if (-not $pythonExe) {
    Write-Host "[ERROR] Python installation could not be verified. AI Engine can be installed inside the app later."
    exit 1
}

Write-Host "[OK] Using Python: $pythonExe"
Save-PythonPath -PythonExe $pythonExe

# Ensure pip is available and upgraded
Write-Host "-> Ensuring pip is ready..."
& "$pythonExe" -m ensurepip --upgrade 2>$null | Out-Null
& "$pythonExe" -m pip install --upgrade pip --no-warn-script-location

# 3. Detect GPU Hardware
Write-Host "[Step 3/6] Detecting GPU Hardware (NVIDIA CUDA vs Standard CPU)..."
$hasNvidia = $false
$gpuName = ""

try {
    $smi = & nvidia-smi --query-gpu=name --format=csv,noheader 2>$null
    if ($LASTEXITCODE -eq 0 -and $smi) {
        $hasNvidia = $true
        $gpuName = ($smi -split "`n")[0].Trim()
    }
} catch {}

if (-not $hasNvidia) {
    try {
        $wmiGpu = (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*NVIDIA*" -or $_.Name -like "*GeForce*" -or $_.Name -like "*RTX*" -or $_.Name -like "*GTX*" } | Select-Object -First 1).Name
        if ($wmiGpu) {
            $hasNvidia = $true
            $gpuName = $wmiGpu.Trim()
        }
    } catch {}
}

# Check if AI Engine is already installed and working
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$checkScript = Join-Path $scriptDir "check_ai_engine.py"
if ((Test-Path $checkScript)) {
    Write-Host "-> Checking existing AI Engine packages..."
    $checkOut = & "$pythonExe" "$checkScript" 2>$null
    if ($checkOut -and ($checkOut -match "__STATUS__")) {
        $jsonPart = ($checkOut -split "__STATUS__")[1].Trim()
        try {
            $statusObj = $jsonPart | ConvertFrom-Json
            $allReady = $statusObj.torch.installed -and $statusObj.demucs.installed -and $statusObj.whisper.installed
            $cudaMatch = (-not $hasNvidia) -or ($statusObj.torch.cuda -eq $true)
            if ($allReady -and $cudaMatch) {
                Write-Host "-> Installing/Updating helper libraries (pydub, edge-tts>=7.3.1, google-genai, scipy, soundfile)..."
                & "$pythonExe" -m pip install --upgrade pydub soundfile "edge-tts>=7.3.1" google-genai Pillow scipy numpy --no-warn-script-location
                Write-Host "=================================================================="
                Write-Host "[SUCCESS 100%] All AI Engine packages are already installed and verified!"
                Write-Host "=================================================================="
                exit 0
            }
        } catch {}
    }
}

# 4. Install PyTorch & TorchAudio
if ($hasNvidia) {
    Write-Host "[Step 4/6] NVIDIA GPU detected ($gpuName)! Installing PyTorch (CUDA 12.4 Acceleration)..."
    & "$pythonExe" -m pip install --upgrade torch torchaudio --index-url https://download.pytorch.org/whl/cu124 --no-warn-script-location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARN] CUDA PyTorch install returned non-zero, falling back to standard PyTorch..."
        & "$pythonExe" -m pip install --upgrade torch torchaudio --no-warn-script-location
    }
} else {
    Write-Host "[Step 4/6] Standard CPU Mode detected. Installing PyTorch & TorchAudio (CPU)..."
    & "$pythonExe" -m pip install --upgrade torch torchaudio --no-warn-script-location
}

# 5. Install Demucs, Faster-Whisper & Audio/AutoDub packages
Write-Host "[Step 5/6] Installing Demucs AI (BGM/Vocal Separation) & SoundFile..."
& "$pythonExe" -m pip install --upgrade demucs soundfile --no-warn-script-location

Write-Host "[Step 5/6] Installing Faster-Whisper AI (Speech-to-Text & Timestamps)..."
& "$pythonExe" -m pip install --upgrade faster-whisper --no-warn-script-location

Write-Host "[Step 5/6] Installing Audio Pitch & Auto-Dubbing helper libraries (pydub, edge-tts>=7.3.1)..."
& "$pythonExe" -m pip install --upgrade pydub "edge-tts>=7.3.1" google-genai Pillow scipy numpy --no-warn-script-location

# 6. Final Verification
Write-Host "[Step 6/6] Running Self-Verification (First load may take 15-45s on Laptop CPU)..."
if (Test-Path $checkScript) {
    $verifyOut = & "$pythonExe" "$checkScript" 2>&1 | Out-String
    if ($verifyOut -match "WinError 126" -or $verifyOut -match "DLL load failed" -or $verifyOut -match "fbgemm\.dll") {
        Write-Host "[FIX] Detected missing VC++ Runtime DLL for PyTorch. Re-installing Visual C++ Redistributable..."
        $vcInstaller = Join-Path $env:TEMP "jai_vc_redist_fix.x64.exe"
        if (Download-FileFast -Url "https://aka.ms/vs/17/release/vc_redist.x64.exe" -Dest $vcInstaller) {
            Start-Process -FilePath $vcInstaller -ArgumentList "/install /quiet /norestart" -Wait -WindowStyle Hidden
            Remove-Item $vcInstaller -Force -ErrorAction SilentlyContinue
            $verifyOut = & "$pythonExe" "$checkScript" 2>&1 | Out-String
        }
    }
    Write-Host "Verification output: $verifyOut"
}

Save-PythonPath -PythonExe $pythonExe
Write-Host "=================================================================="
Write-Host "[SUCCESS 100%] JAI DUBBER AI Engine Setup Finished!"
Write-Host "=================================================================="
exit 0
