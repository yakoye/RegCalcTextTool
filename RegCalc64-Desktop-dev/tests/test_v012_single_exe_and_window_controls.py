from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CPP = (ROOT / 'src' / 'main.cpp').read_text(encoding='utf-8')
CMAKE = (ROOT / 'CMakeLists.txt').read_text(encoding='utf-8')
RC = (ROOT / 'resources' / 'app.rc').read_text(encoding='utf-8')
DESKTOP_HTML = (ROOT / 'web' / 'desktop.html').read_text(encoding='utf-8')
DESKTOP_JS = (ROOT / 'web' / 'desktop.js').read_text(encoding='utf-8')
DESKTOP_CSS = (ROOT / 'web' / 'desktop.css').read_text(encoding='utf-8')
BUILD = (ROOT / 'build.bat').read_text(encoding='utf-8')
PACKAGE = (ROOT / 'package.bat').read_text(encoding='utf-8')


def require(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    # Single-EXE resource packaging contract.
    require('IDR_DESKTOP_HTML' in RC and 'RCDATA' in RC, 'desktop.html is not embedded as RCDATA')
    require('IDR_DESKTOP_CSS' in RC, 'desktop.css is not embedded')
    require('IDR_DESKTOP_JS' in RC, 'desktop.js is not embedded')
    require('IDR_TOOL_HTML' in RC, 'tool.html is not embedded')
    require('AddWebResourceRequestedFilter' in CPP, 'embedded web resource request filter missing')
    require('CreateWebResourceResponse' in CPP, 'embedded resource response creation missing')
    require('FindResourceW' in CPP and 'LoadResource' in CPP and 'LockResource' in CPP,
            'Win32 embedded resource loader missing')
    require('SetVirtualHostNameToFolderMapping' not in CPP, 'runtime still depends on external web folder mapping')
    require('copy_directory' not in CMAKE, 'CMake still copies external web folder')
    require('xcopy' not in BUILD.lower(), 'build output still copies web folder')
    require('dist\\RegCalc64.exe' in PACKAGE and 'dist\\*' not in PACKAGE,
            'package should archive only RegCalc64.exe')

    # Native minimize + always-on-top contract.
    require('id="topmost-btn"' in DESKTOP_HTML, 'topmost button missing')
    require('id="minimize-btn"' in DESKTOP_HTML, 'minimize button missing')
    require('window:toggle-topmost' in DESKTOP_JS, 'topmost web message missing')
    require('window:get-topmost' in DESKTOP_JS, 'topmost state query missing')
    require('window:minimize' in DESKTOP_JS, 'minimize web message missing')
    require('topmost:1' in CPP and 'topmost:0' in CPP, 'native topmost state response missing')
    require('HWND_TOPMOST' in CPP and 'HWND_NOTOPMOST' in CPP, 'native topmost SetWindowPos contract missing')
    require('SW_MINIMIZE' in CPP, 'native minimize handling missing')
    require('always_on_top' in CPP, 'topmost persistence missing')
    require('.is-active' in DESKTOP_CSS, 'topmost active visual state missing')

    print('RegCalc64 Desktop v0.1.2 feature contract: PASS')


if __name__ == '__main__':
    main()
