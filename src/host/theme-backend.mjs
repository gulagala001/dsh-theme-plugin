import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { ownedFile, exists, digest } from './files.mjs';
import { ThemeError, API } from '../shared/protocol.mjs';

export async function inspectBackend(root, pkg, assets) {
  const value = pkg.exports?.['.'];
  const entry = typeof value === 'string' ? value : value?.import || value?.default || pkg.main;
  if (!entry || !assets.has(entry.replace(/^\.\//, ''))) return null;
  const source = await readFile(await ownedFile(root, entry), 'utf8');
  if (!/\bwebServer\b|\bwebRuntime\b/.test(source)) return null;
  return { entry: entry.replace(/^\.\//, ''), runtime: 'isolated-node-service' };
}

export class ThemeBackends {
  constructor(root, { cli, register, authorize } = {}) {
    this.root = root; this.running = new Map(); this.owners = new Map(); this.children = new Set(); this.routes = new Map();
    this.cli = cli; this.register = register; this.authorize = authorize;
  }
  async start(theme) {
    if (!theme?.backend) return;
    const key = `${theme.id}/${theme.digest}`;
    if (this.running.has(key)) { const value = await this.running.get(key); theme.backend.routes = value.routes; return value; }
    const owner = {}; this.owners.set(key, owner);
    const pending = this.launch(theme, owner).then(value => {
      try { this.attachRoutes(theme, value); } catch (e) { this.stop(value.child); this.releaseRoutes(key, value.child); throw e; }
      value.child.once('exit', () => {
        this.releaseRoutes(key, value.child);
        if (this.running.get(key) === pending) { this.running.delete(key); this.owners.delete(key); }
      });
      return value;
    }).catch(e => { if (this.running.get(key) === pending) { this.running.delete(key); this.owners.delete(key); } throw e; });
    this.running.set(key, pending);
    return pending;
  }
  async launch(theme, owner) {
    if (!process.allowedNodeEnvironmentFlags.has('--permission') && !process.allowedNodeEnvironmentFlags.has('--experimental-permission')) {
      throw new ThemeError('backend-runtime', '当前 Node 不支持主题后台的独立权限进程，需要更新主题运行环境');
    }
    const work = join(this.root, theme.id, theme.digest), home = join(this.root, theme.id, 'data');
    for (const [name, hash] of Object.entries(theme.files || {})) {
      if (digest(await readFile(await ownedFile(theme.root, name))) !== hash) throw new ThemeError('resource-changed', '主题后台或资源在检查后发生变化，请重新导入');
    }
    await mkdir(work, { recursive: true }); await mkdir(home, { recursive: true });
    const entry = await ownedFile(theme.root, theme.backend.entry), runner = resolve(import.meta.dirname, 'backend-runner.mjs');
    const token = randomUUID(), input = join(work, 'input.json');
    const resolutions = {}, helpers = new Set();
    const locate = async (name, req) => {
      if (resolutions[name]) return;
      const file = req.resolve(name); resolutions[name] = file;
      let folder = dirname(file);
      while (!await exists(join(folder, 'package.json')) && dirname(folder) !== folder) folder = dirname(folder);
      helpers.add(folder);
      const manifest = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
      for (const dependency of Object.keys(manifest.dependencies || {})) await locate(dependency, createRequire(file));
    };
    if (this.cli) for (const name of ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-home-paths', '@deepseek-ai/cordis']) {
      try { await locate(name, createRequire(this.cli)); } catch {}
    }
    await writeFile(input, JSON.stringify({ entry, home, token, resolutions }), { mode: 0o600 });
    const pluginRoot = resolve(import.meta.dirname, '../..');
    const reads = [await realpath(theme.root), runner, join(pluginRoot, 'package.json'), work, home, ...helpers];
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'LANG', 'LC_ALL'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    if (this.owners.get(`${theme.id}/${theme.digest}`) !== owner) throw new ThemeError('backend-cancelled', '主题后台启动已取消');
    const child = spawn(process.execPath, [
      process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission',
      ...reads.map(path => `--allow-fs-read=${path}`), `--allow-fs-write=${home}`,
      '--max-old-space-size=192', runner, input,
    ], { cwd: home, env: { ...env, HOME: home, USERPROFILE: home, DSH_HOME: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const owned = { key: `${theme.id}/${theme.digest}`, child };
    this.children.add(owned); child.once('exit', () => this.children.delete(owned));
    const stop = () => this.stop(child);
    let log = '', buffer = '';
    child.stderr.on('data', value => { log = (log + value).slice(-3000); });
    const ready = await new Promise((done, fail) => {
      const timer = setTimeout(() => { stop(); fail(new ThemeError('backend-timeout', '主题后台初始化超时，未应用')); }, 12000);
      let settled = false;
      const reject = e => { if (settled) return; settled = true; clearTimeout(timer); stop(); fail(e); };
      child.once('error', reject);
      child.once('exit', code => reject(new ThemeError('backend-start', `主题后台未能启动（${code}）`, { diagnostic: log.replaceAll(token, '[redacted]') })));
      child.stdout.on('data', value => {
        buffer += value;
        let next;
        while ((next = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, next); buffer = buffer.slice(next + 1);
          let data; try { data = JSON.parse(line); } catch { continue; }
          if (data.ready === true && Number.isInteger(data.port)) { settled = true; clearTimeout(timer); done(data); }
          else if (data.ready === false) reject(new ThemeError('backend-start', data.error, { code: data.code, resource: data.resource, stack: data.stack }));
        }
      });
    });
    const value = { ...ready, child, token, url: `http://127.0.0.1:${ready.port}` };
    theme.backend.routes = ready.routes;
    return value;
  }
  async proxy(theme, suffix, req, res) {
    const backend = await this.start(theme);
    const url = backend.url + suffix;
    const headers = { 'x-dtp-bridge': backend.token, origin: backend.url, host: `127.0.0.1:${backend.port}` };
    for (const key of ['content-type', 'range', 'accept', 'if-none-match', 'if-modified-since']) if (req.headers[key]) headers[key] = req.headers[key];
    const payload = [];
    if (!['GET', 'HEAD'].includes(req.method)) {
      let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 112 * 1024 * 1024) throw new ThemeError('request-size', '主题后台请求过大'); payload.push(chunk); }
    }
    const response = await fetch(url, { method: req.method, headers, body: payload.length ? Buffer.concat(payload) : undefined, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    const output = {};
    for (const key of ['content-type', 'cache-control', 'content-range', 'accept-ranges', 'etag', 'last-modified']) if (response.headers.has(key)) output[key] = response.headers.get(key);
    output['cache-control'] = 'no-store';
    if (response.headers.has('location')) output.location = response.headers.get('location');
    res.writeHead(response.status, output);
    if (req.method === 'HEAD') { res.end(); return; }
    for await (const bytes of response.body || []) if (!res.write(bytes)) await once(res, 'drain');
    res.end();
  }
  retain(themes) {
    const keys = new Set(themes.filter(Boolean).map(t => `${t.id}/${t.digest}`));
    for (const [key, pending] of this.running) if (!keys.has(key)) {
      this.running.delete(key); this.owners.delete(key); void pending.then(value => this.stop(value.child)).catch(() => {});
      this.releaseRoutes(key);
    }
    for (const { key, child } of this.children) if (!keys.has(key)) this.stop(child);
  }
  attachRoutes(theme, backend) {
    if (!this.register) return;
    const key = `${theme.id}/${theme.digest}`;
    for (const route of backend.routes) {
      if (route.path === API || route.path.startsWith(API + '/') || ['/api/', '/plugins/', '/assets/'].includes(route.path)) throw new ThemeError('backend-route', '主题声明了宿主保留的资源路由');
      const identity = `${route.kind}:${route.path}`;
      let entry = this.routes.get(identity);
      if (!entry) {
        entry = { owners: new Map() };
        const off = this.register({ ...route, handler: async (req, res) => {
          const rejected = this.authorize?.(req);
          if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
          const current = [...entry.owners.values()].at(-1);
          if (!current) { res.writeHead(404); res.end(); return; }
          try { await this.proxy(current.theme, req.url, req, res); }
          catch { if (!res.headersSent) res.writeHead(502); res.end(); }
        } });
        entry.off = off; this.routes.set(identity, entry);
      }
      entry.owners.set(key, { theme, child: backend.child });
    }
  }
  releaseRoutes(key, child) {
    for (const [identity, route] of this.routes) {
      if (!child || route.owners.get(key)?.child === child) route.owners.delete(key);
      if (!route.owners.size) { try { route.off?.(); } catch (e) { console.warn('Theme route cleanup failed:', e.message); } finally { this.routes.delete(identity); } }
    }
  }
  stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 1000);
    timer.unref(); child.once('exit', () => clearTimeout(timer));
  }
  dispose() { this.retain([]); }
}
