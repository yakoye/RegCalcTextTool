# RegCalc64 Desktop v0.1.5

RegCalc64 的 Windows 桌面版。使用 **C++17 + Win32 + Microsoft WebView2**：C++ 负责窗口、置顶、最小化、拖动、缩放、单 EXE 资源宿主和 WebView2 Runtime 引导；寄存器计算继续复用已经验证过的 RegCalc64 HTML/JavaScript。

## v0.1.5：Warm Mode / 秒开优化

- 改为**单实例常驻**：第一次启动创建 WebView2；之后再次双击 `RegCalc64.exe` 只唤醒已有窗口，不再重复创建 WebView2。
- 右上角 Close 现在是 **Close to tray**：关闭窗口时隐藏到系统托盘，计算器现场和 WebView2 都继续保留。
- 系统托盘菜单提供：**打开 RegCalc64 / 置顶 / 退出**。只有选择“退出”才真正释放 WebView2 并结束进程。
- 完整退出时先执行 `ICoreWebView2Controller::Close()`，再释放 WebView2 / Controller / Environment，避免旧 WebView2 子进程仍在退出时马上启动新实例。
- 增加启动阶段性能日志：`%LOCALAPPDATA%\RegCalc64\startup.log`。可以看到 `process_start`、`webview2_environment_ready`、`webview2_controller_ready`、`tool_ui_ready` 等时间点，用于继续定位首次启动耗时。
- 保留 v0.1.4 的单 Manifest 修复、单 EXE、IconPark 风格按钮、置顶、最小化和 WebView2 自动安装引导。

### Warm Mode 使用方式

```text
第一次双击 RegCalc64.exe
    -> 正常启动 WebView2

点右上角 ×
    -> 隐藏到系统托盘（不退出）

再次双击 RegCalc64.exe
    -> 直接唤醒已有窗口

需要真正退出
    -> 右击系统托盘 RegCalc64 图标 -> 退出
```

如果仍感觉**第一次启动**慢，请把下面文件内容发出来：

```text
%LOCALAPPDATA%\RegCalc64\startup.log
```

这样可以直接判断耗时是在 Runtime 检测、Environment、Controller 还是页面/UI ready。

## v0.1.4

- 修复 Visual Studio / MSVC 链接阶段 `CVT1100: duplicate resource, type: MANIFEST, name: 1`。
- `resources/app.rc` 继续作为唯一的 EXE Manifest 来源；MSVC 链接器通过 `/MANIFEST:NO` 禁止再自动生成第二份 Manifest。
- 保留 v0.1.3 的 IconPark 风格窗口图标、WebView2 自动检测/安装引导、单 EXE、置顶和最小化。
- RegCalc64 的 `web/tool.html` 与 v0.1.3 保持不变。

## v0.1.3 功能基线

- 右上角 Help / Always on Top / Minimize / Close 统一为 **IconPark outline 风格 SVG**：48×48 grid、4px stroke、round linecap/linejoin；不再混用字符、emoji 和 CSS 拼图标。
- 继续保持单 EXE 发布：HTML / CSS / JS 和 Microsoft WebView2 Evergreen Bootstrapper 都编译进 `RegCalc64.exe`。
- 启动时自动检测 Microsoft Edge WebView2 Runtime。
- 已安装：直接打开 RegCalc64。
- 未安装：弹出明确的安装向导，用户可选择 **立即安装**、打开微软 **官方下载** 页面，或取消。
- “立即安装”只有在用户明确点击后才执行；RegCalc64 从自身资源释放微软官方 Evergreen Bootstrapper，并运行 `/silent /install`，安装完成后自动重新检测并继续启动。
- 保留 v0.1.2 的置顶、最小化、窗口位置/大小记忆、标题拖动、resize 和所有 RegCalc64 功能。

## 构建环境

- Windows 10 / Windows 11 x64
- Visual Studio 2022/2026，安装 **Desktop development with C++**
- CMake
- PowerShell
- 构建机需要联网一次，用于下载 WebView2 SDK 和微软官方 Evergreen Bootstrapper

运行：

```bat
build.bat
```

`build.bat` 会自动下载：

1. 固定版本 Microsoft.Web.WebView2 SDK。
2. Microsoft 官方 **Evergreen Bootstrapper**。

生成：

```text
dist\RegCalc64.exe
```

发布给别人时只需要这一个 EXE。

## 给最终用户：如何运行

### 情况 1：正常 Windows 11 / 大多数 Windows 10

直接双击：

```text
RegCalc64.exe
```

如果电脑已经有 Microsoft Edge WebView2 Runtime，RegCalc64 会直接打开，不需要安装任何其他东西。

### 情况 2：电脑缺少 WebView2 Runtime，而且能联网

RegCalc64 会自动检测到缺失，并显示安装窗口。选择：

```text
立即安装 / Install now
```

程序会运行 EXE 内嵌的微软 **Evergreen Bootstrapper**。Bootstrapper 会自动识别电脑架构，从 Microsoft 下载并安装合适的 WebView2 Runtime。安装成功后 RegCalc64 会再次检测并继续启动。

RegCalc64 不会在没有用户确认的情况下自动安装组件。

### 情况 3：电脑缺少 WebView2 Runtime，而且不能联网

在另一台能联网的电脑打开 Microsoft Edge WebView2 官方下载页：

```text
https://developer.microsoft.com/microsoft-edge/webview2/
```

找到 **Evergreen Standalone Installer**，下载 **x64** 版本：

```text
MicrosoftEdgeWebView2RuntimeInstallerX64.exe
```

把安装程序复制到目标电脑，运行一次。之后再双击 `RegCalc64.exe` 即可。

> Evergreen Bootstrapper 适合联网安装；Evergreen Standalone Installer 适合离线安装。

## WebView2 是什么

WebView2 Runtime 是 Microsoft 提供的 Windows Web UI 运行组件。RegCalc64 用它显示已经内嵌在 EXE 中的本地 HTML/CSS/JavaScript 界面。RegCalc64 不需要启动浏览器、不需要本地 HTTP Server，也不会从网络加载自己的 UI。

## 窗口操作

右上角四个按钮现在全部使用统一线性 SVG：

- Help：帮助 / About。
- Pin：切换 Always on Top；启用后变绿，并记住状态。
- Minimize：最小化到任务栏。
- Close：隐藏到系统托盘，保持 Warm Mode；真正退出请右击托盘图标选择“退出”。
- 标题区域：拖动窗口。
- 右下角：调整窗口大小。

## 状态保存

窗口设置：

```text
%LOCALAPPDATA%\RegCalc64\settings.ini
```

WebView2 数据及计算器本地状态：

```text
%LOCALAPPDATA%\RegCalc64\WebView2
```

## 打包

```bat
package.bat
```

生成：

```text
RegCalc64-Desktop-v0.1.5-windows-x64.zip
```

ZIP 中只有 `RegCalc64.exe`。

## 测试

```bat
python tests\test_contract.py
python tests\test_msvc_geometry_types.py
python tests\test_v012_single_exe_and_window_controls.py
python tests\test_v013_iconpark_webview2_runtime.py
python tests\test_v014_manifest_single_source.py
python tests\test_v015_warm_start_single_instance_tray.py
```

## 设计原则

- 不使用 Electron / Node。
- 不启动本地服务器。
- 不联网加载 RegCalc64 UI。
- 不重写已经验证的寄存器计算算法。
- WebView2 缺失时给普通用户可理解、可操作的引导。
