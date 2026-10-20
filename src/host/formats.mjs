import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import semver from 'semver';
import { json, exists, walk, digest, ownedFile } from './files.mjs';
import { transformCss } from './styles.mjs';
import { adaptClientAssets } from './client-assets.mjs';
import { adaptClientModules } from './client-modules.mjs';
import { ADAPTER_VERSION } from '../shared/host-contract.mjs';
import { API, HOST_VERSION, PROTOCOL, ThemeError, slug, text } from '../shared/protocol.mjs';
import { validateSkin } from '../../vendor/appearance/src/client/skins/format.mjs';
const MAX_TEXT = 12 * 1024 * 1024;
function tokens(value) {
  const out = {};
  for (const [name, v] of Object.entries(value || {})) {
    if (!/^--[a-zA-Z][a-zA-Z0-9_-]{0,140}$/.test(name) || typeof v !== 'string' || v.length > 2000 || /[{};<>]|url\s*\(|expression\s*\(/i.test(v)) throw new ThemeError('theme-token', `主题参数无效：${name}`);
    out[name] = v;
  }
  return out;
}
export function normalizeData(value) {
  if (value?.schemaVersion === 1 && value.tokens?.common) return { format: 'omd-v1', legacy: validateSkin(value), name: value.name, originalId: value.id, version: value.version };
  if (value?.format === 'dsh-dream-skin/pack' && value.version === 1) {
    const m = value.manifest, mode = m?.colorScheme;
    if (!m?.id || !['light', 'dark'].includes(mode)) throw new ThemeError('theme-manifest', 'Dream 主题包缺少有效主题信息');
    return { format: 'dream-v1', name: m.nameZh || m.name, originalId: m.id, version: m.version || '1.0.0', tokens: { [mode]: tokens(m.tokens) }, modes: [mode], author: m.author, description: 'Dream Skin 配色包；此交换格式仅包含配色。' };
  }
  if (value?.format === PROTOCOL) {
    if (!value.id || !value.name || !value.version) throw new ThemeError('theme-manifest', '主题缺少 id、名称或版本');
    return { format: PROTOCOL, originalId: value.id, name: value.name, version: value.version, author: value.author, description: value.description,
      tokens: { light: tokens(value.tokens?.light), dark: tokens(value.tokens?.dark) },
      styles: value.styles || [], background: value.background || {}, settings: value.settings || [], client: value.client, bodyAttr: value.bodyAttr };
  }
  // Simple --dsw token exports are already used by several existing managers.
  if (value?.id && (value.label || value.name) && value.tokens && !value.format) {
    const light = {}, dark = {};
    for (const [key, v] of Object.entries(value.tokens)) {
      if (typeof v === 'string') light[key] = dark[key] = v;
      else { if (v?.light !== undefined) light[key] = v.light; if (v?.dark !== undefined) dark[key] = v.dark; }
    }
    return { format: 'native-tokens', originalId: value.id, name: value.name || value.label, version: value.version || '1.0.0', tokens: { light: tokens(light), dark: tokens(dark) } };
  }
  throw new ThemeError('theme-format', '尚不能自动识别此主题格式，请使用“复制给 AI 修复”');
}
export function inspectClient(code, filename) {
  let ast;
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (e) { throw new ThemeError('client-syntax', `主题客户端语法不兼容：${filename}:${e.loc?.line || 0} ${e.message}`); }
  let registration, count = 0;
  const requires = new Set(), network = new Set();
  simple(ast, {
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type === 'MemberExpression' && callee.property?.name === 'load' && code.slice(callee.start, callee.end).includes('__ModuleLoader__')) {
        count++; const object = node.arguments[0];
        const id = object?.properties?.find(p => p.key?.name === 'id' || p.key?.value === 'id')?.value;
        const factory = object?.properties?.find(p => p.key?.name === 'factory' || p.key?.value === 'factory')?.value;
        if (id?.type === 'Literal' && typeof id.value === 'string' && ['FunctionExpression', 'ArrowFunctionExpression'].includes(factory?.type)) registration = { moduleId: id.value, factory: code.slice(factory.start, factory.end) };
      }
      if (callee.type === 'Identifier' && callee.name === 'require') {
        if (node.arguments[0]?.type !== 'Literal' || typeof node.arguments[0].value !== 'string') throw new ThemeError('client-import', '主题包含无法预先确定的动态模块依赖');
        requires.add(node.arguments[0].value);
      }
    },
    Literal(node) { if (typeof node.value === 'string' && /^\/(?:api|skin-assets|plugins)\//.test(node.value)) network.add(node.value); },
  });
  if (count !== 1 || !registration) throw new ThemeError('client-format', '主题客户端不是可识别的 DSH ModuleLoader 模块，需要适配其入口');
  const forbidden = [...requires].filter(x => /^(?:node:|fs$|child_process$|electron$)|^\.\.?\//.test(x));
  if (forbidden.length) throw new ThemeError('client-import', '主题客户端依赖未打包的模块', { modules: forbidden });
  return { ...registration, requires: [...requires], routes: [...network] };
}
export async function inspectTheme(input, meta = {}) {
  const file = (await stat(input)).isFile();
  const root = file ? dirname(input) : input;
  let manifest, normalized, pkg = await json(join(root, 'package.json'), {}).catch(() => ({}));
  if (file) normalized = normalizeData(await json(input));
  else if (await exists(join(root, 'theme.json'))) {
    manifest = await json(join(root, 'theme.json')); normalized = normalizeData(manifest);
  } else if (await exists(join(root, 'skin.json'))) {
    manifest = await json(join(root, 'skin.json'));
    if (manifest.schemaVersion === 1 && manifest.tokens) normalized = normalizeData(manifest);
    else {
      const c = manifest.contributes || {};
      normalized = { format: c.stylesheet ? 'skin-center-v2' : 'dsh-client',
        originalId: manifest.id, name: text(manifest.name), version: manifest.version || pkg.version,
        author: text(manifest.author), description: manifest.description || manifest.tagline,
        styles: [c.stylesheet, c.patches].filter(Boolean), background: c.backgroundMedia || {},
        bodyAttr: manifest.bodyAttr, hooks: manifest.facets?.client, preview: manifest.preview, skinManifest: manifest };
    }
  } else if (pkg.dsh?.client) normalized = { format: 'dsh-client', originalId: pkg.name, name: text(pkg.dsh?.display?.name) || pkg.name, description: pkg.description, version: pkg.version };
  else throw new ThemeError('theme-format', '主题目录缺少可识别的主题清单');
  if (!normalized.name) normalized.name = meta.name || basename(root);
  const id = meta.id || 'theme-' + digest((meta.source?.spec || pkg.name || normalized.originalId || normalized.name)).slice(0, 24);
  const listed = file ? { files: [{ name: basename(input) }], bytes: (await stat(input)).size } : await walk(root);
  const hashes = {};
  for (const item of listed.files) hashes[item.name] = digest(await readFile(join(root, item.name)));
  const contentHash = digest((file ? await readFile(input, 'utf8') : JSON.stringify(hashes)) + `\nhost:${HOST_VERSION};adapter:${ADAPTER_VERSION}`);
  const resource = name => `${API}/assets/${id}/${contentHash}/${name.split('/').map(encodeURIComponent).join('/')}`;
  const assets = new Set(listed.files.map(f => f.name));
  const css = [], nativeTokens = new Set();
  for (const path of normalized.styles || []) {
    const full = await ownedFile(root, path), s = await stat(full);
    if (s.size > MAX_TEXT) throw new ThemeError('css-size', '主题样式过大');
    css.push(transformCss(await readFile(full, 'utf8'), { id, file: path, assets, resource, nativeTokens }));
  }
  const background = {};
  for (const mode of ['light', 'dark']) {
    const bg = normalized.background?.[mode];
    if (!bg) continue;
    if (!['image', 'video'].includes(bg.type)) throw new ThemeError('background-kind', '此动态背景需要专用适配模块');
    await ownedFile(root, bg.src);
    background[mode] = { type: bg.type, src: resource(bg.src), scrim: typeof bg.scrim === 'string' && !/[;{}<>]|url\s*\(/i.test(bg.scrim) ? bg.scrim : '' };
  }
  let client;
  if (normalized.format === 'dsh-client' || normalized.client) {
    let path = normalized.client?.entry || pkg.exports?.['./client'] || 'lib/client.js';
    if (typeof path !== 'string') path = path?.import || path?.default;
    if (!path) throw new ThemeError('client-entry', '主题未声明可识别的客户端入口');
    const full = await ownedFile(root, path);
    if ((await stat(full)).size > MAX_TEXT) throw new ThemeError('client-size', '主题客户端过大');
    const inspected = inspectClient(await readFile(full, 'utf8'), path);
    const moduleId = `dsh-theme-plugin/theme/${id}/${contentHash}`;
    // Only the module factory is loaded. Original registration/top-level code
    // cannot replace a live DSH module with the same id.
    const modules = adaptClientModules(inspected.factory, inspected.requires);
    const adapted = adaptClientAssets(modules.factory, { packageName: pkg.name, originalId: normalized.originalId, assets, resource });
    const generated = `window.__ModuleLoader__.load({id:${JSON.stringify(moduleId)},factory:${adapted.factory}});\n`;
    client = { moduleId, originalModuleId: inspected.moduleId, requires: modules.requires, moduleMappings: modules.mappings, routes: inspected.routes,
      adaptedRoutes: adapted.adaptedRoutes, path: path.replace(/^\.\//, ''), code: generated, url: `${API}/client/${id}/${contentHash}` };
  }
  const warnings = [];
  const declaredLicense = manifest?.license || pkg.license || meta.license || '';
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find(name => assets.has(name));
  if (licenseFile && typeof declaredLicense === 'string') {
    const notice = (await readFile(await ownedFile(root, licenseFile), 'utf8')).slice(0, 2000);
    if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(notice) && !/AGPL/i.test(declaredLicense)) warnings.push(`包清单声明 ${declaredLicense || '未注明'}，但 ${licenseFile} 标注 GNU AGPL；请核对原项目许可。`);
  }
  const range = pkg.engines?.dsh || pkg.dsh?.engines?.dsh || pkg.peerDependencies?.['@deepseek-ai/dsh'];
  if (range && semver.validRange(range) && !semver.satisfies(HOST_VERSION, range, { includePrerelease: true })) warnings.push(`原包声明宿主 ${range}；需在 ${HOST_VERSION} 隔离验证，不使用原宿主后端。`);
  const hooks = normalized.hooks;
  if (hooks) {
    await ownedFile(root, hooks.entry);
    // Hook execution requires the separate runtime contract and isolated probe.
    if (hooks.apiVersion !== 'x-org.linxin666.skin-center/v1alpha1') throw new ThemeError('hooks-contract', `暂不认识此动态接口：${hooks.apiVersion}`);
  }
  const previews = [];
  for (const path of Object.values(normalized.preview || {})) if (typeof path === 'string' && assets.has(path)) previews.push(resource(path));
  return { ...normalized, id, digest: contentHash, root, entryFile: file ? basename(input) : undefined, files: hashes, bytes: listed.bytes, css: css.join('\n'), nativeTokens: [...nativeTokens], background,
    hooks: hooks ? { ...hooks, url: resource(hooks.entry) } : null, client,
    version: normalized.version || '0.0.0', source: meta.source || {}, screenshots: [...previews, ...(meta.screenshots || [])],
    license: declaredLicense, packageName: pkg.name,
    report: { ok: !client && !hooks, format: normalized.format, stage: client || hooks ? 'isolated-load-required' : 'static-checked', warnings,
      runtime: client || hooks ? 'pending' : 'declarative', hostVersion: HOST_VERSION, adapterVersion: ADAPTER_VERSION, checkedAt: new Date().toISOString() } };
}
