import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { buildDependencies } from './build-dependencies.mjs';
import { exists, ownedFile, inside } from './files.mjs';
import { ThemeError } from '../shared/protocol.mjs';

function exportPath(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(exportPath).find(Boolean);
  if (value && typeof value === 'object') return exportPath(value.browser || value.import || value.default || value.require);
}

// Build only a browser entry with our pinned compiler. Never run package
// scripts, install hooks, shell commands or the theme's Node entry point.
export async function clientSource(root, pkg, requested) {
  root = await realpath(root);
  const declared = requested || exportPath(pkg.exports?.['./client']) || 'lib/client.js';
  const published = inside(root, declared);
  if (await exists(published) && !/\.[cm]?tsx?$/.test(declared)) {
    const code = await readFile(await ownedFile(root, declared), 'utf8');
    if (code.includes('__ModuleLoader__') && !/\brequire\s*\(\s*['"]\.\.?\//.test(code)) return { path: declared.replace(/^\.\//, ''), code };
  }
  const names = [declared, 'src/client.tsx', 'src/client.ts', 'src/client/index.tsx', 'src/client/index.ts',
    'src/client.jsx', 'src/client.js', 'src/client/index.jsx', 'src/client/index.js', 'client.tsx', 'client.ts', 'client/index.tsx', 'client/index.ts'];
  let entry;
  for (const name of names) if (await exists(inside(root, name))) { entry = name; break; }
  if (!entry) throw new ThemeError('client-entry-missing', '原包没有已构建客户端，也没有可自动编译的客户端源码', { declared });
  const dependencies = await buildDependencies(root, pkg);
  let result, fragment = false;
  const source = await readFile(await ownedFile(root, entry), 'utf8');
  if (!/\.[cm]?tsx?$/.test(entry)) {
    try { const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); fragment = ast.body.some(x => x.type === 'ReturnStatement'); } catch {}
  }
  try {
    result = await build({
      absWorkingDir: root,
      ...(fragment ? { stdin: { contents: `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{${source}\n}});`, resolveDir: resolve(root, entry, '..'), sourcefile: entry, loader: 'js' } } : { entryPoints: [entry] }),
      outfile: 'theme-client.js', write: false,
      bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
      minify: true, logLevel: 'silent', metafile: true,
      tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', target: 'ES2022' } },
      external: ['react', 'react-dom', 'react/*', 'react-dom/*', '@deepseek-ai/*'],
      loader: Object.fromEntries(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.otf'].map(x => [x, 'dataurl'])),
      plugins: [{
        name: 'local-theme-inputs',
        setup(b) {
          b.onResolve({ filter: /\?raw$/ }, args => ({ path: inside(root, relative(root, resolve(args.resolveDir, args.path.slice(0, -4)))), namespace: 'raw-theme' }));
          b.onResolve({ filter: /.*/ }, args => dependencies.resolve(args, b));
          b.onLoad({ filter: /.*/, namespace: 'raw-theme' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
          b.onLoad({ filter: /.*/, namespace: 'file' }, async args => {
            if (!args.path.startsWith(root + '/') && !args.path.startsWith(dependencies.temporary + '/')) throw new ThemeError('client-build-path', '主题源码引用超出下载目录');
            return null;
          });
        },
      }],
    });
  } catch (e) {
    throw new ThemeError('client-build', '自动编译主题客户端失败', { errors: e.errors?.map(x => x.text) || [e.message], entry });
  } finally { await dependencies.dispose(); }
  const js = result.outputFiles.find(x => x.path.endsWith('.js'))?.text;
  if (!js) throw new ThemeError('client-build', '主题编译未生成浏览器入口');
  const css = result.outputFiles.filter(x => x.path.endsWith('.css')).map(x => x.text).join('\n');
  let registered = false;
  simple(parse(js, { ecmaVersion: 'latest' }), { MemberExpression(node) {
    if ((node.computed ? node.property.value : node.property.name) === '__ModuleLoader__') registered = true;
  } });
  const code = registered ? js : `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name || 'theme')},factory:(require)=>{var module={exports:{}};var exports=module.exports;
${js}
const component=typeof module.exports.apply==="function"?module.exports:module.exports.default;
if(component&&${!!css}){const original=component.apply;component.apply=function(ctx,...args){const style=document.createElement("style");style.dataset.pluginCss=${JSON.stringify(pkg.name + '/compiled.css')};style.textContent=${JSON.stringify(css)};ctx.effect(()=>{document.head.append(style);return()=>style.remove();});return original.call(this,ctx,...args);};}
return module.exports;}});`;
  return { path: entry.replace(/^\.\//, ''), code, built: { entry, compiler: 'esbuild', dependencies: dependencies.resolved, inputs: Object.keys(result.metafile.inputs).filter(x => !x.startsWith('../')) } };
}
