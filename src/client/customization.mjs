// Implements the published Deep Whale customization v1/v2 browser contract.
// Uses its existing preference key so adopted skins retain their settings.
const KEY = 'dsh.skin-manager.preferences.v2';
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export function normalizeSetting(setting, value) {
  const fallback = setting.defaultValue;
  if (setting.type === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (setting.type === 'select') return setting.options?.some(o => o.value === value) ? value : fallback;
  if (setting.type === 'range') return Math.min(setting.max, Math.max(setting.min, Number.isFinite(value) ? value : fallback));
  if (setting.type === 'color') return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  if (setting.type === 'checkbox-group') return (setting.options || []).filter(o => (Array.isArray(value) ? value : fallback || []).includes(o.value)).map(o => o.value);
  if (setting.type === 'visibility-schedule') {
    const data = value && typeof value === 'object' ? value : fallback || {};
    return { enabled: data.enabled === true, outside: data.outside === 'hidden' ? 'hidden' : 'visible',
      ranges: (Array.isArray(data.ranges) ? data.ranges : []).filter(r => time.test(r?.start) && time.test(r?.end) && r.start !== r.end).slice(0, 24).map(r => ({ start: r.start, end: r.end })) };
  }
  return fallback;
}
export function scheduleVisible(value, now = new Date()) {
  if (!value.enabled) return true;
  const minute = now.getHours() * 60 + now.getMinutes();
  const inside = value.ranges.some(r => { const start = minutes(r.start), end = minutes(r.end); return start < end ? minute >= start && minute < end : minute >= start || minute < end; });
  return inside ? value.outside === 'hidden' : value.outside !== 'hidden';
}
export function settingVisible(setting, values) {
  const condition = setting.visibleWhen;
  return !condition || (condition.anyOf || [condition]).some(c => c.values?.includes(values[c.key]));
}
export function createCustomization() {
  const definitions = new Map(), listeners = new Set(), offs = [];
  let snapshot = [], disposed = false, timer, selected = null, owns = true;
  const values = definition => {
    const current = read(KEY), legacy = read('dsh-deep-whale.skin-manager.v1');
    const source = current[definition.skinId] || (definition.skinId === 'maid-atelier' ? legacy.maid : definition.skinId === 'orca-link' ? legacy.orca : {}) || {};
    return Object.fromEntries(definition.settings.map(s => [s.key, normalizeSetting(s, Object.hasOwn(source, s.key) ? source[s.key] : s.legacyValue?.map?.[String(source[s.legacyValue?.key])])]));
  };
  const emit = () => { snapshot = [...new Set(definitions.values())].filter(d => d.skinId === selected); for (const fn of listeners) fn(); };
  const report = e => window.dispatchEvent(new CustomEvent('dtp:theme-error', { detail: e }));
  const apply = () => {
    clearTimeout(timer);
    let timed = false;
    for (const definition of new Set(definitions.values())) {
      if (!owns || definition.skinId !== selected) continue;
      const current = values(definition), visibility = {};
      for (const s of definition.settings) if (s.type === 'visibility-schedule') { visibility[s.key] = scheduleVisible(current[s.key]); timed ||= current[s.key].enabled; }
      try { definition.apply({ values: current, visibility }); } catch (e) { report(e); }
    }
    if (timed && !disposed) timer = setTimeout(apply, 60025 - Date.now() % 60000);
  };
  for (const protocol of [1, 2]) {
    const register = event => {
      const { token, definition: d } = event.detail || {};
      if (!token || d?.protocol !== protocol || typeof d.apply !== 'function' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(d.skinId) || !Array.isArray(d.settings) || d.settings.length > 150) return;
      if (!d.settings.every(s => /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(s?.key) && !['__proto__', 'constructor', 'prototype'].includes(s.key) && ['boolean', 'select', 'range', 'color', 'checkbox-group', 'visibility-schedule'].includes(s.type))) return;
      definitions.set(token, d); apply(); emit();
    };
    const unregister = event => { const { token, definition } = event.detail || {}; if (definitions.get(token) !== definition) return; definitions.delete(token); emit(); apply(); };
    for (const [name, fn] of [['register', register], ['unregister', unregister]]) {
      const event = `dsh:skin-customization-${name}-v${protocol}`;
      window.addEventListener(event, fn); offs.push(() => window.removeEventListener(event, fn));
    }
    window.dispatchEvent(new Event(`dsh:skin-customization-ready-v${protocol}`));
  }
  const storage = e => { if (e.key === KEY || e.key === null) { apply(); emit(); } };
  window.addEventListener('storage', storage); offs.push(() => window.removeEventListener('storage', storage));
  return {
    getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, values,
    select(id, manage = true) {
      if (owns && selected && selected !== id) for (const d of new Set(definitions.values())) if (d.skinId === selected) try { d.apply(null); } catch (e) { report(e); }
      selected = id; owns = manage; apply(); emit();
    },
    set(definition, key, value) {
      const setting = definition.settings.find(s => s.key === key); if (!setting) return;
      const saved = read(KEY);
      saved[definition.skinId] = { ...saved[definition.skinId], [key]: normalizeSetting(setting, value) };
      localStorage.setItem(KEY, JSON.stringify(saved));
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify(saved), storageArea: localStorage }));
    },
    dispose() { disposed = true; clearTimeout(timer); for (const off of offs) off(); for (const d of definitions.values()) if (owns && d.skinId === selected) try { d.apply(null); } catch {} definitions.clear(); listeners.clear(); },
  };
}
