# =============================================================================
#  Aria2 Dashboard - Windows 11 one-click setup
#
#  Double-click windows\Setup.bat to run this (or run it from PowerShell).
#
#  What it does:
#    1. Downloads the official aria2 Windows build into %USERPROFILE%\aria2
#       (no admin rights required) and adds it to your user PATH
#    2. Writes %USERPROFILE%\aria2\aria2.conf with RPC enabled on port 6800
#    3. Registers a hidden background auto-start (per-user Startup folder)
#       and starts aria2 right away
#    4. Installs Node.js if needed (winget, or a portable copy as fallback)
#       and builds the Chrome extension into <repo>\dist\chrome
#    5. Opens chrome://extensions and copies the extension folder path to
#       your clipboard for the one-time "Load unpacked" step
#
#  Optional parameters:
#    -Secret <token>   use this RPC secret instead of the stored/generated one
#    -Port <number>    RPC port (default 6800, ignored if the conf file has one)
#    -SkipBuild        do not touch Node/npm or the extension build
#    -Rebuild          force npm install + rebuild of dist\chrome
#    -NoBrowser        do not open Chrome / Explorer / clipboard at the end
#
#  Safe to re-run: your existing conf and secret are kept unless -Secret is
#  passed, and existing builds are reused unless -Rebuild is passed.
# =============================================================================

param(
    [string]$Secret = "",
    [int]$Port = 6800,
    [switch]$SkipBuild,
    [switch]$Rebuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }
$ProgressPreference = "SilentlyContinue"   # makes Invoke-WebRequest much faster

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
$repoRoot    = Split-Path -Parent $PSScriptRoot
$aria2Dir    = Join-Path $env:USERPROFILE "aria2"
$aria2Exe    = Join-Path $aria2Dir "aria2c.exe"
$confPath    = Join-Path $aria2Dir "aria2.conf"
$sessionPath = Join-Path $aria2Dir "aria2.session"
$logPath     = Join-Path $aria2Dir "aria2c.log"
$vbsPath     = Join-Path $aria2Dir "start-aria2-hidden.vbs"
$downloadDir = Join-Path $env:USERPROFILE "Downloads"
$distChrome  = Join-Path $repoRoot "dist\chrome"

$tempDir = $env:TEMP
if (-not $tempDir) { $tempDir = $env:TMPDIR }
if (-not $tempDir) { $tempDir = Join-Path $env:USERPROFILE "AppData\Local\Temp" }

$startupFolder = [Environment]::GetFolderPath("Startup")
if (-not $startupFolder) { $startupFolder = Join-Path $env:USERPROFILE "Start Menu\Programs\Startup" }
$startupLnk = Join-Path $startupFolder "Aria2 RPC (Aria2 Dashboard).lnk"

# aria2c.exe we will actually run (may differ from $aria2Exe if a copy is locked)
$script:Aria2ExeInUse = $aria2Exe

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
function Write-Info { param([string]$m) Write-Host "    $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    [ok]   $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "    [warn] $m" -ForegroundColor Yellow }
function Write-Fail { param([string]$m) Write-Host "    [ERR]  $m" -ForegroundColor Red }
function Write-Step {
    param([string]$Number, [string]$Message)
    Write-Host ""
    Write-Host "== Step $Number : $Message" -ForegroundColor White
}

# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------
function Test-PortOpen {
    param([int]$PortNumber)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect("127.0.0.1", $PortNumber)
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Invoke-Aria2Rpc {
    param([string]$Method, [string]$RpcSecret)
    $params = @()
    if ($RpcSecret) { $params = @("token:$RpcSecret") }
    $payload = @{
        jsonrpc = "2.0"
        id      = "aria2-dashboard-setup"
        method  = $Method
        params  = $params
    }
    $json = ConvertTo-Json -InputObject $payload -Depth 4 -Compress
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/jsonrpc" -Method Post `
        -ContentType "application/json" -Body $json -TimeoutSec 5
}

function Get-ConfValue {
    param([string]$Key)
    if (-not (Test-Path $confPath)) { return $null }
    $pattern = "^\s*" + [regex]::Escape($Key) + "\s*=\s*(.+?)\s*$"
    $hit = Select-String -Path $confPath -Pattern $pattern | Select-Object -First 1
    if ($hit) { return $hit.Matches[0].Groups[1].Value }
    return $null
}

function Get-PortOwner {
    # Best-effort name of the process listening on a local port.
    param([int]$PortNumber)
    try {
        $conns = @(Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue)
        foreach ($c in $conns) {
            $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($p) { return "$($p.ProcessName) (pid $($p.Id))" }
        }
    } catch { }
    try {
        $lines = @(netstat -ano | Select-String ":$PortNumber\s" | Select-String "LISTENING")
        if ($lines.Count -gt 0) {
            $ownerPid = ($lines[0].ToString().Trim() -split "\s+")[-1]
            $p = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
            if ($p) { return "$($p.ProcessName) (pid $($p.Id))" }
            return "pid $ownerPid"
        }
    } catch { }
    return "unknown process"
}

function Get-RpcState {
    # Classifies whatever answers the RPC port:
    #   "ours"         - an aria2 accepting our secret is running
    #   "other-secret" - an aria2 is listening, but rejects our token
    #   "not-aria2"    - the port answers, but it is not an aria2 RPC server
    param([string]$RpcSecret)
    try {
        $response = Invoke-Aria2Rpc -Method "aria2.getVersion" -RpcSecret $RpcSecret
    } catch {
        return "not-aria2"
    }
    if ($response -and $response.result -and $response.result.version) { return "ours" }
    if ($response -and "$($response.error.message)" -match "Unauthorized") { return "other-secret" }
    return "not-aria2"
}

# ---------------------------------------------------------------------------
# Step 1 helpers - the aria2 binary
# ---------------------------------------------------------------------------
function Find-Aria2c {
    if (Test-Path $aria2Exe) { return $aria2Exe }
    $cmd = Get-Command aria2c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Install-Aria2 {
    # Downloads the official static Windows build of aria2. No admin needed.
    New-Item -ItemType Directory -Force -Path $aria2Dir | Out-Null

    $pinnedUrl = "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip"
    $url = $null
    try {
        Write-Info "Looking up the latest aria2 release on GitHub..."
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/aria2/aria2/releases/latest" -TimeoutSec 30
        $asset = $release.assets |
            Where-Object { $_.name -match "^aria2-.*win-64bit.*\.zip$" } |
            Select-Object -First 1
        if ($asset) { $url = $asset.browser_download_url }
    } catch {
        Write-Warn "GitHub API unreachable - falling back to the pinned 1.37.0 release"
    }
    if (-not $url) { $url = $pinnedUrl }

    $zipPath = Join-Path $tempDir "aria2-win-download.zip"
    Write-Info "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 600

    $extractDir = Join-Path $tempDir ("aria2-extract-" + [guid]::NewGuid().ToString("N"))
    Write-Info "Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    $found = Get-ChildItem -Path $extractDir -Recurse -Filter "aria2c.exe" | Select-Object -First 1
    if (-not $found) { throw "aria2c.exe was not found inside the downloaded archive" }

    Copy-Item -Path $found.FullName -Destination $aria2Exe -Force
    Get-ChildItem -Path (Split-Path -Parent $found.FullName) -Filter "*.dll" -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item -Path $_.FullName -Destination $aria2Dir -Force -ErrorAction SilentlyContinue }

    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
}

function Add-Aria2ToPath {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @()
    if ($userPath) { $parts = @($userPath.Split(";") | Where-Object { $_ }) }
    $trimmed = @($parts | ForEach-Object { $_.TrimEnd("\") })
    if ($trimmed -contains $aria2Dir) {
        Write-Ok "aria2 folder is already on your user PATH"
        return
    }
    $newPath = (@($parts) + $aria2Dir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    $env:Path = "$env:Path;$aria2Dir"
    Write-Ok "Added $aria2Dir to your user PATH (new terminals will have aria2c)"
}

# ---------------------------------------------------------------------------
# Step 2 helpers - configuration + secret
# ---------------------------------------------------------------------------
function Write-Aria2Conf {
    param([string]$RpcSecret)
    New-Item -ItemType Directory -Force -Path $aria2Dir | Out-Null
    $lines = @(
        "# aria2 configuration for the Aria2 Dashboard extension",
        "# Generated by windows\setup.ps1 - edit freely, then restart via windows\aria2.bat",
        "",
        "# --- RPC (what the browser extension talks to) ---",
        "enable-rpc=true",
        "rpc-listen-all=false",
        "rpc-listen-port=$Port",
        "rpc-allow-origin-all=true",
        "rpc-secret=$RpcSecret",
        "",
        "# --- Downloads ---",
        "dir=$downloadDir",
        "continue=true",
        "max-concurrent-downloads=5",
        "max-connection-per-server=5",
        "min-split-size=10M",
        "split=5",
        "file-allocation=none",
        "",
        "# --- Session persistence (resume queue after reboot) ---",
        "input-file=$sessionPath",
        "save-session=$sessionPath",
        "save-session-interval=30",
        "force-save=true",
        "",
        "# --- Logging ---",
        "console-log-level=warn",
        "log-level=warn",
        "log=$logPath"
    )
    # WriteAllLines uses UTF-8 without BOM, which aria2 parses cleanly
    [System.IO.File]::WriteAllLines($confPath, $lines)
    if (-not (Test-Path $sessionPath)) {
        New-Item -ItemType File -Path $sessionPath -Force | Out-Null
    }
}

# ---------------------------------------------------------------------------
# Step 3 helpers - hidden background auto-start
# ---------------------------------------------------------------------------
function Write-LauncherScript {
    # .vbs wrapper: launches aria2c with zero visible windows.
    New-Item -ItemType Directory -Force -Path $aria2Dir | Out-Null
    $vbs = @"
Option Explicit
Dim shell, cmd
Set shell = CreateObject("WScript.Shell")
cmd = """$script:Aria2ExeInUse"" --conf-path=""$confPath"""
shell.Run cmd, 0, False
"@
    [System.IO.File]::WriteAllText($vbsPath, $vbs)
}

function Register-AutoStart {
    # Per-user Startup folder shortcut - no admin rights needed, survives reboots.
    # Never register a shortcut to a missing launcher file.
    if (-not (Test-Path $vbsPath)) { Write-LauncherScript }
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($startupLnk)
        $shortcut.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
        $shortcut.Arguments = '"' + $vbsPath + '"'
        $shortcut.WorkingDirectory = $aria2Dir
        $shortcut.Description = "aria2 RPC daemon for the Aria2 Dashboard extension"
        $shortcut.Save()
        [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
        return $true
    } catch {
        Write-Warn "Could not create the Startup shortcut: $($_.Exception.Message)"
        return $false
    }
}

function Remove-StaleStartupEntries {
    # Delete leftover aria2-related Startup shortcuts (older installs, manual
    # experiments). A stale entry pointing at a missing .vbs makes Windows
    # Script Host pop "can not find script file" at every login.
    try {
        $ourName = Split-Path -Leaf $startupLnk
        $shell = New-Object -ComObject WScript.Shell
        Get-ChildItem -Path $startupFolder -Filter "*.lnk" -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($_.Name -ieq $ourName) { return }
                try {
                    $sc = $shell.CreateShortcut($_.FullName)
                    $haystack = "$($sc.TargetPath) $($sc.Arguments)"
                    if ($haystack -match "aria2") {
                        Remove-Item -Path $_.FullName -Force
                        Write-Ok "Removed stale startup entry: $($_.Name)"
                    }
                } catch { }
            }
        [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
    } catch { }
}

function Start-Aria2Background {
    Write-LauncherScript
    try {
        Start-Process -FilePath (Join-Path $env:SystemRoot "System32\wscript.exe") `
            -ArgumentList ('"' + $vbsPath + '"') -WindowStyle Hidden
    } catch {
        # wscript missing/disabled - fall back to launching aria2c directly
        try {
            Start-Process -FilePath $script:Aria2ExeInUse `
                -ArgumentList ('--conf-path="' + $confPath + '"') -WindowStyle Hidden
        } catch { }
    }
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 700
        if (-not (Test-PortOpen $Port)) { continue }
        # The port answering is not enough - verify OUR aria2 is behind it,
        # otherwise a port conflict gets reported as a successful start.
        if ((Get-RpcState -RpcSecret $Secret) -eq "ours") { return $true }
    }
    return $false
}

function Stop-Aria2Process {
    # Graceful RPC shutdown first (flushes the session), hard kill as fallback.
    $procs = @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { return }
    try {
        $null = Invoke-Aria2Rpc -Method "aria2.shutdown" -RpcSecret (Get-ConfValue "rpc-secret")
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            if (-not (Test-PortOpen $Port)) { break }
        }
    } catch { }
    foreach ($p in @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
}

# ---------------------------------------------------------------------------
# Step 4 helpers - Node.js + extension build
# ---------------------------------------------------------------------------
function Get-NpmCommand {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $null }
    $version = ""
    try { $version = (& $node.Source --version) 2>$null } catch { return $null }
    if ("$version" -match "^v(\d+)" -and [int]$Matches[1] -ge 18) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        if ($npm) { return $npm.Source }
    }
    return $null
}

function Install-NodeViaWinget {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) { return $false }
    Write-Info "Installing Node.js LTS with winget (a UAC prompt may appear)..."
    try {
        & $winget.Source install --id OpenJS.NodeJS.LTS --exact --silent `
            --accept-package-agreements --accept-source-agreements --disable-interactivity | Out-Null
    } catch { }
    # Re-read PATH from the registry so the fresh install is visible now
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
    return ($null -ne (Get-NpmCommand))
}

function Install-PortableNode {
    # Last resort: per-user portable Node.js (no installer, no admin, no PATH).
    $installRoot = Join-Path $env:LOCALAPPDATA "Programs\aria2-node"
    $zipPath = Join-Path $tempDir "node-portable.zip"
    try {
        Write-Info "Downloading a portable Node.js 22 build..."
        $listing = Invoke-WebRequest -Uri "https://nodejs.org/dist/latest-v22.x/" -UseBasicParsing -TimeoutSec 60
        $m = [regex]::Match($listing.Content, "node-v([\d\.]+)-win-x64\.zip")
        if (-not $m.Success) { return $null }
        $url = "https://nodejs.org/dist/latest-v22.x/node-v$($m.Groups[1].Value)-win-x64.zip"
        Write-Info "Downloading $url"
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 900
        New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
        Expand-Archive -Path $zipPath -DestinationPath $installRoot -Force
        $npmCmd = Get-ChildItem -Path $installRoot -Recurse -Filter "npm.cmd" | Select-Object -First 1
        if (-not $npmCmd) { return $null }
        return (Split-Path -Parent $npmCmd.FullName)
    } catch {
        Write-Warn "Portable Node.js download failed: $($_.Exception.Message)"
        return $null
    } finally {
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    }
}

function Build-Extension {
    $npmCmd = Get-NpmCommand
    if (-not $npmCmd) { if (Install-NodeViaWinget) { $npmCmd = Get-NpmCommand } }
    if (-not $npmCmd) {
        $portableDir = Install-PortableNode
        if ($portableDir) {
            $env:Path = "$portableDir;$env:Path"
            $npmCmd = Join-Path $portableDir "npm.cmd"
        }
    }
    if (-not $npmCmd) {
        throw "Could not set up Node.js automatically. Install Node.js 18+ from https://nodejs.org/ and run Setup.bat again."
    }
    Write-Ok "Using npm: $npmCmd"

    Push-Location $repoRoot
    try {
        if ($Rebuild -or -not (Test-Path (Join-Path $repoRoot "node_modules"))) {
            Write-Info "Installing npm dependencies (this can take a minute)..."
            & $npmCmd install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
            Write-Ok "Dependencies installed"
        }
        Write-Info "Building the Chrome extension..."
        & $npmCmd run build:chrome
        if ($LASTEXITCODE -ne 0) { throw "npm run build:chrome failed with exit code $LASTEXITCODE" }
        if (-not (Test-Path (Join-Path $distChrome "manifest.json"))) {
            throw "Build finished but manifest.json is missing from $distChrome"
        }
        Write-Ok "Extension built: $distChrome"
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Step 5 helpers - Chrome hand-off
# ---------------------------------------------------------------------------
function Find-Chrome {
    foreach ($regPath in @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    )) {
        try {
            $exe = (Get-ItemProperty -Path $regPath -ErrorAction Stop).'(default)'
            if ($exe -and (Test-Path $exe)) { return $exe }
        } catch { }
    }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if (-not $base) { continue }
        $exe = Join-Path $base "Google\Chrome\Application\chrome.exe"
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

# =============================================================================
# Main
# =============================================================================
Write-Host ""
Write-Host "  ==================================================" -ForegroundColor White
Write-Host "   Aria2 Dashboard - Windows setup" -ForegroundColor White
Write-Host "  ==================================================" -ForegroundColor White
Write-Host "   Project:     $repoRoot"
Write-Host "   aria2 home:  $aria2Dir"
Write-Host "   RPC:         http://localhost:$Port/jsonrpc"

try {
    # -- Step 1: aria2 binary -------------------------------------------------
    Write-Step "1/5" "aria2 binary"
    $found = Find-Aria2c
    if ($found) {
        Write-Ok "Found aria2: $found"
        if ($found -ne $aria2Exe) {
            try {
                Copy-Item -Path $found -Destination $aria2Exe -Force
                $script:Aria2ExeInUse = $aria2Exe
                Write-Ok "Copied it into $aria2Dir so everything lives in one place"
            } catch {
                $script:Aria2ExeInUse = $found
                Write-Warn "Could not copy aria2c.exe into $aria2Dir (in use?) - using $found"
            }
        }
    } else {
        Install-Aria2
        if (-not (Test-Path $aria2Exe)) { throw "aria2 installation failed" }
        $script:Aria2ExeInUse = $aria2Exe
        Write-Ok "aria2 installed: $aria2Exe"
    }
    Add-Aria2ToPath
    $versionLine = (& $script:Aria2ExeInUse --version | Select-Object -First 1)
    Write-Ok "$versionLine"

    # -- Step 2: conf + secret ------------------------------------------------
    Write-Step "2/5" "aria2.conf + RPC secret"
    $confSecret = Get-ConfValue "rpc-secret"
    $confPort   = Get-ConfValue "rpc-listen-port"
    if ($confPort) { $Port = [int]$confPort }
    if ($Secret -ne "") {
        Write-Aria2Conf -RpcSecret $Secret
        Write-Ok "Wrote $confPath (using the -Secret you provided)"
    } elseif ($confSecret) {
        $Secret = $confSecret
        Write-Ok "Keeping your existing $confPath and RPC secret"
    } else {
        $Secret = [guid]::NewGuid().ToString("N")
        Write-Aria2Conf -RpcSecret $Secret
        Write-Ok "Wrote $confPath with a freshly generated RPC secret"
    }

    # -- Step 3: background service -------------------------------------------
    Write-Step "3/5" "Background service"

    # Always (re)write the hidden launcher BEFORE touching the Startup folder.
    # Writing it only when starting aria2 meant that a reboot could hit
    # "Windows Script Host: can not find script file" whenever aria2 happened
    # to be already running during setup.
    Write-LauncherScript
    Write-Ok "Hidden launcher ready: $vbsPath"

    if (Register-AutoStart) {
        Write-Ok "Auto-start on login: $startupLnk"
    }
    Remove-StaleStartupEntries

    if (Test-PortOpen $Port) {
        $state = Get-RpcState -RpcSecret $Secret
        if ($state -eq "ours") {
            Write-Ok "Port $Port already has our aria2 - leaving it running"
        } elseif ($state -eq "other-secret") {
            $owner = Get-PortOwner $Port
            if ($owner -match "aria2c") {
                Write-Warn "Another local aria2c (owner: $owner) holds port $Port with a different secret - replacing it."
                Stop-Aria2Process
                if (Start-Aria2Background) {
                    Write-Ok "aria2 restarted on port $Port with the new config"
                } else {
                    Write-Warn "aria2 did not come up (port owner: $(Get-PortOwner $Port)). Last log lines:"
                    if (Test-Path $logPath) {
                        Get-Content $logPath -Tail 5 | ForEach-Object { Write-Host "           $_" -ForegroundColor DarkGray }
                    }
                }
            } else {
                Write-Warn "Port $Port is held by a DIFFERENT aria2 (owner: $owner) that does not accept our secret."
                Write-Warn "Typical cause: Docker Desktop publishing this project's dev container (secret: change-me)."
                Write-Warn "Fix: stop that container ('docker compose down'), or re-run setup with -Port 6801 and set"
                Write-Warn "the extension RPC URL to http://localhost:6801/jsonrpc. Nothing on port $Port was changed."
            }
        } else {
            $owner = Get-PortOwner $Port
            Write-Warn "Port $Port is used by something that is NOT aria2 (owner: $owner) - aria2c cannot start."
            Write-Warn "Fix: stop/exit that program, or re-run setup with -Port 6801 and set the extension"
            Write-Warn "RPC URL to http://localhost:6801/jsonrpc. Nothing on port $Port was changed."
        }
    } else {
        Write-Info "Starting aria2 in the background (hidden)..."
        if (Start-Aria2Background) {
            Write-Ok "aria2 is running on port $Port (no window - see $logPath)"
        } else {
            Write-Warn "aria2 did not start correctly (port owner: $(Get-PortOwner $Port)). Last log lines:"
            if (Test-Path $logPath) {
                Get-Content $logPath -Tail 5 | ForEach-Object { Write-Host "           $_" -ForegroundColor DarkGray }
            }
        }
    }
    $rpcState = Get-RpcState -RpcSecret $Secret
    if ($rpcState -eq "ours") {
        $rpc = Invoke-Aria2Rpc -Method "aria2.getVersion" -RpcSecret $Secret
        Write-Ok "RPC test ok - aria2 $($rpc.result.version)"
    } elseif ($rpcState -eq "other-secret") {
        Write-Warn "RPC check: an aria2 is answering on port $Port, but with a different secret (see above)."
    } else {
        Write-Warn "RPC check: port $Port is not answering as our aria2 (see above)."
    }

    # -- Step 4: build the extension -------------------------------------------
    if ($SkipBuild) {
        Write-Step "4/5" "Extension build (-SkipBuild)"
    } elseif (-not $Rebuild -and (Test-Path (Join-Path $distChrome "manifest.json"))) {
        Write-Step "4/5" "Extension build"
        Write-Ok "Existing build found - skipping (run with -Rebuild to force a rebuild)"
    } else {
        Write-Step "4/5" "Extension build"
        Build-Extension
    }

    # -- Step 5: hand-off to Chrome --------------------------------------------
    Write-Step "5/5" "Load the extension in Chrome (one-time)"
    Write-Host ""
    Write-Host "    RPC URL:       http://localhost:$Port/jsonrpc" -ForegroundColor White
    Write-Host "    Secret token:  $Secret" -ForegroundColor White
    Write-Host "    (also stored in $confPath)"
    Write-Host ""
    Write-Host "    1. Open  chrome://extensions"
    Write-Host "    2. Turn on  Developer mode  (toggle, top-right)"
    Write-Host "    3. Click  Load unpacked  and select this folder:"
    Write-Host "         $distChrome" -ForegroundColor Yellow
    Write-Host "    4. Open the extension options and paste the secret token above"
    Write-Host ""
    Write-Host "    Unpacked Chrome extensions stay loaded after browser restarts - one-time only." -ForegroundColor DarkGray

    if (-not $NoBrowser) {
        try {
            Set-Clipboard -Value $distChrome
            Write-Ok "Extension folder path copied to your clipboard"
        } catch { }
        try {
            $chrome = Find-Chrome
            if ($chrome) {
                Start-Process -FilePath $chrome -ArgumentList "chrome://extensions"
                Write-Ok "Opened chrome://extensions in Chrome"
            } else {
                Write-Warn "Chrome not found - open chrome://extensions manually"
            }
        } catch { }
        try { Start-Process explorer.exe -ArgumentList ('"' + $distChrome + '"') } catch { }
    }

    Write-Host ""
    Write-Ok "Done. Daily control: double-click windows\aria2.bat"
} catch {
    Write-Host ""
    Write-Fail "Setup failed: $($_.Exception.Message)"
    Write-Fail "Fix the issue above and run windows\Setup.bat again (it is safe to re-run)."
    exit 1
}

exit 0




