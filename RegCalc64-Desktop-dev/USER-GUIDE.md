# RegCalc64 Desktop v0.1.6 使用说明

## 直接运行

双击：

```text
RegCalc64.exe
```

如果系统已有 Microsoft Edge WebView2 Runtime，RegCalc64 会直接启动。

## 关闭、托盘与 Warm Mode

默认情况下，系统托盘菜单中的：

```text
✓ 关闭按钮隐藏到托盘
```

处于勾选状态。因此点击右上角 `×` 时，窗口会隐藏到系统托盘，但程序和 WebView2 不退出；再次双击 `RegCalc64.exe` 会快速恢复原窗口和计算现场。

系统托盘右键菜单：

- **打开 RegCalc64**：恢复窗口并切到前台。
- **置顶**：切换 Always on Top，并记住选择。
- **关闭按钮隐藏到托盘**：决定右上角 `×` 是隐藏到托盘还是真正退出，并记住选择。
- **退出**：无条件真正退出程序并释放 WebView2。

如果你不希望 RegCalc64 常驻后台，只需取消勾选 **关闭按钮隐藏到托盘**。之后点击 `×` 就会真正退出。

## 任务栏图标

最小化按钮 `—` 会正常最小化到 Windows 任务栏。无边框桌面窗口保留标准 Windows 最小化/恢复语义，因此可以通过任务栏 RegCalc64 图标在显示/激活与最小化/恢复之间切换。

从托盘隐藏后重新双击 `RegCalc64.exe` 或选择托盘的 **打开 RegCalc64**，窗口会恢复并主动切到当前前台，而不是停留在文件资源管理器等窗口后面。

## 日志与调试

v0.1.6 已关闭临时启动性能日志和 trace；RegCalc64 不再写入自己的启动诊断文件或调试 trace。WebView2 DevTools 同样在正式桌面壳中关闭。

## 缺少 WebView2 Runtime

如果目标电脑没有 WebView2，RegCalc64 会显示安装引导：

- **立即安装 / Install now**：使用 EXE 内嵌的 Microsoft Evergreen Bootstrapper 在线安装。
- **官方下载 / Official download**：打开 Microsoft WebView2 官方下载页。
- **取消 / Cancel**：退出，不做任何安装。

### 离线电脑

在另一台能联网的电脑打开：

```text
https://developer.microsoft.com/microsoft-edge/webview2/
```

下载 **Evergreen Standalone Installer x64**，复制到目标电脑安装一次，然后重新运行 `RegCalc64.exe`。
