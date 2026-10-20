import { readFile, realpath } from 'node:fs/promises';
import { relative, dirname } from 'node:path';
import { build } from 'esbuild-wasm';
import { buildDependencies } from './build-dependencies.mjs';
import { ownedFile } from './files.mjs';
import { hostRequire, hostModule } from './host-modules.mjs';
import semver from 'semver';
import { ThemeError } from '../shared/protocol.mjs';

// Bundle third-party JavaScript without running package scripts. DSH modules
// remain external and resolve to the actual supported host at load time.
export async function backendSource(root, pkg, entry, { cli } = {}) {
  root = await realpath(root);
  const dependencies = await buildDependencies(root, pkg);
  const host = hostRequire(cli), hostDependencies = new Map();
  try {
    const result = await build({
      absWorkingDir: root, entryPoints: [entry], write: false, bundle: true,
      platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent',
      external: ['@deepseek-ai/*'], minify: false,
      plugins: [{
        name: 'theme-backend-inputs',
        setup(b) {
          b.onResolve({ filter: /.*/ }, args => {
            if (/^(?:node:|[./])/.test(args.path)) return null;
            const name = args.path.startsWith('@') ? args.path.split('/').slice(0, 2).join('/') : args.path.split('/')[0];
            const range = pkg.dependencies?.[name] || pkg.optionalDependencies?.[name] || pkg.peerDependencies?.[name];
            if (!name.startsWith('@deepseek-ai/')) try {
              const available = hostModule(host, name);
              if (available.name === name && (!range || semver.validRange(range) && semver.satisfies(available.version, range))) {
                hostDependencies.set(name, { name, version: available.version, ...(range ? { range } : {}) });
                return { path: args.path, external: true };
              }
            } catch {}
            return dependencies.resolve(args, b, { node: true });
          });
          b.onLoad({ filter: /\.[cm]?js$/, namespace: 'file' }, async args => {
            if (args.path.startsWith(root + '/')) {
              const path = relative(root, args.path);
              let contents = await readFile(await ownedFile(root, path), 'utf8');
              if (/\b(?:module\.exports|exports\.|require\s*\()/.test(contents)) {
                const prelude = [];
                for (const [key, location] of [['__filename', path], ['__dirname', dirname(path) + '/']]) {
                  if (new RegExp(`\\b${key}\\b`).test(contents) && !new RegExp(`(?:const|let|var)\\s+${key}\\b`).test(contents)) {
                    prelude.push(`var ${key}=__dtpFileUrlToPath(new URL(${JSON.stringify(location)},__dtpThemeRoot));`);
                  }
                }
                if (prelude.length) contents = prelude.join('\n') + '\n' + contents.replace(/^#![^\n]*\n/, '');
              }
              // Asset paths retain the original module's location after the
              // immutable source directory is copied into the theme library.
              return { contents: contents.replace(/\bimport\.meta\.url\b/g,
                `new URL(${JSON.stringify(path)}, __dtpThemeRoot).href`), loader: 'js' };
            }
            if (!args.path.startsWith(dependencies.temporary + '/')) throw new ThemeError('backend-build-path', '主题后台引用超出下载目录');
          });
        },
      }],
    });
    return { code: result.outputFiles[0].text, dependencies: dependencies.resolved, hostDependencies: [...hostDependencies.values()] };
  } catch (error) {
    throw new ThemeError('backend-build', '自动准备主题后台失败', { errors: error.errors?.map(e => e.text) || [error.message], entry });
  } finally { await dependencies.dispose(); }
}
