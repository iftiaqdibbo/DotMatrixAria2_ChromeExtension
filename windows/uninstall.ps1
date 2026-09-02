# =============================================================================
#  Aria2 Dashboard - Windows uninstall
#
#  Removes the aria2 background service: stops the daemon, deletes the
#  Startup-folder auto-start and the user PATH entry, and (optionally, after
#  asking) deletes %USERPROFILE%\aria2 (conf, session, log).
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

$confSecret = Get-ConfValue "rpc-secret"
if ($confSecret) { $Secret = $confSecret }
$confPort = Get-ConfValue "rpc-listen-port"
if ($confPort) { $Port = [int]$confPort }

Write-Host ""

# --- 1. stop aria2 -----------------------------------------------------------
$procs = @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)
if ($procs.Count -gt 0) {
    Write-Host "  [ok]   Stopping aria2 (graceful shutdown, saves the session)..."
    try {
        $null = Invoke-Aria2Rpc -Method "aria2.shutdown" -RpcSecret $Secret
        Start-Sleep -Seconds 2
    } catch { }
    foreach ($p in @(Get-Process -Name "aria2c" -ErrorAction SilentlyContinue)) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    Write-Host "  [ok]   aria2 stopped"
} else {
    Write-Host "  [ok]   aria2 is not running"
}

# --- 2. auto-start -----------------------------------------------------------
if (Test-Path $startupLnk) {
    Remove-Item -Path $startupLnk -Force
    Write-Host "  [ok]   Removed auto-start: $startupLnk"
} else {
    Write-Host "  [ok]   No auto-start shortcut found"
}

# --- 3. PATH -----------------------------------------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath) {
    $allParts = @($userPath.Split(";") | Where-Object { $_ })
    $kept = @($allParts | Where-Object { $_.TrimEnd("\") -ne $aria2Dir })
    if ($kept.Count -ne $allParts.Count) {
        [Environment]::SetEnvironmentVariable("Path", ($kept -join ";"), "User")
        Write-Host "  [ok]   Removed $aria2Dir from your user PATH"
    } else {
        Write-Host "  [ok]   No PATH entry found"
    }
}

# --- 4. files ----------------------------------------------------------------
if ($KeepFiles) {
    Write-Host "  [ok]   Kept $aria2Dir (-KeepFiles)"
} else {
    $answer = Read-Host "  Delete the aria2 folder too? ($aria2Dir) [y/N]"
    if ($answer -match "^[Yy]") {
        Remove-Item -Path $aria2Dir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $aria2Dir) {
            Write-Host "  [warn] Could not fully delete $aria2Dir (files in use?)" -ForegroundColor Yellow
        } else {
            Write-Host "  [ok]   Deleted $aria2Dir"
        }
    } else {
        Write-Host "  [ok]   Kept $aria2Dir (conf, session, log)"
    }
}

Write-Host ""
Write-Host "  Note: to remove the extension itself, go to chrome://extensions,"
Write-Host "        find 'Aria2 Dashboard' and click Remove."
Write-Host "  Your project folder and dist\chrome build were not touched."
Write-Host ""
