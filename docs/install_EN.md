# Install dsh-theme-plugin

[简体中文](install.md)

Version **0.2.0** targets **DSH 0.2.1-rc.3**, **Cordis 4.0.5** and **Node.js 22.19+**. Other host versions are not declared supported. Install into the profile you actually use; this plugin does not upgrade the host.

## Add the plugin

1. Open **Plugins → Add Plugin** in the target DSH instance.
2. Paste the fixed URL below and confirm installation.
3. Enable it as directed by DSH. Finish active tasks before any requested restart.
4. Open **Settings → Appearance** for Appearance settings, Theme management and Market.

```text
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.5-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.5-dsh.0.2.1-rc.3.tgz
```

The identifier is `@gulagala001/dsh-theme-plugin`. This release is not published to npm; do not install the unrelated unscoped package.

CLI example for the `web` profile; replace it with your actual profile name:

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.5-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.5-dsh.0.2.1-rc.3.tgz
```

## AI-assisted installation

```text
Identify my target DSH instance and profile, and confirm that its host version is 0.2.1-rc.3.
Install the fixed release below into that profile. The package identifier must be @gulagala001/dsh-theme-plugin.
Preserve configuration, conversations, original theme packages and user data. Do not install the unrelated unscoped npm package.
Do not upgrade DSH automatically. Before any required restart, check for active work and identify the instance to restart.
Confirm that Settings → Appearance contains Appearance settings, Theme management and Market.
Archive: https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.5-dsh.0.2.1-rc.3/gulagala001-dsh-theme-plugin-0.2.5-dsh.0.2.1-rc.3.tgz
Checksums: https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.2.5-dsh.0.2.1-rc.3/SHA256SUMS
```

## Themes, updates and removal

Choose **Install and apply** in the market. Failed checks preserve the current appearance and offer an AI repair task. Reimport the repaired package in Theme management. Dynamic preflight may download Chromium on first use; an unavailable check environment leaves the theme uninstalled with an explanation.

Use a newer fixed release archive to update, retaining the profile and data. Remove through DSH's plugin manager, or run this for the matching profile:

```sh
dsh plugin --profile web remove @gulagala001/dsh-theme-plugin
```

Removal does not deliberately delete the theme library or browser preferences. See [compatibility](compatibility_EN.md) for formats and service-dependent themes.
