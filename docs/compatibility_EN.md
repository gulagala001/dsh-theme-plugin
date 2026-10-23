# Compatibility

[简体中文](compatibility.md)

The supported host is **DSH 0.2.1-rc.2**. Compatibility uses real current-host APIs. Stale catalog entries are checked for newer releases with matching package/repository identity; removed host APIs are not recreated.

## Automatic handling

| Theme format | Handling |
| --- | --- |
| Built-in appearances and `.omd-skin.json` v1 | Layouts, palettes, backgrounds and advanced preferences |
| `dsh-theme-plugin/v1` | Tokens, local CSS, image/video backgrounds and optional dynamic clients |
| Skin Center v2 | Styles, patches, previews, backgrounds and v1alpha1 hooks |
| DSH ModuleLoader themes | Complete programs, closures and private modules, resource mapping and lifecycle ownership |
| Source packages without built clients | JS/TS/JSX and declared dependencies are compiled without upstream installation scripts |
| DSH theme backends | Real disposable Cordis contexts using current RPC, HTTP and configuration services |
| Deep Whale | Original artwork, customization v1/v2, preferences and time rules |
| Dream Skin v1 exchange packages | Their palette data; full dynamic plugins use the regular DSH theme flow |
| Existing native themes | Automatic discovery and coordinated enable/disable through DSH, retaining original configuration |

Downloads use fixed versions or commits. Incomplete source packages may use a published npm artifact with matching package, version and repository. If a selected newer release fails, the catalog's original version is also checked; fallback installation requires the same current-host checks. Dynamic features are not discarded and service responses are not fabricated to increase coverage.

Downloads are limited to 256 MiB; extracted content to 512 MiB and 6,000 files. Local file imports are limited to 80 MiB. Original package files are retained separately from compiled/adapted output.

## What preflight checks

Each dynamic candidate gets its own disposable DSH profile and browser. Checks cover page loading, actual input, the settings entry, light/dark modes, client disposal/remount, backend stop/restart and reopening the page. Themes exposing native editable Config forms also undergo a configuration write. A broken candidate cannot contaminate the next candidate's host.

Themes that alter boot HTML trigger a page refresh after switching. Unsent drafts and attachments defer that refresh. Installation failures retain the active appearance; activation failures restore the previous choice. Relevant host/adapter updates trigger rechecks while retaining theme files and configuration.

Reading the library, loading old page resources or installing an update during a switch does not restart the previous backend. Current, pending and rollback revisions retain their exact digests. The page uses the host's confirmation or recovery result; older responses cannot replace a newer selection. After interruption, the next operation or host startup restores the previous choice first. Failed recovery retains its receipt and reports the error; old confirmations and new switches remain blocked until recovery completes. Removing the current theme restores the native appearance and releases its backend. Once theme management is disposed, late requests cannot continue confirmation or change the page.

The 2026-10-20 batch used a fixed snapshot of **549 deduplicated catalog entries**, prepared each entry and exercised runnable candidates in the real host. Affected candidates were rerun after shared fixes: **454 passed basic runtime checks; 95 remained blocked**, including obsolete themes, unavailable/incomplete sources and runtime failures. Blocked entries are not counted as compatible. Live catalog totals change; inclusion is not a passing compatibility result.

| Representative theme | Validation |
| --- | --- |
| dsh-ads 0.1.3 | Real market download/install/apply, light/dark, native input/settings, disposal and remount |
| ORCA Link 0.0.1 | Real market installation, original artwork, switching and recovery |
| Dream Skin 10.20.0 | Current-host loading, native backend endpoints and lifecycle |
| dsh-columbina-theme | Native configuration writes, validation and persistence after backend restart |
| Open Sea, Catppuccin and Deep Whale | Assets and client/backend lifecycle on the corresponding fixed candidates |

The package was installed through DSH's native installer and coinstalled with OMD/OpenCU in an isolated macOS environment, checking one Appearance entry and three subpages. This does not validate every extra feature, long-running behavior, graphics device or third-party plugin combination. Windows/Linux devices have not been exercised.

## Installation remains blocked when

- A theme requires obsolete DSH modules/services and has no working current-host version.
- Required artwork, code or resources are missing and cannot be obtained from a matching release artifact.
- Loading, configuration writes or reopening fail, or input/settings become unusable.
- An unprepared local helper is required, or downloads/the checking environment are unavailable.

Errors provide a specific reason and a copyable [AI repair task](ai-repair.md). Unavailable fonts retain the theme's browser fallback with a warning; missing required images, scripts and backend endpoints still block installation.

## Markets and trust

Sources: [DSH Skin Market](https://kingofsoysauce.github.io/dsh-skin-market/), [Workshop](https://dsh-market.com/), [A2H](https://dsh.a2hmarket.ai/) and the [DSH community catalog](https://awesome-dsh-plugin.com/). Duplicate identities retain their sources. Missing previews are labeled; failed feeds show cached or unavailable status.

Third-party themes remain plugins: backends have normal Node/DSH capabilities, and browser scripts have page permissions. Disposable profiles detect compatibility faults; they are not a malicious-code sandbox or a guarantee about delayed behavior. Use trusted authors.
