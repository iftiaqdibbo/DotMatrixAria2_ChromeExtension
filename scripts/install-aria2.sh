#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${CYAN}[info]${RESET}  $1"; }
ok()    { echo -e "${GREEN}[ok]${RESET}    $1"; }
warn()  { echo -e "${YELLOW}[warn]${RESET}  $1"; }
err()   { echo -e "${RED}[error]${RESET} $1"; }

command_exists() {
  command -v "$1" &>/dev/null
}

detect_package_manager() {
  if command_exists apt-get; then
    echo "apt"
  elif command_exists pacman; then
    echo "pacman"
  elif command_exists dnf; then
    echo "dnf"
  elif command_exists brew; then
    echo "brew"
  else
    echo "unknown"
  fi
}

install_linux() {
  local pkg_mgr
  pkg_mgr=$(detect_package_manager)

  case "$pkg_mgr" in
    apt)
      info "Detected Debian/Ubuntu system (apt)"
      info "Updating package lists..."
      sudo apt-get update -y
      info "Installing aria2..."
      sudo apt-get install -y aria2
      ;;
    pacman)
      info "Detected Arch Linux system (pacman)"
      info "Installing aria2..."
      sudo pacman -Sy --noconfirm aria2
      ;;
    dnf)
      info "Detected Fedora system (dnf)"
      info "Installing aria2..."
      sudo dnf install -y aria2
      ;;
    brew)
      info "Detected macOS system (Homebrew)"
      info "Installing aria2..."
      brew install aria2
      ;;
    *)
      err "Could not detect a supported package manager."
      echo ""
      echo -e "${BOLD}Install aria2 manually:${RESET}"
      echo "  Debian/Ubuntu:  sudo apt update && sudo apt install aria2"
      echo "  Arch Linux:     sudo pacman -Sy aria2"
      echo "  Fedora:         sudo dnf install aria2"
      echo "  macOS:          brew install aria2"
      echo ""
      echo "  Or download from: https://github.com/aria2/aria2/releases"
      exit 1
      ;;
  esac
}

start_aria2() {
  if command_exists aria2c; then
    ok "aria2 is installed: $(aria2c --version | head -1)"
  else
    err "aria2c not found in PATH after installation."
    exit 1
  fi

  info "Checking if aria2 RPC is already running on port 6800..."
  if curl -s -o /dev/null -w "" "http://localhost:6800/jsonrpc" 2>/dev/null; then
    ok "aria2 RPC is already running on port 6800."
    return 0
  fi

  local rpc_secret="${1:-change-me}"

  info "Starting aria2 with RPC enabled..."
  info "  RPC URL:    http://localhost:6800/jsonrpc"
  info "  Secret:     ${rpc_secret}"

  nohup aria2c \
    --enable-rpc \
    --rpc-listen-all=false \
    --rpc-listen-port=6800 \
    --rpc-secret="$rpc_secret" \
    --dir="$HOME/Downloads" \
    --max-concurrent-downloads=5 \
    --continue=true \
    --max-connection-per-server=5 \
    --min-split-size=10M \
    --split=5 \
    > /tmp/aria2c.log 2>&1 &

  local pid=$!
  sleep 1

  if kill -0 "$pid" 2>/dev/null; then
    ok "aria2 started (PID: $pid)"
    ok "Log file: /tmp/aria2c.log"
  else
    err "aria2 failed to start. Check /tmp/aria2c.log for details."
    exit 1
  fi
}

echo ""
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo -e "${BOLD}  aria2 installer for Aria2 Dashboard${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════${RESET}"
echo ""

if [[ "$(uname -s)" == "Linux" || "$(uname -s)" == "Darwin" ]]; then
  install_linux
else
  err "This script does not support $(uname -s)."
  echo "Please install aria2 manually or run scripts/install-aria2.ps1 on Windows."
  exit 1
fi

RPC_SECRET="change-me"
if [[ -n "$1" ]]; then
  RPC_SECRET="$1"
fi

echo ""
start_aria2 "$RPC_SECRET"

echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo "  1. Open the Aria2 Dashboard extension"
echo "  2. Go to Settings (gear icon)"
echo "  3. Set RPC URL to: http://localhost:6800/jsonrpc"
echo "  4. Set Secret Token to: ${RPC_SECRET}"
echo "  5. Click 'test connection' to verify"
echo ""
echo -e "${BOLD}To make aria2 start automatically, add this to your shell profile:${RESET}"
echo "  aria2c --enable-rpc --rpc-listen-all=false --rpc-listen-port=6800 --rpc-secret=\"${RPC_SECRET}\" --dir=\"\$HOME/Downloads\" -D"
echo ""
