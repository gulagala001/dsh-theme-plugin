import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeEngine } from '../src/host/engine.mjs';
import { createClient } from '../src/client/store.mjs';
import { ADAPTER_VERSION } from '../src/shared/host-contract.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function fixture(t, services = {}) {
  const root = await mkdtemp(join(tmpdir(), 'theme-activation-'));
  const engine = new ThemeEngine({ get: name => services[name] }, root);
  const runtime = { active: null, launches: [] };
  engine.backends = {
    async start(theme) {
      if (!theme?.backend || runtime.active === `${theme.id}/${theme.digest}`) return;
      runtime.active = `${theme.id}/${theme.digest}`;
      runtime.launches.push(runtime.active);
    },
    async retain(themes) {
      if (!themes.some(theme => theme && `${theme.id}/${theme.digest}` === runtime.active)) runtime.active = null;
    },
    async dispose() { runtime.active = null; },
  };
  await engine.library.initialize();
  t.after(async () => { await engine.dispose(); await rm(root, { recursive: true, force: true }); });
  for (const id of ['first', 'second']) await engine.library.add({ id, digest: 'v1', backend: {}, report: { ok: true, adapterVersion: ADAPTER_VERSION } });
  await engine.library.commit((await engine.library.begin('first')).token);
  await engine.state();
  return { engine, runtime };
}

test('reading state during activation preserves the candidate backend through commit', async t => {
  const { engine, runtime } = await fixture(t);
  const candidate = await engine.activate('second');
  assert.equal((await engine.state()).active, 'first', 'the client has not confirmed the switch');
  assert.equal(runtime.active, 'second/v1', 'a read must not restart the committed predecessor');
  await engine.commit(candidate.token);
  assert.equal(runtime.active, 'second/v1');
  assert.deepEqual(runtime.launches, ['first/v1', 'second/v1']);
});

test('failure restoration and confirmation cannot act on the same activation concurrently', async t => {
  const { engine, runtime } = await fixture(t);
  const candidate = await engine.activate('second');
  const entered = deferred(), release = deferred(), retain = engine.backends.retain;
  engine.backends.retain = async themes => {
    if (themes.some(theme => theme?.id === 'first')) { entered.resolve(); await release.promise; }
    return retain(themes);
  };
  const failed = engine.fail(candidate.token, 'client failed');
  await entered.promise;
  const committed = engine.commit(candidate.token).then(() => 'committed', error => error.code);
  release.resolve();
  await failed;
  assert.equal(await committed, 'activation-expired');
  assert.equal(engine.library.state.active, 'first');
  assert.equal(runtime.active, 'first/v1');
});

test('an expired native switch is restored before another activation starts', async t => {
  const enabled = new Set(['native-first']);
  const { engine } = await fixture(t, { pluginManager: {
    async setBundleEnabled(name, value) { if (value) enabled.add(name); else enabled.delete(name); return { application: 'applied' }; },
  } });
  for (const id of ['native-first', 'native-second']) await engine.library.add({ id, digest: 'v1', linked: { name: id }, report: { ok: true } });
  await engine.library.commit((await engine.library.begin('native-first')).token);
  await engine.activate('native-second');
  await engine.library.mutate(state => { state.pending.deadline = 0; });
  const next = await engine.activate('default');
  await engine.commit(next.token);
  assert.deepEqual([...enabled], []);
});

test('library reads do not erase a pending switch before runtime recovery', async t => {
  const { engine, runtime } = await fixture(t);
  const candidate = await engine.activate('second');
  await engine.library.mutate(state => { state.pending.deadline = 0; });
  assert.equal((await engine.library.snapshot()).pending?.token, candidate.token);
  await engine.state();
  assert.equal(engine.library.state.pending, null);
  assert.equal(runtime.active, 'first/v1');
});

test('installing a newer revision retains the in-flight candidate and its predecessor', async t => {
  const { engine } = await fixture(t);
  await engine.library.add({ id: 'first', digest: 'v2', backend: {}, report: { ok: true } });
  const candidate = await engine.activate('first');
  await engine.library.add({ id: 'first', digest: 'v3', backend: {}, report: { ok: true } });
  await engine.library.add({ id: 'first', digest: 'v4', backend: {}, report: { ok: true } });
  assert.equal(engine.theme('first', candidate.digest)?.digest, 'v2');
  assert.equal(engine.theme('first', candidate.previousDigest)?.digest, 'v1');
  await engine.commit(candidate.token);
  assert.equal((await engine.state()).activeTheme.digest, 'v2');
});

test('inspecting a replacement does not shadow the installed theme revision', async t => {
  const { engine } = await fixture(t);
  await engine.commitCandidate({ id: 'first', digest: 'v2', files: {}, report: { ok: false } }, () => {
    assert.equal(engine.theme('first', 'v1')?.digest, 'v1');
    assert.equal(engine.theme('first')?.digest, 'v1');
    assert.equal(engine.theme('first', 'v2'), null, 'only checked and published revisions are visible');
  });
  assert.equal(engine.theme('first')?.digest, 'v2');
});

test('removing the active theme releases its backend and clears rollback references', async t => {
  const { engine, runtime } = await fixture(t);
  const removed = await engine.remove('first');
  assert.equal(runtime.active, null);
  assert.equal(removed.active, 'default');
  assert.equal(removed.activeDigest, undefined);
  assert.equal(removed.previous, null);
  assert.equal(removed.themes.some(theme => theme.id === 'first'), false);
});

test('an obsolete failure receipt cannot roll back a later committed switch', async t => {
  const { engine, runtime } = await fixture(t);
  const first = await engine.activate('second');
  await engine.commit(first.token);
  const next = await engine.activate('first');
  await engine.commit(next.token);
  const launches = runtime.launches.length;
  assert.equal((await engine.fail(first.token, 'late')).active, 'first');
  assert.equal(runtime.active, 'first/v1');
  assert.equal(runtime.launches.length, launches);
});

test('failed runtime recovery keeps an expired receipt until restoration actually succeeds', async t => {
  const { engine, runtime } = await fixture(t);
  const candidate = await engine.activate('second');
  const start = engine.backends.start;
  engine.backends.start = async theme => { if (theme?.id === 'first') throw Error('backend unavailable'); return start(theme); };
  await assert.rejects(engine.fail(candidate.token, 'client failed'), /backend unavailable/);
  assert.equal(engine.library.state.pending?.token, candidate.token);
  assert.equal(engine.library.state.pending.deadline, 0);
  await assert.rejects(engine.commit(candidate.token), /backend unavailable/);
  engine.backends.start = start;
  await assert.rejects(engine.commit(candidate.token), { code: 'activation-expired' });
  assert.equal(engine.library.state.pending, null);
  assert.equal(runtime.active, 'first/v1');
});

test('disposal drains an in-flight activation before releasing its runtime', async t => {
  const { engine, runtime } = await fixture(t);
  const entered = deferred(), release = deferred(), start = engine.backends.start;
  engine.backends.start = async theme => {
    if (theme?.id === 'second') { entered.resolve(); await release.promise; }
    return start(theme);
  };
  const activation = engine.activate('second').catch(error => error.name);
  await entered.promise;
  const disposed = engine.dispose();
  release.resolve();
  assert.equal(await activation, 'AbortError');
  await disposed;
  assert.equal(engine.library.state.active, 'first');
  assert.equal(engine.library.state.pending, null);
  assert.equal(runtime.active, null);
  await assert.rejects(engine.activate('second'), { name: 'AbortError' });
});

test('cold recovery leaves managed backends stopped until host compatibility is rechecked', async t => {
  const { engine, runtime } = await fixture(t);
  await engine.activate('second');
  await engine.backends.retain([]);
  await engine.library.mutate(state => { state.pending.deadline = 0; state.themes.find(theme => theme.id === 'first').report.adapterVersion = -1; });
  engine.discover = async () => {};
  await engine.initializeNative(); await engine.revalidation;
  assert.equal(engine.library.state.pending, null);
  assert.equal(engine.library.state.active, 'default');
  assert.equal(runtime.active, null);
  assert.deepEqual(runtime.launches, ['first/v1', 'second/v1']);
});

function clientFixture(t, request) {
  const saved = Object.fromEntries(['window', 'document', 'BroadcastChannel', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, {
    window: new EventTarget(), document: { querySelectorAll: () => [] }, BroadcastChannel: undefined,
    fetch: async (_url, options) => request(_url.split('/').at(-1), JSON.parse(options.body), options.signal),
  });
  let selected = 'default';
  const appearance = {
    getSnapshot: () => ({ active: true, selected, skins: [] }), subscribe: () => () => {},
    select(id) { selected = id; }, reset() { selected = 'default'; },
  };
  const client = createClient({ get: () => undefined }, appearance);
  t.after(() => {
    client.dispose();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { client, selected: () => selected };
}
const response = (value, ok = true) => ({ ok, json: async () => value });

test('successful activation uses its committed state even when a later read is unavailable', async t => {
  let active = 'default', reads = 0;
  const { client, selected } = clientFixture(t, async (action, data) => {
    if (action === 'activate') return response({ token: 'pending', previous: active });
    if (action === 'commit') active = 'glyph-motion';
    if (action === 'state' && ++reads > 1) throw Error('connection interrupted after commit');
    return response({ active, revision: active === 'default' ? 1 : 2, themes: [] });
  });
  await client.refresh();
  assert.ok(await client.activate('glyph-motion'));
  assert.equal(selected(), 'glyph-motion');
  assert.equal(client.getSnapshot().active, 'glyph-motion');
  assert.equal(reads, 1, 'the commit already carries the authoritative state');
});

test('a rejected activation renders the server recovery receipt instead of an obsolete predecessor', async t => {
  const { client, selected } = clientFixture(t, async action => {
    if (action === 'activate') return response({ token: 'expired', previous: 'default' });
    if (action === 'commit') return response({ error: 'expired', code: 'activation-expired' }, false);
    return response({ active: 'ios-liquid-glass', revision: 3, themes: [] });
  });
  assert.equal(await client.activate('glyph-motion'), null);
  assert.equal(selected(), 'ios-liquid-glass');
  assert.equal(client.getSnapshot().active, 'ios-liquid-glass');
});

test('a failed recovery reports both the switch error and the unfinished restoration', async t => {
  const { client } = clientFixture(t, async action => {
    if (action === 'activate') return response({ token: 'pending', previous: 'default' });
    return response({ error: action === 'commit' ? 'confirmation failed' : 'backend unavailable' }, false);
  });
  await client.activate('glyph-motion');
  assert.match(client.getSnapshot().error.message, /confirmation failed.*恢复未完成.*backend unavailable/);
});

test('a delayed state read cannot replace a newer activation receipt', async t => {
  const entered = deferred(), release = deferred();
  const { client, selected } = clientFixture(t, async action => {
    if (action === 'state') { entered.resolve(); await release.promise; return response({ active: 'default', revision: 1, themes: [] }); }
    if (action === 'activate') return response({ token: 'new', previous: 'default' });
    return response({ active: 'glyph-motion', revision: 2, themes: [] });
  });
  const reading = client.refresh({ apply: true });
  await entered.promise;
  await client.activate('glyph-motion');
  release.resolve(); await reading;
  assert.equal(client.getSnapshot().active, 'glyph-motion');
  assert.equal(selected(), 'glyph-motion');
});

test('disposing the client prevents late activation receipts from changing or confirming appearance', async t => {
  const pending = deferred(), entered = deferred(), actions = [];
  const { client, selected } = clientFixture(t, async (action, _data, signal) => {
    actions.push(action);
    if (action === 'activate') { entered.resolve(signal); await pending.promise; return response({ token: 'late', previous: 'default' }); }
    return response({ active: 'glyph-motion', revision: 2, themes: [] });
  });
  const switching = client.activate('glyph-motion');
  const signal = await entered.promise;
  client.dispose(); pending.resolve();
  await switching;
  assert.equal(signal?.aborted, true);
  assert.equal(selected(), 'default');
  assert.deepEqual(actions, ['activate']);
});
