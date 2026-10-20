import React, { useSyncExternalStore } from 'react';
import { createSkinRuntime } from '../../vendor/appearance/src/client/skins/runtime.mjs';
import { createSurfaceMarkers } from '../../vendor/appearance/src/client/skins/surfaces.mjs';
import { applySidebarPresentation } from '../../vendor/appearance/src/client/sidebar.jsx';
import { applyCodexIntegration } from '../../vendor/appearance/src/client/skins/codex-desktop/integration.jsx';
import { applyMaterialIntegration, MATERIAL_LAYOUT } from '../../vendor/appearance/src/client/skins/google-material-expressive/integration.jsx';
import { applyTerminalPresentation } from '../../vendor/appearance/src/client/skins/claude-cli-terminal/presentation.jsx';
import { applyGlyphIntegration } from '../../vendor/appearance/src/client/skins/glyph-motion/integration.jsx';
import { glyphOwnership } from '../../vendor/appearance/plugins/glyph-theme/src/shared/ownership.mjs';
import { brandDocumentTitle } from '../../vendor/appearance/src/client/document-title.mjs';
import { whaleSvg } from '../../vendor/appearance/src/client/brand.mjs';
import adapter from '../../vendor/appearance/src/client/skins/adapter.css';
import appearance from '../../vendor/appearance/src/client/skins/appearance.css';
import base from '../../vendor/appearance/src/client/skins/layout-base.css';
import ios from '../../vendor/appearance/src/client/skins/ios-liquid-glass/layout.css';
import codex from '../../vendor/appearance/src/client/skins/codex-desktop/layout.css';
import material from '../../vendor/appearance/src/client/skins/google-material-expressive/layout.css';
import terminal from '../../vendor/appearance/src/client/skins/claude-cli-terminal/layout.css';
import glyph from '../../vendor/appearance/plugins/glyph-theme/src/theme/layout.css';
export { Personalization } from '../../vendor/appearance/src/client/skins/personalization.jsx';
export { AppearanceDrafts, useAppearanceDrafts } from '../../vendor/appearance/src/client/skins/advanced.jsx';
export { AppearanceSelect, EffectsToggle } from '../../vendor/appearance/src/client/skins/controls.jsx';
export { Button, Input, Select, Switch, Checkbox, SegmentedControl } from '../../vendor/appearance/src/client/native-controls.jsx';
import { API } from '../shared/protocol.mjs';
const STORAGE_KEY = 'dsh.theme.appearance.v1';
// The shared appearance source stays byte-identical to OMD; only these product options differ.
const PRODUCT = {
  storageKey: STORAGE_KEY, defaultSkin: 'default', owner: { id: 'dsh-theme-plugin', priority: 10 }, tokenOwner: 'dsh-theme-plugin/appearance',
  brand: { themeLogo: '跟随主题', productLogo: '立体鲸鱼', productTitle: null, placeholder: 'DeepSeek Harness' },
  assetUrl: file => `${API}/builtin/${file}`,
};
export function createAppearance(ctx) {
  // Adopt appearance preferences without changing the original plugin's data.
  // Keep the theme's visuals; only the default product wording is native.
  if (localStorage.getItem(STORAGE_KEY) === null) {
    const inherited = localStorage.getItem('omd.skins.v1');
    if (inherited !== null) {
      try { const saved = JSON.parse(inherited); if (saved && typeof saved === 'object' && !Array.isArray(saved)) localStorage.setItem(STORAGE_KEY, inherited); } catch {}
    }
  }
  const surfaces = createSurfaceMarkers();
  const runtime = createSkinRuntime(ctx, adapter, { 'ios-liquid': ios, 'codex-desktop': codex, 'claude-cli-terminal': terminal, [MATERIAL_LAYOUT]: material, 'glyph-motion': glyph }, appearance, surfaces, base, PRODUCT);
  let observer;
  ctx.effect(() => () => { observer?.disconnect(); runtime.dispose(); surfaces.dispose(); });
  ctx.effect(() => {
    let release;
    const sync = () => {
      const state = runtime.getSnapshot(), enabled = state.active && state.selected === 'glyph-motion';
      if (enabled && !release) {
        // Claiming can synchronously dispose the standalone token layer and
        // emit theme/change. Reserve the claim before notifying its listeners.
        release = () => {};
        release = glyphOwnership().claimOmd();
        const current = runtime.getSnapshot();
        if (!current.active || current.selected !== 'glyph-motion') sync();
      } else if (!enabled && release) { const off = release; release = null; off(); }
    };
    const off = runtime.subscribe(sync); sync();
    return () => { off(); release?.(); };
  });
  observer = new MutationObserver(() => surfaces.refresh());
  observer.observe(document.body, { childList: true, subtree: true });
  applySidebarPresentation(ctx);
  applyCodexIntegration(ctx, () => runtime, { priority: -100 });
  applyMaterialIntegration(ctx, () => runtime, { priority: -100 });
  applyTerminalPresentation(ctx, () => runtime);
  applyGlyphIntegration(ctx, () => runtime, { priority: -100 });
  applyBrand(ctx, runtime);
  return runtime;
}
function applyBrand(ctx, runtime) {
  function Mark() {
    const { advanced } = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return <img width="28" height="28" alt="" src={advanced.brand.image || 'data:image/svg+xml,' + encodeURIComponent(whaleSvg('dtp-brand'))}/>;
  }
  function Name() { const { advanced } = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot); const text = advanced.brand.logo === 'custom' && advanced.brand.name || 'DeepSeek Harness'; return <strong className="dtp-wordmark glyph-wordmark" title={text}>{text}</strong>; }
  for (const [name, Component] of [['sidebar.brand.mark', Mark], ['sidebar.brand.name', Name], ['conversation.hero.brand.mark', Mark]]) {
    ctx.slots.inject(name, () => {
      let release;
      const update = () => {
        const state = runtime.getSnapshot(), logo = state.advanced.brand.logo;
        const enabled = state.active && (name === 'sidebar.brand.name'
          ? logo !== 'native' && (state.selected !== 'default' || logo === 'custom' || logo === 'omd')
          : logo === 'custom' || logo === 'omd');
        if (enabled && !release) release = ctx.slots.register({ name, id: 'dtp-brand', priority: -20 }, Component);
        else if (!enabled && release) { release(); release = null; }
      };
      const off = runtime.subscribe(update); update(); return () => { off(); release?.(); };
    });
  }
  ctx.effect(() => {
    const title = brandDocumentTitle(document, { mode: 'native' });
    const sync = () => { const state = runtime.getSnapshot(); title.update(state.active ? { mode: state.advanced.brand.title, text: state.advanced.brand.titleText } : { mode: 'native' }); };
    const off = runtime.subscribe(sync); sync();
    return () => { off(); title(); };
  });
}
