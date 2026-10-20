import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function hostRequire(cli) {
  if (cli) return createRequire(cli);
  const local = createRequire(import.meta.url);
  try { return createRequire(join(dirname(local.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js')); }
  catch { return local; }
}
export function hostModule(req, name) {
  const path = req.resolve(name);
  let directory = dirname(path);
  while (!existsSync(join(directory, 'package.json')) && dirname(directory) !== directory) directory = dirname(directory);
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  return { path, name: pkg.name, version: pkg.version };
}
