# =============================================================================
#  Aria2 Dashboard - aria2 background service manager (Windows)
#
#  Day-to-day control of the aria2 daemon that windows\setup.ps1 installed:
#
#    aria2.ps1 status     show daemon + RPC status (default)
#    aria2.ps1 start      start aria2 hidden in the background
#    aria2.ps1 stop       stop aria2 (graceful, saves the session)
#    aria2.ps1 restart    stop + start
#    aria2.ps1 log        show the last 50 log lines
#    aria2.ps1 conf       open aria2.conf in Notepad
#    aria2.ps1 secret     show the RPC secret (and copy it to the clipboard)
#    aria2.ps1 rpc        raw RPC ping (aria2.getVersion)
#
#  Double-click windows\aria2.bat for a menu version of the same commands.
# =============================================================================

param([parameter(Position = 0)][string]$Command = "status")

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$aria2Dir    = Join-Path $env:USERPROFILE "aria2"
$aria2Exe    = Join-Path $aria2Dir "aria2c.exe"
$confPath    = Join-Path $aria2Dir "aria2.conf"
$sessionPath = Join-Path $aria2Dir "aria2.session"
$logPath     = Join-Path $aria2Dir "aria2c.log"
$vbsPath     = Join-Path $aria2Dir "start-aria2-hidden.vbs"

$startupFolder = [Environment]::GetFolderPath("Startup")
if (-not $startupFolder) { $startupFolder = Join-Path $env:USERPROFILE "Start Menu\Programs\Startup" }
$startupLnkPath = Join-Path $startupFolder "Aria2 RPC (Aria2 Dashboard).lnk"

function Write-Ok   { param([string]$m) Write-Host "  [ok]   $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Write-Fail { param([string]$m) Write-Host "  [ERR]  $m" -ForegroundColor Red }

function Get-ConfValue {
    param([string]$Key)
    if (-not (Test-Path $confPath)) { return $null }
    $pattern = "^\s*" + [regex]::Escape($Key) + "\s*=\s*(.+?)\s*$"
    $hit = Select-String -Path $confPath -Pattern $pattern | Select-Object -First 1
    if ($hit) { return $hit.Matches[0].Groups[1].Value }
    return $null
}

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
        id      = "aria2-dashboard-manager"
        method  = $Method
        params  = $params
    }
    $json = ConvertTo-Json -InputObject $payload -Depth 4 -Compress
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/jsonrpc" -Method Post `
        -ContentType "application/json" -Body $json -TimeoutSec 5
}

# Effective settings (conf wins over defaults)
$Port = 6800
$confPort = Get-ConfValue "rpc-listen-port"
if ($confPort) { $Port = [int]$confPort }
$Secret = ""
$confSecret = Get-ConfValue "rpc-secret"
if ($confSecret) { $Secret = $confSecret }

# Which aria2c.exe to launch
$script:ExeInUse = $aria2Exe
if (-not (Test-Path $script:ExeInUse)) {
    $cmd = Get-Command aria2c -ErrorAction SilentlyContinue
    if ($cmd) { $script:ExeInUse = $cmd.Source }
}

function Write-LauncherScript {
    # .vbs wrapper: launches aria2c with zero visible windows.
    $vbs = @"
Option Explicit
Dim shell, cmd
Set shell = CreateObject("WScript.Shell")
cmd = """$script:ExeInUse"" --conf-path=""$confPath"""
shell.Run cmd, 0, False
"@
    New-Item -ItemType Directory -Force -Path $aria2Dir | Out-Null
    [System.IO.File]::WriteAllText($vbsPath, $vbs)
}

function Start-Aria2 {
    if (Test-PortOpen $Port) {
        Write-Ok "aria2 RPC is already listening on port $Port - nothing to do"
        return
    }
    if (-not (Test-Path $script:ExeInUse)) {
        Write-Fail "aria2c.exe not found (looked in $aria2Dir and on PATH)"
        Write-Fail "Run windows\Setup.bat first."
        exit 1
    }
    if (-not (Test-Path $confPath)) {
        Write-Fail "Missing config: $confPath"
        Write-Fail "Run windows\Setup.bat first (it creates conf, secret and auto-start)."
        exit 1
    }
    Write-LauncherScript
    try {
        Start-Process -FilePath (Join-Path $env:SystemRoot "System32\wscript.exe") `
            -ArgumentList ('"' + $vbsPath + '"') -WindowStyle Hidden
    } catch {
        # wscript missing/disabled - fall back to launching aria2c directly
        try {
            Start-Process -FilePath $script:ExeInUse `
                -ArgumentList ('--conf-path="' + $confPath + '"') -WindowStyle Hidden
        } catch { }
    }
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 700
        if (Test-PortOpen $Port) { break }
    }
    if (Test-PortOpen $Port) {
        Write-Ok "aria2 started in the background - RPC on http://localhost:$Port/jsonrpc"
    } else {
        Write-Fail "aria2 did not open port $Port - check $logPath"
        if (Test-Path $logPath) {
            Get-Content $logPath -Tail 5 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
        }
        exit 1
    }
}

function Stop-Aria2 {
    $procs = @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-Ok "aria2 is not running"
        return
    }
    # Graceful RPC shutdown first (flushes the session), hard kill as fallback.
    try {
        $null = Invoke-Aria2Rpc -Method "aria2.shutdown" -RpcSecret $Secret
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Milliseconds 500
            if (-not (Test-PortOpen $Port)) { break }
        }
    } catch { }
    foreach ($p in @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    if (Test-PortOpen $Port) {
        Write-Warn "aria2 may still be running (port $Port is still open)"
    } else {
        Write-Ok "aria2 stopped (session saved)"
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "  Aria2 Dashboard - aria2 status" -ForegroundColor White
    Write-Host "  -------------------------------" -ForegroundColor White
    Write-Host "  aria2 home:    $aria2Dir"
    Write-Host "  conf:          $(if (Test-Path $confPath) { $confPath } else { 'MISSING - run windows\Setup.bat' })"
    Write-Host "  session file:  $(if (Test-Path $sessionPath) { $sessionPath } else { '-' })"
    Write-Host "  auto-start:    $(if (Test-Path $startupLnkPath) { 'registered (startup folder)' } else { 'not registered' })"
    Write-Host "  download dir:  $(Get-ConfValue 'dir')"
    Write-Host "  rpc port:      $Port"
    Write-Host "  rpc secret:    $(if ($Secret) { 'set' } else { 'not set' })"

    $procs = @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)
    Write-Host "  process:       $(if ($procs.Count -gt 0) { 'running (pid ' + $procs[0].Id + ')' } else { 'not running' })"
    $portOpen = Test-PortOpen $Port
    Write-Host "  port $Port :      $(if ($portOpen) { 'open' } else { 'closed' })"

    if ($portOpen) {
        try {
            $rpc = Invoke-Aria2Rpc -Method "aria2.getVersion" -RpcSecret $Secret
            Write-Host "  rpc:           connected - aria2 $($rpc.result.version)" -ForegroundColor Green
            Write-Host ""
            Write-Ok "The extension should be able to connect."
            $script:StatusOk = $true
        } catch {
            Write-Host "  rpc:           failed" -ForegroundColor Red
            Write-Host ""
            Write-Warn "Port is open but RPC failed - the running aria2 probably uses a different secret."
            Write-Warn "Stop it (aria2.bat -> 2), then start again, or re-run windows\Setup.bat."
            $script:StatusOk = $false
        }
    } else {
        Write-Host ""
        Write-Warn "aria2 is not reachable. Start it:  windows\aria2.bat  ->  1  (or: aria2.bat start)"
        if (Test-Path $logPath) {
            Write-Warn "Recent log lines:"
            Get-Content $logPath -Tail 5 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        }
        $script:StatusOk = $false
    }
    Write-Host ""
}

function Show-Log {
    if (-not (Test-Path $logPath)) {
        Write-Warn "No log file yet at $logPath"
        return
    }
    Write-Host "--- last 50 lines of $logPath ---" -ForegroundColor DarkGray
    Get-Content $logPath -Tail 50
}

function Show-Conf {
    if (-not (Test-Path $confPath)) {
        Write-Warn "No config at $confPath - run windows\Setup.bat first"
        return
    }
    try {
        Start-Process notepad.exe $confPath
    } catch {
        Get-Content $confPath
    }
}

function Show-Secret {
    if (-not $Secret) {
        Write-Warn "No rpc-secret configured in $confPath"
        return
    }
    Write-Host ""
    Write-Host "  RPC URL:       http://localhost:$Port/jsonrpc"
    Write-Host "  Secret token:  $Secret"
    Write-Host ""
    try {
        Set-Clipboard -Value $Secret
        Write-Ok "Secret copied to the clipboard - paste it into the extension options"
    } catch { }
}

function Invoke-RpcPing {
    try {
        $rpc = Invoke-Aria2Rpc -Method "aria2.getVersion" -RpcSecret $Secret
        $rpc | ConvertTo-Json -Depth 6
    } catch {
        Write-Fail "RPC ping failed: $($_.Exception.Message)"
        exit 1
    }
}

function Show-Help {
    Write-Host ""
    Write-Host "  Aria2 Dashboard - aria2 manager"
    Write-Host ""
    Write-Host "  usage: aria2.ps1 [start|stop|restart|status|log|conf|secret|rpc|help]"
    Write-Host ""
    Write-Host "    start    start aria2 hidden in the background"
    Write-Host "    stop     stop aria2 (graceful, saves the session)"
    Write-Host "    restart  stop + start"
    Write-Host "    status   show daemon + RPC status (default)"
    Write-Host "    log      show the last 50 log lines"
    Write-Host "    conf     open aria2.conf in Notepad"
    Write-Host "    secret   show the RPC secret (and copy it to the clipboard)"
    Write-Host "    rpc      raw RPC ping (aria2.getVersion)"
    Write-Host ""
}

# -----------------------------------------------------------------------------
# Dispatch
# -----------------------------------------------------------------------------
switch ($Command.ToLower()) {
    "start"   { Start-Aria2 }
    "stop"    { Stop-Aria2 }
    "restart" { Stop-Aria2; Start-Sleep -Seconds 1; Start-Aria2 }
    "log"     { Show-Log }
    "logs"    { Show-Log }
    "conf"    { Show-Conf }
    "config"  { Show-Conf }
    "secret"  { Show-Secret }
    "rpc"     { Invoke-RpcPing }
    "ping"    { Invoke-RpcPing }
    "help"    { Show-Help }
    "-h"      { Show-Help }
    "--help"  { Show-Help }
    "status"  { Show-Status }
    default   { Write-Fail "Unknown command: $Command"; Show-Help; exit 1 }
}

if ($Command.ToLower() -eq "status" -and -not $script:StatusOk) {
    exit 1
}

exit 0


