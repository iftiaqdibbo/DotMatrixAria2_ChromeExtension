@echo off
setlocal EnableExtensions
title Aria2 Dashboard - aria2 manager

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

rem Command-line pass-through:  aria2.bat [start|stop|restart|status|log|conf|secret|rpc|help]
if not "%~1"=="" goto passthrough

:menu
cls
echo.
echo   ==================================================
echo    Aria2 Dashboard - aria2 background service
echo   ==================================================
echo.
echo     1. Start aria2 in the background
echo     2. Stop aria2
echo     3. Restart aria2
echo     4. Status + RPC connection test
echo     5. Show recent log output
echo     6. Edit aria2.conf
echo     7. Show / copy the RPC secret
echo     8. Re-run the full setup  (Setup.bat)
echo     9. Re-run setup on a different RPC port
echo     0. Exit
echo.
choice /C 1234567890 /N /M "   Select an option: "
if errorlevel 10 goto end
if errorlevel 9 goto setupport
if errorlevel 8 goto rerun
if errorlevel 7 goto secret
if errorlevel 6 goto conf
if errorlevel 5 goto log
if errorlevel 4 goto status
if errorlevel 3 goto restart
if errorlevel 2 goto stop
if errorlevel 1 goto start

:start
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" start
echo.
pause
goto menu
:stop
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" stop
echo.
pause
goto menu
:restart
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" restart
echo.
pause
goto menu
:status
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" status
echo.
pause
goto menu
:log
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" log
echo.
pause
goto menu
:conf
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" conf
goto menu
:secret
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" secret
echo.
pause
goto menu
:setupport
cls
echo.
echo   Re-run setup on a different RPC port
echo   -------------------------------------
echo   Use this when the current port is blocked by another program, e.g. the
echo   Docker dev container holding 6800. Your secret is kept. Afterwards set
echo   the extension RPC URL to the new port.
echo.
set "NEWPORT="
set /P NEWPORT="   Enter the new RPC port (e.g. 6801, empty to cancel): "
if "%NEWPORT%"=="" goto menu
echo %NEWPORT%| findstr /R /C:"^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo.
    echo   [ERR] "%NEWPORT%" is not a port number - try something like 6801
    echo.
    pause
    goto menu
)
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Port %NEWPORT%
echo.
pause
goto menu
:rerun
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
pause
goto menu
:end
endlocal
exit /b 0

:passthrough
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0aria2.ps1" %*
exit /b %ERRORLEVEL%
