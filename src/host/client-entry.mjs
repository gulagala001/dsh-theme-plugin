import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { ThemeError } from '../shared/protocol.mjs';

function memberName(node) {
  return node?.computed ? node.property?.value : node?.property?.name;
}

// Inspect the complete program. Factories often close over constants, CSS and
// helper functions outside load(); extracting just the function loses them.
export function inspectClient(code, filename, { moduleId } = {}) {
  let ast;
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (e) { throw new ThemeError('client-syntax', `主题客户端无法解析：${filename}:${e.loc?.line || 0} ${e.message}`); }
  const constants = new Map(), loaderNames = new Set(), registrations = [], objects = new Map(), helpers = new Set();
  simple(ast, {
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier') return;
      if (node.init?.type === 'Literal') constants.set(node.id.name, node.init.value);
      if (node.init?.type === 'ObjectExpression') objects.set(node.id.name, node.init);
      if (node.init && code.slice(node.init.start, node.init.end).includes('__ModuleLoader__') &&
        ['MemberExpression', 'ConditionalExpression', 'LogicalExpression'].includes(node.init.type)) loaderNames.add(node.id.name);
      if (node.init && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init.type) &&
        code.slice(node.init.start, node.init.end).includes('__ModuleLoader__.load(')) helpers.add(node.id.name);
    },
  });
  const value = node => node?.type === 'Literal' ? node.value : node?.type === 'Identifier' ? constants.get(node.name) : undefined;
  simple(ast, { CallExpression(node) {
    const c = node.callee;
    const helper = c?.type === 'Identifier' && helpers.has(c.name);
    if (!helper && (c?.type !== 'MemberExpression' || memberName(c) !== 'load')) return;
    if (!helper && !code.slice(c.start, c.end).includes('__ModuleLoader__') && !loaderNames.has(c.object?.name)) return;
    const argument = node.arguments[0], object = argument?.type === 'Identifier' ? objects.get(argument.name) : argument;
    if (object?.type !== 'ObjectExpression') return;
    const properties = object.properties;
    const id = value(properties.find(p => (p.key?.name || p.key?.value) === 'id')?.value);
    const factory = properties.find(p => (p.key?.name || p.key?.value) === 'factory')?.value;
    if (typeof id !== 'string' || !factory) throw new ThemeError('client-format', '主题模块缺少可识别的注册名称或工厂');
    registrations.push({ id, factory });
  } });
  if (!registrations.length) throw new ThemeError('client-format', '主题客户端缺少 DSH 模块注册');
  const requireNames = new Set(['require']);
  for (const { factory } of registrations) if (factory.params?.[0]?.type === 'Identifier') requireNames.add(factory.params[0].name);
  const requires = new Set(), routes = new Set();
  simple(ast, {
    CallExpression(node) {
      if (!requireNames.has(node.callee?.name)) return;
      const name = value(node.arguments[0]);
      if (typeof name !== 'string') {
        // Helpers can forward a name to the host require function. Their
        // literal call sites are resolved by the module loader at runtime.
        return;
      }
      requires.add(name);
    },
    Literal(node) {
      if (typeof node.value === 'string' && /^\/(?!\/)[\w-]+\/[^<>\s]*$/.test(node.value)) routes.add(node.value);
    },
  });
  const localIds = new Set(registrations.map(x => x.id));
  const forbidden = [...requires].filter(x => /^(?:node:|fs$|child_process$|electron$)|^\.\.?\//.test(x) && !localIds.has(x));
  if (forbidden.length) throw new ThemeError('client-import', '主题客户端包含需要打包的本地依赖', { modules: forbidden });
  const first = registrations.find(x => x.id === moduleId) || registrations[0];
  let factory = code.slice(first.factory.start, first.factory.end);
  if (factory.startsWith('(') && first.factory.type === 'FunctionExpression') factory = `function${factory}`;
  return { moduleId: first.id, factory, source: code, registrations: [...localIds],
    requires: [...requires].filter(x => !localIds.has(x)), routes: [...routes] };
}

export function wrapClient(source, { moduleId, originalModuleId, mappings = [] }) {
  const aliases = Object.fromEntries(mappings.map(x => [x.from, x.to]));
  return `window.__ModuleLoader__.load({id:${JSON.stringify(moduleId)},factory:(__hostRequire)=>{
const __definitions=new Map(),__instances=new Map();
const __loader={load(value){if(!value||typeof value.id!=="string"||typeof value.factory!=="function")throw Error("Invalid theme module");__definitions.set(value.id,value);}};
const __realWindow=window;
const __scope=__realWindow.__DTP_THEME_SCOPES__?.get(${JSON.stringify(moduleId)});
const __window=new Proxy(__realWindow,{get(target,key){if(key==="__ModuleLoader__")return __loader;if(__scope&&key in __scope)return __scope[key];const value=Reflect.get(target,key,target);return typeof value==="function"&&typeof key==="string"&&!/^[A-Z]/.test(key)?value.bind(target):value;},set(target,key,value){return __scope?__scope.setWindowProperty(key,value):Reflect.set(target,key,value,target);}});
(function(window,self,globalThis,document,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,MutationObserver,ResizeObserver,fetch,XMLHttpRequest,Image,Audio){
${source}
}).call(__window,__window,__window,__window,__scope?.document??document,...["setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame","cancelAnimationFrame","MutationObserver","ResizeObserver","fetch","XMLHttpRequest","Image","Audio"].map(key=>__scope?.[key]??__realWindow[key]));
const __aliases=${JSON.stringify(aliases)};
const __require=name=>{if(__instances.has(name))return __instances.get(name);const definition=__definitions.get(name);if(definition){const value=definition.factory(__require);__instances.set(name,value);return value;}return __scope?.modules.has(name)?__scope.modules.get(name):__hostRequire(__aliases[name]||name);};
return __require(${JSON.stringify(originalModuleId)});
}});\n`;
}
