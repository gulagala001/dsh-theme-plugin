import { backendSource } from './backend-build.mjs';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { ownedFile } from './files.mjs';

async function bundleOptions(root, pkg, assets) {
  const patches = pkg.dsh?.bundle?.patch || 'cordis.patch.yml';
  const rows = [];
  const collect = value => {
    if (Array.isArray(value)) for (const row of value) collect(row);
    else if (value && typeof value === 'object') {
      if (value.name === pkg.name) rows.push(value);
      collect(value.insert); if (value.group) collect(value.config);
    }
  };
  for (const path of Array.isArray(patches) ? patches : [patches]) {
    if (typeof path !== 'string' || !assets.has(path.replace(/^\.\//, ''))) continue;
    collect(parse((await readFile(await ownedFile(root, path), 'utf8')).replace(/^\uFEFF/, '')));
  }
  const row = rows[0];
  return row ? { profileEntryId: row.id, profileInject: row.inject, defaultConfig: row.config || {} } : {};
}

export async function inspectBackend(root, pkg, assets, options) {
  const value = pkg.exports?.['.'];
  const entry = typeof value === 'string' ? value : value?.import || value?.default || pkg.main;
  if (!entry || !assets.has(entry.replace(/^\.\//, ''))) return null;
  return { entry: entry.replace(/^\.\//, ''), runtime: 'native-host-plugin',
    ...await bundleOptions(root, pkg, assets), ...await backendSource(root, pkg, entry, options) };
}
