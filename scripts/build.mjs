import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const { name } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(resolve(root, 'lib'), { recursive: true });
await build({
  entryPoints: [resolve(root, 'src/client/index.jsx')],
  outfile: resolve(root, 'lib/client.js'),
  bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
  minifySyntax: true, minifyWhitespace: true, keepNames: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/*'],
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'css-string', setup(b) {
    b.onLoad({ filter: /\.css$/ }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' }));
  } }],
});
