import { API } from '../shared/protocol.mjs';

// The legacy settingsScope contract backed by this theme's persistent library
// storage. Bindings keep snapshots stable and serialize writes across controls.
export function themeSettings(theme, scope) {
  const bindings = new Map();
  return {
    bind({ namespace }) {
      if (bindings.has(namespace)) return bindings.get(namespace);
      const listeners = new Set();
      scope.onDispose(() => listeners.clear());
      let snapshot = { status: 'loading', writable: true, value: undefined }, pending = Promise.resolve();
      const publish = next => { snapshot = next; for (const fn of listeners) fn(); };
      const request = async patch => {
        const response = await scope.fetch(`${API}/preferences`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: theme.id, namespace, ...patch }) });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || '主题设置保存失败');
        publish({ status: 'ready', writable: true, value: result.value });
      };
      pending = request({}).catch(error => { publish({ status: 'error', writable: false, value: undefined, error }); });
      const write = patch => {
        const result = pending.then(() => request(patch));
        pending = result.catch(() => {}); return result;
      };
      const binding = {
        getSnapshot: () => snapshot,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set: (field, value) => write({ field, value }),
        unset: field => write({ field, unset: true }),
      };
      bindings.set(namespace, binding); return binding;
    },
  };
}
