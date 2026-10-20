import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, mergeCatalogs } from '../src/host/market.mjs';
test('renamed packages in the same repository subdirectory share one current entry', () => {
  const old = normalizeCatalog('king', { skins: [{ id: 'old-blue', name: 'Blue', package: '@old/blue', repo: 'https://github.com/example/skins',
    install: { target: 'github:example/skins#old&path:/blue', version: '0.0.1' }, compatibility: { dsh: '0.1.0-rc.6' } }] });
  const current = normalizeCatalog('awesome', { plugins: [{ category: 'theme', owner: 'example', name: 'blue', npm: '@new/blue', version: '0.1.8', url: 'https://github.com/example/skins/tree/main/blue' }] });
  const merged = mergeCatalogs([old, current]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].version, '0.1.8');
  assert.equal(merged[0].spec, '@new/blue@0.1.8');
  assert.equal(merged[0].sources.length, 2);
});
test('different packages sharing only a repository root remain separate', () => {
  const rows = normalizeCatalog('king', { skins: ['blue', 'red'].map(name => ({ id: name, name, package: '@example/' + name, repo: 'https://github.com/example/skins', install: { target: '@example/' + name, version: '1.0.0' } })) });
  assert.equal(mergeCatalogs([rows]).length, 2);
});
