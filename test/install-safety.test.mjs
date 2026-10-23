import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { extract } from '../src/host/packages.mjs';
import { inspectTheme } from '../src/host/formats.mjs';
import { Library } from '../src/host/store.mjs';
import { ThemeEngine } from '../src/host/engine.mjs';
import { transformCss } from '../src/host/styles.mjs';
import { adaptClientModules } from '../src/host/client-modules.mjs';
import { normalizeSetting, scheduleVisible } from '../src/client/customization.mjs';
import { isHostThemeService } from '../src/shared/host-contract.mjs';
const temporary = async fn => { const root = await mkdtemp(join(tmpdir(), 'dtp-check-')); try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); } };
test('startup does not await native preset inventory before the host is ready', () => temporary(async root => {
  let onReady, hostReady = false, reads = 0, releaseInventory;
  const inventory = new Promise(resolve => { releaseInventory = resolve; });
  const services = {
    appReady: { onReady(callback) { onReady = callback; return () => { onReady = null; }; } },
    pluginManager: {
      async listBundles() { assert.equal(hostReady, true); return []; },
      async listPlugins() { reads++; await inventory; return []; },
    },
  };
  const engine = new ThemeEngine({ get: key => services[key] }, root);
  try {
    await engine.initialize();
    assert.equal(reads, 0);
    let exposed = false;
    const state = engine.state().then(value => { exposed = true; return value; });
    hostReady = true; onReady();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal(exposed, false);
    releaseInventory();
    assert.equal((await state).version, '0.2.2-dsh.0.2.1-rc.2');
    await engine.discovery;
  } finally { releaseInventory(); engine.dispose(); }
}));
test('unloading before host readiness cancels deferred theme discovery', () => temporary(async root => {
  let callback, unsubscribed = false, reads = 0;
  const services = {
    appReady: { onReady(fn) { callback = fn; return () => { unsubscribed = true; }; } },
    pluginManager: { async listBundles() { reads++; return []; } },
  };
  const engine = new ThemeEngine({ get: key => services[key] }, root);
  await engine.initialize();
  engine.dispose();
  callback();
  await engine.initialization;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(unsubscribed, true);
  assert.equal(reads, 0);
}));
test('archives cannot write outside their staging directory', () => temporary(async root => {
  const zip = zipSync({ '../escaped.txt': strToU8('bad') });
  await assert.rejects(extract(zip, root), /越过/);
}));
test('broken manifests and missing assets fail before entering library', () => temporary(async root => {
  const manifest = join(root, 'theme.json');
  await writeFile(manifest, '{');
  await assert.rejects(inspectTheme(root), SyntaxError);
  await writeFile(manifest, JSON.stringify({ format: 'dsh-theme-plugin/v1', id: 'sample', name: 'Sample', version: '1.0', styles: ['skin.css'] }));
  await writeFile(join(root, 'skin.css'), 'body { background: url(missing.png) }');
  await assert.rejects(inspectTheme(root), /缺少资源/);
}));
test('client inspection leaves original package bytes unchanged', () => temporary(async root => {
  const client = 'window.__ModuleLoader__.load({id:"sample",factory:(require)=>({apply(ctx){}})});';
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'sample', version: '1', exports: { './client': './client.js' }, dsh: { client: {} } }));
  await writeFile(join(root, 'client.js'), client);
  const theme = await inspectTheme(root);
  assert.equal(theme.report.ok, false);
  assert.equal(await readFile(join(root, 'client.js'), 'utf8'), client);
}));
test('installation copies the checked files even when parent directories are hidden', () => temporary(async root => {
  const source = join(root, '.local', 'source'); await mkdir(source, { recursive: true });
  await writeFile(join(source, 'theme.json'), JSON.stringify({ format: 'dsh-theme-plugin/v1', id: 'copy', name: 'Copy', version: '1' }));
  const engine = new ThemeEngine({ get: () => undefined }, join(root, '.local', 'library'));
  await engine.library.initialize();
  const installed = await engine.commitCandidate(await inspectTheme(source), () => {});
  assert.equal(await readFile(join(installed.root, 'theme.json'), 'utf8'), await readFile(join(source, 'theme.json'), 'utf8'));
  engine.dispose();
}));
test('failed updates retain the active revision and interrupted switches retain their recovery receipt', () => temporary(async root => {
  const library = new Library(root); await library.initialize();
  await library.add({ id: 'sample', digest: 'old', report: { ok: true } });
  await library.commit((await library.begin('sample')).token);
  await library.add({ id: 'sample', digest: 'new', report: { ok: true } });
  await library.add({ id: 'sample', digest: 'new', report: { ok: true } });
  assert.equal(library.state.themes[0].previousRevision.digest, 'old');
  const pending = await library.begin('sample');
  await assert.rejects(library.begin('default'), /另一个窗口/);
  await library.fail(pending.token, 'bad');
  assert.equal(library.state.activeDigest, 'old');
  await library.begin('sample');
  const restarted = new Library(root); await restarted.initialize();
  assert.equal(restarted.state.activeDigest, 'old');
  assert.equal(restarted.state.pending.id, 'sample');
  assert.equal(restarted.state.pending.deadline, 0);
}));
test('native theme adoption avoids duplicate installs and restores exclusive routes after failure', () => temporary(async root => {
  let route = 'native';
  const manager = { async setBundleEnabled(name, enabled) {
    assert.equal(name, 'native-theme');
    if (enabled) { assert.equal(route, null); route = 'native'; }
    else { assert.equal(route, 'native'); route = null; }
    return { application: 'applied' };
  } };
  const engine = new ThemeEngine({ get: key => key === 'pluginManager' ? manager : undefined }, root);
  engine.backends = {
    async start(theme) {
      if (!theme?.backend) return;
      assert.equal(route, null, 'the previous native route must be released first');
      route = theme.id;
    },
    async retain(themes) { if (route === 'managed' && !themes.some(t => t?.id === 'managed')) route = null; },
    dispose() {},
  };
  await engine.library.initialize();
  await engine.library.add({ id: 'native', digest: 'native-v1', linked: { name: 'native-theme', packageName: 'native-theme' }, report: { ok: true } });
  await engine.library.add({ id: 'managed', digest: 'managed-v1', backend: {}, report: { ok: true } });
  await engine.library.commit((await engine.library.begin('native')).token);
  const adopted = await engine.installEntry({ id: 'market-native', packageName: 'native-theme' }, () => { throw Error('must not download a second copy'); });
  assert.equal(adopted.themes[0].id, 'native');
  const pending = await engine.activate('managed');
  assert.equal(route, 'managed');
  await engine.fail(pending.token, 'client failed');
  assert.equal(route, 'native');
  assert.equal(engine.library.state.active, 'native');
  assert.equal(engine.library.state.pending, null);
  engine.dispose();
}));
test('stylesheet scoping retains html/root conditions and isolates animations', () => {
  const nativeTokens = new Set();
  const css = transformCss(':root{--dsw-alias-brand-primary:red} :where(:root)::before{content:""} html.dark body{color:red} .card{animation:spin 1s} @keyframes spin{to{opacity:0}}', { id: 'sample', resource: x => x, nativeTokens });
  assert.match(css, /html\[data-dtp-theme=["']?sample["']?\]/);
  assert.match(css, /html\[data-dtp-theme=["']?sample["']?\]\.dark/);
  assert.match(css, /\.card:is\(html\[data-dtp-theme=["']?sample["']?\]/);
  assert.match(css, /:where\(:root\):is\([^{}]+\)::before/);
  assert.match(css, /@keyframes dtp-sample-spin/);
  assert.deepEqual([...nativeTokens], ['--dsw-alias-brand-primary']);
  assert.match(css, /--dtp-css-dsw-alias-brand-primary:red/);
});
test('legacy module mappings reject unknown exports', () => {
  const old = '@deepseek-ai/dsh-client-runtime/client';
  const mapped = adaptClientModules(`require=>{const r=require("${old}");return r.defineStore({});}`, [old]);
  assert.deepEqual(mapped.requires, ['@deepseek-ai/dsh-client-store']);
  assert.throws(() => adaptClientModules(`require=>{const r=require("${old}");return r.unknown();}`, [old]), /已变更/);
});
test('upstream schedule settings retain overnight visibility rules', () => {
  const value = normalizeSetting({ type: 'visibility-schedule' }, { enabled: true, outside: 'visible', ranges: [{ start: '22:00', end: '06:00' }] });
  assert.equal(scheduleVisible(value, new Date(2026, 9, 20, 23)), false);
  assert.equal(scheduleVisible(value, new Date(2026, 9, 20, 12)), true);
});
test('native theme infrastructure cannot be toggled as a skin', () => temporary(async root => {
  let touched = false;
  const engine = new ThemeEngine({ get: key => key === 'pluginManager' ? { setPluginEnabled() { touched = true; } } : undefined }, root);
  assert.equal(isHostThemeService('@deepseek-ai/dsh-client-ui-theme'), true);
  assert.equal(isHostThemeService('@deepseek-ai/dsh-client-ui-aqua'), false);
  await assert.rejects(engine.toggleLinked({ linked: { name: '@deepseek-ai/dsh-client-ui-theme', entryId: 'include:ui-theme' } }, false), /不能停用/);
  assert.equal(touched, false);
  engine.dispose();
}));
