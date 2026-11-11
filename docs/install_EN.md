# Install DSH Theme

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.2** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.4-dsh.0.2.2-rc.2/gulagala001-dsh-theme-plugin-0.3.4-dsh.0.2.2-rc.2.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.4-dsh.0.2.2-rc.2/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.4-dsh.0.2.2-rc.2/gulagala001-dsh-theme-plugin-0.3.4-dsh.0.2.2-rc.2.tgz"
```

## Ask the AI to install it

You can also send this to the AI in DSH and let it do the install:

```text
Install DSH Theme into the DSH profile I am using now:
https://github.com/gulagala001/dsh-theme-plugin/releases/download/v0.3.4-dsh.0.2.2-rc.2/gulagala001-dsh-theme-plugin-0.3.4-dsh.0.2.2-rc.2.tgz
First check that DSH is 0.2.2-rc.2 and Node.js is 24.9.0 or later. The package must be @gulagala001/dsh-theme-plugin; do not install the unscoped package with the same name from npm.
Keep my settings, conversations and theme files, and do not upgrade DSH. Before restarting, make sure no task is running.
Afterwards, confirm that Settings → Appearance has the Appearance settings, Theme management and Market pages.
```

## Upgrade and roll back

Back up your profile and `DSH_HOME/dsh-theme-plugin/`, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/dsh-theme-plugin/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove @gulagala001/dsh-theme-plugin
```

Then restart DSH. The theme library and the appearance preferences stored in the browser stay; delete them by hand if you no longer need them.
