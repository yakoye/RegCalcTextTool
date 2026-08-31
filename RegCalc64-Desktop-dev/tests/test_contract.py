from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TOOL = (ROOT / "web" / "tool.html").read_text(encoding="utf-8")
DESKTOP_JS = (ROOT / "web" / "desktop.js").read_text(encoding="utf-8")
CPP = (ROOT / "src" / "main.cpp").read_text(encoding="utf-8")
CMAKE = (ROOT / "CMakeLists.txt").read_text(encoding="utf-8")


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def main():
    # Desktop shell contract.
    check('const DESKTOP_VERSION = "0.1.5";' in DESKTOP_JS, "desktop version missing")
    check('const NATURAL_WIDTH = 588;' in DESKTOP_JS, "natural width changed")
    check('REGCALC64_APPLY_STATE' in DESKTOP_JS, "state restore bridge missing")
    check('REGCALC64_STATE_CHANGED' in DESKTOP_JS, "state save bridge missing")
    check('window:drag' in DESKTOP_JS, "drag bridge missing")
    check('window:resize-br' in DESKTOP_JS, "resize bridge missing")
    check('window:close' in DESKTOP_JS, "close bridge missing")

    # Tool remains the existing RegCalc implementation and only has desktop help wording changes.
    for fn in [
        "regcalc_set_text_value",
        "regcalc_set_button_value",
        "regcalc_updateFromBitField",
        "regcalc_handleShift",
        "regcalc_calculate",
        "regcalc_syncResultToHex",
        "regcalc_setResultFormat",
        "regcalc_clean_all_value",
        "regcalc_applyLogic",
    ]:
        check(f"function {fn}(" in TOOL, f"missing core function: {fn}")

    check("RegCalc64 Desktop v" in TOOL, "desktop help version label missing")
    check("拖过 bit 可选择连续位域" in TOOL, "selection help missing")

    # Native host contract.
    check("CreateCoreWebView2EnvironmentWithOptions" in CPP, "WebView2 environment creation missing")
    check("COINIT_APARTMENTTHREADED" in CPP, "STA COM initialization missing")
    check("AddWebResourceRequestedFilter" in CPP, "embedded local resource mapping missing")
    check("CreateWebResourceResponse" in CPP, "embedded response creation missing")
    check("app.regcalc64.local" in CPP, "virtual host name missing")
    check("GetAvailableCoreWebView2BrowserVersionString" in CPP, "runtime detection missing")
    check("WM_NCLBUTTONDOWN, HTCAPTION" in CPP, "native drag handling missing")
    check("WM_NCLBUTTONDOWN, HTBOTTOMRIGHT" in CPP, "native resize handling missing")
    check("settings.ini" in CPP, "window geometry persistence missing")

    # Build uses static loader so the distribution doesn't need WebView2Loader.dll.
    check("WebView2LoaderStatic.lib" in CMAKE, "static WebView2 loader missing")
    check("version" in CMAKE, "version.lib link missing")
    check("copy_directory" not in CMAKE, "single-exe build must not copy web assets")

    print("RegCalc64 Desktop v0.1.5 contract: PASS")


if __name__ == "__main__":
    main()
