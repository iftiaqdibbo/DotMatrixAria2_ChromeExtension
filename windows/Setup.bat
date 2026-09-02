@echo off
setlocal EnableExtensions
title Aria2 Dashboard - Windows setup

echo.
echo   Aria2 Dashboard - Windows 11 setup
echo   -----------------------------------
echo   Installs/upgrades aria2, registers it as a hidden background service
echo   (auto-start on login), builds the Chrome extension and opens
echo   chrome://extensions. No admin rights needed.
echo.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*

echo.
echo   -------------------------------------------------------------
echo   Setup finished - you can close this window.
pause >nul
endlocal
