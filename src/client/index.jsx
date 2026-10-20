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
  let client, appearance, appearanceFiber, disposed = false, error, restoring = false, listeners = new Set();
  const customization = createCustomization();
  let refreshPage = () => {};
  const publish = () => { refreshPage(); for (const fn of listeners) fn(); };
  const loading = async () => {
    try {
      checkHostCapabilities(ctx);
      let response;
      // While the host is still starting, the library answers "restoring"; poll until it is ready.
      for (;;) {
        response = await fetch(`${API}/state`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (response.status !== 503 || (await response.clone().json().catch(() => ({}))).code !== 'restoring') break;
        if (!restoring) { restoring = true; publish(); }
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (disposed) return;
      }
      restoring = false;
      const initial = await response.json(); if (!response.ok) throw Object.assign(Error(initial.error || '主题服务暂不可用'), { code: initial.code, details: initial.details });
      if (disposed) return;
      appearanceFiber = ctx.plugin({ name: 'dsh-theme-appearance', apply(scope) { appearance = createAppearance(scope); } });
      await appearanceFiber;
      if (disposed) { await appearanceFiber.dispose(); return; }
      if (initial.probe) {
        // The disposable host first passes onboarding and opens its real
        // workspace. A visible onboarding root is not a usable themed shell.
        window.__DTP_PROBE_READY__ = true;
        await new Promise(resolve => { window.__DTP_PROBE_BEGIN__ = resolve; });
        if (disposed) return;
        appearance.select('default');
        customization.select(initial.probe.originalId);
        await runProbe(ctx, initial.probe); return;
      }
      client = createClient(ctx, appearance, customization);
      await client.start(initial); publish();
    } catch (e) {
      client?.dispose(); client = undefined;
      await appearanceFiber?.dispose();
      error = e.message; publish();
      if (window.__DTP_PROBE_MODE__ || window.__DTP_PROBE_READY__ || location.search.includes('theme-probe')) window.__DTP_PROBE_RESULT__ = { ok: false, error: e.message, code: e.code, details: e.details };
    }
  };
  function Page() {
    const [, update] = useState(0);
    useEffect(() => { const fn = () => update(n => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
    return client ? <ThemeSettings {...{ client, appearance, customization }}/> : <section className="dtp-settings"><h2>外观</h2><p role={error ? 'alert' : 'status'}>{error || (restoring ? '正在恢复主题…' : '正在读取主题与外观设置…')}</p></section>;
  }
  ctx.slots.inject('settings.section', () => {
    let release;
    refreshPage = () => {
      release?.();
      // A failed takeover leaves the existing appearance page available.
      // Keep its diagnostic under a separate navigation identity.
      release = ctx.slots.register({ name: 'settings.section',
        id: error ? 'dsh-theme-plugin-error' : 'omd-appearance', order: 15, priority: -100,
        label: () => error ? '主题管理' : '外观' }, Page);
    };
    refreshPage();
    return () => { refreshPage = () => {}; release?.(); };
  });
  ctx.effect(() => { void loading(); return () => { disposed = true; client?.dispose(); customization.dispose(); listeners.clear(); }; });
}
