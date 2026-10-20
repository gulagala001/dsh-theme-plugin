import { access, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { ThemeError } from '../shared/protocol.mjs';
const exec = promisify(execFile), require = createRequire(import.meta.url), pending = new Map();
export async function validationBrowser(root, { signal, progress = () => {} } = {}) {
  const paths = [chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  for (const path of paths) { try { await access(path); return path; } catch {} }
  const cache = join(root, 'browser-cache');
  if (pending.has(cache)) return pending.get(cache);
  const task = (async () => {
    await mkdir(cache, { recursive: true });
    const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cache, ELECTRON_RUN_AS_NODE: '1' };
    const cwd = resolve(import.meta.dirname, '../..');
    const { stdout } = await exec(process.execPath, ['-e', 'process.stdout.write(require("playwright-core").chromium.executablePath())'], { cwd, env, signal, timeout: 15000 });
    const path = stdout.trim();
    try { await access(path); return path; } catch {}
    progress('首次准备隔离检查环境，正在下载浏览器组件');
    const cli = join(dirname(require.resolve('playwright-core/package.json')), 'cli.js');
    try { await exec(process.execPath, [cli, 'install', 'chromium'], { cwd, env, signal, timeout: 240000, maxBuffer: 1024 * 1024 }); }
    catch { throw new ThemeError('probe-browser-download', '检查环境暂时无法下载，主题尚未安装。恢复网络后可直接重试，无需手动配置。', { stage: 'validation-environment' }); }
    await access(path);
    return path;
  })().finally(() => pending.delete(cache));
  pending.set(cache, task);
  return task;
}
