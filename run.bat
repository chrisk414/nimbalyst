@echo off
setlocal

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%packages\electron"
set "DEV_SCRIPT=%APP_DIR%\scripts\dev.ps1"
set "LOG_DIR=%ROOT%nimbalyst-local\logs"

if not exist "%DEV_SCRIPT%" (
  echo Could not find Nimbalyst dev script:
  echo   %DEV_SCRIPT%
  exit /b 1
)

if /I "%~1"=="--attached" goto run_attached

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%i"
set "STDOUT_LOG=%LOG_DIR%\electron-dev-run-%STAMP%.stdout.log"
set "STDERR_LOG=%LOG_DIR%\electron-dev-run-%STAMP%.stderr.log"

where pwsh >nul 2>nul
if errorlevel 1 (
  set "PS_EXE=powershell"
) else (
  set "PS_EXE=pwsh"
)

set "NIMBALYST_APP_DIR=%APP_DIR%"
set "NIMBALYST_DEV_SCRIPT=%DEV_SCRIPT%"
set "NIMBALYST_RUN_STDOUT=%STDOUT_LOG%"
set "NIMBALYST_RUN_STDERR=%STDERR_LOG%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$argsList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $env:NIMBALYST_DEV_SCRIPT); Start-Process -FilePath $env:PS_EXE -ArgumentList $argsList -WorkingDirectory $env:NIMBALYST_APP_DIR -WindowStyle Hidden -RedirectStandardOutput $env:NIMBALYST_RUN_STDOUT -RedirectStandardError $env:NIMBALYST_RUN_STDERR"

if errorlevel 1 exit /b %ERRORLEVEL%

echo Started Nimbalyst dev app.
echo Logs:
echo   %STDOUT_LOG%
echo   %STDERR_LOG%
echo.
echo Use "run.bat --attached" to run in the current terminal.
exit /b 0

:run_attached
where pwsh >nul 2>nul
if not errorlevel 1 goto run_attached_pwsh

where powershell >nul 2>nul
if not errorlevel 1 goto run_attached_powershell

echo Could not find PowerShell. Install PowerShell 7 or use Windows PowerShell.
exit /b 1

:run_attached_pwsh
pushd "%APP_DIR%" || exit /b 1
pwsh -NoProfile -ExecutionPolicy Bypass -File "%DEV_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:run_attached_powershell
pushd "%APP_DIR%" || exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEV_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
