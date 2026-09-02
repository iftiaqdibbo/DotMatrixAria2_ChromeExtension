@echo off
setlocal EnableExtensions
title Aria2 Dashboard - uninstall

echo.
echo   Aria2 Dashboard - Windows uninstall
echo   ------------------------------------
echo   Stops aria2 and removes its background auto-start (incl. stale entries
echo   from older installs) and PATH entry. Your project folder is not touched.
echo   Add -KeepFiles to never delete %%USERPROFILE%%\aria2.
echo.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*

echo.
echo   Uninstall finished - you can close this window.
pause >nul
endlocal
