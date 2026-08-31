from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CPP = (ROOT / 'src/main.cpp').read_text(encoding='utf-8')
JS = (ROOT / 'web/desktop.js').read_text(encoding='utf-8')
CMAKE = (ROOT / 'CMakeLists.txt').read_text(encoding='utf-8')
BUILD = (ROOT / 'build.bat').read_text(encoding='utf-8')
PACKAGE = (ROOT / 'package.bat').read_text(encoding='utf-8')
README = (ROOT / 'README.md').read_text(encoding='utf-8')
GUIDE = (ROOT / 'USER-GUIDE.md').read_text(encoding='utf-8')


def require(condition, message):
    if not condition:
        raise AssertionError(message)

# Version bump.
require('project(RegCalc64Desktop VERSION 0.1.6' in CMAKE, 'CMake version is not 0.1.6')
require('const DESKTOP_VERSION = "0.1.6";' in JS, 'desktop.js version is not 0.1.6')
require('RegCalc64 Desktop v0.1.6 build' in BUILD, 'build.bat version is not 0.1.6')
require('v0.1.6-windows-x64.zip' in PACKAGE, 'package.bat version is not 0.1.6')

# Foreground activation: launching a secondary instance grants the resident process
# foreground permission, and the resident process has a thread-input fallback.
require('GetWindowThreadProcessId(existing, &existingProcessId)' in CPP,
        'secondary instance does not resolve resident PID')
require('AllowSetForegroundWindow(existingProcessId)' in CPP,
        'secondary instance does not grant foreground activation permission')
require('AttachThreadInput(currentThread, foregroundThread, TRUE)' in CPP
        and 'AttachThreadInput(currentThread, foregroundThread, FALSE)' in CPP,
        'foreground-lock fallback is missing')
require('SetActiveWindow(hwnd_)' in CPP and 'SetFocus(hwnd_)' in CPP,
        'reactivation does not explicitly activate/focus the window')

# Close-button behavior is user-configurable from the tray and persists.
require('ID_TRAY_CLOSE_TO_TRAY' in CPP, 'tray close-to-tray command missing')
require('close_to_tray' in CPP, 'close-to-tray preference is not persisted')
require('LoadCloseToTray' in CPP, 'close-to-tray preference loader missing')
require('SetCloseToTray' in CPP, 'close-to-tray preference setter missing')
require('closeToTray_ ? MF_CHECKED : MF_UNCHECKED' in CPP,
        'tray menu does not show close-to-tray checked state')
require('if (closeToTray_)' in CPP and 'HideWindowToTray();' in CPP and 'RequestExit();' in CPP,
        'WM_CLOSE does not branch between hide-to-tray and real exit')

# Custom borderless window still exposes standard Windows taskbar minimize/restore semantics.
require('WS_SYSMENU' in CPP and 'WS_MINIMIZEBOX' in CPP,
        'window style does not expose standard taskbar minimize/restore semantics')
require('case WM_SYSCOMMAND:' in CPP and 'case SC_MINIMIZE:' in CPP and 'case SC_RESTORE:' in CPP,
        'taskbar/system minimize-restore commands are not explicitly handled')

# Performance instrumentation was temporary and must not ship.
for forbidden in ('TraceStartup', 'startup.log', 'OutputDebugStringA', 'GetStartupLogPath'):
    require(forbidden not in CPP, f'debug trace still present in main.cpp: {forbidden}')
require('put_AreDevToolsEnabled(FALSE)' in CPP,
        'WebView2 DevTools should be disabled in the production desktop shell')
require('startup.log' not in README and 'startup.log' not in GUIDE,
        'documentation still tells users about startup.log')

print('v0.1.6 foreground/close/taskbar/no-trace contract: PASS')
