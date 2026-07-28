# TextFormatter 与图片工具设计

## 1. 目标

本次改造分为两个独立模块：

1. 补强 `TextFormatterTool.html`，重新整理功能分类，增加开发常用的文本、URL、Base64、数据格式和字节处理能力，并修复现有边界问题。
2. 新增独立的图片处理工具页，通过新的 `Image` 顶层标签加载，完成常用图片转换、压缩、尺寸调整、基础变换、ICO 生成、预览和下载。

两个模块均保持纯静态部署，兼容 Cloudflare Workers & Pages 和 GitHub Pages。用户数据只在浏览器本地处理，不上传服务器。

## 2. 范围

### 2.1 第一阶段：TextFormatter

TextFormatter 调整为七个一级分类：

1. 文本清理
2. 行与列表
3. 大小写与命名
4. 编码与转义
5. 数据格式化
6. Hex 与字节
7. 生成器

“序列号码生成”从当前独立区域移动到“生成器”分类中。需要参数的功能通过内嵌参数面板完成，立即转换类功能仍使用菜单项触发。

### 2.2 第二阶段：Image

新增：

- `ImageTool.html`
- 主页面 `Image` 标签
- 主站 iframe 延迟加载和后台预加载配置
- README 和 About 中文说明及修改记录

第一版 Image 工具支持：

- 点击、拖放或剪贴板粘贴图片
- 图片信息和原图预览
- SVG、PNG、JPEG、WebP、BMP 之间的适用转换
- SVG 转位图
- 多尺寸 ICO 生成
- JPEG、WebP 质量压缩
- PNG 重新编码与体积变化提示
- 指定宽高、百分比缩放和保持宽高比
- 常用尺寸预设
- 背景颜色和透明背景处理
- 旋转、水平翻转、垂直翻转
- 结果预览、尺寸、文件大小和节省比例
- 下载结果

第一版不包含：

- 真正的位图矢量化
- 复杂自由裁剪界面
- 批量转换和 ZIP 下载
- OCR
- AI 抠图
- 动图逐帧保留

## 3. TextFormatter 功能设计

### 3.1 输入输出工作流

数据流：

```text
原文输入 -> 选择操作 -> 校验输入 -> 执行转换 -> 结果输出
                                         |
                                         +-> 成功或错误状态
```

提供以下通用操作：

- 复制结果
- 下载结果为 `.txt`
- 原文与结果交换
- 将结果继续作为原文
- 清空原文
- 清空结果
- 清空所有
- 显示字符数、行数和 UTF-8 字节数

所有转换函数统一返回：

```js
{
  ok: true,
  value: "",
  message: ""
}
```

失败时返回：

```js
{
  ok: false,
  value: "",
  message: "可直接显示给用户的中文错误原因"
}
```

转换失败不得继续使用“原样返回”伪装成成功。

### 3.2 文本清理

保留：

- 去除空行
- 去除半角空格
- 去除每行首尾空格
- 合并连续空格和 Tab
- 去除所有换行
- 去除中断换行

新增：

- 去除全部空白字符
- 去除不可见控制字符
- 换行符统一
- 多个连续空行压缩为一个
- 全角与半角互转
- 中文标点与英文标点互转

### 3.3 行与列表

保留：

- 行去重
- 行排序
- 添加行号
- 移除行号
- 横向转纵向
- 纵向转横向

新增：

- 行倒序
- 随机打乱行
- 行去重时选择是否忽略大小写
- 行去重时选择是否忽略首尾空格
- 删除包含指定内容的行
- 只保留包含指定内容的行
- 每行添加前缀
- 每行添加后缀
- 每行批量包裹单引号或双引号
- 使用指定分隔符拆分或合并
- 按列提取

现有横转竖逻辑中会把问号当作分隔符的问题需要修复。默认分隔符只包含空白和逗号，其他分隔符由用户明确指定。

### 3.4 大小写与命名

保留：

- 大写
- 小写
- PascalCase
- camelCase
- snake_case
- kebab-case
- space case

新增：

- CONSTANT_CASE
- dot.case
- Title Case
- Sentence case
- 每个单词首字母大写
- 大小写反转

单词切分应支持现有 camelCase、下划线、短横线、空格和常用标点。中文保留原字符，不对中文强制执行无意义的大小写转换。

### 3.5 编码与转义

#### Base64

支持：

- UTF-8 文本与 Base64 互转
- 文件转纯 Base64
- 文件转完整 Data URL
- 图片转 Base64 并预览
- Base64 或 Data URL 还原为文件
- Base64 或 Data URL 还原为图片并预览
- 标准 Base64 与 URL-safe Base64 互转
- 自动补齐或移除末尾 `=`

文件模式显示：

- 文件名
- 文件大小
- MIME 类型
- 当前输出形式

Base64 解码时：

- Data URL 自动读取 MIME 类型
- 纯 Base64 由用户指定 MIME 类型和文件名
- 非法 Base64 明确报错
- 大文件给出体积提示

文件、图片、Base64 文件结果不得写入 `localStorage`。

#### URL 与 Web

支持：

- URL 参数值编码和解码
- 完整 URL 编码和解码
- URL 查询参数解析
- 查询参数重新生成 URL
- 参数排序、添加和删除
- HTML 实体编码和解码
- Unicode 转义和反转义
- 标准 Base64 与 URL-safe Base64 互转

必须区分：

- 参数值模式：使用组件级编码语义
- 完整 URL 模式：保留 URL 结构字符

#### Markdown

支持：

- 根据标题和 URL 生成 Markdown 链接
- 解析 Markdown 链接
- Markdown 链接中的特殊字符转义
- Markdown 转 HTML
- HTML 转 Markdown

HTML 转 Markdown 和 Markdown 转 HTML 使用成熟、轻量、可在纯浏览器中运行的库，不自行实现完整语法解析器。库文件需要随静态站点一起部署，不依赖运行时外部 CDN。

### 3.6 数据格式化

保留：

- JSON 格式化
- JSON 压缩

新增：

- JSON 语法校验并显示错误位置
- JSON 键名递归排序
- JSON 字符串转义和反转义
- JSON 与 JavaScript 对象文本的常用转换
- XML 格式化和压缩
- YAML 与 JSON 互转
- CSV 与 TSV 互转
- URL 查询参数与 JSON 互转

XML、YAML、CSV 和 Markdown 使用成熟解析库。所有解析器单独捕获异常，一个功能失败不得影响其他功能。

#### 可视化表格与 Markdown 双向转换

“数据格式化”分类增加独立表格编辑面板，支持：

- 在网页中直接编辑单元格
- 从 Excel、WPS 或其他表格复制制表符数据后粘贴
- 添加、删除行
- 添加、删除列
- 设置首行为表头
- 设置列左对齐、居中或右对齐
- 合并和拆分相邻单元格
- 单元格内输入多行内容
- GFM Markdown 表格转可编辑网格
- HTML 表格转可编辑网格
- 可编辑网格导出为 GFM Markdown
- 可编辑网格导出为 HTML 表格
- 一键复制输出

GFM Markdown 表格本身没有标准的 `rowspan` 和 `colspan`。因此使用以下确定规则：

- 默认输出模式为 GFM Markdown
- 合并单元格导出为 GFM 时，把主单元格内容重复写入所有被覆盖单元格
- 不使用“同上”等非标准占位文本
- 单元格内换行导出为 `<br>`
- 单元格中的 `|` 转义为 `\|`
- GFM 导入后无法恢复原来的合并关系，按普通单元格处理
- HTML 表格模式使用 `rowspan`、`colspan` 和 `<br>`，完整保留合并与换行
- HTML 表格导入时恢复 `rowspan` 和 `colspan`

表格数据模型：

```js
{
  rows: 3,
  columns: 3,
  headerRows: 1,
  alignments: ["left", "center", "right"],
  cells: [
    {
      row: 0,
      column: 0,
      value: "标题",
      rowSpan: 1,
      colSpan: 2,
      coveredBy: null
    }
  ]
}
```

只有主单元格保存内容和跨度；被覆盖单元格通过 `coveredBy` 指向主单元格。合并前必须验证所选区域为连续矩形，且没有跨出选择范围的既有合并。

### 3.7 Hex 与字节

保留：

- 1 字节添加 `0x`
- 4 字节大端
- 4 字节小端
- 8 字节大端
- 8 字节小端
- 移除 `0x` 并按字节分隔

修复：

- 非十六进制字符不得静默删除
- 奇数位 Hex 不得静默补齐或丢弃
- 不足 1、4、8 字节分组的数据不得静默丢弃

提供处理模式：

- 严格模式：发现非法字符或不完整分组立即报错
- 自动清洗：删除允许的空格、逗号、下划线和 `0x` 前缀，其他字符仍报错

新增：

- 整体字节顺序反转
- UTF-8 文本与 Hex 互转
- Hex 与十进制互转
- Hex 与二进制互转
- 连续 Hex 与空格分组 Hex 互转
- C 字节数组格式输出
- JavaScript 字节数组格式输出

### 3.8 生成器

序列号码生成保留：

- 开始值
- 结束值
- 补零位数
- 生成数量
- 正序、逆序、乱序
- 换行、空格、逗号和自定义分隔符
- 生成到原文或结果

修复：

- 数量超过上限时显示提示
- 非法数量、非整数和不合理范围显示提示
- 上限统一为 10000 条

后续候选，不纳入本轮第一版：

- UUID
- 随机字符串
- 日期序列
- 重复文本
- 测试邮箱
- 测试手机号

## 4. TextFormatter 界面设计

### 4.1 功能选择

七个一级分类统一使用轻量折叠菜单或弹出菜单。分类标题展示名称和展开箭头。

菜单视觉规则：

- 操作区只保留一层外边框
- 下拉浮层只保留一层边框
- 菜单项不使用完整矩形边框，使用留白和轻分隔线
- 不再使用覆盖内容的 `::after` 悬浮提示
- 每个菜单项内部可显示一行短说明
- 较长说明显示在菜单底部的固定说明区
- 手机端点击即可看到说明，不依赖 hover
- 同一时间只展开一个分类
- 点击外部或按 Esc 关闭

需要参数的操作在当前分类下展开参数面板，不使用多层嵌套浮层。

### 4.2 状态反馈

统一使用非阻塞 Toast 和输入区附近的错误说明：

- 处理完成
- 已复制
- 已下载
- 输入格式错误
- 文件过大
- 不支持的文件类型
- 无可处理内容

## 5. Image 工具设计

### 5.1 状态模型

```js
{
  sourceFile: null,
  sourceUrl: "",
  sourceBitmap: null,
  sourceInfo: {
    name: "",
    type: "",
    size: 0,
    width: 0,
    height: 0,
    hasAlpha: false
  },
  transform: {
    width: 0,
    height: 0,
    keepAspectRatio: true,
    rotate: 0,
    flipX: false,
    flipY: false,
    backgroundColor: "#ffffff"
  },
  output: {
    format: "image/png",
    quality: 0.85,
    blob: null,
    url: "",
    size: 0
  },
  status: "idle",
  error: ""
}
```

切换或清空图片时必须调用 `URL.revokeObjectURL()` 释放临时资源。

### 5.2 输入

支持：

- 文件选择
- 文件拖放
- 剪贴板粘贴

输入校验：

- MIME 类型和扩展名共同检查
- 浏览器不能解码时显示明确错误
- SVG 需要在本地解析，禁止执行其中的脚本
- 超出浏览器可安全处理的图片尺寸或像素总量时拒绝处理并提示

### 5.3 转换

优先使用浏览器原生解码、Canvas 和 Blob API 完成 PNG、JPEG、WebP 输出。

BMP 和 ICO 使用独立编码模块：

- BMP 输出至少支持 24 位 RGB 和 32 位 RGBA
- ICO 支持把多个 PNG 尺寸封装到一个 `.ico`
- 默认 ICO 尺寸为 16、32、48、64、128、256

SVG：

- SVG 可渲染成 PNG、JPEG、WebP、BMP
- PNG、JPEG、WebP、BMP 转 SVG 仅生成包含位图资源的 SVG 容器
- 页面必须明确说明该功能不是矢量化

### 5.4 压缩与尺寸

JPEG 和 WebP：

- 质量范围 1 至 100
- 默认 85
- 输出比原图更大时明确提示

PNG：

- 第一版使用可靠的重新编码
- 显示结果是否真正变小
- 不承诺每张 PNG 都能压缩

尺寸：

- 指定宽度或高度
- 百分比缩放
- 保持宽高比
- 常用尺寸预设
- 不允许宽高为零、负数或超过安全上限

### 5.5 结果

结果区显示：

- 预览
- 格式
- 宽高
- 文件大小
- 与原文件相比的增减比例
- 下载按钮

处理失败时保留原图和当前配置，允许用户修改参数后重试。

## 6. 本地偏好和隐私

允许保存：

- TextFormatter 分类展开状态
- Hex 严格或自动清洗模式
- 非敏感的序列参数
- Image 默认输出格式
- Image 默认质量
- 是否保持宽高比

禁止保存：

- TextFormatter 原文和结果，除非用户明确开启“保存文本”
- 文件内容
- Base64 文件内容
- 图片内容
- Blob URL
- 剪贴板内容

建议使用带版本号的存储键：

```js
toolbox.textformatter.settings.v1
toolbox.image.settings.v1
```

旧版 `textconvert_textInput` 和 `textconvert_textOutput` 需要兼容迁移：首次加载时读取并展示，但默认关闭继续自动保存；用户清空时同步移除旧键。

## 7. 文件与模块边界

第一版保持静态 HTML 工具页结构，但避免继续把全部逻辑塞进单个函数：

```text
TextFormatterTool.html
text-formatter.js
text-codecs.js
text-generators.js
markdown-table.js

ImageTool.html
image-tool.js
image-codecs.js

shared-ui.css
shared-ui.js
vendor/
```

职责：

- HTML：页面结构和无脚本时的基础说明
- `text-formatter.js`：状态、UI、通用转换调度
- `text-codecs.js`：Base64、URL、Markdown、JSON、XML、YAML、CSV、Hex
- `text-generators.js`：序列生成
- `markdown-table.js`：表格数据模型、合并、GFM/HTML 导入与导出
- `image-tool.js`：图片状态、预览、变换和输出流程
- `image-codecs.js`：BMP、ICO 及格式能力检查
- `shared-ui.js`：Toast、复制等跨工具通用能力

第三方库必须固定版本并随站点构建，不从外部 CDN 动态加载。

## 8. 错误处理

所有用户输入错误使用中文说明，不直接显示原始 JavaScript 异常。

需要覆盖：

- 无输入
- 非法 URL 编码
- 非法 Base64
- 非法 Data URL
- JSON、XML、YAML、CSV 解析失败
- 非法 Hex
- 序列范围过大
- 图片格式不支持
- 图片解码失败
- Canvas 尺寸超限
- 图片编码失败
- 下载失败

单个功能失败不得使页面其他功能不可用。

## 9. 验收与测试

### 9.1 TextFormatter

- 每个现有功能至少保留一个回归用例
- 每个新增功能覆盖正常输入、空输入和非法输入
- 中文、emoji、CRLF 和大文本需要专项用例
- Base64 文本、二进制文件、PNG 图片均做正反向测试
- URL 参数模式与完整 URL 模式分别测试
- GFM 表格与网页编辑网格双向转换
- 合并单元格导出 GFM 时重复内容
- 合并单元格导出 HTML 时保留 `rowspan` 和 `colspan`
- 单元格换行导出为 `<br>`
- HTML 表格导入后恢复合并状态
- Hex 严格模式和自动清洗模式分别测试
- 10000 条序列成功，超过上限明确失败
- 桌面和手机下拉菜单不出现边框嵌套和说明遮挡

### 9.2 Image

- PNG、JPEG、WebP、BMP、SVG 输入
- PNG、JPEG、WebP、BMP 输出
- SVG 转位图
- 多尺寸 ICO 文件头和目录项校验
- 透明 PNG 转 JPEG 背景色正确
- 缩放保持宽高比
- 旋转和翻转方向正确
- 压缩前后大小显示正确
- 超大图和损坏文件显示友好错误
- 手机端不横向溢出

### 9.3 构建与部署

- `npm run build` 成功
- `dist` 包含新增 HTML、JS、依赖和资源
- 主站首屏仍优先加载 RegCalc
- Image 标签首次点击可加载
- 后台预加载不阻塞 RegCalc
- GitHub Pages 路径正常
- Cloudflare 静态部署路径正常

## 10. 实施顺序

1. 建立 TextFormatter 可测试的转换函数和统一结果结构。
2. 修复现有功能边界问题。
3. 重组七类 UI 并修复菜单视觉问题。
4. 增加 Base64、URL、Markdown、数据格式和 Hex 能力。
5. 增加可视化表格编辑及 Markdown/HTML 表格双向转换。
6. 完成 TextFormatter 回归和移动端检查。
7. 新增 Image 标签和独立页面骨架。
8. 完成图片输入、预览、转换、压缩、尺寸和变换。
9. 完成 BMP、ICO 输出。
10. 更新 About、README 和中文修改记录。
11. 构建、浏览器验证、提交代码。
