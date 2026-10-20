# Compatibility

The supported host is **DSH 0.2.1-rc.2**. Catalog inclusion, static inspection and runtime validation are separate facts. The full market has not been exercised individually.

| Format or source | Handling |
| --- | --- |
| Built-in appearances and legacy `.omd-skin.json` v1 | Layouts, palettes, backgrounds and advanced preferences |
| `dsh-theme-plugin/v1` | Native tokens, local CSS/assets, image/video backgrounds and optional client |
| Skin Center v2 | Styles, patches, previews, backgrounds, v1alpha1 hooks and semantic surfaces |
| Native DSH ModuleLoader clients | Dependency checks, distinct module identity, lifecycle handling and isolated preflight |
| Deep Whale | Checked local resource routes, customization v1/v2, preferences and time rules |
| Dream Skin v1 exchange packages | Palette import; this exchange format does not carry a complete dynamic theme |
| Existing native theme plugins | Discovery and management through DSH's native plugin lifecycle |
| Themes requiring backend business services | Explicit service adapters or existing native linkage; arbitrary Node entry points are not executed |

## Representative validation

Validation used macOS, isolated DSH 0.2.1-rc.2 and Chromium. It does not establish Windows/Linux, every interaction or all plugin combinations.

- Workshop frutiger-aero: real download/install/apply, wallpaper, glass, palette rendering and switching.
- Workshop Blue Fantasy: isolated hooks loading, light/dark, disposal and remount.
- Open Sea 1.2.5: lifecycle after local asset-route adaptation; WebGPU quality remains hardware-dependent.
- Aqua 1.3.0: lifecycle after adapting its older store module path.
- Deep Whale maid-atelier and orca-link: lifecycle with local artwork and customization integration.
- Existing Glyph: one canvas after adoption and clean deactivation when switching.
- Legacy theme and preferences: original selection and custom naming migrate while original browser records remain intact.

The installed package's three settings pages and real market images were exercised. Both standalone CLI and the desktop-bundled CLI can run isolated preflight. Broken JSON, missing assets, path traversal and CSS hiding the shell are rejected; interrupted activation and failed updates have focused recovery checks.

Full Skin Center controller handoff, full coinstallation with other appearance controllers, and Windows/Linux device flows have not been validated. Existing Skin Center is linked natively with its current settings retained; its internal themes are not silently copied. Long-tail themes and service-dependent works are not marked fully compatible without corresponding evidence.

## Market sources

[DSH Skin Market](https://kingofsoysauce.github.io/dsh-skin-market/), [Workshop](https://dsh-market.com/), [A2H](https://dsh.a2hmarket.ai/) and [DSH community catalog](https://awesome-dsh-plugin.com/).

Duplicate package identities retain multiple sources. Unavailable feeds show cached or unavailable status. Missing previews are labeled. Downloads preserve author/source metadata and use fixed commits or release versions where available.

## Recovery and trust

Unsupported formats, missing resources, unknown modules or failed isolated loading block installation and produce an AI repair task. Interrupted activation restores the previous selection. Host/adapter changes invalidate affected compatibility reports and trigger rechecks, preserving originals and preferences.

Third-party browser themes retain normal page-script permissions. Preflight checks common compatibility failures, not malicious-code safety or every delayed behavior. Use trusted sources.
