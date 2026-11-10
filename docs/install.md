# 安装 DSH Theme

[English](install_EN.md) · [返回首页](../README.md)

需要 DSH **0.2.2-rc.1** 和 Node.js **24.9.0+**。

## 在 DSH 里安装

打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.3-dsh.0.2.2-rc.1/gulagala001-dsh-theme-plugin-0.3.3-dsh.0.2.2-rc.1.tgz
```

等手头的任务跑完，按提示启用或重启 DSH。校验文件：[SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.3-dsh.0.2.2-rc.1/SHA256SUMS)。

## 用命令行安装

用同一个 DSH 自带的命令行，把 `web` 换成你的 profile（桌面版是 `desktop`）：

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.3-dsh.0.2.2-rc.1/gulagala001-dsh-theme-plugin-0.3.3-dsh.0.2.2-rc.1.tgz"
```

## 复制给 AI

也可以把下面这段发给 DSH 里的 AI，让它帮你装：

```text
请把 DSH Theme 安装到我现在用的 DSH profile：
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.3-dsh.0.2.2-rc.1/gulagala001-dsh-theme-plugin-0.3.3-dsh.0.2.2-rc.1.tgz
先确认 DSH 是 0.2.2-rc.1、Node.js 是 24.9.0 以上。包名应为 @gulagala001/dsh-theme-plugin，不要装 npm 上没有作用域的同名包。
保留原来的配置、会话和主题文件，不要升级 DSH；需要重启时先确认没有任务在跑。
装好后确认 设置 → 外观 里有外观设置、主题管理、市场三个页面。
```

## 升级和回退

先备份 profile 和 `DSH_HOME/dsh-theme-plugin/`，再用新版安装包覆盖安装，DSH 本身不用动。升级失败时原有数据不受影响，把第一条报错发到 [Issues](https://github.com/gulagala001/dsh-theme-plugin/issues)。

想回到旧版，就装回之前的安装包。回退只换代码，新版写入的数据不会自动撤销。

## 卸载

在插件页移除，或运行：

```bash
dsh plugin --profile web remove @gulagala001/dsh-theme-plugin
```

然后重启 DSH。主题库和浏览器里的外观偏好会留着，不需要可以手动删除。
