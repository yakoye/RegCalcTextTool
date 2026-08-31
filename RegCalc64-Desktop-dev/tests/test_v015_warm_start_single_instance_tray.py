from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CPP = (ROOT / 'src' / 'main.cpp').read_text(encoding='utf-8')
JS = (ROOT / 'web' / 'desktop.js').read_text(encoding='utf-8')
HTML = (ROOT / 'web' / 'desktop.html').read_text(encoding='utf-8')
CMAKE = (ROOT / 'CMakeLists.txt').read_text(encoding='utf-8')
README = (ROOT / 'README.md').read_text(encoding='utf-8')
BUILD = (ROOT / 'build.bat').read_text(encoding='utf-8')
PACKAGE = (ROOT / 'package.bat').read_text(encoding='utf-8')


def require(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    # Version bump for the performance/warm-start release.
    require('project(RegCalc64Desktop VERSION 0.1.5' in CMAKE, 'CMake version is not 0.1.5')
    require('const DESKTOP_VERSION = "0.1.5";' in JS, 'desktop.js version is not 0.1.5')
    require('RegCalc64 Desktop v0.1.5 build' in BUILD, 'build.bat version is not 0.1.5')
    require('v0.1.5-windows-x64.zip' in PACKAGE, 'package.bat version is not 0.1.5')

    # Second launch must be cheap: detect an existing instance before COM/WebView2 startup
    # and tell the resident window to show itself.
    require('CreateMutexW' in CPP and 'ERROR_ALREADY_EXISTS' in CPP, 'single-instance mutex missing')
    require('RegCalc64Desktop.SingleInstance' in CPP, 'stable single-instance mutex name missing')
    require('FindWindowW' in CPP, 'existing window discovery missing')
    require('WM_APP_SHOW' in CPP, 'show-existing-instance message missing')
    require('ShowAndActivateWindow' in CPP, 'resident-window activation helper missing')

    # Window close is warm-mode hide; only an explicit Exit tears down the process.
    wm_close = CPP.split('case WM_CLOSE:', 1)[1].split('case ', 1)[0]
    require('HideWindowToTray' in wm_close, 'WM_CLOSE must hide to tray in warm mode')
    require('DestroyWindow' not in wm_close, 'WM_CLOSE must not destroy the warm resident process')
    require('RequestExit' in CPP and 'WM_APP_EXIT' in CPP, 'explicit full-exit path missing')

    # Tray owns the discoverable Open / Always on top / Exit actions.
    for token in ('Shell_NotifyIconW', 'NIM_ADD', 'NIM_DELETE', 'TrackPopupMenu',
                  'ID_TRAY_OPEN', 'ID_TRAY_TOPMOST', 'ID_TRAY_EXIT'):
        require(token in CPP, f'tray contract missing: {token}')

    # Full shutdown must explicitly close WebView2 before the host window/process dies.
    require('ShutdownWebView' in CPP, 'WebView2 shutdown helper missing')
    require('controller_->Close()' in CPP, 'ICoreWebView2Controller::Close() missing')

    # Startup timing must reach actual tool readiness, not merely process creation.
    require('startup.log' in CPP and 'TraceStartup' in CPP, 'startup timing log missing')
    require('hostMessage("app:ready")' in JS, 'tool-ready timing signal missing')
    require('message == L"app:ready"' in CPP, 'native app-ready timing receiver missing')

    # UX should disclose the new close-to-tray behavior.
    require('Close to tray' in HTML, 'close button does not disclose tray behavior')
    require('托盘' in README and 'startup.log' in README, 'README lacks warm mode/timing guidance')

    print('v0.1.5 warm-start/single-instance/tray contract: PASS')


if __name__ == '__main__':
    main()
