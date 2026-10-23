# 安装 dsh-theme-plugin

[English](install_EN.md)

版本 **0.2.0** 对应 **DSH 0.2.1-rc.2**、Cordis **4.0.5**、Node.js **22.19+**。其他宿主版本尚未声明支持。安装到要使用的 profile，不会自动替换宿主版本。

## 添加插件

1. 在目标 DSH 实例打开 **插件 → ＋ 添加插件**。
2. 粘贴下方固定地址，确认安装。
3. 按宿主提示启用。若要求重启，先结束当前任务，再重启对应实例。
4. 打开 **设置 → 外观**，使用外观设置、主题管理和市场三个页面。

```text
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.2-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.2-dsh.0.2.1-rc.2.tgz
```

安装标识是 `@gulagala001/dsh-theme-plugin`；不要从 npm 安装无作用域的同名包。当前不提供 npm 发布。

CLI 用户可在实际使用的 profile 安装。以下示例目标是 `web`；使用不同 profile 时替换该名称：

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.2-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.2-dsh.0.2.1-rc.2.tgz
```

## 复制给 AI 安装

```text
请先确认我当前要使用的 DSH 实例与 profile，以及宿主版本是否为 0.2.1-rc.2。
在该 profile 安装下面的固定发行包，包标识应为 @gulagala001/dsh-theme-plugin。
保留已有配置、会话、主题原包和用户数据；不要安装无作用域 npm 同名包。
不要自动升级 DSH。需要重启时先检查是否有任务运行，并说明要重启哪个实例。
安装完成后确认设置 → 外观具有外观设置、主题管理、市场三个子页。
安装包：https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.2-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.2.2-dsh.0.2.1-rc.2.tgz
校验值：https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.2-dsh.0.2.1-rc.2/SHA256SUMS
```

## 主题安装与恢复

在市场点击“安装并应用”。检查失败不会替换当前可用外观，按提示复制 AI 修复任务；修复包在主题管理重新导入。动态预检可能首次下载 Chromium，检查环境不可用时会说明原因并保留未安装状态。

更新本插件使用新的固定发行包，保留原 profile 与数据。卸载可使用插件管理界面，或在对应 profile 运行：

```sh
dsh plugin --profile web remove @gulagala001/dsh-theme-plugin
```

主题库和浏览器偏好不会因此主动删除。实际支持格式及后台服务型主题的限制见[兼容说明](compatibility.md)。
