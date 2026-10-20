import { Inject, isConstructor } from '@deepseek-ai/cordis';
import { ThemeConfigEntries } from './config-entries.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { digest, ownedFile } from './files.mjs';
import { API, ThemeError } from '../shared/protocol.mjs';
import { hostRequire, hostModule } from './host-modules.mjs';

function hostAccess(plugin, lifecycle) {
  const callback = typeof plugin === 'function' ? plugin : plugin.apply;
  if (typeof callback !== 'function') return plugin;
  const views = new WeakMap();
  const view = context => {
    if (views.has(context)) return views.get(context);
    const service = (name, value) => {
      if (name !== 'connection' || !value) return value;
      // The real Connection service normally derives the route owner from a
      // Cordis shadow. Our isolated webServer needs the actual theme context.
      // Keep the native registries, admission checks and RPC codec unchanged.
      return new Proxy(value, { get(target, key) {
        if (key === 'rpc' && typeof target.register === 'function') return {
          handle: (channel, handler) => target.register(proxy, channel, handler),
          intercept: (channel, matches, handler) => target.registerInterceptor(proxy, channel, matches, handler),
        };
        if (key === 'fetch' && typeof target.registerFetchRoute === 'function') return {
          register: route => target.registerFetchRoute(proxy, route),
        };
        const item = Reflect.get(target, key, target);
        return typeof item === 'function' ? item.bind(target) : item;
      } });
    };
    const proxy = new Proxy(context, { get(target, key) {
      if (key === 'get') return name => service(name, target.get(name));
      if (key === 'inject') return (names, apply) => target.inject(names, (child, ...args) => apply(view(child), ...args));
      if (key === 'on') return (event, callback, ...args) => {
        if (event === 'webserver/index-inject') lifecycle.requiresReload = true;
        if (event !== 'dispose') return target.on(event, callback, ...args);
        let pending = true;
        target.effect(() => () => { if (pending) { pending = false; return callback(); } });
        return () => { pending = false; };
      };
      if (key === 'plugin') return (child, ...args) => target.plugin(hostAccess(child, lifecycle), ...args);
      try { const value = service(key, Reflect.get(target, key, target)); return typeof value === 'function' ? value.bind(target) : value; }
      catch (error) {
        // Optional property access must not invent a service. Read the actual
        // current host value; a missing required inject still fails earlier.
        if (typeof key === 'string' && error.message.startsWith(`cannot get property "${key}" without inject`)) return service(key, target.get(key));
        throw error;
      }
    } });
    views.set(context, proxy); return proxy;
  };
  if (isConstructor(plugin)) {
    const adapted = class extends plugin { constructor(context, config) { super(view(context), config); } };
    Object.defineProperty(adapted, 'name', { value: plugin.name });
    return adapted;
  }
  return { ...plugin, name: plugin.name, inject: plugin.inject, Config: plugin.Config,
    apply(context, config) { return callback.call(plugin, view(context), config); } };
}

// Themes are DSH plugins. Their host half uses a real, disposable Cordis child
// and the host's own services; no reimplementation of settings, tools or RPC.
// The same code is first run in the disposable DSH preflight profile.
export class NativeThemeBackends {
  constructor(ctx, root, { cli } = {}) {
    this.ctx = ctx; this.root = root; this.cli = cli;
    this.configs = new ThemeConfigEntries(ctx, join(root, 'config'), hostRequire(cli));
    this.running = new Map(); this.pending = Promise.resolve(); this.closed = false;
  }
  async start(theme) {
    if (!theme?.backend) return;
    const key = `${theme.id}/${theme.digest}`;
    if (this.running.has(key)) return this.running.get(key);
    const operation = this.pending.catch(() => {}).then(async () => {
      if (this.closed) throw new ThemeError('backend-cancelled', '主题后台已关闭');
      if (this.running.get(key) !== operation) throw new ThemeError('backend-cancelled', '主题后台启动已取消');
      if (this.active && this.active.key !== key) {
        const previous = this.active; this.active = null;
        this.running.delete(previous.key); await previous.value.dispose();
      }
      const value = await this.launch(theme);
      if (this.closed || this.running.get(key) !== operation) { await value.dispose(); throw new ThemeError('backend-cancelled', '主题后台启动已取消'); }
      this.active = { key, value }; return value;
    }).catch(error => { if (this.running.get(key) === operation) this.running.delete(key); throw error; });
    this.running.set(key, operation); this.pending = operation;
    return operation;
  }
  async launch(theme) {
    for (const [name, hash] of Object.entries(theme.files || {})) {
      if (digest(await readFile(await ownedFile(theme.root, name))) !== hash) throw new ThemeError('resource-changed', '主题文件在检查后发生变化，请重新安装');
    }
    const folder = join(this.root, theme.id, theme.digest);
    await mkdir(folder, { recursive: true });
    const file = join(folder, 'backend.mjs'), url = pathToFileURL(file).href;
    await writeFile(file, `import {createRequire as __dtpRequire} from "node:module";\nimport {fileURLToPath as __dtpFileUrlToPath} from "node:url";\n` +
      `const require=__dtpRequire(import.meta.url),__dtpThemeRoot=${JSON.stringify(pathToFileURL(resolve(theme.root) + '/').href)};\n` +
      theme.backend.code, { mode: 0o600 });
    const req = hostRequire(this.cli);
    const hostDependencies = new Set();
    for (const dependency of theme.backend.hostDependencies || []) {
      const current = hostModule(req, dependency.name);
      if (current.version !== dependency.version) throw new ThemeError('host-dependency', `宿主依赖 ${dependency.name} 已变化，需要重新检查主题`);
      hostDependencies.add(dependency.name);
    }
    const hook = registerHooks({ resolve(specifier, context, next) {
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (context.parentURL?.split('?')[0] === url && (specifier.startsWith('@deepseek-ai/') || hostDependencies.has(name))) {
        return { url: pathToFileURL(req.resolve(specifier)).href, shortCircuit: true };
      }
      return next(specifier, context);
    } });
    let fiber, managedConfig, cancelled = false;
    const dispose = async () => {
      if (cancelled) return; cancelled = true;
      try { await managedConfig?.dispose(); await fiber?.dispose(); } finally { hook.deregister(); }
    };
    try {
      const mod = await import(url), originalPlugin = typeof mod.apply === 'function' ? mod : mod.default;
      const plugin = originalPlugin && hostAccess(originalPlugin, theme.backend);
      // Current DSH's connection routes also consult webServer on the calling
      // fiber. Both transports belong to the managed scope already.
      if (plugin) Object.defineProperty(plugin, 'inject', { configurable: true, writable: true,
        value: Inject.resolve(['webServer', 'connection'], Inject.resolve(theme.backend.profileInject, Inject.resolve(plugin.inject))) });
      if (typeof plugin !== 'function' && typeof plugin?.apply !== 'function') throw new ThemeError('backend-entry', '主题后台没有 apply 入口');
      const required = Object.keys(Inject.resolve(plugin.inject));
      const missing = required.filter(name => this.ctx.get(name) === undefined);
      if (missing.length) throw new ThemeError('host-capability', `主题需要当前 DSH 未提供的服务：${missing.join('、')}`);
      let child, scope;
      fiber = this.ctx.plugin({ name: `theme-backend-${theme.id}`, inject: ['webServer', 'connection'], apply(owner) {
        const server = owner.webServer, connection = owner.connection;
        owner.fiber.entry = undefined;
        scope = owner.isolate('webServer');
        const facade = {};
        for (let proto = server; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
          for (const key of Object.getOwnPropertyNames(proto)) {
            if (key === 'constructor' || key === 'ctx' || key in facade) continue;
            const value = server[key];
            if (typeof value === 'function') facade[key] = (...args) => {
              if (key === 'tapIndex') theme.backend.requiresReload = true;
              if (key === 'registerFallback') throw new ThemeError('backend-route', '主题不能替换宿主的页面服务');
              const result = value.apply(server, args);
              if (!['tapIndex', 'registerUpgrade'].includes(key) || typeof result !== 'function') return result;
              let owned = true;
              const once = () => { if (owned) { owned = false; return result(); } };
              owner.effect(() => once); return once;
            };
            else Object.defineProperty(facade, key, { enumerable: true, get: () => server[key] });
          }
        }
        facade.register = route => {
            if (route.path === API || route.path?.startsWith(API + '/') || ['/', '/api', '/api/', '/plugins/', '/assets/'].includes(route.path)) {
              throw new ThemeError('backend-route', '主题占用了宿主或主题管理的保留路径');
            }
            const handler = route.handler;
            const release = server.register({ ...route, handler(req, res) {
              const rejected = connection.requestRejection(req);
              if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
              return handler(req, res);
            } });
            let owned = true;
            const once = () => { if (owned) { owned = false; return release?.(); } };
            owner.effect(() => once);
            return once;
          };
        scope.provide('webServer', facade);
      } });
      let timer;
      const ready = (async () => {
        // Providers become available once their owning fiber is active. Do
        // not wait for their consumers inside the provider's apply().
        await fiber;
        if (fiber._error) throw fiber._error;
        if (!scope) throw new ThemeError('host-capability', '主题后台宿主依赖未就绪');
        if (plugin.Config?.toJSON) {
          managedConfig = await this.configs.create(theme, scope, plugin);
          scope = scope.isolate('loader');
          scope.provide('loader', managedConfig.facade);
          managedConfig.entry.parent.ctx = scope;
          managedConfig.entry.parent.tree.ctx = scope;
          managedConfig.entry._patchContext([]);
          child = managedConfig.entry.ctx.plugin(plugin, managedConfig.entry.options.config);
          managedConfig.entry.fiber = child.ctx.fiber;
          managedConfig.entry.moduleNamespace = mod;
        } else child = scope.plugin(plugin, theme.backend.defaultConfig || {});
        await child;
        while (child.state === 0 || child.state === 1) {
          if (cancelled) throw new ThemeError('backend-cancelled', '主题后台已取消');
          await new Promise(done => setTimeout(done, 10));
        }
        if (child._error) throw child._error;
        if (child.state !== 2) throw new ThemeError('backend-start', '主题后台未能启用');
        await new Promise(done => setImmediate(done));
      })();
      try { await Promise.race([ready, new Promise((_, fail) => { timer = setTimeout(() => fail(new ThemeError('backend-timeout', '主题后台初始化超时')), 12000); })]); }
      finally { clearTimeout(timer); }
      if (this.closed) throw new ThemeError('backend-cancelled', '主题后台已关闭');
      this.ctx.get('settings')?.invalidate();
      return { dispose, configEntry: managedConfig?.entry };
    } catch (error) { await dispose(); throw error; }
  }
  retain(themes) {
    const keys = new Set(themes.filter(Boolean).map(t => `${t.id}/${t.digest}`));
    const pending = [];
    for (const [key, operation] of this.running) if (!keys.has(key)) {
      if (this.active?.key === key) this.active = null;
      this.running.delete(key); pending.push(operation.then(value => value.dispose(), () => {}));
    }
    return Promise.all(pending);
  }
  async dispose() { this.closed = true; try { await this.retain([]); } finally { this.configs.dispose(); } }
}
