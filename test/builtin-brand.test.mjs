import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('built-in brands fill native fallback slots and release them across preferences and owners', async () => {
  const { outputFiles } = await build({ stdin: { contents: `
    export { applySkinBrands } from './vendor/appearance/src/client/skins/brand.jsx';
  `, resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'] });
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  // Render each published client snapshot without requiring a browser. The
  // runtime subscription and native slot priority rules remain exercised below.
  const load = name => name === 'react' ? { ...React, useSyncExternalStore: (_subscribe, snapshot) => snapshot() } : require(name);
  new Function('require', 'module', 'exports', outputFiles[0].text)(load, module, module.exports);
  const { applySkinBrands } = module.exports;
  const entries = new Map(), disposers = [], listeners = new Set();
  const slots = {
    inject(name, setup) { disposers.push(setup()); },
    register(options, component) {
      const entry = { options, component }, list = entries.get(options.name) || [];
      assert.ok(!list.some(value => (value.options.priority || 0) === (options.priority || 0)), 'native single slots reject duplicate priorities');
      entries.set(options.name, [...list, entry]);
      return () => entries.set(options.name, entries.get(options.name).filter(value => value !== entry));
    },
  };
  let state = { active: true, selected: 'default', skins: [{ id: 'glyph-copy', layout: 'glyph-motion' }, { id: 'terminal-copy', layout: 'claude-cli-terminal' }], advanced: { brand: { logo: 'theme' } } };
  const runtime = { brand: { placeholder: 'DeepSeek Harness' }, getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const update = patch => { state = { ...state, ...patch }; for (const fn of listeners) fn(); };
  const hero = 'conversation.hero.brand.mark', sidebar = 'sidebar.brand.mark';
  const render = name => {
    const winner = [...entries.get(name) || []].sort((a, b) => (a.options.priority || 0) - (b.options.priority || 0))[0];
    return winner ? renderToStaticMarkup(React.createElement(winner.component)) : 'native fallback';
  };
  const Host = () => React.createElement('b', null, 'host brand');
  slots.register({ name: sidebar }, Host);
  applySkinBrands({ slots }, () => runtime, { priority: -100 });
  assert.equal(render(hero), 'native fallback');
  assert.equal(render(sidebar), '<b>host brand</b>');
  update({ selected: 'glyph-copy' });
  assert.match(render(hero), /omd-glyph-brand/);
  assert.match(render(sidebar), /omd-glyph-nav-brand/);
  const removeHost = slots.register({ name: hero }, Host);
  assert.match(render(hero), /omd-glyph-brand/, 'late native registration must not hide the selected theme');
  for (const logo of ['native', 'custom', 'omd']) {
    update({ advanced: { brand: { logo } } });
    assert.equal(render(hero), '<b>host brand</b>');
    assert.equal(render(sidebar), '<b>host brand</b>');
  }
  removeHost();
  update({ advanced: { brand: { logo: 'theme' } }, selected: 'terminal-copy' });
  assert.match(render(hero), /omd-cli-welcome/);
  assert.match(render(hero), /DeepSeek Harness/);
  assert.doesNotMatch(render(hero), /Oh My DSH|omd-glyph/);
  assert.match(render(sidebar), /omd-cli-mark/);
  update({ active: false });
  assert.equal(render(hero), 'native fallback');
  assert.equal(render(sidebar), '<b>host brand</b>');
  update({ active: true, selected: 'glyph-copy' });
  assert.match(render(hero), /omd-glyph-brand/);
  update({ selected: 'default' });
  assert.equal(render(hero), 'native fallback');
  update({ selected: 'glyph-copy' });
  for (const dispose of disposers.reverse()) dispose();
  assert.equal(listeners.size, 0);
  assert.equal(render(hero), 'native fallback');
  assert.equal(render(sidebar), '<b>host brand</b>');
});
