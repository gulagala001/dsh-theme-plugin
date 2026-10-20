# 主题开发与宿主适配

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

原生主题可保留 `package.json` 的 `dsh.client` 与 `exports["./client"]`。v1 包也可声明 `client: { "entry": "lib/client.js" }`。入口是单一 DSH `window.__ModuleLoader__.load({ id, factory })` 注册，其模块导出 `apply(ctx)` 与 `inject`。

所有监听、计时器、观察器、样式与 DOM 副作用必须通过 `ctx.effect` 或返回的 disposer 清理。不得替换宿主根槽、吞掉所有输入事件或留下无法卸载的全局状态。依赖必须由匹配宿主提供或在客户端构建时打包；相对 `require`、Node 内置模块和未识别依赖会阻断安装。

第三方 Node 主入口不会被执行。已有静态资源服务通过已核对的兼容器映射；依赖真实后台业务服务的主题需要专用适配或保留原生安装联动，不能伪造服务响应。

Skin Center hooks v1alpha1 与 Deep Whale customization v1/v2 沿用上游接口。当前 v1 的任意 `settings` 声明尚未实现自动控件生成；动态主题可通过受支持的上游 customization 事件声明控件，或注册宿主原生设置。

## 维护 DSH 适配

1. 在隔离依赖/profile 中安装目标宿主，读取实际服务和类型定义。
2. 更新 `src/shared/host-contract.mjs`；模块迁移集中于 `src/host/client-modules.mjs`，页面定位集中于 `semantic.mjs`，资源服务集中于 `client-assets.mjs`。
3. 检查原生设置入口、主题服务、模块生命周期、真实交互与恢复。按变化选择少量代表主题，不要求每次重复整个市场。
4. 提升适配器版本；动态包的兼容报告随之失效并重新检查。检查未通过时保留原包、配置与可复制诊断。
5. 确认实际支持范围后更新宿主约束与兼容说明，再构建、检查真实安装包。未知版本不能仅靠放宽约束声明支持。

市场、下载、主题库和事务层不应引用宿主页面类名。遇到多个主题共享的故障，优先修复协议或宿主适配层；特殊主题规则记录来源与匹配条件，避免无界补丁积累。
