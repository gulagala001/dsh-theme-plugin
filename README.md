<a name="readme-top"></a>

<h1 align="center">dsh-theme-plugin</h1>

<p align="center"><strong>浏览社区主题，一键检查、安装和管理。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-theme-plugin/releases/tag/v0.2.0-dsh.0.2.1-rc.2"><img alt="0.2.0" src="https://img.shields.io/badge/release-0.2.0-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-theme-plugin/releases/tag/v0.2.0-dsh.0.2.1-rc.2"><img alt="本版插件包下载次数" src="https://img.shields.io/github/downloads/gulagala001/dsh-theme-plugin/v0.2.0-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.0-dsh.0.2.1-rc.2.tgz?style=flat-square&amp;label=package%20downloads&amp;displayAssetName=false&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-theme-plugin/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-theme-plugin?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/compatibility.md">完整文档</a> · <a href="https://github.com/gulagala001/dsh-theme-plugin/issues">反馈</a></p>

<p align="center"><a href="docs/images/market.png"><img src="docs/images/market.png" alt="带图片与说明的主题市场 / Visual theme marketplace" width="880"></a></p>

<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

兼容以当前支持的 DSH 版本为基准，不为过老主题补旧接口。动态主题先在独立 DSH 与浏览器中运行检查；主题属于第三方插件，其后台使用真实宿主服务。预检不是恶意代码安全沙箱。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.0-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.0-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.0-dsh.0.2.1-rc.2/SHA256SUMS).

### 2. 先试这一件事

打开 **设置 → 外观 → 市场**，选择一套主题，点击 **安装并应用**。

**成功标志：** 安装前检查通过后，当前外观切换，主题出现在“主题管理”；检查失败则保留原外观并显示具体原因。

## 三个页面，管理完整外观

| 页面 | 可以做什么 |
| --- | --- |
| **外观设置** | 明暗、配色、背景、字体、尺寸、圆角、透明度、动态、Logo／标题及受支持的主题专属设置。 |
| **主题管理** | 查看内置、已有、导入与市场主题；启用、导出、移除和更新。 |
| **市场** | 多来源图片卡片、说明、作者、搜索、风格筛选、热门／最新排序与一键安装。 |

内置 DSH 原生、Glyph 动态字符、Codex Desktop、iOS Liquid Glass、Claude CLI 与 Google Material，并提供 29 套配色。新装保留原生外观；识别到已有主题或可迁移偏好时承接当前选择。默认标题为 DeepSeek Harness，保留主题的字体、造型和动态效果。

### 已有主题直接纳入管理

已安装插件由 DSH 原生管理，主题基座协调启停，避免执行第二份主题。文件导入支持已识别的 `.json`、`.zip` 和 `.tgz` 格式；下载与适配保留上游原包。

![主题管理](docs/images/theme-management.png)

### 一次安装，先查版本和运行状态

市场旧快照先核对同包、同仓库的新版本，固定实际下载来源。源码型主题可自动准备客户端；后台使用当前 DSH 的真实服务和可释放生命周期。隔离检查覆盖加载、实际输入和设置入口、明暗、卸载与重挂载；失败时保留当前可用外观。

兼容声明与实际运行检查分开显示。未经检查的目录条目不标记为已兼容，依赖已移除旧接口的主题不会被强行装入。[实际支持范围](docs/compatibility.md)

## 常见问题

<details>
<summary>安装为什么需要等一会儿？</summary>

动态主题先进入暂存区，再启动匹配的独立 DSH 和浏览器检查。没有可用 Chromium／Chrome／Edge 时会准备固定浏览器资源，首次下载需要时间；失败不会跳过检查安装。

</details>

<details>
<summary>旧条目或有问题的主题怎么处理？</summary>

先自动查找同来源的可用新版。无法兼容时显示具体版本与原因，可复制完整 AI 修复任务；修复包重新导入后仍须通过检查。你不需要手写适配代码。[AI 修复指南](docs/ai-repair.md)

</details>

<details>
<summary>升级 DSH 后还能继续使用吗？</summary>

只声明经过适配的宿主版本。宿主或兼容器变化后，受影响主题重新检查；原包和设置保留，未通过前恢复可用外观。不会通过放宽版本声明冒称支持未来 DSH。

</details>

## 数据、开发与许可

主题库位于 `DSH_HOME/dsh-theme-plugin/`，按 profile 区分；外观偏好和自定义背景还使用浏览器本地存储。主题后台作为原生插件使用其原有数据位置。市场浏览请求公开目录，安装请求 GitHub／npm／主题资源；主题管理本身不需要模型 Key，也不向市场上传会话。

隔离预检可发现常见启动故障，不能证明任意第三方代码、所有设备与延迟行为绝对安全。具体主题的功能和权限仍由原作者实现负责。

[可选开发协议与构建](docs/development.md)。代码采用 [MIT](LICENSE)；字体、组件与其他来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，第三方主题素材保持原许可。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.md) |
| 了解使用方法与边界 | [使用文档](docs/compatibility.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/dsh-theme-plugin/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/dsh-theme-plugin/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/dsh-theme-plugin/releases">版本与下载</a> · <a href="https://github.com/gulagala001/dsh-theme-plugin/issues">反馈</a></p>
