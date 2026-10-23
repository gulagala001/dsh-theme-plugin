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
      // A process restart invalidates confirmation, but only the engine can
      // restore native plugins and retire this receipt after recovery succeeds.
      this.state.pending.deadline = 0;
      this.state.revision++;
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
    return structuredClone(this.state);
  }
  async add(theme) {
    return this.mutate(s => {
      const old = s.themes.find(x => x.id === theme.id);
      // Active revision remains readable until the caller explicitly activates its replacement.
      if (old) {
        // Pin every revision referenced by selection, rollback or an in-flight
        // switch. Unpublished installation candidates never become readable.
        const retained = new Set([
          s.active === theme.id && s.activeDigest,
          s.previous === theme.id && s.previousDigest,
          s.pending?.id === theme.id && s.pending.digest,
          s.pending?.previous === theme.id && s.pending.previousDigest,
          !s.activeDigest && old.digest,
        ].filter(Boolean));
        retained.delete(theme.digest);
        const revisions = [];
        for (let prior = old; prior; prior = prior.previousRevision) if (retained.delete(prior.digest)) revisions.push(prior);
        theme.previousRevision = undefined;
        for (const prior of revisions.reverse()) theme.previousRevision = { ...prior, previousRevision: theme.previousRevision };
      }
      s.themes = [...s.themes.filter(x => x.id !== theme.id), theme];
      s.issues = s.issues.filter(x => x.id !== theme.id);
    });
  }
  async issue(issue) { return this.mutate(s => { s.issues = [issue, ...s.issues.filter(x => x.id !== issue.id)].slice(0, 80); }); }
  async begin(id, { startup = false } = {}) {
    return this.mutate(s => {
      if (s.pending) throw new ThemeError('activation-busy', '另一个窗口正在切换主题，请稍后重试');
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
      if (s.active === id) { s.active = 'default'; s.activeDigest = undefined; }
      if (s.previous === id) { s.previous = null; s.previousDigest = undefined; }
      s.themes = s.themes.filter(t => t.id !== id); s.issues = s.issues.filter(t => t.id !== id);
    });
  }
}
