# DSH Theme 0.3.1 · DSH 0.2.1-rc.5

[中文](#zh-031) | [English](#en-031)

<a id="zh-031"></a>

## 中文

本版适配与验收正在进行，尚未发布。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-031"></a>

## English

This adaptation is under validation and has not been published.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [DSH Theme 0.3.1](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.1-dsh.0.2.1-rc.5/gulagala001-dsh-theme-plugin-0.3.1-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.1-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md)

---

# DSH Theme 0.3.0 · DSH 0.2.1-rc.3

[中文](#zh-030) | [English](#en-030)

<a id="zh-030"></a>

## 中文

### 新增功能

- 新增 Claude Desktop 外观，覆盖浅色／深色界面、消息、输入框、模型选择、附件、思考与工具状态。

### 体验优化

- 完善按钮、菜单、对话框、滚动边缘、侧栏与工作台分隔条的样式和交互。
- 保留 DSH 原生输入法、发送、上传、权限操作、虚拟列表与键盘可访问性。

<a id="en-030"></a>

## English

### New Features

- Add the Claude Desktop appearance across light/dark surfaces, messages, composer, model selection, attachments, reasoning and tool states.

### Improvements

- Refine buttons, menus, dialogs, scroll edges and sidebar/workbench splitters.
- Preserve DSH’s native input methods, sending, uploads, permission actions, virtualized lists and keyboard accessibility.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴下方固定包地址。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

The exact host is **DSH 0.2.1-rc.3**. Paste the fixed package URL below into **Plugins → Add plugin**. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Theme 0.3.0-dsh.0.2.1-rc.3](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.0-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.3.0-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.0-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md)

---

# DSH Theme 0.2.6 · DSH 0.2.1-rc.3

[中文](#zh-026) | [English](#en-026)

<a id="zh-026"></a>

## 中文

### 问题修复

- Glyph 背景画布、控件装饰与标题标记在挂载时即不可交互，防止外部样式覆盖后拦截点击。
- 画布初始化失败时同样保留点击穿透；主题绘制与原生控件交互保持独立。

<a id="en-026"></a>

## English

### Bug Fixes

- Glyph background canvases, control decorations and captions are noninteractive from mount, preventing external CSS from making them intercept clicks.
- Preserves hit transparency even when canvas initialization fails, keeping theme drawing separate from native control interaction.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Theme 0.2.6](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.6-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.6-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.6-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install_EN.md)

---

# DSH Theme 0.2.5 · DSH 0.2.1-rc.3

[中文](#zh-025) | [English](#en-025)

<a id="zh-025"></a>

## 中文

### 问题修复

- 修正主题状态与修复说明仍显示旧版本号的问题，并在发行包检查中核对内部版本与包版本一致。已安装 0.2.4 的用户请升级本版，主题与配置保留。
- 修复 DSH rc.3 视图标签区域占满宽度导致的标题挤压、按钮越界与异常换行。
- 统一嵌套标签间距、空占位和角落按钮边距，补齐 Codex 主题的横向布局及 macOS 顶栏预留。

<a id="en-025"></a>

## English

### Bug Fixes

- Correct the old version reported in theme state and repair instructions, and check internal/package version agreement before release. Users of 0.2.4 should upgrade; themes and settings are retained.
- Fix the full-width rc.3 view row squeezing titles, overflowing actions and causing unwanted header wrapping.
- Align nested tab spacing, empty leading slots and corner-button margins, and complete Codex theme geometry and macOS header clearance.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和正式会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and existing conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Theme 0.2.5](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.5-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.5-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.5-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install_EN.md)

---

# DSH Theme 0.2.4 · DSH 0.2.1-rc.3

[中文](#zh-024) | [English](#en-024)

<a id="zh-024"></a>

## 中文

### 问题修复

- 修复 DSH rc.3 视图标签区域占满宽度导致的标题挤压、按钮越界与异常换行。
- 统一嵌套标签间距、空占位和角落按钮边距，补齐 Codex 主题的横向布局及 macOS 顶栏预留。

<a id="en-024"></a>

## English

### Bug Fixes

- Fix the full-width rc.3 view row squeezing titles, overflowing actions and causing unwanted header wrapping.
- Align nested tab spacing, empty leading slots and corner-button margins, and complete Codex theme geometry and macOS header clearance.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和正式会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and existing conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Theme 0.2.4](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.4-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.4-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.4-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install_EN.md)

---

# DSH Theme 0.2.3 · DSH 0.2.1-rc.3

[中文](#zh-023) | [English](#en-023)

<a id="zh-023"></a>

## 中文

### 问题修复

- 主题切换以宿主保存回执为准，保留失败后的恢复信息和原生外观设置。

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-023"></a>

## English

### Bug Fixes

- Theme switching follows native persistence receipts and preserves recovery information and native appearance settings after failures.

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Theme 0.2.3](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.3-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.3-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.3-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install_EN.md)

---

# DSH Theme 0.2.2 · DSH 0.2.1-rc.2

[中文](#zh-022) | [English](#en-022)

<a id="zh-022"></a>

## 中文

### 问题修复

- 修复选择 Glyph 动态字符后只有背景字符、没有首页动态鲸鱼的问题，兼容原生首页的默认品牌插槽。
- 修复 Claude CLI 主题首页标识缺失，并使欢迎标题使用正确的产品名称。
- 修复 Glyph 覆盖原生或自定义 Logo 的问题；切换回产品 Logo 后不再错误沿用已保存的自定义图片。
- 修复同类 Glyph 皮肤与多个外观入口交接时的样式清空、重复渲染及恢复问题，导入的 Glyph 皮肤按实际布局协调启停。
- 主题切换和停用及时归还原生品牌入口；降低动态效果时保留静态鲸鱼，明暗与窗口尺寸变化继续正确显示。

<a id="en-022"></a>

## English

### Bug Fixes

- Restores the animated hero whale when selecting Glyph, including native home screens whose brand slot uses fallback content.
- Restores the Claude CLI welcome mark and uses the correct product name in its heading.
- Preserves native and custom logo preferences under Glyph. Selecting the product logo no longer reuses a previously saved custom image.
- Fixes style loss, duplicate renderers and restoration during appearance ownership changes. Imported Glyph skins coordinate activation by their actual layout.
- Restores native brand slots when switching or disabling themes. Reduced motion retains a still whale, with correct rendering across color schemes and window sizes.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Theme 0.2.2](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.2-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.2-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.2-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install_EN.md)

---

# DSH Theme 0.2.1 · DSH 0.2.1-rc.2

[中文](#zh-021) | [English](#en-021)

<a id="zh-021"></a>

## 中文

### 体验优化

- 减少 Glyph 的重复布局读取、可见性扫描和遮挡计算，复用字符图标及形变结果。

### 问题修复

- 修复工作台放大、浮窗移动／动画及关闭后的字符与分隔线残影，保护内嵌原生预览。
- 隐藏控件、图标和点击光圈及时清除，停用 Glyph 后立即清空画布；统一各外观的顶栏区域。

<a id="en-021"></a>

## English

### Improvements

- Reduces repeated Glyph layout reads, visibility scans and occlusion calculations, reusing character icons and deformation results.

### Bug Fixes

- Fixes lingering characters and dividers when expanding the workbench or moving, animating and closing floating panels, while protecting embedded native previews.
- Clears hidden controls, icons and click rings promptly, clears the canvas when Glyph is disabled, and aligns titlebar regions across appearances.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Theme 0.2.1](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.1-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-theme-plugin/blob/main/docs/install_EN.md)
