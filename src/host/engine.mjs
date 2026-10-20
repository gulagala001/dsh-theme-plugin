import { mkdir, readdir, readFile, writeFile, rename, cp, stat, rm } from 'node:fs/promises';
import { join, resolve, basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Library } from './store.mjs';
import { Market } from './market.mjs';
import { acquire, candidates, extract, copyLocal, publishedFallback } from './packages.mjs';
import { inspectTheme } from './formats.mjs';
import { preflight, resolveCli } from './probe.mjs';
import { atomic, digest, exists, json, inside, ownedFile } from './files.mjs';
import { HOST_VERSION, VERSION, ThemeError, repairTask } from '../shared/protocol.mjs';
import { needsRecheck, needsRuntimeProbe, isHostThemeService, isNativeThemeController } from '../shared/host-contract.mjs';
import { ThemeBackends } from './theme-backend.mjs';
export const publicTheme = theme => {
  if (!theme) return null;
  const { root, files, previousRevision, ...rest } = theme;
  if (rest.client) { const { factory, code, ...client } = rest.client; rest.client = client; }
  return rest;
};
export class ThemeEngine {
  constructor(ctx, root, { probe } = {}) {
    this.ctx = ctx; this.root = root; this.library = new Library(root); this.market = new Market(root);
    this.operations = new Map(); this.pendingThemes = new Map(); this.probe = probe; this.cli = resolveCli(ctx);
    this.controller = new AbortController();
    const server = ctx.get('webServer'), connection = ctx.get('connection');
    this.backends = new ThemeBackends(join(root, 'backends'), {
      cli: this.cli,
      register: server ? route => server.register(route) : undefined,
      authorize: connection ? request => connection.requestRejection(request) : undefined,
    });
  }
  async initialize() {
    await this.library.initialize();
    if (this.probe) { this.pendingThemes.set(this.probe.id, this.probe); return; }
    const hostEntries = this.library.state.themes.filter(t => isHostThemeService(t.linked?.packageName || t.linked?.name)).map(t => t.id);
    if (hostEntries.length) await this.library.mutate(s => {
      s.themes = s.themes.filter(t => !hostEntries.includes(t.id));
      if (hostEntries.includes(s.active)) { s.active = null; s.activeDigest = undefined; }
      if (hostEntries.includes(s.previous)) { s.previous = null; s.previousDigest = undefined; }
    });
    // Native inventory can wait for the Host Loader (including this plugin)
    // while auditing restored agent presets. Never await it during apply().
    this.initialization = new Promise(resolve => {
      this.resolveInitialization = resolve;
      const start = () => queueMicrotask(() => {
        if (this.controller.signal.aborted) { resolve(); return; }
        void this.initializeNative().catch(e => {
          if (!this.controller.signal.aborted) this.discoveryError = e.message;
        }).finally(resolve);
      });
      const ready = this.ctx.get('appReady');
      if (ready?.onReady) this.offReady = ready.onReady(start);
      else void Promise.resolve().then(() => this.ctx.get('loader')?.await()).then(start).catch(e => {
        this.discoveryError = e.message; resolve();
      });
    });
  }
  async initializeNative() {
    this.controller.signal.throwIfAborted();
    if (this.library.recoveredPending) {
      const pending = this.library.recoveredPending;
      try { await this.restoreLinked(this.theme(pending.previous), this.theme(pending.id)); }
      catch (e) { this.discoveryError = `原生主题恢复需要处理：${e.message}`; }
    }
    this.controller.signal.throwIfAborted();
    await this.discover({ local: false }).catch(e => { this.discoveryError = e.message; });
    this.controller.signal.throwIfAborted();
    await this.prepareRevalidation();
    this.controller.signal.throwIfAborted();
    this.discovery = this.discover().catch(e => { this.discoveryError = e.message; });
  }
  async prepareRevalidation() {
    const stale = this.library.state.themes.filter(t => needsRecheck(t));
    if (!stale.length) return;
    await this.library.mutate(s => {
      for (const t of s.themes) if (stale.some(x => x.id === t.id)) t.report = { ...t.report, ok: false, stage: 'host-recheck-required' };
      if (stale.some(t => t.id === s.active)) {
        s.upgrade = { id: s.active, digest: s.activeDigest };
        s.active = 'default'; s.activeDigest = undefined;
        s.recovery = { message: '正在重新检查当前主题的兼容性，主题与设置已保留。', at: Date.now() };
      }
    });
    this.revalidating = true;
    this.revalidation = (async () => {
      for (const old of stale) {
        if (this.controller.signal.aborted) break;
        try {
          const theme = await inspectTheme(old.entryFile ? join(old.root, old.entryFile) : old.root, { id: old.id, source: old.source, name: old.name });
          this.controller.signal.throwIfAborted();
          await this.commitCandidate(theme, () => {});
          await this.library.mutate(s => {
            if (s.upgrade?.id === theme.id && s.active === 'default') { s.active = theme.id; s.activeDigest = theme.digest; s.recovery = null; }
            if (s.upgrade?.id === theme.id) s.upgrade = null;
          });
        } catch (e) {
          await this.library.issue({ id: old.id, name: old.name, at: Date.now(), message: e.message, code: e.code || 'host-recheck',
            repair: repairTask({ theme: old, error: e, report: e.details || {} }) });
        }
      }
    })().catch(e => { this.discoveryError = e.message; }).finally(() => { this.revalidating = false; });
  }
  async state() {
    await this.initialization;
    this.controller.signal.throwIfAborted();
    if (this.library.state.pending?.deadline < Date.now()) await this.fail(this.library.state.pending.token, '主题启用超时，已恢复之前的外观。');
    const state = await this.library.snapshot();
    await this.backends.start(this.probe || this.theme(state.active, state.activeDigest));
    return { ...state, themes: state.themes.map(publicTheme), activeTheme: publicTheme(this.theme(state.active, state.activeDigest)), version: VERSION, hostVersion: HOST_VERSION,
      discoveryError: this.discoveryError, discovering: !!this.discovering, revalidating: !!this.revalidating, probe: this.probe ? publicTheme(this.probe) : null };
  }
  start(task, metadata) {
    const id = randomUUID(), operation = { id, state: 'running', phase: '准备主题', startedAt: Date.now(), ...metadata };
    this.operations.set(id, operation);
    void (async () => {
      try { operation.result = await task(value => { operation.phase = value; }); operation.state = 'done'; }
      catch (error) {
        const failure = { code: error.code || 'install-failed', message: error.message, stage: error.details?.stage || operation.phase };
        const report = { ...error.details, stage: failure.stage };
        const theme = error.details?.theme || metadata?.theme || {};
        operation.error = { ...failure, report, repair: repairTask({ theme, error: failure, report }) };
        operation.state = 'failed';
        await this.library.issue({ id: theme.id || id, name: theme.name || '导入的主题', at: Date.now(), ...operation.error }).catch(() => {});
      } finally {
        operation.finishedAt = Date.now();
        for (const [key, old] of this.operations) if (old.finishedAt && Date.now() - old.finishedAt > 60 * 60 * 1000) this.operations.delete(key);
      }
    })();
    return { id };
  }
  async installEntry(entry, progress) {
    const staging = join(this.root, 'staging', randomUUID());
    try {
    progress('下载主题与资源');
    const acquired = await acquire(entry, staging, { signal: this.controller.signal });
    const options = await candidates(acquired.root, entry);
    if (!options.length) throw new ThemeError('theme-format', '下载内容中没有可识别的主题；原包未进入 DSH 启动链路');
    const installed = [];
    for (const folder of options) {
      progress('检查主题格式、依赖与资源');
      const meta = { ...entry, id: options.length === 1 ? entry.id : `${entry.id}-${digest(folder.slice(acquired.root.length)).slice(0, 8)}`, source: acquired.source };
      let theme, published;
      try { theme = await inspectTheme(folder, meta); }
      catch (error) {
        if (!['client-build', 'client-entry-missing', 'client-syntax', 'client-format', 'client-import'].includes(error.code)) throw error;
        progress('获取同作者、同版本的完整发行包');
        published = await publishedFallback(folder, join(staging, 'published', meta.id), { signal: this.controller.signal }).catch(() => null);
        if (!published) throw error;
        theme = await inspectTheme(published.root, { ...meta, source: { ...published.source, original: acquired.source } });
      }
      if (theme.client?.build && !published) {
        progress('核对完整发行包');
        published = await publishedFallback(folder, join(staging, 'published', meta.id), { signal: this.controller.signal }).catch(() => null);
        if (published) theme = await inspectTheme(published.root, { ...meta, source: { ...published.source, original: acquired.source } });
      }
      try { installed.push(await this.commitCandidate(theme, progress)); }
      catch (error) {
        if (error.code !== 'probe-failed' || published) throw error;
        progress('使用同作者同版本发行包重新检查');
        published = await publishedFallback(folder, join(staging, 'published', meta.id), { signal: this.controller.signal }).catch(() => null);
        if (!published) throw error;
        const complete = await inspectTheme(published.root, { ...meta, source: { ...published.source, original: acquired.source } });
        installed.push(await this.commitCandidate(complete, progress));
      }
    }
    return { themes: installed.map(publicTheme) };
    } finally { await rm(staging, { recursive: true, force: true }).catch(() => {}); }
  }
  async commitCandidate(theme, progress) {
    this.controller.signal.throwIfAborted();
    this.pendingThemes.set(theme.id, theme);
    try {
      progress(needsRuntimeProbe(theme) ? '在隔离 DSH 中验证加载与切换' : '校验完成，保存主题');
      theme.report = await preflight(theme, { root: this.root, cli: this.cli, signal: this.controller.signal, progress });
      this.controller.signal.throwIfAborted();
      const target = join(this.root, 'themes', theme.id, theme.digest);
      if (!await exists(target)) {
        const temporary = target + '.install-' + randomUUID();
        await mkdir(temporary, { recursive: true });
        try {
          for (const [name, hash] of Object.entries(theme.files)) {
            const bytes = await readFile(await ownedFile(theme.root, name));
            if (digest(bytes) !== hash) throw new ThemeError('resource-changed', '主题文件在检查后发生变化，未安装');
            const path = inside(temporary, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { mode: 0o600 });
          }
          await rename(temporary, target);
        } finally { await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
      } else {
        for (const [name, hash] of Object.entries(theme.files)) if (digest(await readFile(await ownedFile(target, name))) !== hash) throw new ThemeError('installed-resource-changed', '已存主题资源发生变化，请先移除该主题后重新安装');
      }
      theme.root = target; theme.installedAt = Date.now();
      await this.library.add(theme);
      return theme;
    } catch (e) {
      e.details = { ...e.details, theme: { id: theme.id, name: theme.name, version: theme.version, format: theme.format, digest: theme.digest, source: theme.source }, compatibility: theme.report };
      throw e;
    } finally { this.pendingThemes.delete(theme.id); }
  }
  async importData({ name, data }, progress) {
    if (typeof data !== 'string' || data.length > 110 * 1024 * 1024) throw new ThemeError('import-size', '导入文件过大');
    const bytes = Buffer.from(data, 'base64'), staging = join(this.root, 'staging', randomUUID());
    try {
    await mkdir(staging, { recursive: true });
    let list;
    if (/\.json$/i.test(name || '')) { const path = join(staging, 'theme.json'); await writeFile(path, bytes); list = [path]; }
    else { const unpacked = await extract(bytes, staging); list = await candidates(unpacked.root); }
    if (!list.length) throw new ThemeError('theme-format', '导入文件没有可识别的主题');
    const installed = [];
    for (const path of list) {
      progress('检查导入主题');
      const theme = await inspectTheme(path, { source: { spec: `local:${name}`, url: '', resolved: digest(bytes) } });
      installed.push(await this.commitCandidate(theme, progress));
    }
    return { themes: installed.map(publicTheme) };
    } finally { await rm(staging, { recursive: true, force: true }).catch(() => {}); }
  }
  async discover({ local = true } = {}) {
    this.discovering = true;
    try {
      const homeValue = this.ctx.get('dshHomePath');
      const home = this.ctx.get('profileContext')?.home || (typeof homeValue === 'function' ? homeValue() : homeValue);
      const profile = this.ctx.get('profileContext')?.dir;
      const roots = [];
      const manager = this.ctx.get('pluginManager');
      const bundles = manager ? await manager.listBundles().catch(() => []) : [];
      this.controller.signal.throwIfAborted();
      for (const bundle of bundles) {
        if (!bundle.installed || bundle.official || isHostThemeService(bundle.name) || (!isNativeThemeController(bundle.name) && /dsh-theme-plugin|manager|market|center|gallery/.test(bundle.name)) || !profile) continue;
        const path = join(profile, 'node_modules', bundle.name);
        if (!await exists(path)) continue;
        const pkg = await json(join(path, 'package.json'), {}).catch(() => ({}));
        if (/theme|skin|wallpaper|aqua|catppuccin/i.test(bundle.name + ' ' + pkg.description) || await exists(join(path, 'skin.json'))) roots.push({ path, bundle });
      }
      const entries = manager?.listPlugins ? await manager.listPlugins().catch(() => []) : [];
      this.controller.signal.throwIfAborted();
      const bundleEntries = new Set(bundles.filter(b => roots.some(r => r.bundle === b)).flatMap(b => (b.rows || []).map(r => r.entryId)));
      for (const entry of entries) {
        if (!profile || bundleEntries.has(entry.entryId) || isHostThemeService(entry.moduleName) || !/theme|skin|wallpaper|aqua|catppuccin/i.test(entry.moduleName) || (!isNativeThemeController(entry.moduleName) && /manager|market|center|gallery|dsh-theme-plugin/.test(entry.moduleName))) continue;
        try {
          const modulePath = entry.moduleName.startsWith('file:') ? fileURLToPath(entry.moduleName)
            : createRequire(join(profile, 'package.json')).resolve(entry.moduleName);
          let folder = dirname(modulePath);
          for (let depth = 0; depth < 8 && !await exists(join(folder, 'package.json')); depth++) folder = dirname(folder);
          if (await exists(join(folder, 'package.json')) && !roots.some(r => r.path === folder)) roots.push({ path: folder, entry });
        } catch {}
      }
      if (local && home && await exists(join(home, 'skins'))) for (const entry of await readdir(join(home, 'skins'), { withFileTypes: true })) if (entry.isDirectory()) roots.push({ path: join(home, 'skins', entry.name) });
      for (const source of roots) {
        this.controller.signal.throwIfAborted();
        const id = 'discovered-' + digest(source.bundle?.name || source.entry?.entryId || source.path).slice(0, 24);
        if (this.library.state.themes.some(x => x.id === id)) {
          if (this.library.state.active === null && (source.bundle || source.entry)?.enabled) await this.library.mutate(s => { s.active = id; });
          continue;
        }
        try {
          let theme;
          if (source.bundle || source.entry) {
            // Existing plugin code is already managed by the native loader. Do
            // not execute a second copy, copy its user data, or reinstall it.
            const pkg = await json(join(source.path, 'package.json')), skin = await json(join(source.path, 'skin.json'), {});
            if (isHostThemeService(pkg.name)) continue;
            const original = source.bundle || source.entry, name = source.bundle?.name || source.entry.moduleName;
            theme = { id, root: source.path, files: {}, digest: digest(name + pkg.version), format: 'native-linked',
              originalId: skin.id || pkg.name, name: isNativeThemeController(pkg.name) ? 'Skin Center 当前主题' : skin.name || pkg.name,
              description: isNativeThemeController(pkg.name) ? '沿用 Skin Center 当前选择的主题和设置。' : skin.description || pkg.description, version: pkg.version,
              source: { spec: source.bundle?.source || 'existing-local', resolved: pkg.version }, linked: { name, packageName: pkg.name, enabled: original.enabled, entryId: source.entry?.entryId, readOnly: source.entry?.readOnlyReason },
              report: { ok: true, stage: 'existing-plugin', runtime: 'native-managed', note: '已安装主题，由 DSH 原生管理；不代表已完成独立转包验证。' } };
            await this.library.add(theme);
            if (original.enabled && this.library.state.active === null) await this.library.mutate(s => { s.active = id; });
          } else {
            theme = await inspectTheme(source.path, { id, source: { spec: 'existing-local', resolved: '' } });
            await this.commitCandidate(theme, () => {});
          }
        } catch (e) {
          const error = { code: e.code || 'discovery', message: e.message };
          await this.library.issue({ id, name: source.bundle?.name || basename(source.path), at: Date.now(), ...error,
            repair: repairTask({ theme: { name: source.bundle?.name || basename(source.path) }, error, report: e.details || {} }) });
        }
      }
    } finally { this.discovering = false; }
  }
  theme(id, hash) {
    const value = this.pendingThemes.get(id) || this.library.state.themes.find(t => t.id === id);
    if (value?.digest === hash || !hash) return value;
    for (let revision = value?.previousRevision; revision; revision = revision.previousRevision) if (revision.digest === hash) return revision;
    return null;
  }
  async activate(id, { startup = false } = {}) {
    const candidate = await this.library.begin(id, { startup });
    try { await this.backends.start(this.theme(id, candidate.digest)); }
    catch (e) { await this.fail(candidate.token, e.message); throw e; }
    candidate.theme = publicTheme(this.theme(id, candidate.digest));
    candidate.previousTheme = publicTheme(this.theme(candidate.previous, candidate.previousDigest));
    if (startup) return candidate;
    const theme = this.theme(id), previous = this.theme(candidate.previous);
    try {
      if (previous?.linked && previous.id !== id) {
        await this.toggleLinked(previous, false);
      }
      if (theme?.linked) await this.toggleLinked(theme, true);
      return candidate;
    } catch (e) {
      await this.fail(candidate.token, e.message); throw e;
    }
  }
  async toggleLinked(theme, enabled) {
    if (!theme?.linked) return;
    const manager = this.ctx.get('pluginManager'), linked = theme.linked;
    if (isHostThemeService(linked.packageName || linked.name)) throw new ThemeError('host-service', 'DSH 的主题运行服务不是可切换皮肤，不能停用');
    if (!manager || linked.readOnly) throw new ThemeError('native-manager', '宿主暂不能修改这个原生主题的启用状态，已保留当前外观');
    const result = linked.entryId ? await manager.setPluginEnabled(linked.entryId, enabled) : await manager.setBundleEnabled(linked.name, enabled);
    if (result.application === 'restart-required') throw new ThemeError('restart-required', '该原生主题需要重启 DSH 才能切换，当前切换已撤回');
    if (result.application !== 'applied') throw new ThemeError('native-switch', '原生主题切换未成功', { result });
  }
  async restoreLinked(previous, candidate) {
    const errors = [];
    if (candidate?.linked && candidate.id !== previous?.id) try { await this.toggleLinked(candidate, false); } catch (e) { errors.push(e.message); }
    if (previous?.linked) try { await this.toggleLinked(previous, true); } catch (e) { errors.push(e.message); }
    if (errors.length) throw Error(errors.join('；'));
  }
  async fail(token, message) {
    if (this.library.state.pending?.token !== token) return;
    const previous = this.theme(this.library.state.pending?.previous, this.library.state.pending?.previousDigest), candidate = this.theme(this.library.state.pending?.id, this.library.state.pending?.digest);
    try { await this.restoreLinked(previous, candidate); } catch (e) { message += `；原生主题恢复：${e.message}`; }
    const result = await this.library.fail(token, message);
    this.backends.retain([previous]);
    return result;
  }
  async commit(token) {
    await this.library.commit(token);
    this.backends.retain([this.theme(this.library.state.active, this.library.state.activeDigest)]);
  }
  dispose() { this.offReady?.(); this.controller.abort(); this.resolveInitialization?.(); this.backends.dispose(); }
}
