import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { HOST_CONTRACT } from '../shared/host-contract.mjs';
import { ThemeError } from '../shared/protocol.mjs';

export function adaptClientModules(factory, requires, { program = false } = {}) {
  const source = program ? factory : `(${factory})`, ast = parse(source, { ecmaVersion: 'latest' });
  const replacements = [], mappings = [];
  for (const [old, alias] of Object.entries(HOST_CONTRACT.moduleAliases)) {
    if (!requires.includes(old)) continue;
    const names = new Set(), calls = [], destructured = new Set();
    simple(ast, {
      VariableDeclarator(node) {
        if (!node.init || !source.slice(node.init.start, node.init.end).includes(old)) return;
        if (node.id.type === 'Identifier') names.add(node.id.name);
        else if (node.id.type === 'ObjectPattern') for (const property of node.id.properties) {
          if (property.key) destructured.add(property.key.name || property.key.value);
        }
      },
      CallExpression(node) { if (node.callee?.name === 'require' && node.arguments[0]?.value === old) calls.push(node.arguments[0]); },
    });
    const exports = new Set(destructured);
    simple(ast, { MemberExpression(node) { if (names.has(node.object?.name)) exports.add(node.computed ? node.property.value : node.property.name); } });
    if ([...exports].some(name => !alias.exports.includes(name))) {
      throw new ThemeError('host-module-changed', `主题使用已变更的宿主模块 ${old}，需要适配其接口`, { exports: [...exports] });
    }
    for (const node of calls) replacements.push({ start: node.start - (program ? 0 : 1), end: node.end - (program ? 0 : 1), value: JSON.stringify(alias.target) });
    mappings.push({ from: old, to: alias.target, exports: [...exports] });
  }
  for (const patch of replacements.sort((a, b) => b.start - a.start)) factory = factory.slice(0, patch.start) + patch.value + factory.slice(patch.end);
  return { factory, requires: [...new Set(requires.map(name => mappings.find(m => m.from === name)?.to || name))], mappings };
}
