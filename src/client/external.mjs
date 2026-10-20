import { API } from '../shared/protocol.mjs';
import { semanticAdapter } from './semantic.mjs';
import { createThemeScope } from './theme-scope.mjs';
import { themeSettings } from './theme-settings.mjs';
const script = url => new Promise((done, fail) => {
  const el = document.createElement('script'); el.src = url; el.async = true;
  el.onload = () => { el.remove(); done(); }; el.onerror = () => { el.remove(); fail(Error('主题客户端资源无法加载')); };
  document.head.append(el);
});
export async function mountExternal(ctx, theme) {
  if (theme.linked) return () => {};
  const cleanups = [], root = document.documentElement;
  let disposed = false, cleanupPromise;
  const cleanup = () => cleanupPromise ||= (async () => {
    if (disposed) return; disposed = true; const errors = [];
    for (const fn of cleanups.reverse()) try { await fn(); } catch (e) { errors.push(e); }
    if (errors.length) console.warn('主题资源清理失败', errors);
  })();
  const ownAttribute = (element, key, value) => {
    const prior = element.getAttribute(key); element.setAttribute(key, value);
    cleanups.push(() => { if (element.getAttribute(key) === value) { if (prior === null) element.removeAttribute(key); else element.setAttribute(key, prior); } });
  };
  try {
    const customizationErrors = [], onCustomizationError = e => customizationErrors.push(e.detail?.message || '主题专属设置加载失败');
    window.addEventListener('dtp:theme-error', onCustomizationError);
    cleanups.push(() => window.removeEventListener('dtp:theme-error', onCustomizationError));
    const onLoadError = event => {
      const error = event.error || event.reason, source = `${event.filename || ''}\n${error?.stack || ''}`;
      if (source.includes(`/assets/${theme.id}/`) || source.includes(`/client/${theme.id}/`)) customizationErrors.push(error?.message || event.message || '主题初始化失败');
    };
    window.addEventListener('error', onLoadError); window.addEventListener('unhandledrejection', onLoadError);
    cleanups.push(() => { window.removeEventListener('error', onLoadError); window.removeEventListener('unhandledrejection', onLoadError); });
    ownAttribute(root, 'data-dtp-theme', theme.id);
    if (theme.format === 'skin-center-v2') ownAttribute(root, 'data-dsh-skin', theme.originalId);
    if (typeof theme.bodyAttr === 'string' && /^data-dsh-[a-z0-9-]+$/.test(theme.bodyAttr)) ownAttribute(document.body, theme.bodyAttr, '');
    cleanups.push(semanticAdapter());
    if (theme.css) { const style = document.createElement('style'); style.dataset.dtpTheme = theme.id; style.textContent = theme.css; document.head.append(style); cleanups.push(() => style.remove()); }
    if (theme.nativeTokens?.length) {
      cleanups.push(ctx.theme.overrideTokens(`dsh-theme-plugin/${theme.id}/css`, Object.fromEntries(theme.nativeTokens.map(key => [key, {
        light: `var(--dtp-css-${key.slice(2)})`, dark: `var(--dtp-css-${key.slice(2)})`,
      }]))));
    }
    if (theme.tokens) {
      const keys = new Set([...Object.keys(theme.tokens.light || {}), ...Object.keys(theme.tokens.dark || {})]);
      const current = ctx.theme.getTheme().active.colorScheme;
      const pairs = Object.fromEntries([...keys].map(key => [key, { light: theme.tokens.light?.[key] ?? theme.tokens.dark?.[key], dark: theme.tokens.dark?.[key] ?? theme.tokens.light?.[key] }]));
      if (keys.size) cleanups.push(ctx.theme.overrideTokens(`dsh-theme-plugin/${theme.id}`, pairs));
      if (theme.modes?.length === 1 && current !== theme.modes[0]) ctx.theme.setTheme(theme.modes[0]);
    }
    const layers = {};
    if (theme.hooks || Object.keys(theme.background || {}).length) {
      for (const [index, name] of ['background', 'ambient', 'top', 'bottom', 'sidebar', 'foreground'].entries()) {
        const layer = document.createElement('div'); layer.className = `dtp-layer dtp-layer-${name}`; layer.dataset.dshSkinLayer = name; layer.setAttribute('aria-hidden', 'true');
        layer.style.zIndex = name === 'background' ? '-2' : name === 'ambient' ? '-1' : String(20 + index);
        document.body.append(layer); layers[name] = layer; cleanups.push(() => layer.remove());
      }
      const update = () => {
        const mode = ctx.theme.getTheme().active.colorScheme, background = theme.background?.[mode];
        layers.background.replaceChildren();
        if (!background) return;
        const media = document.createElement(background.type === 'video' ? 'video' : 'img');
        media.src = background.src;
        if (background.type === 'video') { media.muted = true; media.loop = true; media.autoplay = !matchMedia('(prefers-reduced-motion: reduce)').matches; media.playsInline = true; }
        layers.background.append(media);
        if (background.scrim) { const scrim = document.createElement('div'); scrim.className = 'dtp-scrim'; scrim.style.background = background.scrim; layers.background.append(scrim); }
      };
      update(); cleanups.push(ctx.on('theme/change', update));
      if (Object.keys(theme.background || {}).length) { ownAttribute(root, 'data-dsh-backdrop-active', 'true'); ownAttribute(document.body, 'data-dsh-backdrop-active', 'true'); }
      if (theme.hooks) {
        const mod = await import(/* @vite-ignore */ theme.hooks.url);
        if (typeof mod.default !== 'function') throw Error('动态主题未导出 hooks 工厂');
        const hooks = mod.default();
        if (typeof hooks?.apply !== 'function') throw Error('动态主题未提供 apply');
        const themeListeners = new Set();
        cleanups.push(ctx.on('theme/change', () => { for (const fn of themeListeners) fn(ctx.theme.getTheme().active.colorScheme); }));
        const result = hooks.apply({ skinId: theme.originalId, scopeAttr: theme.originalId, layers,
          assetBase: `${API}/assets/${theme.id}/${theme.digest}`,
          theme: { get: () => ctx.theme.getTheme().active.colorScheme, subscribe: fn => { themeListeners.add(fn); return () => themeListeners.delete(fn); } },
          onCleanup: fn => { if (typeof fn === 'function') cleanups.push(fn); },
        });
        if (result?.then) await result;
        if (typeof hooks.dispose === 'function') cleanups.push(() => hooks.dispose());
      }
    }
    if (theme.client) {
      const modules = ctx.get('modules');
      if (!modules?.import) throw Error('当前 DSH 没有动态主题模块接口');
      const scope = createThemeScope(theme);
      const compatibilityServices = ctx.get('settingsScope') ? {} : { settingsScope: themeSettings(theme, scope) };
      const scopes = window.__DTP_THEME_SCOPES__ ||= new Map();
      scopes.set(theme.client.moduleId, scope);
      cleanups.push(() => { scope.dispose(); scopes.delete(theme.client.moduleId); });
      for (const name of theme.client.requires || []) {
        try { scope.modules.set(name, scope.adaptModule(name, await modules.import(name))); }
        catch {
          if (/^@deepseek-ai\/[^/]+\/client$/.test(name)) {
            try { scope.modules.set(name, await modules.import(name.replace(/\/client$/, ''))); } catch {}
          }
          // Optional imports inside the original factory's try/catch retain
          // their own fallback. A required import still throws when invoked.
        }
      }
      await script(theme.client.url);
      const stylesBefore = new Set(document.querySelectorAll('style[data-plugin-css]'));
      cleanups.push(() => {
        for (const el of document.querySelectorAll('style[data-plugin-css]')) {
          if (!stylesBefore.has(el) && (el.dataset.plugin === theme.client.originalModuleId || el.dataset.pluginCss?.startsWith(theme.client.originalModuleId + '/'))) el.remove();
        }
      });
      const mod = await modules.import(theme.client.moduleId);
      const component = typeof mod.apply === 'function' ? mod : mod.default;
      if (typeof component?.apply !== 'function') throw Error('主题客户端没有 apply(ctx) 入口');
      const asked = Array.isArray(component.inject) ? component.inject : Object.entries(component.inject || {}).filter(([, value]) => value === true || (value && value.required !== false)).map(([key]) => key);
      const required = asked.filter(key => !ctx.get(key) && !compatibilityServices[key]);
      if (required.length) throw Error(`主题需要当前宿主未提供的服务：${required.join('、')}`);
      let applied, failed;
      const ready = new Promise((done, fail) => { applied = done; failed = fail; });
      const injection = Array.isArray(component.inject) ? component.inject.filter(key => !compatibilityServices[key]) :
        Object.fromEntries(Object.entries(component.inject || {}).filter(([key]) => !compatibilityServices[key]));
      const fiber = ctx.plugin({ name: `theme-${theme.id}`, inject: injection, async apply(child) {
        // Older themes use the former per-plugin dispose event. Cordis 4
        // owns cleanup through effects; keep the original callback semantics.
        const compatible = new Proxy(child, { get(target, key) {
          if (key === 'get') return name => scope.adaptService(name, target.get(name) || compatibilityServices[name]);
          if (Object.hasOwn(compatibilityServices, key)) return compatibilityServices[key];
          if (key === 'on') return (event, fn, ...args) => {
            if (event !== 'dispose') return target.on(event, fn, ...args);
            let pending = true;
            target.effect(() => () => { if (pending) { pending = false; return fn(); } });
            return () => { pending = false; };
          };
          return scope.adaptService(key, Reflect.get(target, key, target));
        } });
        try { const release = await component.apply(compatible); if (typeof release === 'function') child.effect(() => release); applied(); }
        catch (e) { failed(e); throw e; }
      } });
      cleanups.push(() => modules.invalidate?.(theme.client.moduleId));
      cleanups.push(() => fiber.dispose());
      // Stop theme-owned callbacks and registrations while the Cordis
      // context is still active, then await its disposal before reimport.
      cleanups.push(() => scope.dispose());
      let timer;
      try { await Promise.race([ready, new Promise((_, fail) => { timer = setTimeout(() => fail(Error('主题初始化超时')), 10000); })]); }
      finally { clearTimeout(timer); }
    }
    if (theme.client || theme.hooks) await new Promise(resolve => setTimeout(resolve, 120));
    if (customizationErrors.length) throw Error(customizationErrors[0]);
    window.removeEventListener('dtp:theme-error', onCustomizationError);
    window.removeEventListener('error', onLoadError); window.removeEventListener('unhandledrejection', onLoadError);
    return cleanup;
  } catch (e) { await cleanup(); throw e; }
}
export async function runProbe(ctx, theme) {
  const errors = [], onError = e => errors.push(e.message || e.reason?.message || String(e.reason));
  const customError = e => errors.push(e.detail?.message || '主题专属设置初始化失败');
  window.addEventListener('dtp:theme-error', customError);
  window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onError);
  window.__DTP_PROBE_ACTIVE__ = true;
  let dispose;
  const backend = async action => {
    if (!theme.backend) return;
    const response = await fetch(`${API}/probe-backend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw Error(`主题后台${action === 'stop' ? '卸载' : action === 'check-settings' ? '设置保存' : '恢复'}失败：${failure.error || response.status}`);
    }
    return response.json();
  };
  const step = async phase => {
    if (!window.__DTP_PROBE_INTERACTIVE__) return;
    const id = (window.__DTP_PROBE_STEP__?.id || 0) + 1;
    window.__DTP_PROBE_STEP__ = { id, phase };
    const deadline = Date.now() + 30000;
    while (window.__DTP_PROBE_ACK__ !== id && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (window.__DTP_PROBE_ACK__ !== id) throw Error('主题的实际界面交互检查未完成');
    if (window.__DTP_PROBE_UI_ERROR__) throw Error(window.__DTP_PROBE_UI_ERROR__);
  };
  try {
    dispose = await mountExternal(ctx, theme);
    const settings = await backend('check-settings');
    for (const mode of ['light', 'dark']) {
      ctx.theme.setTheme(mode);
      await new Promise(resolve => setTimeout(resolve, 700));
      const frame = document.querySelector('[data-slot="root"]');
      if (!frame) throw Error('主题加载后宿主界面未就绪');
      let bounds = frame.getBoundingClientRect();
      // Native slot outlets use display:contents and have no box of their own.
      // Measure their rendered descendants without depending on hashed classes.
      if (bounds.width < 200 || bounds.height < 200) {
        const contents = document.createRange(); contents.selectNodeContents(frame);
        bounds = contents.getBoundingClientRect();
      }
      if (bounds.width < 200 || bounds.height < 200) throw Error('主题使宿主界面不可见，未安装');
      for (let element = frame; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .05) throw Error('主题隐藏了宿主界面，未安装');
      }
      await step(mode);
    }
    await dispose(); dispose = null;
    await backend('stop');
    await new Promise(resolve => setTimeout(resolve, 300));
    await step('disposed');
    await backend('start');
    await backend('check-settings');
    dispose = await mountExternal(ctx, theme);
    await new Promise(resolve => setTimeout(resolve, 500));
    await step('remount');
    if (errors.length) throw Error(errors[0]);
    window.__DTP_PROBE_RESULT__ = { ok: true, checks: ['native-workspace-load', 'light-dark', 'native-input', 'native-settings', 'dispose', 'remount', ...(settings?.configurable ? ['native-settings-write'] : [])],
      requiresReload: !!theme.backend?.requiresReload, errors };
  } catch (e) { window.__DTP_PROBE_RESULT__ = { ok: false, error: e.message, stack: e.stack, errors }; }
  finally { await dispose?.(); window.__DTP_PROBE_ACTIVE__ = false; window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onError); window.removeEventListener('dtp:theme-error', customError); }
}
