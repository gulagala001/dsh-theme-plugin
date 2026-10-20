import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
registerHooks({ resolve(specifier, context, next) {
  if (input.resolutions?.[specifier]) return { url: pathToFileURL(input.resolutions[specifier]).href, shortCircuit: true };
  return next(specifier, context);
} });
const routes = [], effects = [], events = new EventEmitter();
let listener, stopping = false;
async function dispose() {
  if (stopping) return; stopping = true;
  events.emit('dispose');
  for (const off of effects.reverse()) try { await off(); } catch {}
  listener?.close(); process.exit(0);
}
process.once('SIGTERM', () => { void dispose(); });
process.once('disconnect', () => { void dispose(); });
const webRuntime = { trustedHosts: [] };
const capabilities = {
  webServer: { register(route) {
    if (!['exact', 'prefix'].includes(route.kind) || typeof route.handler !== 'function' ||
      typeof route.path !== 'string' || !route.path.startsWith('/') || ['', '/api'].includes(route.path.replace(/\/+$/, ''))) throw Error('Unsupported theme route');
    routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); };
  } },
  webRuntime,
  dshHomePath: () => input.home,
  profileContext: { home: input.home, dir: input.home, name: 'theme-service' },
  baseDir: input.home,
  appReady: { onReady(fn) { queueMicrotask(fn); return () => {}; } },
  connection: { requestRejection(req) { return req.headers['x-dtp-bridge'] === input.token ? undefined : 403; } },
};
const context = {
  ...capabilities,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  get(name) { return capabilities[name]; },
  inject(names, fn) {
    if (names.some(name => !capabilities[name])) return { dispose() {} };
    const off = fn(context);
    if (typeof off === 'function') effects.push(off);
    return { dispose() { if (typeof off === 'function') off(); } };
  },
  effect(fn) { const off = fn(); if (typeof off === 'function') effects.push(off); return off; },
  on(name, fn) { events.on(name, fn); const off = () => events.off(name, fn); effects.push(off); return off; },
};
try {
  await mkdir(input.home, { recursive: true });
  listener = createServer(async (req, res) => {
    if (req.headers['x-dtp-bridge'] !== input.token) { res.writeHead(403); res.end(); return; }
    const path = new URL(req.url, 'http://localhost').pathname;
    const route = routes.find(r => r.kind === 'exact' && path === r.path) ||
      routes.filter(r => r.kind === 'prefix' && path.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (!route) { res.writeHead(404); res.end(); return; }
    try { await route.handler(req, res); }
    catch (e) { if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  });
  await new Promise((done, fail) => { listener.once('error', fail); listener.listen(0, '127.0.0.1', done); });
  const port = listener.address().port;
  webRuntime.trustedHosts = [`127.0.0.1:${port}`, '127.0.0.1', `localhost:${port}`, 'localhost'];
  const mod = await import(pathToFileURL(input.entry).href), plugin = typeof mod.apply === 'function' ? mod : mod.default;
  if (typeof plugin?.apply !== 'function') throw Error('Theme backend has no apply entry');
  const required = Array.isArray(plugin.inject) ? plugin.inject : Object.entries(plugin.inject || {}).filter(([, spec]) => spec === true || (spec && spec.required !== false)).map(([name]) => name);
  const missing = required.filter(name => !context[name] && !capabilities[name]);
  if (missing.length) throw Error(`Theme backend requires unavailable host capabilities: ${missing.join(', ')}`);
  const off = await plugin.apply(context, input.config || {});
  if (typeof off === 'function') effects.push(off);
  process.stdout.write(JSON.stringify({ ready: true, port, routes: routes.map(({ kind, path }) => ({ kind, path })) }) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({ ready: false, error: e.message, code: e.code, resource: e.resource, stack: e.stack }) + '\n');
  listener?.close(); process.exitCode = 1;
}
