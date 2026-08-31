# RegCalc64 Desktop 使用说明

## 最简单的使用方式

拿到 `RegCalc64.exe` 后直接双击即可。

Windows 11 和大多数正常更新的 Windows 10 已经带有 Microsoft Edge WebView2 Runtime，因此通常不会出现任何额外安装步骤。

## 如果提示缺少 Microsoft Edge WebView2 Runtime

RegCalc64 会自动弹出安装窗口：

- **立即安装 / Install now**：推荐。RegCalc64 使用 EXE 内嵌的 Microsoft 官方 Evergreen Bootstrapper 安装 WebView2，安装后自动继续启动。需要联网。
- **官方下载 / Official download**：打开 Microsoft WebView2 官方下载页面。
- **取消 / Cancel**：退出，不做任何安装。

RegCalc64 不会在你没有确认的情况下安装 WebView2。

## 离线电脑

在另一台联网电脑打开：

`https://developer.microsoft.com/microsoft-edge/webview2/`

下载 **Evergreen Standalone Installer → x64**，文件通常名为：

`MicrosoftEdgeWebView2RuntimeInstallerX64.exe`

复制到离线电脑安装一次，之后 `RegCalc64.exe` 就可以直接运行。

## 右上角按钮

从左到右：Help、Always on Top、Minimize、Close。全部使用统一的 IconPark outline 风格。
