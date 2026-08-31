#include <windows.h>
#include <commctrl.h>
#include <dwmapi.h>
#include <shlobj.h>
#include <shellapi.h>
#include <wrl.h>
#include <WebView2.h>
#include "resource.h"

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <sstream>
#include <string>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {
constexpr wchar_t kWindowClass[] = L"RegCalc64DesktopWindow";
constexpr wchar_t kWindowTitle[] = L"RegCalc64";
constexpr int kDefaultWidth = 560;
constexpr int kDefaultHeight = 610;
constexpr int kMinWidth = 420;
constexpr int kMinHeight = 460;
constexpr wchar_t kSingleInstanceMutex[] = L"Local\\RegCalc64Desktop.SingleInstance";
constexpr UINT WM_APP_DRAG = WM_APP + 1;
constexpr UINT WM_APP_RESIZE_BR = WM_APP + 2;
constexpr UINT WM_APP_SHOW = WM_APP + 3;
constexpr UINT WM_APP_TRAY = WM_APP + 4;
constexpr UINT WM_APP_EXIT = WM_APP + 5;
constexpr UINT ID_TRAY_OPEN = 2001;
constexpr UINT ID_TRAY_TOPMOST = 2002;
constexpr UINT ID_TRAY_CLOSE_TO_TRAY = 2003;
constexpr UINT ID_TRAY_EXIT = 2004;
constexpr UINT kTrayIconId = 1;

struct SavedGeometry {
    int x = CW_USEDEFAULT;
    int y = CW_USEDEFAULT;
    int width = kDefaultWidth;
    int height = kDefaultHeight;
    bool validPosition = false;
};

std::wstring GetModuleDirectory() {
    wchar_t buffer[MAX_PATH]{};
    DWORD len = GetModuleFileNameW(nullptr, buffer, ARRAYSIZE(buffer));
    std::filesystem::path path(std::wstring(buffer, len));
    return path.parent_path().wstring();
}

std::wstring GetLocalAppDataDirectory() {
    wchar_t path[MAX_PATH]{};
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, SHGFP_TYPE_CURRENT, path))) {
        std::filesystem::path result(path);
        result /= L"RegCalc64";
        std::error_code ec;
        std::filesystem::create_directories(result, ec);
        return result.wstring();
    }
    return GetModuleDirectory();
}

std::wstring GetSettingsPath() {
    return (std::filesystem::path(GetLocalAppDataDirectory()) / L"settings.ini").wstring();
}

std::wstring GetWebViewDataPath() {
    std::filesystem::path path(GetLocalAppDataDirectory());
    path /= L"WebView2";
    std::error_code ec;
    std::filesystem::create_directories(path, ec);
    return path.wstring();
}

bool ReadIniInt(const wchar_t* section, const wchar_t* key, int& value) {
    wchar_t buffer[64]{};
    DWORD n = GetPrivateProfileStringW(section, key, nullptr, buffer, ARRAYSIZE(buffer), GetSettingsPath().c_str());
    if (!n) return false;
    wchar_t* end = nullptr;
    long parsed = wcstol(buffer, &end, 10);
    if (!end || *end != L'\0') return false;
    value = static_cast<int>(parsed);
    return true;
}

SavedGeometry LoadGeometry() {
    SavedGeometry g;
    int x = 0, y = 0, w = 0, h = 0;
    const bool hasX = ReadIniInt(L"window", L"x", x);
    const bool hasY = ReadIniInt(L"window", L"y", y);
    if (ReadIniInt(L"window", L"width", w)) g.width = std::max(kMinWidth, w);
    if (ReadIniInt(L"window", L"height", h)) g.height = std::max(kMinHeight, h);
    if (hasX && hasY) {
        g.x = x;
        g.y = y;
        g.validPosition = true;
    }
    return g;
}

void WriteIniInt(const wchar_t* section, const wchar_t* key, int value) {
    wchar_t buffer[32]{};
    _itow_s(value, buffer, 10);
    WritePrivateProfileStringW(section, key, buffer, GetSettingsPath().c_str());
}

void SaveGeometry(HWND hwnd) {
    if (!hwnd || IsIconic(hwnd)) return;
    RECT r{};
    if (!GetWindowRect(hwnd, &r)) return;
    WriteIniInt(L"window", L"x", r.left);
    WriteIniInt(L"window", L"y", r.top);
    WriteIniInt(L"window", L"width", r.right - r.left);
    WriteIniInt(L"window", L"height", r.bottom - r.top);
}

RECT WorkAreaForPoint(POINT pt) {
    RECT work{};
    HMONITOR mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{sizeof(mi)};
    if (GetMonitorInfoW(mon, &mi)) return mi.rcWork;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
    return work;
}

SavedGeometry NormalizeGeometry(SavedGeometry g) {
    if (!g.validPosition) {
        POINT pt{};
        GetCursorPos(&pt);
        RECT work = WorkAreaForPoint(pt);
        g.x = work.left + ((work.right - work.left) - g.width) / 2;
        g.y = work.top + ((work.bottom - work.top) - g.height) / 2;
        g.validPosition = true;
        return g;
    }

    POINT center{g.x + g.width / 2, g.y + g.height / 2};
    RECT work = WorkAreaForPoint(center);

    // Win32 RECT coordinates are LONG, while SavedGeometry uses int.
    // Normalize the work-area values to int before using std::min/max/clamp
    // so MSVC does not have to deduce a mixed LONG/int template type.
    const int workLeft = static_cast<int>(work.left);
    const int workTop = static_cast<int>(work.top);
    const int workRight = static_cast<int>(work.right);
    const int workBottom = static_cast<int>(work.bottom);
    const int workWidth = workRight - workLeft;
    const int workHeight = workBottom - workTop;

    g.width = std::min(g.width, workWidth);
    g.height = std::min(g.height, workHeight);
    g.x = std::clamp(g.x, workLeft, std::max(workLeft, workRight - g.width));
    g.y = std::clamp(g.y, workTop, std::max(workTop, workBottom - g.height));
    return g;
}

std::wstring HResultMessage(HRESULT hr) {
    wchar_t* text = nullptr;
    FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                   nullptr, hr, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
                   reinterpret_cast<LPWSTR>(&text), 0, nullptr);
    std::wstring out = text ? text : L"Unknown error";
    if (text) LocalFree(text);
    return out;
}

class RegCalcApp {
public:
    int Run(HINSTANCE instance, int showCommand) {
        instance_ = instance;

        singleInstanceMutex_ = CreateMutexW(nullptr, FALSE, kSingleInstanceMutex);
        if (singleInstanceMutex_ && GetLastError() == ERROR_ALREADY_EXISTS) {
            ActivateExistingInstance();
            CloseHandle(singleInstanceMutex_);
            singleInstanceMutex_ = nullptr;
            return 0;
        }

        SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

        if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) {
            MessageBoxW(nullptr, L"COM initialization failed.", kWindowTitle, MB_ICONERROR | MB_OK);
            CloseSingleInstanceMutex();
            return 1;
        }

        INITCOMMONCONTROLSEX commonControls{sizeof(commonControls), ICC_STANDARD_CLASSES};
        InitCommonControlsEx(&commonControls);

        WNDCLASSEXW wc{sizeof(wc)};
        wc.lpfnWndProc = &RegCalcApp::WndProcStatic;
        wc.hInstance = instance_;
        wc.lpszClassName = kWindowClass;
        wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        wc.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(IDI_APP_ICON));
        wc.hIconSm = wc.hIcon;
        wc.hbrBackground = CreateSolidBrush(RGB(240, 244, 248));
        if (!RegisterClassExW(&wc)) {
            CoUninitialize();
            CloseSingleInstanceMutex();
            return 1;
        }

        auto g = NormalizeGeometry(LoadGeometry());
        alwaysOnTop_ = LoadAlwaysOnTop();
        closeToTray_ = LoadCloseToTray();
        const DWORD exStyle = WS_EX_APPWINDOW | (alwaysOnTop_ ? WS_EX_TOPMOST : 0);

        hwnd_ = CreateWindowExW(
            exStyle,
            kWindowClass,
            kWindowTitle,
            WS_POPUP | WS_THICKFRAME | WS_CLIPCHILDREN | WS_SYSMENU | WS_MINIMIZEBOX,
            g.x, g.y, g.width, g.height,
            nullptr, nullptr, instance_, this);

        if (!hwnd_) {
            CoUninitialize();
            CloseSingleInstanceMutex();
            return 1;
        }

        ApplyDwmStyle();
        AddTrayIcon();
        ShowWindow(hwnd_, showCommand);
        UpdateWindow(hwnd_);
        InitializeWebView();

        MSG msg{};
        while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        ShutdownWebView();
        RemoveTrayIcon();
        CoUninitialize();
        CloseSingleInstanceMutex();
        return static_cast<int>(msg.wParam);
    }

private:
    static LRESULT CALLBACK WndProcStatic(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
        RegCalcApp* self = nullptr;
        if (msg == WM_NCCREATE) {
            auto* cs = reinterpret_cast<CREATESTRUCTW*>(lParam);
            self = static_cast<RegCalcApp*>(cs->lpCreateParams);
            self->hwnd_ = hwnd;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        } else {
            self = reinterpret_cast<RegCalcApp*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        }
        return self ? self->WndProc(msg, wParam, lParam) : DefWindowProcW(hwnd, msg, wParam, lParam);
    }

    LRESULT WndProc(UINT msg, WPARAM wParam, LPARAM lParam) {
        switch (msg) {
        case WM_NCCALCSIZE:
            if (wParam) return 0; // full client-area, no native title bar
            break;
        case WM_SIZE:
            ResizeWebView();
            return 0;
        case WM_DPICHANGED: {
            auto* suggested = reinterpret_cast<RECT*>(lParam);
            SetWindowPos(hwnd_, nullptr, suggested->left, suggested->top,
                         suggested->right - suggested->left,
                         suggested->bottom - suggested->top,
                         SWP_NOZORDER | SWP_NOACTIVATE);
            return 0;
        }
        case WM_GETMINMAXINFO: {
            auto* mmi = reinterpret_cast<MINMAXINFO*>(lParam);
            mmi->ptMinTrackSize.x = kMinWidth;
            mmi->ptMinTrackSize.y = kMinHeight;
            return 0;
        }
        case WM_SYSCOMMAND:
            switch (wParam & 0xFFF0) {
            case SC_MINIMIZE:
                ShowWindow(hwnd_, SW_MINIMIZE);
                return 0;
            case SC_RESTORE:
                ShowAndActivateWindow();
                return 0;
            default:
                break;
            }
            break;
        case WM_APP_DRAG:
            ReleaseCapture();
            SendMessageW(hwnd_, WM_NCLBUTTONDOWN, HTCAPTION, 0);
            return 0;
        case WM_APP_RESIZE_BR:
            ReleaseCapture();
            SendMessageW(hwnd_, WM_NCLBUTTONDOWN, HTBOTTOMRIGHT, 0);
            return 0;
        case WM_APP_SHOW:
            ShowAndActivateWindow();
            return 0;
        case WM_APP_TRAY:
            HandleTrayMessage(lParam);
            return 0;
        case WM_APP_EXIT:
            RequestExit();
            return 0;
        case WM_CLOSE:
            if (closeToTray_) {
                HideWindowToTray();
            } else {
                RequestExit();
            }
            return 0;
        case WM_DESTROY:
            SaveGeometry(hwnd_);
            RemoveTrayIcon();
            PostQuitMessage(0);
            return 0;
        case WM_ERASEBKGND:
            return 1;
        }
        if (taskbarCreatedMessage_ != 0 && msg == taskbarCreatedMessage_) {
            trayIconAdded_ = false;
            AddTrayIcon();
            return 0;
        }
        return DefWindowProcW(hwnd_, msg, wParam, lParam);
    }

    void ApplyDwmStyle() {
        if (!hwnd_) return;
        // Windows 11 rounded corners. Ignored gracefully on older systems.
        enum DWM_WINDOW_CORNER_PREFERENCE_LOCAL {
            DWMWCP_DEFAULT_LOCAL = 0,
            DWMWCP_DONOTROUND_LOCAL = 1,
            DWMWCP_ROUND_LOCAL = 2,
            DWMWCP_ROUNDSMALL_LOCAL = 3
        };
        constexpr DWORD DWMWA_WINDOW_CORNER_PREFERENCE_LOCAL = 33;
        auto preference = DWMWCP_ROUND_LOCAL;
        DwmSetWindowAttribute(hwnd_, DWMWA_WINDOW_CORNER_PREFERENCE_LOCAL,
                              &preference, sizeof(preference));
    }

    bool ActivateExistingInstance() const {
        for (int attempt = 0; attempt < 40; ++attempt) {
            HWND existing = FindWindowW(kWindowClass, nullptr);
            if (existing) {
                DWORD existingProcessId = 0;
                GetWindowThreadProcessId(existing, &existingProcessId);
                if (existingProcessId != 0) {
                    AllowSetForegroundWindow(existingProcessId);
                }
                ShowWindowAsync(existing, IsIconic(existing) ? SW_RESTORE : SW_SHOW);
                PostMessageW(existing, WM_APP_SHOW, 0, 0);
                SetForegroundWindow(existing);
                return true;
            }
            Sleep(25);
        }
        return false;
    }

    void CloseSingleInstanceMutex() {
        if (!singleInstanceMutex_) return;
        CloseHandle(singleInstanceMutex_);
        singleInstanceMutex_ = nullptr;
    }

    void AddTrayIcon() {
        if (!hwnd_ || trayIconAdded_) return;

        if (taskbarCreatedMessage_ == 0) {
            taskbarCreatedMessage_ = RegisterWindowMessageW(L"TaskbarCreated");
        }

        trayIconData_ = {};
        trayIconData_.cbSize = sizeof(trayIconData_);
        trayIconData_.hWnd = hwnd_;
        trayIconData_.uID = kTrayIconId;
        trayIconData_.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        trayIconData_.uCallbackMessage = WM_APP_TRAY;
        trayIconData_.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(IDI_APP_ICON));
        wcscpy_s(trayIconData_.szTip, L"RegCalc64");

        trayIconAdded_ = Shell_NotifyIconW(NIM_ADD, &trayIconData_) == TRUE;
    }

    void RemoveTrayIcon() {
        if (!trayIconAdded_) return;
        Shell_NotifyIconW(NIM_DELETE, &trayIconData_);
        trayIconAdded_ = false;
    }

    void ShowTrayMenu() {
        if (!hwnd_) return;

        HMENU menu = CreatePopupMenu();
        if (!menu) return;

        const bool zh = IsChineseUi();
        AppendMenuW(menu, MF_STRING, ID_TRAY_OPEN, zh ? L"打开 RegCalc64" : L"Open RegCalc64");
        AppendMenuW(
            menu,
            MF_STRING | (alwaysOnTop_ ? MF_CHECKED : MF_UNCHECKED),
            ID_TRAY_TOPMOST,
            zh ? L"置顶" : L"Always on top");
        AppendMenuW(
            menu,
            MF_STRING | (closeToTray_ ? MF_CHECKED : MF_UNCHECKED),
            ID_TRAY_CLOSE_TO_TRAY,
            zh ? L"关闭按钮隐藏到托盘" : L"Close button hides to tray");
        AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
        AppendMenuW(menu, MF_STRING, ID_TRAY_EXIT, zh ? L"退出" : L"Exit");

        POINT cursor{};
        GetCursorPos(&cursor);
        SetForegroundWindow(hwnd_);
        const UINT command = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY,
            cursor.x,
            cursor.y,
            0,
            hwnd_,
            nullptr);
        DestroyMenu(menu);
        PostMessageW(hwnd_, WM_NULL, 0, 0);

        if (command == ID_TRAY_OPEN) {
            ShowAndActivateWindow();
        } else if (command == ID_TRAY_TOPMOST) {
            SetAlwaysOnTop(!alwaysOnTop_);
        } else if (command == ID_TRAY_CLOSE_TO_TRAY) {
            SetCloseToTray(!closeToTray_);
        } else if (command == ID_TRAY_EXIT) {
            RequestExit();
        }
    }

    void HandleTrayMessage(LPARAM lParam) {
        const UINT event = static_cast<UINT>(lParam);
        if (event == WM_LBUTTONUP || event == WM_LBUTTONDBLCLK) {
            ShowAndActivateWindow();
        } else if (event == WM_RBUTTONUP || event == WM_CONTEXTMENU) {
            ShowTrayMenu();
        }
    }

    void HideWindowToTray() {
        if (!hwnd_ || exiting_) return;
        if (!trayIconAdded_) {
            RequestExit();
            return;
        }
        SaveGeometry(hwnd_);
        ShowWindow(hwnd_, SW_HIDE);
    }

    void ShowAndActivateWindow() {
        if (!hwnd_ || exiting_) return;

        if (IsIconic(hwnd_)) {
            ShowWindow(hwnd_, SW_RESTORE);
        } else {
            ShowWindow(hwnd_, SW_SHOW);
        }

        if (alwaysOnTop_) {
            SetWindowPos(
                hwnd_, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        } else {
            SetWindowPos(
                hwnd_, HWND_TOP, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        }

        // SetForegroundWindow can be rejected for a background process by the
        // Windows foreground-lock policy. A secondary RegCalc64 launch grants
        // us permission first; the thread-input attachment below is a fallback
        // for tray/menu activation and other shell edge cases.
        HWND foreground = GetForegroundWindow();
        const DWORD foregroundThread = foreground
            ? GetWindowThreadProcessId(foreground, nullptr)
            : 0;
        const DWORD currentThread = GetCurrentThreadId();
        const bool attached = foregroundThread != 0 && foregroundThread != currentThread
            && AttachThreadInput(currentThread, foregroundThread, TRUE) != FALSE;

        BringWindowToTop(hwnd_);
        SetForegroundWindow(hwnd_);
        SetActiveWindow(hwnd_);
        SetFocus(hwnd_);

        if (attached) {
            AttachThreadInput(currentThread, foregroundThread, FALSE);
        }
    }

    void ShutdownWebView() {
        if (webview_) {
            webview_->remove_WebMessageReceived(webMessageToken_);
            webview_->remove_WebResourceRequested(webResourceRequestedToken_);
        }
        if (controller_) controller_->Close();
        webview_.Reset();
        controller_.Reset();
        environment_.Reset();
    }

    void RequestExit() {
        if (exiting_) return;
        exiting_ = true;
        SaveGeometry(hwnd_);
        RemoveTrayIcon();
        ShutdownWebView();
        if (hwnd_) DestroyWindow(hwnd_);
    }

    void ResizeWebView() {
        if (!controller_ || !hwnd_) return;
        RECT bounds{};
        GetClientRect(hwnd_, &bounds);
        controller_->put_Bounds(bounds);
    }

    bool IsChineseUi() const {
        const LANGID lang = GetUserDefaultUILanguage();
        return PRIMARYLANGID(lang) == LANG_CHINESE;
    }

    bool IsWebView2RuntimeAvailable(std::wstring* version = nullptr) const {
        LPWSTR runtimeVersion = nullptr;
        const HRESULT hr = GetAvailableCoreWebView2BrowserVersionString(nullptr, &runtimeVersion);
        const bool available = SUCCEEDED(hr) && runtimeVersion && runtimeVersion[0] != L'\0';
        if (available && version) *version = runtimeVersion;
        if (runtimeVersion) CoTaskMemFree(runtimeVersion);
        return available;
    }

    HRESULT ExtractEmbeddedResourceToFile(int resourceId, const std::wstring& outputPath) const {
        HRSRC resource = FindResourceW(instance_, MAKEINTRESOURCEW(resourceId), RT_RCDATA);
        if (!resource) return HRESULT_FROM_WIN32(GetLastError());

        HGLOBAL loaded = LoadResource(instance_, resource);
        if (!loaded) return HRESULT_FROM_WIN32(GetLastError());

        const DWORD size = SizeofResource(instance_, resource);
        const void* bytes = LockResource(loaded);
        if (!bytes || size == 0) return E_FAIL;

        HANDLE file = CreateFileW(
            outputPath.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
            FILE_ATTRIBUTE_TEMPORARY | FILE_ATTRIBUTE_NOT_CONTENT_INDEXED, nullptr);
        if (file == INVALID_HANDLE_VALUE) return HRESULT_FROM_WIN32(GetLastError());

        DWORD written = 0;
        const BOOL ok = WriteFile(file, bytes, size, &written, nullptr);
        const DWORD error = ok ? ERROR_SUCCESS : GetLastError();
        CloseHandle(file);

        if (!ok) return HRESULT_FROM_WIN32(error);
        if (written != size) return HRESULT_FROM_WIN32(ERROR_WRITE_FAULT);
        return S_OK;
    }

    std::wstring TemporaryBootstrapperPath() const {
        wchar_t tempDir[MAX_PATH + 1]{};
        const DWORD len = GetTempPathW(ARRAYSIZE(tempDir), tempDir);
        if (len == 0 || len >= ARRAYSIZE(tempDir)) return {};

        std::wstringstream name;
        name << L"RegCalc64-WebView2-" << GetCurrentProcessId() << L".exe";
        return (std::filesystem::path(tempDir) / name.str()).wstring();
    }

    bool InstallEmbeddedWebView2Runtime() {
        const std::wstring installerPath = TemporaryBootstrapperPath();
        if (installerPath.empty()) return false;

        DeleteFileW(installerPath.c_str());
        const HRESULT extractHr = ExtractEmbeddedResourceToFile(
            IDR_WEBVIEW2_BOOTSTRAPPER, installerPath);
        if (FAILED(extractHr)) {
            std::wstring message = IsChineseUi()
                ? L"无法释放内嵌的 Microsoft WebView2 安装程序。\n\n"
                : L"Unable to extract the embedded Microsoft WebView2 installer.\n\n";
            message += HResultMessage(extractHr);
            MessageBoxW(hwnd_, message.c_str(), kWindowTitle, MB_ICONERROR | MB_OK);
            return false;
        }

        SHELLEXECUTEINFOW execute{sizeof(execute)};
        execute.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI;
        execute.hwnd = hwnd_;
        execute.lpVerb = L"open";
        execute.lpFile = installerPath.c_str();
        execute.lpParameters = L"/silent /install";
        execute.nShow = SW_HIDE;

        if (!ShellExecuteExW(&execute) || !execute.hProcess) {
            const DWORD error = GetLastError();
            DeleteFileW(installerPath.c_str());
            std::wstring message = IsChineseUi()
                ? L"无法启动 Microsoft WebView2 安装程序。\n\n"
                : L"Unable to start the Microsoft WebView2 installer.\n\n";
            message += HResultMessage(HRESULT_FROM_WIN32(error));
            MessageBoxW(hwnd_, message.c_str(), kWindowTitle, MB_ICONERROR | MB_OK);
            return false;
        }

        SetCursor(LoadCursorW(nullptr, IDC_WAIT));
        WaitForSingleObject(execute.hProcess, INFINITE);
        DWORD exitCode = ERROR_GEN_FAILURE;
        GetExitCodeProcess(execute.hProcess, &exitCode);
        CloseHandle(execute.hProcess);
        SetCursor(LoadCursorW(nullptr, IDC_ARROW));
        DeleteFileW(installerPath.c_str());

        for (int attempt = 0; attempt < 20; ++attempt) {
            if (IsWebView2RuntimeAvailable()) return true;
            Sleep(250);
        }

        std::wstringstream detail;
        if (IsChineseUi()) {
            detail << L"WebView2 Runtime 未能完成安装。\n\n"
                   << L"请确认电脑可以访问 Microsoft 网络服务，或使用 Evergreen Standalone Installer 离线安装。\n\n"
                   << L"安装程序退出码: " << exitCode;
        } else {
            detail << L"WebView2 Runtime installation did not complete.\n\n"
                   << L"Check Microsoft network access, or use the Evergreen Standalone Installer for offline installation.\n\n"
                   << L"Installer exit code: " << exitCode;
        }
        MessageBoxW(hwnd_, detail.str().c_str(), kWindowTitle, MB_ICONERROR | MB_OK);
        return false;
    }

    void OpenWebView2OfficialDownload() const {
        ShellExecuteW(
            hwnd_, L"open",
            L"https://developer.microsoft.com/microsoft-edge/webview2/",
            nullptr, nullptr, SW_SHOWNORMAL);
    }

    bool PromptForWebView2Runtime() {
        constexpr int kInstallButton = 1001;
        constexpr int kDownloadButton = 1002;
        const bool zh = IsChineseUi();

        const TASKDIALOG_BUTTON buttons[] = {
            {kInstallButton, zh ? L"立即安装" : L"Install now"},
            {kDownloadButton, zh ? L"官方下载" : L"Official download"},
        };

        TASKDIALOGCONFIG config{};
        config.cbSize = sizeof(config);
        config.hwndParent = hwnd_;
        config.hInstance = instance_;
        config.dwFlags = TDF_ALLOW_DIALOG_CANCELLATION | TDF_POSITION_RELATIVE_TO_WINDOW;
        config.dwCommonButtons = TDCBF_CANCEL_BUTTON;
        config.pszWindowTitle = L"RegCalc64";
        config.pszMainIcon = TD_WARNING_ICON;
        config.pszMainInstruction = zh
            ? L"需要 Microsoft Edge WebView2 Runtime"
            : L"Microsoft Edge WebView2 Runtime is required";
        config.pszContent = zh
            ? L"这是 Microsoft 提供的 Windows Web UI 运行组件。Windows 11 和大多数 Windows 10 通常已经预装。\n\n你可以让 RegCalc64 使用内嵌的 Microsoft Evergreen Bootstrapper 安装，也可以打开微软官方下载页面。"
            : L"This is Microsoft's Windows Web UI runtime. It is normally already installed on Windows 11 and most Windows 10 PCs.\n\nRegCalc64 can install it using the embedded Microsoft Evergreen Bootstrapper, or open Microsoft's official download page.";
        config.cButtons = static_cast<UINT>(ARRAYSIZE(buttons));
        config.pButtons = buttons;
        config.nDefaultButton = kInstallButton;
        config.pszFooter = zh
            ? L"离线电脑：请在其他电脑下载 Evergreen Standalone Installer（x64），复制到目标电脑安装一次。"
            : L"Offline PC: download the Evergreen Standalone Installer (x64) on another PC, copy it over, and install it once.";

        int pressed = IDCANCEL;
        const HRESULT hr = TaskDialogIndirect(&config, &pressed, nullptr, nullptr);
        if (FAILED(hr)) {
            const int fallback = MessageBoxW(
                hwnd_,
                zh
                    ? L"RegCalc64 需要 Microsoft Edge WebView2 Runtime。\n\n选择“是”立即安装；选择“否”打开微软官方下载页面；选择“取消”退出。"
                    : L"RegCalc64 requires Microsoft Edge WebView2 Runtime.\n\nChoose Yes to install now, No for Microsoft's official download page, or Cancel to exit.",
                L"RegCalc64 - WebView2 Runtime",
                MB_ICONWARNING | MB_YESNOCANCEL);
            if (fallback == IDYES) pressed = kInstallButton;
            else if (fallback == IDNO) pressed = kDownloadButton;
            else pressed = IDCANCEL;
        }

        if (pressed == kInstallButton) return InstallEmbeddedWebView2Runtime();
        if (pressed == kDownloadButton) OpenWebView2OfficialDownload();
        return false;
    }

    bool LoadAlwaysOnTop() const {
        int value = 0;
        return ReadIniInt(L"window", L"always_on_top", value) && value != 0;
    }

    bool LoadCloseToTray() const {
        int value = 1;
        if (!ReadIniInt(L"window", L"close_to_tray", value)) return true;
        return value != 0;
    }

    void SetCloseToTray(bool enabled) {
        closeToTray_ = enabled;
        WriteIniInt(L"window", L"close_to_tray", enabled ? 1 : 0);
        SendCloseToTrayState();
    }

    void SendCloseToTrayState() {
        if (!webview_) return;
        webview_->PostWebMessageAsString(closeToTray_ ? L"close-to-tray:1" : L"close-to-tray:0");
    }

    void SendTopmostState() {
        if (!webview_) return;
        webview_->PostWebMessageAsString(alwaysOnTop_ ? L"topmost:1" : L"topmost:0");
    }

    void SetAlwaysOnTop(bool enabled) {
        alwaysOnTop_ = enabled;
        if (hwnd_) {
            SetWindowPos(
                hwnd_,
                enabled ? HWND_TOPMOST : HWND_NOTOPMOST,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        WriteIniInt(L"window", L"always_on_top", enabled ? 1 : 0);
        SendTopmostState();
    }

    HRESULT CreateEmbeddedResourceStream(int resourceId, IStream** stream) {
        if (!stream) return E_POINTER;
        *stream = nullptr;

        HRSRC resource = FindResourceW(instance_, MAKEINTRESOURCEW(resourceId), RT_RCDATA);
        if (!resource) return HRESULT_FROM_WIN32(GetLastError());

        HGLOBAL loaded = LoadResource(instance_, resource);
        if (!loaded) return HRESULT_FROM_WIN32(GetLastError());

        const DWORD size = SizeofResource(instance_, resource);
        const void* bytes = LockResource(loaded);
        if (!bytes && size != 0) return E_FAIL;

        HGLOBAL copy = GlobalAlloc(GMEM_MOVEABLE, size == 0 ? 1 : size);
        if (!copy) return E_OUTOFMEMORY;

        void* destination = GlobalLock(copy);
        if (!destination) {
            GlobalFree(copy);
            return HRESULT_FROM_WIN32(GetLastError());
        }
        if (size != 0) std::memcpy(destination, bytes, size);
        GlobalUnlock(copy);

        const HRESULT hr = CreateStreamOnHGlobal(copy, TRUE, stream);
        if (FAILED(hr)) GlobalFree(copy);
        return hr;
    }

    bool ResolveEmbeddedResource(
        const std::wstring& uri,
        int& resourceId,
        const wchar_t*& contentType) const {
        constexpr wchar_t kOrigin[] = L"https://app.regcalc64.local";
        const std::wstring origin(kOrigin);
        if (uri.rfind(origin, 0) != 0) return false;

        std::wstring path = uri.substr(origin.size());
        const auto suffix = path.find_first_of(L"?#");
        if (suffix != std::wstring::npos) path.resize(suffix);
        if (path.empty() || path == L"/") path = L"/desktop.html";

        if (path == L"/desktop.html") {
            resourceId = IDR_DESKTOP_HTML;
            contentType = L"text/html; charset=utf-8";
            return true;
        }
        if (path == L"/desktop.css") {
            resourceId = IDR_DESKTOP_CSS;
            contentType = L"text/css; charset=utf-8";
            return true;
        }
        if (path == L"/desktop.js") {
            resourceId = IDR_DESKTOP_JS;
            contentType = L"application/javascript; charset=utf-8";
            return true;
        }
        if (path == L"/tool.html") {
            resourceId = IDR_TOOL_HTML;
            contentType = L"text/html; charset=utf-8";
            return true;
        }
        return false;
    }

    HRESULT HandleEmbeddedWebResource(ICoreWebView2WebResourceRequestedEventArgs* args) {
        if (!args || !environment_) return E_POINTER;

        ComPtr<ICoreWebView2WebResourceRequest> request;
        HRESULT hr = args->get_Request(&request);
        if (FAILED(hr) || !request) return hr;

        LPWSTR rawUri = nullptr;
        hr = request->get_Uri(&rawUri);
        if (FAILED(hr) || !rawUri) return hr;
        std::wstring uri(rawUri);
        CoTaskMemFree(rawUri);

        int resourceId = 0;
        const wchar_t* contentType = nullptr;
        ComPtr<ICoreWebView2WebResourceResponse> response;

        if (ResolveEmbeddedResource(uri, resourceId, contentType)) {
            ComPtr<IStream> stream;
            hr = CreateEmbeddedResourceStream(resourceId, &stream);
            if (FAILED(hr)) return hr;

            std::wstring headers = L"Content-Type: ";
            headers += contentType;
            headers += L"\nCache-Control: no-store\nX-Content-Type-Options: nosniff";
            hr = environment_->CreateWebResourceResponse(
                stream.Get(), 200, L"OK", headers.c_str(), &response);
        } else {
            hr = environment_->CreateWebResourceResponse(
                nullptr, 404, L"Not Found", L"Content-Type: text/plain; charset=utf-8", &response);
        }

        if (FAILED(hr) || !response) return hr;
        return args->put_Response(response.Get());
    }

    void InitializeWebView() {
        if (!IsWebView2RuntimeAvailable()) {
            if (!PromptForWebView2Runtime() || !IsWebView2RuntimeAvailable()) {
                PostMessageW(hwnd_, WM_APP_EXIT, 0, 0);
                return;
            }
        }

        const std::wstring userData = GetWebViewDataPath();
        HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
            nullptr,
            userData.c_str(),
            nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [this](HRESULT result, ICoreWebView2Environment* environment) -> HRESULT {
                    if (FAILED(result) || !environment) {
                        std::wstring message = L"Failed to create WebView2 environment.\n\n" + HResultMessage(result);
                        MessageBoxW(hwnd_, message.c_str(), kWindowTitle, MB_ICONERROR | MB_OK);
                        PostMessageW(hwnd_, WM_APP_EXIT, 0, 0);
                        return result;
                    }
                    environment_ = environment;
                    return environment_->CreateCoreWebView2Controller(
                        hwnd_,
                        Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [this](HRESULT controllerResult, ICoreWebView2Controller* controller) -> HRESULT {
                                if (FAILED(controllerResult) || !controller) {
                                    std::wstring message = L"Failed to create WebView2 controller.\n\n" + HResultMessage(controllerResult);
                                    MessageBoxW(hwnd_, message.c_str(), kWindowTitle, MB_ICONERROR | MB_OK);
                                    PostMessageW(hwnd_, WM_APP_EXIT, 0, 0);
                                    return controllerResult;
                                }
                                controller_ = controller;
                                controller_->get_CoreWebView2(&webview_);
                                if (!webview_) return E_FAIL;
                                ConfigureWebView();
                                ResizeWebView();
                                return S_OK;
                            }).Get());
                }).Get());

        if (FAILED(hr)) {
            std::wstring message = L"WebView2 initialization failed.\n\n" + HResultMessage(hr);
            MessageBoxW(hwnd_, message.c_str(), kWindowTitle, MB_ICONERROR | MB_OK);
            PostMessageW(hwnd_, WM_APP_EXIT, 0, 0);
        }
    }

    void ConfigureWebView() {
        ComPtr<ICoreWebView2Settings> settings;
        if (SUCCEEDED(webview_->get_Settings(&settings)) && settings) {
            settings->put_IsScriptEnabled(TRUE);
            settings->put_IsStatusBarEnabled(FALSE);
            settings->put_AreDefaultContextMenusEnabled(FALSE);
            settings->put_AreDevToolsEnabled(FALSE);
            settings->put_IsZoomControlEnabled(FALSE);
        }

        ComPtr<ICoreWebView2Controller2> controller2;
        if (SUCCEEDED(controller_.As(&controller2)) && controller2) {
            COREWEBVIEW2_COLOR bg{255, 240, 244, 248};
            controller2->put_DefaultBackgroundColor(bg);
        }

        webview_->AddWebResourceRequestedFilter(
            L"https://app.regcalc64.local/*",
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
        webview_->add_WebResourceRequested(
            Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                [this](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
                    return HandleEmbeddedWebResource(args);
                }).Get(),
            &webResourceRequestedToken_);

        webview_->add_WebMessageReceived(
            Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                [this](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                    LPWSTR rawSource = nullptr;
                    if (FAILED(args->get_Source(&rawSource)) || !rawSource) return S_OK;
                    std::wstring source(rawSource);
                    CoTaskMemFree(rawSource);
                    if (source.rfind(L"https://app.regcalc64.local/", 0) != 0) return S_OK;

                    LPWSTR rawMessage = nullptr;
                    if (FAILED(args->TryGetWebMessageAsString(&rawMessage)) || !rawMessage) return S_OK;
                    std::wstring message(rawMessage);
                    CoTaskMemFree(rawMessage);

                    if (message == L"window:close") {
                        PostMessageW(hwnd_, WM_CLOSE, 0, 0);
                    } else if (message == L"window:drag") {
                        PostMessageW(hwnd_, WM_APP_DRAG, 0, 0);
                    } else if (message == L"window:resize-br") {
                        PostMessageW(hwnd_, WM_APP_RESIZE_BR, 0, 0);
                    } else if (message == L"window:minimize") {
                        ShowWindow(hwnd_, SW_MINIMIZE);
                    } else if (message == L"window:toggle-topmost") {
                        SetAlwaysOnTop(!alwaysOnTop_);
                    } else if (message == L"window:get-topmost") {
                        SendTopmostState();
                    } else if (message == L"window:get-close-to-tray") {
                        SendCloseToTrayState();
                    }
                    return S_OK;
                }).Get(),
            &webMessageToken_);

        webview_->Navigate(L"https://app.regcalc64.local/desktop.html");
    }

private:
    HINSTANCE instance_ = nullptr;
    HWND hwnd_ = nullptr;
    ComPtr<ICoreWebView2Environment> environment_;
    ComPtr<ICoreWebView2Controller> controller_;
    ComPtr<ICoreWebView2> webview_;
    EventRegistrationToken webMessageToken_{};
    EventRegistrationToken webResourceRequestedToken_{};
    HANDLE singleInstanceMutex_ = nullptr;
    NOTIFYICONDATAW trayIconData_{};
    UINT taskbarCreatedMessage_ = 0;
    bool alwaysOnTop_ = false;
    bool closeToTray_ = true;
    bool trayIconAdded_ = false;
    bool exiting_ = false;
};

} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int showCommand) {
    RegCalcApp app;
    return app.Run(instance, showCommand);
}
