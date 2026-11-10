# Supported themes

[简体中文](compatibility.md) · [Back to README](../README_EN.md)

This release targets **DSH 0.2.2-rc.1**, and themes are checked against that version. Older market entries are first matched to a newer version from the same package and repository; interfaces that DSH has removed are not added back for old themes.

## Handled automatically on install

| Theme type | What happens |
| --- | --- |
| Built-in appearances, `.omd-skin.json` v1 | Layout, colors, background and advanced appearance settings are kept |
| `dsh-theme-plugin/v1` | Color tokens, bundled CSS, image or video backgrounds and an optional dynamic script |
| Skin Center v2 | Styles, patches, previews, backgrounds and v1alpha1 hooks |
| DSH ModuleLoader themes | The full theme program is kept; resource paths are mapped and startup and unloading are managed |
| Source-only themes without a built client | JS, TS, JSX and declared dependencies are compiled automatically; upstream install scripts never run |
| DSH themes with a backend | The backend runs normally in DSH, using the current DSH interfaces and configuration |
| Deep Whale | Original artwork, customization v1/v2, preferences and time-of-day rules |
| Dream Skin v1 exchange packs | The colors they contain are imported; full dynamic plugins go through normal theme installation |
| Theme plugins already installed | Found automatically and switched through DSH's own plugin manager, with their settings untouched |

Downloads are pinned to an exact version or commit. When a source package is incomplete, the npm release of the same package, version and repository fills the gaps. If the newer version fails its check, the version recorded in the market is tried too, and it must pass the same check. Dynamic effects are never stripped and interface responses are never faked just to get more themes installed.

| Limit | Maximum |
| --- | --- |
| Theme package download | 256 MiB |
| After extraction | 512 MiB, up to 6,000 files |
| Local import file | 80 MiB |

The original theme package is kept as is; compiled and adapted output is stored separately.

## What the test run checks

Dynamic themes run in a separate DSH profile and a separate browser: the page loads, text is typed, settings open, light and dark switch, the theme is unloaded and loaded again, the backend stops and resumes, and the page is reopened. Themes with a settings form also get a test save. Each theme gets its own environment, so one broken theme cannot affect the next.

Some themes need to change the startup page, and switching to them reloads automatically; if the composer holds an unsent draft or attachments, the reload waits until you send. A failed install leaves your appearance unchanged, and a failed enable returns to your previous choice. After a plugin or DSH update, affected themes are checked again, and the theme library and settings are kept.

Removing the theme in use first switches back to the native DSH appearance, then stops its backend.

## What still blocks installation

- The theme only supports a very old DSH, needs modules or services that have been removed, and has no version for the current DSH.
- The package is missing images, code or required resources, and no matching official release can fill them in.
- Loading, saving settings or reopening the page fails, or the theme breaks the composer or settings.
- The theme needs a local helper service that is not set up, or the download or test environment is unavailable.

You get the exact reason and a copyable [AI repair task](ai-repair.md). If a font file cannot be downloaded but the theme declares a fallback font, the fallback is used and you get a notice. Failures in required images, scripts and backend interfaces still block installation.

## Market sources

[DSH Skin Market](https://kingofsoysauce.github.io/dsh-skin-market/), [Creative Workshop](https://dsh-market.com/), [A2H](https://dsh.a2hmarket.ai/) and the [DSH community directory](https://awesome-dsh-plugin.com/). Duplicate themes are merged into one entry; entries without a preview are marked, and an unreachable source shows its cached content or "unavailable".

## Safety

Third-party themes are plugins: the backend can do what any DSH plugin can, and page scripts have page permissions. The test run finds compatibility problems. It is not a sandbox against malicious code and cannot catch every problem that shows up later. Only install themes from authors you trust.
