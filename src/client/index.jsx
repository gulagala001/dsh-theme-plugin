import React, { useEffect, useState } from 'react';
import { createAppearance } from './appearance.jsx';
import { createClient } from './store.mjs';
import { runProbe } from './external.mjs';
import { ThemeSettings } from './ui.jsx';
import { createCustomization } from './customization.mjs';
import { checkHostCapabilities } from '../shared/host-contract.mjs';
import { API } from '../shared/protocol.mjs';
import css from './style.css';
export const inject = ['slots', 'theme', 'configForms', 'layout', 'modules', 'connection', 'locale'];
export function apply(ctx) {
  const style = document.createElement('style'); style.dataset.plugin = 'dsh-theme-plugin'; style.textContent = css; document.head.append(style);
  ctx.effect(() => () => style.remove());
  let client, appearance, disposed = false, error, listeners = new Set();
  const customization = createCustomization();
  const publish = () => { for (const fn of listeners) fn(); };
  const loading = async () => {
    try {
      checkHostCapabilities(ctx);
      const response = await fetch(`${API}/state`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const initial = await response.json(); if (!response.ok) throw Error(initial.error || '主题服务暂不可用');
      if (disposed) return;
      if (initial.probe) {
        // Wait for the real native shell before exercising candidate lifecycle.
        const start = Date.now(); while (!document.querySelector('[data-slot="root"]') && Date.now() - start < 12000) await new Promise(r => setTimeout(r, 100));
        customization.select(initial.probe.originalId);
        await runProbe(ctx, initial.probe); return;
      }
      appearance = createAppearance(ctx);
      client = createClient(ctx, appearance, customization);
      await client.start(initial); publish();
    } catch (e) {
      error = e.message; publish();
      if (location.search.includes('theme-probe')) window.__DTP_PROBE_RESULT__ = { ok: false, error: e.message };
    }
  };
  function Page() {
    const [, update] = useState(0);
    useEffect(() => { const fn = () => update(n => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
    return client ? <ThemeSettings {...{ client, appearance, customization }}/> : <section className="dtp-settings"><h2>外观</h2><p role={error ? 'alert' : 'status'}>{error || '正在读取主题与外观设置…'}</p></section>;
  }
  // Same id as the existing appearance slot replaces the entry when embedded,
  // rather than adding a second independent appearance settings page.
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'omd-appearance', order: 15, priority: -100, label: () => '外观' }, Page));
  ctx.effect(() => { void loading(); return () => { disposed = true; client?.dispose(); customization.dispose(); listeners.clear(); }; });
}
