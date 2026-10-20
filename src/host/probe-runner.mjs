// Run only against an owned disposable DSH home and a fresh headless browser.
// Theme backends use the actual host services in this disposable profile.
// The runner never reads the user's profile.
import { readFile, writeFile, mkdir, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { probePage } from './probe-page.mjs';
const [input, output] = process.argv.slice(2);
const { theme, cli, folder, browserPath, plugin, screenshots } = JSON.parse(await readFile(input, 'utf8'));
let host, browser, result = { ok: false, error: '隔离检查未完成' };
const cleanup = async () => {
  await browser?.close().catch(() => {});
  if (host && host.exitCode === null && host.signalCode === null) {
    await new Promise(done => {
      const timer = setTimeout(() => { host.kill('SIGKILL'); }, 1500);
      host.once('exit', () => { clearTimeout(timer); done(); });
      host.kill('SIGTERM');
    });
  }
};
process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(1)); });
try {
  const home = join(folder, 'home'), profile = join(home, 'profiles', 'theme-probe');
  const req = createRequire(cli);
  const { initProfile, PROFILE_TEMPLATES } = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot')).href);
  await mkdir(join(profile, 'node_modules'), { recursive: true });
  const { name: packageName } = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8'));
  initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, packageName]);
  if (packageName.startsWith('@')) await mkdir(join(profile, 'node_modules', packageName.split('/')[0]), { recursive: true });
  await symlink(plugin, join(profile, 'node_modules', packageName), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({ locale: { preference: 'zh' }, 'ui-theme': { preference: 'light' } }));
  const candidate = join(home, 'candidate.json'); await writeFile(candidate, JSON.stringify(theme), { mode: 0o600 });
  const env = { ...process.env, DSH_HOME: home, DSH_THEME_PLUGIN_PROBE: candidate, DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1',
    HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache'), TMPDIR: folder, TEMP: folder, TMP: folder };
  let hostLog = '';
  const bootstrap = await new Promise((done, fail) => {
    host = spawn(process.execPath, [...(cli.includes('.asar/') ? ['--expose-internals'] : []), cli, '--profile', 'theme-probe', '--no-open', '--port', '0'], { cwd: folder, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => fail(Error('隔离 DSH 启动超时')), 35000);
    const observe = data => {
      hostLog = (hostLog + data).slice(-16000);
      const url = hostLog.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
      if (url) { clearTimeout(timer); done(url); }
    };
    host.stdout.on('data', observe); host.stderr.on('data', observe);
    host.once('error', fail); host.once('exit', code => { clearTimeout(timer); fail(Error(`隔离 DSH 退出 (${code})：${hostLog.slice(-1400)}`)); });
  });
  const candidates = [browserPath, chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    ...(process.platform === 'win32' ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'] : [])];
  let executablePath;
  for (const path of candidates.filter(Boolean)) { try { await access(path); executablePath = path; break; } catch {} }
  if (!executablePath) throw Error('未找到可用于隔离验证的浏览器；此动态主题尚未安装。');
  browser = await chromium.launch({ headless: true, executablePath, env, args: process.platform === 'darwin' ? ['--use-mock-keychain', '--password-store=basic'] : [] });
  result = await probePage(browser, bootstrap, { screenshots });
  if (result.ok && theme.backend) {
    const reopened = await probePage(browser, bootstrap, { screenshots: screenshots ? join(screenshots, 'reopen') : undefined });
    result = reopened.ok ? { ...result,
      requiresReload: result.requiresReload || reopened.requiresReload,
      warnings: [...new Set([...(result.warnings || []), ...(reopened.warnings || [])])],
      checks: [...new Set([...result.checks, ...reopened.checks, 'backend-dispose', 'backend-remount', 'page-reopen'])] } : { ...reopened, phase: 'page-reopen' };
  }
} catch (e) { result = { ok: false, error: e.message }; }
finally {
  await cleanup();
  await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 });
}
process.exit(result.ok ? 0 : 1);
