#!/usr/bin/env node
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { zipSync } from 'fflate';
import { inspectTheme } from '../src/host/formats.mjs';
import { preflight, resolveCli } from '../src/host/probe.mjs';
import { ownedFile } from '../src/host/files.mjs';
import { publicTheme } from '../src/host/engine.mjs';
import { PROTOCOL, repairTask } from '../src/shared/protocol.mjs';
const [command, input, output, ...options] = process.argv.slice(2);
try {
  if (!input || !['init', 'inspect', 'validate', 'pack'].includes(command)) throw Error('用法：theme init <新目录> | inspect <主题> | validate <主题> | pack <主题目录> <输出.zip> [--host-cli <DSH bin.js>]');
  const folder = resolve(input);
  if (command === 'init') {
    await mkdir(folder);
    await writeFile(resolve(folder, 'theme.json'), JSON.stringify({
      format: PROTOCOL, id: 'my-theme', name: '我的主题', version: '1.0.0', author: '', license: 'MIT',
      tokens: { light: { '--dsw-alias-brand-primary': '#4967d8' }, dark: { '--dsw-alias-brand-primary': '#9aaaff' } },
      styles: ['skin.css'],
    }, null, 2) + '\n');
    await writeFile(resolve(folder, 'skin.css'), '/* Use native tokens or data-dsh-surface / data-dsh-part selectors. */\n[data-dsh-surface="composer"] { border-radius: 18px; }\n');
    console.log(`主题模板已创建：${folder}`);
  } else {
    const theme = await inspectTheme(folder);
    if (command !== 'inspect') {
      const args = [output, ...options].filter(Boolean), index = args.indexOf('--host-cli');
      const cli = index >= 0 ? resolve(args[index + 1]) : resolveCli({ get: () => undefined });
      theme.report = await preflight(theme, { root: resolve('.theme-validation'), cli });
    }
    if (command === 'pack') {
      if (!output || !output.endsWith('.zip')) throw Error('请指定输出 .zip 文件');
      const files = {};
      for (const name of Object.keys(theme.files)) files[name] = await readFile(await ownedFile(theme.root, name));
      if (!Object.keys(files).length) throw Error('单文件 JSON 可以直接导入，无需打包');
      await mkdir(dirname(resolve(output)), { recursive: true });
      await writeFile(resolve(output), zipSync(files));
      console.log(`主题包已通过检查：${resolve(output)}`);
    } else console.log(JSON.stringify(publicTheme(theme), null, 2));
  }
} catch (e) { console.error(repairTask({ error: e, report: e.details || {} })); process.exitCode = 1; }
