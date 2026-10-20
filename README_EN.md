# dsh-theme-plugin

Manage appearance, browse visual community theme markets, and download, check and apply themes in DeepSeek Harness.

[简体中文](README.md) · [Compatibility](docs/compatibility_EN.md) · [Development](docs/development.md) · [AI repair](docs/ai-repair.md)

Settings → **Appearance** has three pages:

- **Appearance settings**: color mode, palettes, backgrounds, typography, geometry, effects, branding and supported theme-specific controls.
- **Theme management**: built-in, existing and imported themes; activation, export, removal and diagnostics.
- **Market**: preview images, descriptions, authors, sources, search and filters, with checked installation.

Included appearances: native DSH, Glyph, Codex Desktop, iOS Liquid Glass, Claude CLI and Google Material, plus 29 palettes. Default product wording remains DeepSeek Harness while each theme retains its typography and visual style.

## Installation

Requires **DSH 0.2.1-rc.2** and **Node.js 22.19+**. Open **Plugins → Add Plugin** and paste the fixed archive URL:

```text
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.1.0-dsh.0.2.1-rc.2.tgz
```

Enable the plugin as directed by DSH. If a restart is requested, finish active tasks first. Open Settings → Appearance. Existing installed themes are discovered and retain their native host-managed lifecycle.

The package identifier is `@gulagala001/dsh-theme-plugin`. This release is distributed through GitHub Releases. The unscoped npm package with the same name belongs to another author; use the fixed URL above.

[Installation guide and AI-assisted setup](docs/install_EN.md) · [Release notes](https://github.com/gulagala001/dsh-theme-plugin/releases/tag/v0.1.0-dsh.0.2.1-rc.2) · [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS)

CLI example; replace `web` with the profile you use:

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-theme-plugin-0.1.0-dsh.0.2.1-rc.2.tgz
```

## Preview

![Visual theme market](docs/images/market.png)

![Theme management](docs/images/theme-management.png)

![Appearance settings](docs/images/appearance.png)

Screenshots use a separate demonstration profile. Community artwork and theme names belong to their authors. Catalog size changes over time and does not establish compatibility.

## Use

Open Appearance → Market and choose **Install and apply**. Downloads are staged, checked and only then admitted to the library. Styles, backgrounds and dynamic clients are exercised in an isolated DSH home and a fresh browser, including shell visibility checks.

Import `.json`, `.zip` or `.tgz` files from Theme management. Failed installations preserve the current appearance and provide a **Copy AI repair task** action. Reimport the returned repair package through the same checks.

Dynamic validation uses a matching DSH CLI and an isolated browser. It reuses available Chromium, Chrome or Edge, or automatically prepares a pinned Chromium version on first use. If the environment cannot be prepared, the package remains uninstalled and the UI explains why. Existing native plugins keep their original host-managed lifecycle; restart-dependent transitions are reported.

Catalog inclusion does not establish compatibility. See the [format and compatibility reference](docs/compatibility_EN.md).

## Data and recovery

Checked packages and library state live under `dsh-theme-plugin/` in the DSH data directory, separated by profile. Appearance preferences and custom background images stay in browser-local storage.

The plugin reads the current profile's theme inventory, coordinates activation through the native plugin manager and writes its own library. Market browsing and installation request public catalogs, GitHub, npm or declared public asset hosts. Isolated preflight starts a matching DSH CLI and browser, downloading Chromium when necessary. No model API key is required, and conversation content is not uploaded to markets.

Interrupted activation restores the previous selection. Changes to the host or adapter version require affected dynamic themes to be checked again. Preflight detects common loading failures but cannot establish correctness for every device, plugin combination or delayed behavior.

MIT licensed. Third-party attribution and font licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
