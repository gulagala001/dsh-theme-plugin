import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import { ThemeConfigEntries } from '../src/host/config-entries.mjs';

test('managed theme configuration uses native validation and updates without changing foreign entries', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'theme-config-'));
  const require = createRequire(import.meta.url), host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
  const { default: Loader } = await import(host.resolve('@deepseek-ai/cordis-plugin-loader'));
  const { default: z } = await import(host.resolve('@deepseek-ai/schemastery'));
  const ctx = new Context(); await ctx.plugin(Loader);
  let foreign = 0, live;
  const originalEdit = () => ++foreign;
  const editor = { entries: () => [], configuration: () => [], edit: originalEdit };
  ctx.provide('configEditor', editor); ctx.provide('settings', { invalidate() {} });
  const manager = new ThemeConfigEntries(ctx, directory, host);
  const plugin = { Config: z.object({ color: z.string().default('blue') }), apply(scope, config) {
    live = config; scope.on('internal/update', next => { live = next; });
  } };
  const managed = await manager.create({ id: 'owned', packageName: 'fixture-theme', backend: { defaultConfig: { color: 'blue' } } }, ctx, plugin);
  t.after(async () => { await managed.entry.fiber?.dispose(); await managed.dispose(); manager.dispose(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  await managed.entry.update(managed.entry.options, true); await managed.entry.fiber.await();
  assert.equal(live.color, 'blue');
  await editor.edit(managed.entry, () => ({ color: 'red' }));
  assert.equal(live.color, 'red');
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'owned.json'), 'utf8')), { color: 'red' });
  await assert.rejects(editor.edit(managed.entry, () => ({ color: 17 })));
  assert.equal(live.color, 'red');
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'owned.json'), 'utf8')), { color: 'red' });
  assert.equal(editor.edit({}, () => ({})), 1); assert.equal(foreign, 1);
  manager.dispose(); assert.equal(editor.edit, originalEdit);
});
