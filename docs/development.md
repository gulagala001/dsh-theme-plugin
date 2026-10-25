# 主题开发与宿主适配

宿主构建以 `package.json` 的完整版本为准，当前源码默认 `0.2.1-rc.3`。每份构建对齐同版本 SDK、组件与依赖锁，安装入口按正式发行包的宿主版本选择。

主题协议版本与 DSH 适配版本分开维护。现有受支持格式可以直接导入，无需改用本协议。新增主题可从最小模板开始：

```sh
node scripts/theme.mjs init ./my-theme
node scripts/theme.mjs inspect ./my-theme
node scripts/theme.mjs validate ./my-theme
node scripts/theme.mjs pack ./my-theme ./my-theme.zip
```

`inspect` 只分析，不执行主题；`validate` 与 `pack` 对动态入口运行隔离预检。找不到匹配 CLI 时可传 `--host-cli /absolute/path/to/dsh/lib/bin.js`。检查产物写入当前目录的 `.theme-validation/`。

## 声明式 v1

目录内的 `theme.json`：

```json
{
  "format": "dsh-theme-plugin/v1",
  "id": "my-theme",
  "name": "我的主题",
  "version": "1.0.0",
  "author": "作者",
  "license": "MIT",
  "tokens": {
    "light": { "--dsw-alias-brand-primary": "#4967d8" },
    "dark": { "--dsw-alias-brand-primary": "#9aaaff" }
  },
  "styles": ["skin.css"],
  "background": {
    "light": { "type": "image", "src": "assets/day.webp" },
    "dark": { "type": "video", "src": "assets/night.webm" }
  }
}
```

省略的字段跟随宿主。令牌保留完整 `--dsw-*` 名称。CSS、字体、图片及视频使用包内相对路径；外部 `@import`、远程 CSS 资源和目录外引用会被拒绝。样式被限定到当前主题，动画名称隔离，资源地址映射到带摘要的受控路径。

可使用 `data-dsh-surface`（root、sidebar、conversation、session-header、composer、details、settings、overlay）和已提供的 `data-dsh-part` 语义标记。映射覆盖范围以 `src/client/semantic.mjs` 为准；不要把暂未提供的标记当成完整上游契约。

## 动态入口

原生主题可保留 `package.json` 的 `dsh.client` 与 `exports["./client"]`。v1 包也可声明 `client: { "entry": "lib/client.js" }`。保留完整 DSH `window.__ModuleLoader__.load({ id, factory })` 程序、闭包与同包内部注册，选择匹配包标识的入口，其模块导出 `apply(ctx)` 与 `inject`。只有源码的标准 JS／JSX／TS／TSX 入口可自动编译，按声明解析并固定实际依赖，不执行包安装脚本。

所有监听、计时器、观察器、样式与 DOM 副作用必须通过 `ctx.effect` 或返回的 disposer 清理。可使用宿主公开插槽，但替换布局后必须保留输入、设置与恢复入口。不能吞掉所有输入或留下无法卸载的全局状态。相对模块和已声明的浏览器依赖会自动打包；客户端不能导入 Node 内置模块。

后台入口会先准备为当前宿主可加载的模块，并在隔离 DSH profile 中验证。安装启用后运行于真实 Cordis 子上下文，使用当前 DSH 的服务、原生 RPC 和资源接口；停止主题时释放自身注册。不会重新实现旧版 settings、会话或工具服务，也不伪造 API 响应。主题与普通 DSH 插件具有相应运行权限，预检不构成恶意代码安全沙箱。

Skin Center hooks v1alpha1 与 Deep Whale customization v1/v2 沿用上游接口。当前 v1 的任意 `settings` 声明尚未实现自动控件生成；动态主题可通过受支持的上游 customization 事件声明控件，或注册宿主原生设置。

## 维护 DSH 适配

适配以支持的 DSH 版本为基准，过老主题需上游更新，不持续增建旧接口。

1. 在隔离依赖/profile 中安装目标宿主，读取实际服务和类型定义。
2. 更新 `src/shared/host-contract.mjs`；模块迁移集中于 `src/host/client-modules.mjs`，页面定位集中于 `semantic.mjs`，资源服务集中于 `client-assets.mjs`。
3. 检查原生设置入口、主题服务、模块生命周期、真实交互与恢复。按变化选择少量代表主题，不要求每次重复整个市场。
4. 提升适配器版本；动态包的兼容报告随之失效并重新检查。检查未通过时保留原包、配置与可复制诊断。
5. 确认实际支持范围后更新宿主约束与兼容说明，再构建、检查真实安装包。未知版本不能仅靠放宽约束声明支持。

市场、下载、主题库和事务层不应引用宿主页面类名。遇到多个主题共享的故障，优先修复协议或宿主适配层；特殊主题规则记录来源与匹配条件，避免无界补丁积累。

启用状态由 `library.json` 的当前选择、摘要与待确认记录维护。`ThemeEngine` 串行处理后台启停、确认、失败、超时与移除，并在后台恢复成功后才清除待确认记录；库快照和客户端资源读取不执行另一套恢复或启用逻辑。安装候选检查完成后才进入库，已引用版本继续保留在原有版本链中。客户端直接采用确认／恢复响应，按现有 revision 拒绝迟到状态；停用时终止请求并忽略迟到回执。相关故障交错回归在 `test/activation-consistency.test.mjs`，随现有 `pnpm test` 进入 CI。

首页截图与 GIF 动图放在 `docs/images/`，中英文首页同步，显示尺寸不超过素材原宽；来源、尺寸与哈希记录在 `docs/images/readme-screenshots.json`。更新素材后运行 `npm run docs:check`，公开文件与安装包检查由 `scripts/check-package.mjs` 执行。

每版（含补丁版）新增 `docs/releases/v<完整版本>.md`（当前示例：`docs/releases/v0.2.5-dsh.0.2.1-rc.3.md`） 并登记 `docs/structure.json`；`CHANGELOG.md` 同步当前完整双语正文，历史页面保留。当前导航与固定安装入口同步新版，tag 与 Release 使用相同的分类、正文和精确宿主安装表。
