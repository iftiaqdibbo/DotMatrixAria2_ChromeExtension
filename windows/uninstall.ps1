# =============================================================================
#  Aria2 Dashboard - Windows uninstall
#
#  Removes the aria2 background service: stops the daemon, deletes the
#  Startup-folder auto-start (including stale aria2 shortcuts left behind by
#  older installs) and the user PATH entry, and (optionally, after asking)
#  deletes %USERPROFILE%\aria2 (conf, session, log).
#
#  Optional parameters:
#    -KeepFiles   do not ask, never delete %USERPROFILE%\aria2
#
#  Your project folder and the dist\chrome build are never touched.
# =============================================================================

param([switch]$KeepFiles)

$ErrorActionPreference = "Stop"

$aria2Dir = Join-Path $env:USERPROFILE "aria2"
$confPath = Join-Path $aria2Dir "aria2.conf"

$startupFolder = [Environment]::GetFolderPath("Startup")
if (-not $startupFolder) { $startupFolder = Join-Path $env:USERPROFILE "Start Menu\Programs\Startup" }
$startupLnk = Join-Path $startupFolder "Aria2 RPC (Aria2 Dashboard).lnk"

$Port = 6800
$Secret = ""

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
        id      = "aria2-dashboard-uninstall"
        method  = $Method
        params  = $params
    }
    $json = ConvertTo-Json -InputObject $payload -Depth 4 -Compress
    return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/jsonrpc" -Method Post `
        -ContentType "application/json" -Body $json -TimeoutSec 5
}

function Write-Ok   { param([string]$m) Write-Host "  [ok]   $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Write-Fail { param([string]$m) Write-Host "  [ERR]  $m" -ForegroundColor Red }

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

function Stop-Aria2Processes {
    # Graceful RPC shutdown first (flushes the session), hard kill of local
    # aria2c processes as fallback. RPC shutdown is only attempted when a
    # secret is configured: without a token we could shut down somebody
    # else's secret-less aria2 that happens to listen on the same port.
    $procs = @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-Ok "aria2 is not running"
        return
    }
    Write-Ok "Stopping aria2 (graceful shutdown, saves the session)..."
    if ($Secret) {
        try {
            $null = Invoke-Aria2Rpc -Method "aria2.shutdown" -RpcSecret $Secret
            for ($i = 0; $i -lt 10; $i++) {
                Start-Sleep -Milliseconds 500
                if (-not (Test-PortOpen $Port)) { break }
            }
        } catch { }
    }
    foreach ($p in @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    Write-Ok "aria2 stopped"
}

function Remove-StaleStartupEntries {
    # Older installs may have left other aria2 shortcuts in the Startup folder
    # pointing at files that no longer exist. Those make Windows Script Host
    # pop "can not find script file" at every login, so sweep them too.
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

$confSecret = Get-ConfValue "rpc-secret"
if ($confSecret) { $Secret = $confSecret }
$confPort = Get-ConfValue "rpc-listen-port"
if ($confPort) { $Port = [int]$confPort }

Write-Host ""

# --- 1. stop aria2 -----------------------------------------------------------
Stop-Aria2Processes
if (Test-PortOpen $Port) {
    $owner = Get-PortOwner $Port
    Write-Warn "Port $Port is still in use (owner: $owner) - that is NOT this install's aria2."
    if ($owner -match "docker|wslrelay|vpnkit|com\.docker") {
        Write-Warn "That looks like Docker Desktop publishing the dev container's own aria2."
        Write-Warn "It is unrelated to this uninstall; stop the container if you want the port freed."
    }
}

# --- 2. auto-start -----------------------------------------------------------
if (Test-Path $startupLnk) {
    Remove-Item -Path $startupLnk -Force
    Write-Ok "Removed auto-start: $startupLnk"
} else {
    Write-Ok "No auto-start shortcut found"
}
Remove-StaleStartupEntries

# --- 3. PATH -----------------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath) {
    $allParts = @($userPath.Split(";") | Where-Object { $_ })
    $kept = @($allParts | Where-Object { $_.TrimEnd("\") -ne $aria2Dir })
    if ($kept.Count -ne $allParts.Count) {
        [Environment]::SetEnvironmentVariable("Path", ($kept -join ";"), "User")
        Write-Ok "Removed $aria2Dir from your user PATH"
    } else {
        Write-Ok "No PATH entry found"
    }
}

# --- 4. files ----------------------------------------------------------------
if ($KeepFiles) {
    Write-Ok "Kept $aria2Dir (-KeepFiles)"
} else {
    # No stdin (non-interactive run)? Keep the files - never delete on a
    # question we could not ask.
    $answer = ""
    try { $answer = Read-Host "  Delete the aria2 folder too? ($aria2Dir) [y/N]" } catch { $answer = "" }
    if ($answer -match "^[Yy]") {
        Remove-Item -Path $aria2Dir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $aria2Dir) {
            Write-Warn "Could not fully delete $aria2Dir (files in use?)"
        } else {
            Write-Ok "Deleted $aria2Dir"
        }
    } else {
        Write-Ok "Kept $aria2Dir (conf, session, log)"
    }
}

Write-Host ""
Write-Host "  Note: to remove the extension itself, go to chrome://extensions,"
Write-Host "        find 'Aria2 Dashboard' and click Remove."
Write-Host "  Your project folder and dist\chrome build were not touched."
Write-Host ""
