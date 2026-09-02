$ErrorActionPreference = "Stop"

function Write-Info($msg)  { Write-Host "[info]  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[ok]    $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[warn]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[error] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "======================================================" -ForegroundColor White
Write-Host "  aria2 installer for Aria2 Dashboard" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor White
Write-Host ""

$rpcSecret = if ($args.Count -gt 0) { $args[0] } else { "change-me" }
$aria2Dir = "$env:USERPROFILE\aria2"
$aria2Exe = Join-Path $aria2Dir "aria2c.exe"

if (Test-Path $aria2Exe) {
    Write-Ok "aria2 is already installed at $aria2Exe"
} else {
    Write-Info "Downloading aria2 for Windows..."

    $releasesUrl = "https://api.github.com/repos/aria2/aria2/releases/latest"
    try {
        $release = Invoke-RestMethod -Uri $releasesUrl -UseBasicParsing
    } catch {
        Write-Err "Failed to query GitHub releases API."
        Write-Err "Download aria2 manually from: https://github.com/aria2/aria2/releases"
        exit 1
    }

    $asset = $release.assets | Where-Object {
        $_.name -like "aria2-*win-64bit*.zip" -or $_.name -like "aria2-*win*64*.zip"
    } | Select-Object -First 1

    if (-not $asset) {
        $asset = $release.assets | Where-Object {
            $_.name -like "aria2-*win*.zip"
        } | Select-Object -First 1
    }

    if (-not $asset) {
        Write-Err "Could not find a Windows build in the latest release."
        Write-Err "Download manually from: https://github.com/aria2/aria2/releases"
        exit 1
    }

    $downloadUrl = $asset.browser_download_url
    $zipFile = Join-Path $env:TEMP $asset.name

    Write-Info "Downloading $($asset.name)..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing

    Write-Info "Extracting..."
    New-Item -ItemType Directory -Force -Path $aria2Dir | Out-Null

    $topDir = (Get-ChildItem (Join-Path $env:TEMP "aria2-extract") -ErrorAction SilentlyContinue)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipFile)
    $topFolder = $archive.Entries[0].FullName.Split('/')[0]
    $archive.Dispose()

    Expand-Archive -Path $zipFile -DestinationPath $env:TEMP\aria2-extract -Force

    $extractedDir = Join-Path $env:TEMP "aria2-extract\$topFolder"
    $srcExe = Join-Path $extractedDir "aria2c.exe"

    if (-not (Test-Path $srcExe)) {
        $srcExe = Get-ChildItem -Path $extractedDir -Recurse -Filter "aria2c.exe" |
            Select-Object -First 1 -ExpandProperty FullName
    }

    if (-not (Test-Path $srcExe)) {
        Write-Err "Could not find aria2c.exe in the extracted archive."
        exit 1
    }

    Copy-Item $srcExe -Destination $aria2Exe
    Copy-Item (Join-Path (Split-Path $srcExe) "*.dll") -Destination $aria2Dir -ErrorAction SilentlyContinue

    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\aria2-extract" -Recurse -Force -ErrorAction SilentlyContinue

    Write-Ok "aria2 installed to $aria2Dir"
}

$version = & $aria2Exe --version 2>&1 | Select-Object -First 1
Write-Ok "Version: $version"

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$aria2Dir*") {
    Write-Info "Adding $aria2Dir to user PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$aria2Dir", "User")
    $env:Path = "$env:Path;$aria2Dir"
    Write-Ok "Added to PATH (restart your terminal to take effect)"
} else {
    Write-Ok "aria2 directory is already in PATH"
}

Write-Host ""
Write-Info "Checking if aria2 RPC is already running on port 6800..."
$running = $false
try {
    $tcp = Get-NetTCPConnection -LocalPort 6800 -ErrorAction SilentlyContinue
    if ($tcp) {
        Write-Ok "aria2 RPC is already running on port 6800."
        $running = $true
    }
} catch {}

if (-not $running) {
    Write-Info "Starting aria2 with RPC enabled..."
    Write-Info "  RPC URL:    http://localhost:6800/jsonrpc"
    Write-Info "  Secret:     $rpcSecret"

    $downloadDir = "$env:USERPROFILE\Downloads"
    Start-Process -FilePath $aria2Exe -ArgumentList @"
--enable-rpc
--rpc-listen-all=false
--rpc-listen-port=6800
--rpc-secret=$rpcSecret
--dir=$downloadDir
--max-concurrent-downloads=5
--continue=true
--max-connection-per-server=5
--min-split-size=10M
--split=5
--log=$aria2Dir\aria2c.log
"@ -WindowStyle Hidden

    Start-Sleep -Seconds 2

    $proc = Get-Process -Name "aria2c" -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Ok "aria2 started (PID: $($proc.Id))"
        Write-Ok "Log file: $aria2Dir\aria2c.log"
    } else {
        Write-Warn "aria2 may not have started. Check $aria2Dir\aria2c.log"
    }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open the Aria2 Dashboard extension"
Write-Host "  2. Go to Settings (gear icon)"
Write-Host "  3. Set RPC URL to: http://localhost:6800/jsonrpc"
Write-Host "  4. Set Secret Token to: $rpcSecret"
Write-Host "  5. Click 'test connection' to verify"
Write-Host ""
Write-Host "To start aria2 manually in the future:" -ForegroundColor White
Write-Host "  $aria2Exe --enable-rpc --rpc-listen-port=6800 --rpc-secret=`"$rpcSecret`" --dir=`"$env:USERPROFILE\Downloads`" -D"
Write-Host ""
Write-Host "To auto-start on login, create a shortcut to the above command" -ForegroundColor White
Write-Host "and place it in: $env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
Write-Host ""
