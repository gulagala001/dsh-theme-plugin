import { mkdtemp, rm, readFile, realpath, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import semver from 'semver';
import { acquire } from './packages.mjs';
import { fetchJson } from './network.mjs';
import { ThemeError } from '../shared/protocol.mjs';
import { isBuiltin } from 'node:module';

// Resolve only dependencies actually imported by the browser build. Fetch
// immutable registry archives, verify their integrity, and never run scripts.
export async function buildDependencies(root, pkg) {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'dsh-theme-dependencies-')));
  const packages = [{ root, pkg }], pending = new Map(), resolved = [];
  return {
    temporary, resolved,
    dispose: () => rm(temporary, { recursive: true, force: true }),
    async resolve(args, build, { node = false } = {}) {
      if (args.pluginData?.registryResolved || /^[./]|^[a-z]+:/i.test(args.path)) return null;
      if (node && isBuiltin(args.path)) return { path: args.path, external: true };
      if ((node ? /^@deepseek-ai\// : /^(?:react(?:-dom)?(?:\/|$)|@deepseek-ai\/)/).test(args.path)) return { path: args.path, external: true };
      const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0];
      const parent = packages.filter(p => !relative(p.root, args.resolveDir).startsWith('..')).sort((a, b) => b.root.length - a.root.length)[0];
      const range = parent?.pkg.dependencies?.[name] || parent?.pkg.optionalDependencies?.[name] || parent?.pkg.peerDependencies?.[name] || parent?.pkg.devDependencies?.[name];
      // Optional CommonJS probes retain their original try/catch fallback.
      // An actually required missing module still fails during preflight.
      if (node && !range && args.kind === 'require-call') return { path: args.path, external: true };
      if (!range || !semver.validRange(range)) throw new ThemeError('client-dependency', `主题未声明可解析的依赖版本：${name}`);
      const key = `${name}@${range}`;
      if (!pending.has(key)) pending.set(key, (async () => {
        if (pending.size > 80) throw new ThemeError('client-dependencies', '主题依赖数量过多');
        const catalog = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { limit: 20 * 1024 * 1024 });
        const version = semver.maxSatisfying(Object.keys(catalog.versions || {}), range);
        if (!version) throw new ThemeError('client-dependency', `找不到依赖版本：${key}`);
        const acquired = await acquire({ spec: `${name}@${version}` }, join(temporary, String(pending.size)));
        const manifest = JSON.parse(await readFile(join(acquired.root, 'package.json'), 'utf8'));
        if (manifest.name !== name || manifest.version !== version) throw new ThemeError('package-integrity', '依赖发行包与声明不一致');
        packages.push({ root: acquired.root, pkg: manifest });
        resolved.push({ name, version, digest: acquired.digest });
        const resolver = join(temporary, 'resolve-' + resolved.length);
        const link = join(resolver, 'node_modules', name);
        await mkdir(join(link, '..'), { recursive: true });
        await symlink(acquired.root, link, process.platform === 'win32' ? 'junction' : 'dir');
        return resolver;
      })());
      const folder = await pending.get(key);
      // Let esbuild honor the package's exports, conditions and subpaths.
      return build.resolve(args.path, { kind: args.kind, resolveDir: folder, pluginData: { registryResolved: true } });
    },
  };
}
