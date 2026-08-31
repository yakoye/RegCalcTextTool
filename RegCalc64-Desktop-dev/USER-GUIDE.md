# RegCalc64 Desktop v0.1.5 使用说明

## 直接运行

双击：

```text
RegCalc64.exe
```

如果系统已有 Microsoft Edge WebView2 Runtime，RegCalc64 会直接启动。

## Warm Mode：关闭后再次打开更快

v0.1.5 默认使用 Warm Mode：

```text
第一次启动
  -> 创建 RegCalc64 + WebView2

点击右上角 ×
  -> 隐藏到系统托盘
  -> 不销毁 WebView2

再次双击 RegCalc64.exe
  -> 检测到已有实例
  -> 直接显示原窗口
```

因此第二次、第三次打开不再完整重启 WebView2，Hex / Bit Field / Selection / Expr 等现场也会保留。

系统托盘中的 RegCalc64 图标支持：

- 左键：重新打开窗口。
- 右键 -> **打开 RegCalc64**：显示窗口。
- 右键 -> **置顶**：切换 Always on Top。
- 右键 -> **退出**：真正退出程序并释放 WebView2。

如果希望完全关闭 RegCalc64，请使用托盘菜单的 **退出**，而不是窗口右上角的 ×。

## 首次启动还是慢？

v0.1.5 会记录启动阶段耗时：

```text
%LOCALAPPDATA%\RegCalc64\startup.log
```

典型内容会包含：

```text
process_start
webview2_runtime_ready
webview2_environment_ready
webview2_controller_ready
navigation_started
tool_ui_ready
```

每行前面的 `+xxxms` 是从本次 EXE 启动开始经过的时间。把这个文件发给开发者，可以继续定位首次启动到底慢在 Runtime 检测、WebView2 Environment、Controller，还是 UI 加载。

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
