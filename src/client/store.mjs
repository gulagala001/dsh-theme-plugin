import { API, BUILTINS, repairTask } from '../shared/protocol.mjs';
import { mountExternal } from './external.mjs';
import { needsRuntimeProbe } from '../shared/host-contract.mjs';
export function createClient(ctx, appearance, customization) {
  let state = { ready: false, themes: [], issues: [], active: null, catalog: { items: [], sources: [] }, busy: null, error: null, detail: null }, disposed = false, externalCleanup, externalId, serial = 0;
  const listeners = new Set();
  const controller = new AbortController();
  let monitor, reloadTimer, observedRevision = -1, externalDigest;
  const hasDraft = () => {
    try {
      const sessions = ctx.get('sessions'), conversation = ctx.get('conversation');
      for (const id of sessions?.list.getSnapshot().ids || []) {
        const binding = sessions.binding(id);
        if (!binding || !sessions.retainInfo(id).getSnapshot().retainedBy.mainView) continue;
        const input = conversation?.input.for(binding.ctx).state.getSnapshot();
        if (input && (input.draft || input.attachmentIds?.length || ['adjudicating', 'submitting'].includes(input.phase))) return true;
      }
    } catch { /* Fall back to the visible composer when no session is bound. */ }
    return [...document.querySelectorAll('[data-composer-input]')].some(input => input.isContentEditable && input.textContent.trim());
  };
  const reloadPage = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      if (disposed) return;
      if (state.busy || hasDraft()) {
        emit({ reloadPending: true });
        reloadPage(); return;
      }
      window.location.reload();
    }, state.reloadPending ? 1000 : 200);
  };
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('dsh-theme-plugin/library') : null;
  let appearanceActive = appearance.getSnapshot().active;
  const offAppearance = appearance.subscribe(() => {
    const active = appearance.getSnapshot().active;
    if (active === appearanceActive) return;
    appearanceActive = active;
    if (!active) { ++serial; externalCleanup?.(); externalCleanup = null; externalId = null; customization?.select(null); }
    else if (state.active && !BUILTINS.some(t => t.id === state.active)) queueMicrotask(() => { if (!disposed && appearanceActive) void render(state.active, state.activeTheme).catch(e => report(e)); });
  });
  let recovering = false;
  const failedThemes = new Set();
  const onRuntimeError = event => {
    if (!externalId || recovering || state.busy) return;
    const theme = state.themes.find(t => t.id === externalId), error = event.detail || event.error || event.reason;
    const source = `${event.filename || ''}\n${error?.stack || ''}`;
    if (event.type !== 'dtp:theme-error' && !source.includes(`/assets/${externalId}/`) && !source.includes(`/client/${externalId}/`)) return;
    failedThemes.add(externalId); recovering = true;
    const fallback = state.previous && !failedThemes.has(state.previous) ? state.previous : 'default';
    void activate(fallback).then(() => report(Error(`主题运行失败，已尝试恢复可用外观：${error?.message || event.message || '未知错误'}`), theme)).finally(() => { recovering = false; });
  };
  for (const event of ['error', 'unhandledrejection', 'dtp:theme-error']) window.addEventListener(event, onRuntimeError);
  const emit = patch => { if (disposed) return; state = { ...state, ...patch }; for (const fn of listeners) fn(); };
  function receive(next) {
    if (disposed || next.revision < (state.revision ?? -1)) return false;
    emit({ ...next, ready: true }); observedRevision = next.revision;
    return true;
  }
  async function api(action, data = {}) {
    controller.signal.throwIfAborted();
    const response = await fetch(`${API}/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: controller.signal });
    const value = await response.json();
    controller.signal.throwIfAborted();
    if (!response.ok) { const e = Error(value.error || '主题操作失败'); e.repair = value.repair; e.code = value.code; throw e; }
    return value;
  }
  function report(e, theme) { emit({ error: { message: e.message, repair: e.repair || repairTask({ theme, error: e }) } }); }
  const recoveryError = (error, cause) => Object.assign(Error(`${error.message}；外观恢复未完成：${cause.message}`), { code: cause.code, repair: cause.repair });
  async function render(id, revision) {
    controller.signal.throwIfAborted();
    const generation = ++serial, previous = externalCleanup; externalCleanup = null; externalId = null; externalDigest = null;
    customization?.select(null);
    await previous?.();
    controller.signal.throwIfAborted();
    if (generation !== serial) throw Error('主题切换已取消');
    const builtin = BUILTINS.find(x => x.id === id);
    if (builtin) { appearance.select(id); return; }
    const theme = revision || state.themes.find(x => x.id === id);
    if (!theme) return;
    if (theme.legacy) { appearance.import(theme.legacy); return; }
    appearance.select('default');
    if (!appearanceActive) return;
    customization?.select(theme.originalId, !theme.linked);
    const release = await mountExternal(ctx, theme);
    if (disposed || generation !== serial) { await release(); throw Error('主题切换已取消'); }
    externalCleanup = release; externalId = id; externalDigest = theme.digest;
  }
  async function refresh({ apply = false } = {}) {
    const previous = state.activeTheme;
    const next = await api('state');
    if (!receive(next)) return state;
    if (apply && next.active && (next.active !== externalId || next.activeTheme?.digest !== externalDigest)) {
      await render(next.active, next.activeTheme);
      if ((previous?.id !== next.activeTheme?.id || previous?.digest !== next.activeTheme?.digest) &&
        (previous?.backend?.requiresReload || next.activeTheme?.backend?.requiresReload)) reloadPage();
    }
    return next;
  }
  async function activate(id, { reload = true } = {}) {
    const originalSelection = appearance.getSnapshot().selected;
    const previous = state.activeTheme;
    emit({ busy: { label: '正在应用主题' }, error: null });
    let pending;
    try {
      pending = await api('activate', { id });
      await render(id, pending.theme);
      const committed = await api('commit', { token: pending.token });
      if (!receive(committed)) await render(state.active || 'default', state.activeTheme);
      channel?.postMessage({ revision: state.revision });
      const requiresReload = !!(previous?.backend?.requiresReload || pending.theme?.backend?.requiresReload);
      if (reload && requiresReload) reloadPage();
      return { requiresReload };
    } catch (e) {
      if (pending && !disposed) {
        try {
          const restored = await api('fail', { token: pending.token, message: e.message });
          receive(restored);
          await render(state.active || originalSelection || 'default', state.activeTheme);
        } catch (cause) { if (!disposed) { appearance.reset(); e = recoveryError(e, cause); } }
      }
      report(e, state.themes.find(x => x.id === id));
      return null;
    } finally { emit({ busy: null }); }
  }
  async function operation(action, data, { apply = false } = {}) {
    emit({ busy: { label: '准备主题' }, error: null });
    try {
      const { id } = await api(action, data);
      for (;;) {
        if (disposed) return;
        const result = await api('operation', { id }); emit({ busy: { label: result.phase } });
        if (result.state === 'failed') { const e = Error(result.error.message); e.repair = result.error.repair; throw e; }
        if (result.state === 'done') {
          await refresh();
          channel?.postMessage({ revision: state.revision });
          if (apply && result.result?.themes?.length === 1) await activate(result.result.themes[0].id);
          return result.result;
        }
        await new Promise(resolve => setTimeout(resolve, 700));
      }
    } catch (e) { report(e); await refresh().catch(() => {}); }
    finally { emit({ busy: null }); }
  }
  return {
    getSnapshot: () => state, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    api, report, refresh, activate, operation,
    async start(initial) {
      if (disposed) return;
      let guard;
      try {
        receive(initial || await api('state'));
        if (!state.active) {
          const visual = appearance.getSnapshot(), legacy = visual.skins.find(t => t.id === visual.selected && !t.builtin);
          if (legacy) {
            const { builtin, ...value } = legacy;
            await this.importFile(new File([JSON.stringify(value)], `${legacy.id}.omd-skin.json`, { type: 'application/json' }));
          } else await activate(visual.selected, { reload: false });
        }
        if (state.active) {
          const deadline = Date.now() + 35000;
          for (;;) {
            const theme = state.activeTheme || state.themes.find(t => t.id === state.active);
            if (!theme || theme.linked || !needsRuntimeProbe(theme)) break;
            try { guard = await api('activate', { id: state.active, startup: true }); break; }
            catch (e) {
              if (e.code !== 'activation-busy' || Date.now() > deadline) throw e;
              await new Promise(resolve => setTimeout(resolve, 250));
              receive(await api('state'));
            }
          }
          await render(state.active, state.activeTheme);
          if (guard) receive(await api('commit', { token: guard.token }));
          const active = state.activeTheme;
          if (active?.backend?.requiresReload && window.__DTP_INDEX_BACKEND__ !== `${active.id}/${active.digest}`) reloadPage();
        }
        if (disposed) return;
        const synchronize = async () => {
          if (disposed || state.busy) return;
          try { const next = await api('state'); if (next.revision !== observedRevision || state.discovering || state.revalidating) await refresh({ apply: true }); } catch (e) { report(e); }
        };
        if (channel) channel.onmessage = () => { void synchronize(); };
        const tick = async () => {
          if (disposed) return;
          if (state.discovering || state.revalidating) await synchronize();
          if (!disposed) monitor = setTimeout(tick, 2000);
        };
        observedRevision = state.revision; monitor = setTimeout(tick, 2000);
      } catch (e) {
        if (disposed) return;
        let restored = false;
        if (guard) {
          try { receive(await api('fail', { token: guard.token, message: e.message })); await render(state.active || 'default', state.activeTheme); restored = true; }
          catch (cause) { e = recoveryError(e, cause); }
        }
        if (!restored && !disposed) appearance.reset();
        report(e);
      }
    },
    async market(refresh = false) {
      if (state.catalogLoading) return;
      emit({ catalogLoading: true });
      try { emit({ catalog: await api('catalog', { refresh }) }); } catch (e) { report(e); }
      finally { emit({ catalogLoading: false }); }
    },
    async importFile(file) {
      if (!file) return;
      if (file.size > 80 * 1024 * 1024) { report(Error('主题包不能超过 80 MB')); return; }
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return operation('import', { name: file.name, data: btoa(binary) }, { apply: true });
    },
    async remove(id) {
      try {
        const theme = state.themes.find(t => t.id === id);
        const switched = state.active === id ? await activate('default', { reload: false }) : {};
        if (!switched) return;
        await api('remove', { id });
        if (theme?.legacy) appearance.remove(theme.legacy.id);
        await refresh(); channel?.postMessage({ revision: state.revision });
        if (switched.requiresReload) reloadPage();
      } catch (e) { report(e); }
    },
    async exportTheme(id) {
      try {
        const builtin = appearance.getSnapshot().skins.find(x => x.id === id);
        let result;
        if (builtin) { const { builtin: _, ...skin } = builtin; result = { name: `${skin.id}.omd-skin.json`, blob: new Blob([JSON.stringify(skin, null, 2)], { type: 'application/json' }) }; }
        else { const value = await api('export', { id }); result = { name: value.name, blob: new Blob([Uint8Array.from(atob(value.data), c => c.charCodeAt(0))]) }; }
        const url = URL.createObjectURL(result.blob), a = document.createElement('a'); a.href = url; a.download = result.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) { report(e); }
    },
    detail: detail => emit({ detail }), dismiss: () => emit({ error: null }),
    dispose() { disposed = true; controller.abort(); ++serial; clearTimeout(monitor); clearTimeout(reloadTimer); channel?.close(); offAppearance(); externalCleanup?.(); for (const event of ['error', 'unhandledrejection', 'dtp:theme-error']) window.removeEventListener(event, onRuntimeError); listeners.clear(); },
  };
}
