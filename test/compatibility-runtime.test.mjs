import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { zipSync, strToU8 } from 'fflate';
import { extract, githubSpec } from '../src/host/packages.mjs';
import { inspectClient, wrapClient } from '../src/host/client-entry.mjs';
import { inspectTheme } from '../src/host/formats.mjs';
import { ThemeBackends } from '../src/host/theme-backend.mjs';

const temporary = async fn => {
  const root = await mkdtemp(join(tmpdir(), 'dtp-compat-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
};

test('monorepo source selects path-only refs without importing bundled dependencies', () => temporary(async root => {
  const parsed = githubSpec('github:author/themes#path:/skins/orca');
  assert.deepEqual(parsed, { repo: 'author/themes', ref: 'HEAD', subdir: 'skins/orca' });
  const data = zipSync({
    'repo/skins/orca/skin.json': strToU8('{}'),
    'repo/skins/other/skin.json': strToU8('{"wrong":true}'),
    'repo/skins/orca/node_modules/untrusted/index.js': strToU8('throw Error("not part of theme")'),
  });
  const extracted = await extract(data, root, { subdir: parsed.subdir });
  assert.equal(await readFile(join(extracted.root, 'skin.json'), 'utf8'), '{}');
  assert.equal(extracted.files, 1);
}));

test('private module loader retains closures, method factories and the intended entry', () => {
  const source = `
const value=41, ID="skin";
const loader=typeof window!=="undefined"?window.__ModuleLoader__:null;
loader.load({id:"helper",factory(){return {value};}});
const register=registration=>window.__ModuleLoader__.load(registration);
register({id:ID,factory(require){const helper=require("helper");return {apply(){return helper.value+1;}};}});
`;
  const inspected = inspectClient(source, 'client.js', { moduleId: 'skin' });
  const registrations = [];
  const window = { __ModuleLoader__: { load: x => registrations.push(x) } };
  runInNewContext(wrapClient(source, { moduleId: 'isolated/skin', originalModuleId: inspected.moduleId }), { window, document: {} });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, 'isolated/skin');
  assert.equal(registrations[0].factory(() => { throw Error('private helper leaked'); }).apply(), 42);
});

test('missing published JS builds local source without modifying original files', () => temporary(async root => {
  await mkdir(join(root, 'src'));
  const source = 'export function apply(){ return 42; }';
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'synthetic', version: '1', exports: { './client': './lib/client.js' }, dsh: { client: {} } }));
  await writeFile(join(root, 'src/client.ts'), source);
  const theme = await inspectTheme(root);
  assert.equal(theme.client.build.entry, 'src/client.ts');
  assert.equal(await readFile(join(root, 'src/client.ts'), 'utf8'), source);
  await assert.rejects(readFile(join(root, 'lib/client.js')), { code: 'ENOENT' });
  assert.ok(theme.client.code.includes('apply'));
}));

test('theme backend persists real configuration, authenticates requests and cannot read adjacent files', () => temporary(async root => {
  const source = join(root, 'theme'); await mkdir(source);
  const secret = join(root, 'unrelated.txt'); await writeFile(secret, 'not accessible');
  await writeFile(join(source, 'package.json'), '{"type":"module"}');
  await writeFile(join(source, 'index.mjs'), `
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export const inject=['webServer','connection'];
export function apply(ctx){
  ctx.inject(['webServer'],child=>child.webServer.register({kind:'prefix',path:'/theme',handler(req,res){res.writeHead(404);res.end();}}));
  ctx.webServer.register({kind:'exact',path:'/theme/config',async handler(req,res){
    const rejection=ctx.connection.requestRejection(req);if(rejection!==undefined){res.writeHead(rejection);res.end();return;}
    let denied;try{await readFile(${JSON.stringify(secret)});}catch(e){denied=e.code;}
    const file=join(ctx.dshHomePath(),'value.json');
    if(req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);await writeFile(file,Buffer.concat(chunks));}
    let value;try{value=JSON.parse(await readFile(file,'utf8'));}catch{value=null;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value,denied}));
  }});
}
`);
  const backends = new ThemeBackends(join(root, 'managed'));
  const theme = { id: 'sample', digest: 'v1', root: source, backend: { entry: 'index.mjs' } };
  let running;
  const stop = async () => {
    if (!running || running.child.exitCode !== null || running.child.signalCode) return;
    const exit = once(running.child, 'exit'); backends.dispose(); await exit;
  };
  try {
    running = await backends.start(theme);
    assert.equal((await fetch(running.url + '/theme/config')).status, 403);
    const options = { headers: { 'x-dtp-bridge': running.token, 'content-type': 'application/json' } };
    const saved = await fetch(running.url + '/theme/config', { ...options, method: 'POST', body: '{"color":"blue"}' });
    assert.deepEqual(await saved.json(), { value: { color: 'blue' }, denied: 'ERR_ACCESS_DENIED' });
    await stop();
    running = await backends.start(theme);
    const restored = await fetch(running.url + '/theme/config', { headers: { 'x-dtp-bridge': running.token } });
    assert.equal((await restored.json()).value.color, 'blue');
  } finally { await stop(); }
}));
