import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { ThemeError } from '../shared/protocol.mjs';
import { exists, json } from './files.mjs';
import { validationBrowser } from './browser.mjs';
import { needsRuntimeProbe } from '../shared/host-contract.mjs';
export async function preflight(theme, { root, cli, signal, progress, screenshots } = {}) {
  if (!needsRuntimeProbe(theme)) return { ...theme.report, ok: true };
  if (!cli || !await exists(cli)) throw new ThemeError('probe-host-unavailable', '无法找到匹配宿主的隔离检查入口，尚未安装此主题', { stage: 'isolated-load' });
  const browserPath = await validationBrowser(root, { signal, progress });
  const folder = join(root, 'probes', randomUUID());
  await mkdir(folder, { recursive: true });
  const input = join(folder, 'input.json'), result = join(folder, 'result.json');
  await writeFile(input, JSON.stringify({ theme, cli, folder, browserPath, plugin: resolve(import.meta.dirname, '../..'), screenshots }), { mode: 0o600 });
  const runner = resolve(import.meta.dirname, 'probe-runner.mjs');
  const environment = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  let log = '';
  const code = await new Promise((done, fail) => {
    const child = spawn(process.execPath, [...(cli.includes('.asar/') ? ['--expose-internals'] : []), runner, input, result], { cwd: folder, env: { ...environment, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), 110000);
    const abort = () => child.kill('SIGTERM'); signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', x => { log = (log + x).slice(-12000); }); child.stderr.on('data', x => { log = (log + x).slice(-12000); });
    child.once('error', fail); child.once('exit', code => { clearTimeout(timer); signal?.removeEventListener('abort', abort); done(code); });
  });
  const data = await json(result, { ok: false, error: '隔离加载没有完成，主题未安装。' });
  await rm(join(folder, 'home'), { recursive: true, force: true }).catch(() => {});
  await rm(input, { force: true }).catch(() => {});
  if (code !== 0 || !data.ok) throw new ThemeError('probe-failed', data.error || '隔离加载检查失败', { stage: 'isolated-load', findings: data.errors || [],
    report: { ...data.report, phase: data.phase, code: data.code, details: data.details, stack: data.stack } });
  return { ...theme.report, warnings: [...(theme.report.warnings || []), ...(data.warnings || [])],
    ok: true, runtime: 'isolated-host', stage: 'ready', probe: { ...data, log: undefined }, checkedAt: new Date().toISOString() };
}
export function resolveCli(ctx) {
  try {
    const anchor = ctx.get('profileContext')?.installAnchor;
    if (anchor) {
      const req = createRequire(anchor.endsWith('.json') || anchor.endsWith('.js') ? anchor : join(anchor, 'package.json'));
      try { return join(dirname(req.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js'); }
      catch { return join(dirname(req.resolve('@deepseek-ai/dsh-desktop-host/package.json')), 'lib/cli.js'); }
    }
  } catch {}
  try { return join(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js'); } catch { return null; }
}
