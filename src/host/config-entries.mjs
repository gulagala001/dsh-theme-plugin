import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atomic, json } from './files.mjs';
import { ThemeError } from '../shared/protocol.mjs';

const OWNER = Symbol.for('dsh-theme-plugin/config-entries');

// Current DSH derives its settings UI from ConfigEditor entries. Add managed
// entries to that projection, retaining the native schema, validation,
// redaction, revision checks and volatile-update implementation.
export class ThemeConfigEntries {
  constructor(ctx, directory, host) { this.ctx = ctx; this.directory = directory; this.host = host; this.entries = new Map(); }
  install() {
    if (this.editor) return;
    const editor = this.ctx.get('configEditor');
    if (!editor || !this.ctx.get('settings')) throw new ThemeError('host-settings', '当前 DSH 未提供主题配置条目接口');
    if (editor[OWNER] && editor[OWNER] !== this) throw new ThemeError('host-settings', '已有主题配置管理器正在使用此宿主');
    const methods = ['entries', 'configuration', 'edit'];
    const prior = Object.fromEntries(methods.map(key => [key, { descriptor: Object.getOwnPropertyDescriptor(editor, key), method: editor[key] }]));
    if (methods.some(key => typeof prior[key].method !== 'function')) throw new ThemeError('host-settings', 'DSH 配置接口发生变化，请更新主题管理插件');
    const manager = this;
    const wrappers = {
      entries(...args) { return [...prior.entries.method.apply(this, args), ...[...manager.entries.values()].map(x => x.entry)]; },
      configuration(...args) {
        const managed = new Set([...manager.entries.values()].map(x => x.entry));
        return [...prior.configuration.method.apply(this, args).filter(x => !managed.has(x.entry)), ...[...manager.entries.values()].map(x => ({
          entry: x.entry, inherited: structuredClone(x.defaults), override: structuredClone(x.entry.options.config || {}),
        }))];
      },
      edit(entry, change) {
        const record = [...manager.entries.values()].find(x => x.entry === entry);
        if (!record) return prior.edit.method.call(this, entry, change);
        record.writing = record.writing.catch(() => {}).then(async () => {
          if (manager.entries.get(record.id) !== record || entry.fiber?.state !== 2) throw new ThemeError('theme-inactive', '主题已停用，设置未写入');
          const previous = structuredClone(entry.options.config || {}), next = change(previous, structuredClone(record.defaults));
          const { resolveConfig } = await import(pathToFileURL(manager.host.resolve('@deepseek-ai/cordis')).href);
          resolveConfig(entry.fiber.runtime, entry.fiber.ctx.waterfall(entry.fiber, 'internal/config', next, () => next));
          try {
            await entry.update({ config: next }); await entry.fiber.await();
            if (entry.fiber._error) throw entry.fiber._error;
            await atomic(record.file, next);
          } catch (error) {
            await entry.update({ config: previous }); await entry.fiber.await(); throw error;
          }
        });
        return record.writing;
      },
    };
    for (const key of methods) Object.defineProperty(editor, key, { configurable: true, writable: true, value: wrappers[key] });
    Object.defineProperty(editor, OWNER, { configurable: true, value: this });
    this.editor = editor; this.prior = prior; this.wrappers = wrappers;
  }
  async create(theme, scope, plugin) {
    this.install();
    const { Entry } = await import(pathToFileURL(this.host.resolve('@deepseek-ai/cordis-plugin-loader')).href);
    const loader = this.ctx.get('loader');
    if (!loader) throw new ThemeError('host-settings', 'DSH Loader 未就绪');
    const file = join(this.directory, theme.id + '.json');
    const defaults = theme.backend.defaultConfig || {}, saved = await json(file, defaults);
    const requested = theme.backend.profileEntryId || theme.packageName || theme.id;
    const id = this.editor.entries().some(x => x.options.id === requested) ? `dtp-${theme.id}` : requested;
    const entry = new Entry(loader);
    // A managed row has its own data file; it is never written into the user's
    // startup profile or inserted into the root Loader tree.
    entry.parent = { ctx: scope, tree: { ctx: scope, write() {}, import: async () => plugin } };
    entry.options = { id, name: theme.packageName, inject: ['loader'], config: saved };
    // Preserve the context initialized by Entry: Loader installs independent
    // isolation/interception maps there for later native config updates.
    const record = { id, entry, defaults, file, writing: Promise.resolve() };
    this.entries.set(id, record);
    const originalLoader = loader;
    const facade = {};
    for (let proto = loader; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor' || key in facade) continue;
        const value = loader[key];
        if (typeof value === 'function') facade[key] = value.bind(loader);
        else Object.defineProperty(facade, key, { get: () => loader[key] });
      }
    }
    facade.entries = function* () { yield* originalLoader.entries(); yield entry; };
    facade.resolve = id => id === entry.id || id === entry.options.id ? entry : originalLoader.resolve(id);
    facade.locate = (fiber = entry.fiber) => originalLoader.locate(fiber);
    return { entry, facade, key: Entry.key,
      dispose: async () => {
        await record.writing.catch(() => {});
        if (this.entries.get(id) === record) this.entries.delete(id);
        this.ctx.get('settings')?.invalidate();
      } };
  }
  dispose() {
    if (!this.editor) return;
    for (const [key, original] of Object.entries(this.prior)) {
      if (Object.getOwnPropertyDescriptor(this.editor, key)?.value !== this.wrappers[key]) continue;
      if (original.descriptor) Object.defineProperty(this.editor, key, original.descriptor);
      else delete this.editor[key];
    }
    if (this.editor[OWNER] === this) delete this.editor[OWNER];
    this.entries.clear(); this.editor = null;
  }
}
