import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { runInNewContext } from 'node:vm';
import { zipSync, strToU8 } from 'fflate';
import { extract, githubSpec } from '../src/host/packages.mjs';
import { inspectClient, wrapClient } from '../src/host/client-entry.mjs';
import { inspectTheme } from '../src/host/formats.mjs';
import { NativeThemeBackends } from '../src/host/native-backend.mjs';
import { resolveCli } from '../src/host/probe.mjs';

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

test('native theme backend uses real host services and releases routes when switching', () => temporary(async root => {
  const source = join(root, 'theme'); await mkdir(source);
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'sample', version: '1.0.0', type: 'module', main: 'index.mjs', exports: { './client': './client.js' }, dsh: { client: {} } }));
  await writeFile(join(source, 'client.js'), 'window.__ModuleLoader__.load({id:"sample",factory:()=>({apply(){}})});');
  await writeFile(join(source, 'asset.txt'), 'original asset');
  await writeFile(join(source, 'cordis.patch.yml'), '\uFEFF- insert:\n    - id: sample-backend\n      name: sample\n      config:\n        color: blue\n');
  await writeFile(join(source, 'index.mjs'), `
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export const inject=['webServer','connection','themeTestService'];
export function apply(ctx){
  ctx.webServer.register({kind:'exact',path:'/theme/config',async handler(req,res){
    const rejection=ctx.connection.requestRejection(req);if(rejection!==undefined){res.writeHead(rejection);res.end();return;}
    const file=join(ctx.dshHomePath(),'value.json');
    if(req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);await writeFile(file,Buffer.concat(chunks));}
    let value;try{value=JSON.parse(await readFile(file,'utf8'));}catch{value=null;}
    ctx.themeTestService.calls++;
    const asset=await readFile(new URL('./asset.txt',import.meta.url),'utf8');
    res.end(JSON.stringify({value,asset,calls:ctx.themeTestService.calls}));
  }});
}
`);
  const ctx = new Context(), routes = new Map(), shared = { calls: 0 };
  ctx.provide('webServer', { register(route) { assert.equal(routes.has(route.path), false); routes.set(route.path, route); return () => routes.delete(route.path); } });
  ctx.provide('connection', { requestRejection(req) { return req.authorized ? undefined : 403; } });
  ctx.provide('themeTestService', shared); ctx.provide('dshHomePath', () => root);
  const backends = new NativeThemeBackends(ctx, join(root, 'managed'), { cli: resolveCli({ get() {} }) });
  const theme = await inspectTheme(source, { id: 'sample' });
  assert.deepEqual(theme.backend.defaultConfig, { color: 'blue' });
  const request = async (authorized, method = 'GET', data) => {
    let status = 200, body;
    const req = { authorized, method, async *[Symbol.asyncIterator]() { if (data) yield Buffer.from(data); } };
    await routes.get('/theme/config').handler(req, { writeHead(code) { status = code; }, end(value) { body = value; } });
    return { status, body: body && JSON.parse(body) };
  };
  try {
    await backends.start(theme);
    assert.equal((await request(false)).status, 403);
    assert.deepEqual((await request(true, 'POST', '{"color":"blue"}')).body, { value: { color: 'blue' }, asset: 'original asset', calls: 1 });
    assert.equal(shared.calls, 1);
    await backends.retain([]); assert.equal(routes.size, 0);
    await backends.start(theme);
    assert.equal((await request(true)).body.value.color, 'blue');
    await backends.start({ ...theme, id: 'replacement' });
    assert.equal(routes.size, 1);
  } finally { await backends.dispose(); }
  assert.equal(routes.size, 0);
}));
