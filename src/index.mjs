import { join, resolve, extname, relative } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { ThemeEngine, publicTheme } from './host/engine.mjs';
import { ownedFile, digest, json, atomic } from './host/files.mjs';
import { API, ThemeError, repairTask } from './shared/protocol.mjs';
export const name = '@gulagala001/dsh-theme-plugin';
export const inject = ['webServer', 'connection'];
const ROOT = resolve(import.meta.dirname, '..');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
async function body(req) {
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 112 * 1024 * 1024) throw new ThemeError('request-size', '导入请求过大'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
}
function send(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
export async function apply(ctx, config = {}) {
  const profile = ctx.get('profileContext');
  const homeValue = ctx.get('dshHomePath'), home = profile?.home || (typeof homeValue === 'function' ? homeValue() : homeValue);
  if (!home) { ctx.logger?.warn('主题基座未取得宿主数据目录，跳过启动。'); return; }
  let probe;
  if (process.env.DSH_THEME_PLUGIN_PROBE && profile?.name === 'theme-probe') {
    const path = resolve(process.env.DSH_THEME_PLUGIN_PROBE);
    if (relative(home, path).startsWith('..')) throw Error('Probe record must belong to its isolated home');
    probe = await json(path);
  }
  const root = config.storageDir || join(home, 'dsh-theme-plugin', digest(profile?.dir || 'default').slice(0, 16));
  const engine = new ThemeEngine(ctx, root, { probe });
  ctx.effect(() => () => engine.dispose());
  ctx.on('webserver/index-inject', rows => rows.push({
    kind: 'global', name: '__DTP_INDEX_BACKEND__', value: engine.backends.active?.key || null,
  }));
  let bootError, initialized = false;
  const preferenceWrites = new Map();
  try { await engine.initialize(); } catch (e) { bootError = e.message; ctx.logger?.warn(`主题库恢复失败，已保留原数据：${e.message}`); }
  // Native restoration waits for the host to finish loading; answer state
  // requests at once meanwhile instead of holding them open.
  void Promise.resolve(engine.initialization).finally(() => { initialized = true; });
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API, handler: async (req, res) => {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return; }
    const url = new URL(req.url, 'http://localhost'), path = url.pathname.slice(API.length);
    try {
      if (path.startsWith('/builtin/')) {
        const file = await ownedFile(join(ROOT, 'assets/builtin'), decodeURIComponent(path.slice('/builtin/'.length)));
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }); res.end(await readFile(file)); return;
      }
      if (bootError) { send(res, 503, { error: bootError, code: 'library-unavailable', repair: repairTask({ error: { message: bootError, code: 'library-unavailable' } }) }); return; }
      if (!initialized && path === '/state') { send(res, 503, { error: '正在恢复主题…', code: 'restoring' }); return; }
      await engine.initialization;
      engine.controller.signal.throwIfAborted();
      if (path.startsWith('/client/')) {
        const [, , id, hash] = path.split('/'), theme = engine.theme(id, hash);
        if (!theme?.client) throw new ThemeError('theme-missing', '主题客户端版本不存在');
        const bytes = await readFile(await ownedFile(theme.root, theme.client.path));
        if (digest(bytes) !== theme.files[theme.client.path]) throw new ThemeError('resource-changed', '主题入口在检查后发生变化，请重新导入');
        await engine.backends.start(theme);
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        res.end(theme.client.code); return;
      }
      if (path.startsWith('/assets/')) {
        const [, , id, hash, ...parts] = path.split('/'), theme = engine.theme(id, hash);
        if (!theme) throw new ThemeError('theme-missing', '主题资源版本不存在');
        const name = parts.map(decodeURIComponent).join('/');
        if (!theme.files[name]) throw new ThemeError('resource-missing', '主题资源未通过安装检查');
        const file = await ownedFile(theme.root, name), bytes = await readFile(file);
        if (digest(bytes) !== theme.files[name]) throw new ThemeError('resource-changed', '主题文件在检查后发生变化，请重新导入');
        const type = MIME[extname(file)] || 'application/octet-stream';
        const headers = { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'" };
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (range) {
          const start = Number(range[1]), end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
          if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); res.end(); return; }
          res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 }); res.end(bytes.subarray(start, end + 1));
        } else { res.writeHead(200, { ...headers, 'Content-Length': bytes.length, 'Accept-Ranges': 'bytes' }); res.end(bytes); }
        return;
      }
      if (req.method !== 'POST') { send(res, 405, { error: 'POST required' }); return; }
      const data = await body(req);
      if (path === '/preferences') {
        if (!engine.theme(data.id) || typeof data.namespace !== 'string' || data.namespace.length > 200) throw new ThemeError('settings-scope', '主题设置范围无效');
        const file = join(root, 'preferences', data.id, digest(data.namespace) + '.json');
        const update = (preferenceWrites.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
          const value = await json(file, {});
          if (data.field !== undefined) {
            if (typeof data.field !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(data.field)) throw new ThemeError('settings-field', '主题设置字段无效');
            if (data.unset) delete value[data.field]; else value[data.field] = data.value;
            if (JSON.stringify(value).length > 4 * 1024 * 1024) throw new ThemeError('settings-size', '主题设置超过大小限制');
            await atomic(file, value);
          }
          return value;
        });
        preferenceWrites.set(file, update);
        try { send(res, 200, { value: await update }); }
        finally { if (preferenceWrites.get(file) === update) preferenceWrites.delete(file); }
        return;
      }
      if (path === '/state') { send(res, 200, await engine.state()); return; }
      if (path === '/probe-backend' && engine.probe) {
        if (data.action === 'stop') await engine.backends.retain([]);
        else if (data.action === 'start') await engine.backends.start(engine.probe);
        else if (data.action === 'check-settings') {
          const runtime = await engine.backends.start(engine.probe);
          const entry = runtime?.configEntry, settings = ctx.get('settings');
          const descriptor = entry && settings?.describe().find(row => row.ns === entry.options.id);
          if (descriptor) await settings.update(descriptor.ns, descriptor.value, descriptor.revision);
          send(res, 200, { ok: true, configurable: !!descriptor }); return;
        }
        else throw new ThemeError('probe-action', '未知的隔离检查动作');
        send(res, 200, { ok: true }); return;
      }
      if (path === '/catalog') { send(res, 200, await engine.market.catalog(data.refresh === true)); return; }
      if (path === '/theme') {
        const theme = engine.theme(data.id); if (!theme) throw new ThemeError('theme-missing', '主题不存在');
        send(res, 200, publicTheme(theme)); return;
      }
      if (path === '/operation') { const op = engine.operations.get(data.id); if (!op) throw new ThemeError('operation-missing', '任务已结束，请刷新主题列表'); send(res, 200, op); return; }
      if (path === '/install') {
        const entry = await engine.market.find(data.id);
        send(res, 202, engine.start(progress => engine.installEntry(entry, progress), { theme: entry })); return;
      }
      if (path === '/import') { send(res, 202, engine.start(progress => engine.importData(data, progress), { theme: { name: data.name } })); return; }
      if (path === '/discover') { send(res, 202, engine.start(async () => { await engine.discover(); return engine.state(); })); return; }
      if (path === '/activate') { send(res, 200, await engine.activate(data.id, { startup: data.startup === true })); return; }
      if (path === '/commit') { await engine.commit(data.token); send(res, 200, await engine.state()); return; }
      if (path === '/fail') { await engine.fail(data.token, String(data.message || '主题加载失败').slice(0, 2000)); send(res, 200, await engine.state()); return; }
      if (path === '/remove') { await engine.library.remove(data.id); send(res, 200, await engine.state()); return; }
      if (path === '/export') {
        const theme = engine.theme(data.id); if (!theme) throw new ThemeError('theme-missing', '主题不存在');
        if (theme.linked) throw new ThemeError('native-export', '此主题由 DSH 原生插件管理，请使用原项目提供的安装包');
        if (theme.legacy) { send(res, 200, { name: `${theme.legacy.id}.omd-skin.json`, data: Buffer.from(JSON.stringify(theme.legacy, null, 2)).toString('base64') }); return; }
        const { zipSync } = await import('fflate'); const files = {};
        for (const name of Object.keys(theme.files)) files[name] = await readFile(await ownedFile(theme.root, name));
        send(res, 200, { name: `${theme.id}.zip`, data: Buffer.from(zipSync(files)).toString('base64') }); return;
      }
      send(res, 404, { error: 'Unknown operation' });
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      send(res, 409, { error: e.message, code: e.code || 'theme-error', details: e.details, repair: repairTask({ error: e, report: e.details || {} }) });
    }
  } }));
}
