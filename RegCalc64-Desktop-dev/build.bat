@echo off
setlocal
cd /d "%~dp0"

set "WEBVIEW2_VERSION=1.0.4191.47"

echo === RegCalc64 Desktop v0.1.5 build ===
where cmake >nul 2>nul
if errorlevel 1 (
  echo [ERROR] CMake not found. Install Visual Studio C++ Desktop workload with CMake tools.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\tools\fetch-webview2.ps1" -Version "%WEBVIEW2_VERSION%"
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\tools\fetch-webview2-bootstrapper.ps1"
if errorlevel 1 exit /b 1

cmake -S . -B build -A x64
if errorlevel 1 exit /b 1

cmake --build build --config Release --parallel
if errorlevel 1 exit /b 1

if exist dist rmdir /s /q dist
mkdir dist
copy /y "build\Release\RegCalc64.exe" "dist\RegCalc64.exe" >nul

echo.
echo Build complete - single EXE:
echo   %CD%\dist\RegCalc64.exe
echo.
echo You can send RegCalc64.exe by itself.
echo If WebView2 Runtime is missing, RegCalc64 will guide the user and can install it with the embedded Microsoft bootstrapper.
endlocal
