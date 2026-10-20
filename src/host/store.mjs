import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { atomic, json } from './files.mjs';
import { ThemeError, BUILTINS } from '../shared/protocol.mjs';
export class Library {
  constructor(root) { this.root = root; this.file = join(root, 'library.json'); this.queue = Promise.resolve(); }
  async initialize() {
    await mkdir(this.root, { recursive: true });
    this.state = await json(this.file, { version: 1, revision: 0, themes: [], issues: [], active: null, previous: null, pending: null });
    if (this.state.version !== 1 || !Array.isArray(this.state.themes)) throw new ThemeError('library-format', '主题库格式损坏；原文件已保留');
    if (this.state.pending) {
      const pending = this.state.pending;
      this.recoveredPending = pending;
      this.state.active = pending.previous || null; this.state.activeDigest = pending.previousDigest; this.state.pending = null;
      this.state.recovery = { id: pending.id, at: Date.now(), message: '上次主题启用未完成，已保留之前的可用外观。' };
      await atomic(this.file, this.state);
    }
  }
  async mutate(fn) {
    const run = this.queue.catch(() => {}).then(async () => {
      const next = structuredClone(this.state);
      const result = await fn(next);
      next.revision++;
      await atomic(this.file, next); this.state = next;
      return result ?? structuredClone(next);
    });
    this.queue = run; return run;
  }
  async snapshot() {
    await this.queue.catch(() => {});
    if (this.state.pending && this.state.pending.deadline < Date.now()) await this.fail(this.state.pending.token, '主题启用超时，已恢复之前的外观。');
    return structuredClone(this.state);
  }
  async add(theme) {
    return this.mutate(s => {
      const old = s.themes.find(x => x.id === theme.id);
      // Active revision remains readable until the caller explicitly activates its replacement.
      if (old) {
        let prior = old.digest === theme.digest ? old.previousRevision
          : old.digest === s.activeDigest || old.digest === s.previousDigest || !s.activeDigest ? old : old.previousRevision;
        if (prior?.digest === theme.digest) prior = prior.previousRevision;
        // Keep the active revision and one rollback revision while a newer
        // candidate is waiting. Reinstalling a candidate must not lose either.
        theme.previousRevision = prior ? { ...prior, previousRevision: prior.previousRevision ? { ...prior.previousRevision, previousRevision: undefined } : undefined } : undefined;
      }
      s.themes = [...s.themes.filter(x => x.id !== theme.id), theme];
      s.issues = s.issues.filter(x => x.id !== theme.id);
    });
  }
  async issue(issue) { return this.mutate(s => { s.issues = [issue, ...s.issues.filter(x => x.id !== issue.id)].slice(0, 80); }); }
  async begin(id, { startup = false } = {}) {
    return this.mutate(s => {
      if (s.pending && s.pending.deadline > Date.now()) throw new ThemeError('activation-busy', '另一个窗口正在切换主题，请稍后重试');
      if (!BUILTINS.some(t => t.id === id) && !s.themes.some(t => t.id === id && t.report?.ok)) throw new ThemeError('theme-unchecked', '主题未通过兼容检查');
      const token = randomUUID();
      if (!startup) s.upgrade = null;
      const previous = startup ? s.previous && (s.previous !== id || s.previousDigest && s.previousDigest !== s.activeDigest) ? s.previous : 'default' : s.active;
      const previousDigest = startup ? s.previousDigest : s.activeDigest || s.themes.find(t => t.id === previous)?.digest;
      const digest = startup && s.active === id && s.activeDigest ? s.activeDigest : s.themes.find(t => t.id === id)?.digest;
      s.pending = { token, id, digest, previous, previousDigest, deadline: Date.now() + 30000 };
      return { token, id, digest, previous, previousDigest };
    });
  }
  async commit(token) {
    return this.mutate(s => {
      if (!s.pending || s.pending.token !== token || s.pending.deadline < Date.now()) throw new ThemeError('activation-expired', '主题切换请求已过期');
      s.previous = s.pending.previous; s.previousDigest = s.pending.previousDigest;
      s.active = s.pending.id; s.activeDigest = s.pending.digest; s.pending = null; s.recovery = null;
    });
  }
  async fail(token, message) {
    return this.mutate(s => {
      if (!s.pending || s.pending.token !== token) return;
      s.active = s.pending.previous; s.activeDigest = s.pending.previousDigest;
      s.recovery = { id: s.pending.id, at: Date.now(), message }; s.pending = null;
    });
  }
  async remove(id) {
    return this.mutate(s => {
      if (s.pending) throw new ThemeError('activation-busy', '切换完成后再移除主题');
      if (s.active === id) s.active = 'default';
      s.themes = s.themes.filter(t => t.id !== id); s.issues = s.issues.filter(t => t.id !== id);
    });
  }
}
