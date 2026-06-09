# RegCalcTextTool

RegCalcTextTool 是一个静态网页工具，主要包含：

- `RegCalcTextTool.html`：64 bit 寄存器计算 + 文本格式化，当前主工具
- `reg_tools_cal-big-to-small_63-0_64bit.html`：旧版寄存器计算工具，保留但部署时不作为主入口
- `TextFormatter.html`：旧版文本处理工具，保留但部署时不作为主入口

仓库根目录的 `index.html` 会自动跳转到 `RegCalcTextTool.html`，因此 Cloudflare Pages 和 GitHub Pages 访问站点根路径时都能直接进入主工具。

## 在线使用

- GitHub Pages: <https://yakoye.github.io/RegCalcTextTool/>
- 主工具直达: <https://yakoye.github.io/RegCalcTextTool/RegCalcTextTool.html>

![Show](./img/Show.jpg)

## Cloudflare Workers 部署

如果在 Cloudflare 的 `Workers & Pages` 中选择 `Import a repository` 创建 Worker，使用下面配置：

1. 在 Cloudflare Dashboard 进入 `Workers & Pages`。
2. 选择 `Create application`，通过 `Import a repository` 连接这个 GitHub 仓库。
3. Framework preset 选择 `None`。
4. Build command 填写：

```bash
npm run build
```

5. Build output directory 填写：

```text
dist
```

6. 保存并创建 deployment。

仓库已包含 `wrangler.toml`：

```toml
name = "regcalctexttool"
compatibility_date = "2026-06-08"

[assets]
directory = "./dist"
```

注意：Cloudflare Workers Git 集成要求 Dashboard 里的 Worker 名称和 `wrangler.toml` 里的 `name` 完全一致。当前配置已按你的 Cloudflare 项目名 `regcalctexttool` 设置。

如果想在本地直接用 Wrangler 部署到 Worker：

```bash
npm run deploy:cloudflare
```

Cloudflare 会发布 `dist` 目录中的静态文件，入口仍然是 `/` 或 `/RegCalcTextTool.html`。

## Cloudflare Pages 备选部署

如果你后续改用 Cloudflare Pages 项目，而不是 Worker 项目，也可以继续使用同一个构建命令：

```bash
npm run build
```

Pages 的 Build output directory 填写：

```text
dist
```

本地手动上传 Pages 可用：

```bash
npm run deploy:pages
```

## GitHub Pages 部署

GitHub Pages 可以直接从仓库根目录发布：

1. 打开 GitHub 仓库的 `Settings`。
2. 进入 `Pages`。
3. Source 选择 `Deploy from a branch`。
4. Branch 选择 `main`，Folder 选择 `/root`。
5. 保存后访问 `https://yakoye.github.io/RegCalcTextTool/`。

根目录已有 `.nojekyll`，GitHub Pages 会按静态文件原样发布。

## 本地构建检查

```bash
npm run build
```

构建后会生成 `dist/`，里面只包含部署需要的静态资源，不包含 `.git`、`node_modules`、`scripts`、`README.md`、PSD 源文件等开发内容。

## 后续添加工具

后续如果继续添加新的静态工具，直接把新的 `.html`、图片、CSS、JS 放到仓库中即可。`npm run build` 会自动复制常见静态资源到 `dist/`。如果想让新工具成为站点首页，修改 `index.html` 的跳转地址即可。

## Release note

- 2025.07.25 v0.1 初版
- 2026.03.28 v0.2 修改格式
- 2026.06.08 v0.3 适配移动端显示，优化字体与 RegCalc 表单布局
- 2026.06.08 v0.4 优化位按钮矩阵分组间距，位域编辑支持动态增删
- 2026.06.08 v0.5 计算器支持浮点表达式
- 2026.06.08 v0.6 优化 TextFormatter 手机按钮布局，新增常用文本处理
- 2026.06.09 v0.7 增强 TextFormatter 十六进制分组、大小端、URL、Base64、JSON 处理
- 2026.06.09 v0.8 新增序列生成、时间计算、密码生成和外部工具链接
- 2026.06.09 v0.9 外部工具增加图像处理链接
- 2026.06.09 v0.10 调整 TextFormatter 序列区位置，收窄工具页宽度
- 2026.06.09 v0.11 密码生成器记住指定符号和额外排除字符

## Refer

- [reg_tools](https://github.com/lzwwiner/reg_tools)
