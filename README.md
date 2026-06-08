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

## Cloudflare Workers & Pages 部署

推荐使用 Cloudflare Pages 的 GitHub 集成：

1. 在 Cloudflare Dashboard 进入 `Workers & Pages`。
2. 选择 `Create application`，创建 `Pages` 项目并连接这个 GitHub 仓库。
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
name = "reg-calc-text-tool"
pages_build_output_dir = "dist"
compatibility_date = "2026-06-08"
```

如果想在本地直接用 Wrangler 部署：

```bash
npm run deploy:cloudflare
```

Cloudflare 会发布 `dist` 目录中的静态文件，入口仍然是 `/` 或 `/RegCalcTextTool.html`。

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

## Refer

- [reg_tools](https://github.com/lzwwiner/reg_tools)
