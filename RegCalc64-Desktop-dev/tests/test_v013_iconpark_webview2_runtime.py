from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main = (ROOT / 'src/main.cpp').read_text(encoding='utf-8')
html = (ROOT / 'web/desktop.html').read_text(encoding='utf-8')
css = (ROOT / 'web/desktop.css').read_text(encoding='utf-8')
js = (ROOT / 'web/desktop.js').read_text(encoding='utf-8')
rc = (ROOT / 'resources/app.rc').read_text(encoding='utf-8')
rh = (ROOT / 'resources/resource.h').read_text(encoding='utf-8')
cmake = (ROOT / 'CMakeLists.txt').read_text(encoding='utf-8')
build = (ROOT / 'build.bat').read_text(encoding='utf-8')
readme = (ROOT / 'README.md').read_text(encoding='utf-8')

# Version contract.
assert 'project(RegCalc64Desktop VERSION 0.1.4' in cmake
assert 'const DESKTOP_VERSION = "0.1.4"' in js

# One consistent IconPark outline-style SVG system: 48x48 viewBox and 4px stroke.
for button in ('help-btn', 'topmost-btn', 'minimize-btn', 'close-btn'):
    assert f'id="{button}"' in html
assert html.count('class="iconpark-icon"') == 4
assert html.count('viewBox="0 0 48 48"') == 4
assert 'stroke-width="4"' in html
assert 'stroke-linecap="round"' in html
assert 'stroke-linejoin="round"' in html
assert 'pin-icon' not in html
assert '.pin-icon' not in css

# Runtime bootstrapper is a compiled EXE resource and build fetches it from Microsoft.
assert 'IDR_WEBVIEW2_BOOTSTRAPPER' in rh
assert 'IDR_WEBVIEW2_BOOTSTRAPPER RCDATA' in rc
assert 'MicrosoftEdgeWebview2Setup.exe' in rc
assert 'fetch-webview2-bootstrapper.ps1' in build
assert 'WEBVIEW2_BOOTSTRAPPER' in cmake

# Missing-runtime UX: custom task dialog, one-click install, official download, re-check.
assert 'TaskDialogIndirect' in main
assert 'InstallEmbeddedWebView2Runtime' in main
assert 'ExtractEmbeddedResourceToFile' in main
assert 'Microsoft Edge WebView2 Runtime' in main
assert '/silent /install' in main
assert 'GetAvailableCoreWebView2BrowserVersionString' in main
assert 'https://developer.microsoft.com/microsoft-edge/webview2/' in main
assert 'IDR_WEBVIEW2_BOOTSTRAPPER' in main

# User-facing guidance exists for ordinary, online-missing, and offline cases.
for token in ('Windows 11', '立即安装', 'Evergreen Standalone Installer', 'x64'):
    assert token in readme

print('v0.1.4 IconPark + WebView2 runtime contract: PASS')
