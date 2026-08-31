@echo off
setlocal
cd /d "%~dp0"
call build.bat
if errorlevel 1 exit /b 1

set "ZIP=%CD%\RegCalc64-Desktop-v0.1.6-windows-x64.zip"
if exist "%ZIP%" del /q "%ZIP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%CD%\dist\RegCalc64.exe' -DestinationPath '%ZIP%' -CompressionLevel Optimal"
if errorlevel 1 exit /b 1

echo Package created ^(contains only RegCalc64.exe^):
echo   %ZIP%
endlocal
