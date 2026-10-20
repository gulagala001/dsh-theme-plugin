import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import { posix } from 'node:path';
import { ThemeError } from '../shared/protocol.mjs';
export function transformCss(source, { id, file = 'skin.css', assets = new Set(), resource, nativeTokens = new Set() }) {
  let ast;
  try { ast = postcss.parse(source, { from: file }); }
  catch (e) { throw new ThemeError('css-syntax', `主题样式无法解析：${file}:${e.line || 0} ${e.reason || e.message}`); }
  const keyframes = new Map(), rootSelector = `html[data-dtp-theme="${id}"]`;
  ast.walkAtRules(rule => {
    if (/^(import|document|namespace|charset)$/i.test(rule.name)) throw new ThemeError('css-rule', `不支持外部样式规则：@${rule.name}`);
    if (/keyframes$/i.test(rule.name)) { const next = `dtp-${id}-${rule.params}`; keyframes.set(rule.params, next); rule.params = next; }
  });
  ast.walkDecls(decl => {
    if (/^(behavior|-moz-binding)$/i.test(decl.prop) || /expression\s*\(/i.test(decl.value)) throw new ThemeError('css-executable', '主题样式包含不可接受的可执行声明');
    const parsed = valueParser(decl.value);
    parsed.walk(node => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
      const raw = valueParser.stringify(node.nodes).trim().replace(/^['"]|['"]$/g, '');
      if (raw.startsWith('#') || /^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf|otf));base64,[a-z0-9+/=\s]+$/i.test(raw)) return;
      if (/^data:image\/svg\+xml(?:;charset=[\w-]+)?,/i.test(raw)) {
        let svg;
        try { svg = decodeURIComponent(raw.slice(raw.indexOf(',') + 1)); } catch { throw new ThemeError('resource-data', '主题的 SVG 数据地址编码无效'); }
        if (!/<svg[\s>]/i.test(svg) || /<script[\s>]|<foreignObject[\s>]|\bon\w+\s*=|(?:href|src)\s*=\s*['"]?\s*(?:https?:|javascript:|\/\/)/i.test(svg)) throw new ThemeError('resource-data', '主题 SVG 数据包含脚本或外部引用');
        return;
      }
      if (/^(?:[a-z]+:|\/\/|\/)|\\|\0/i.test(raw)) throw new ThemeError('remote-resource', `主题样式引用了未打包的外部资源：${raw.slice(0, 160)}`, { file });
      const name = posix.normalize(posix.join(posix.dirname(file), raw.split(/[?#]/)[0]));
      if (name.startsWith('../') || !assets.has(name)) throw new ThemeError('resource-missing', `主题缺少资源：${name}`, { file, resource: name });
      node.nodes = [{ type: 'string', quote: '"', value: resource(name), sourceIndex: 0, sourceEndIndex: 0 }];
    });
    decl.value = parsed.toString();
    // Native DSH writes its token layer onto body. Preserve root theme values
    // under separate names so the public override API can bridge them there.
    if (/^--dsw-/.test(decl.prop) && /(?:^|,)\s*(?::(?:where|is)\(\s*)?(?::root|html|body|\[data-ds-dark-theme\])(?:[.#[:\s)]|$)/.test(decl.parent?.selector || '')) {
      nativeTokens.add(decl.prop);
      decl.cloneAfter({ prop: `--dtp-css-${decl.prop.slice(2)}` });
    }
    if (/^(?:-webkit-)?animation(?:-name)?$/i.test(decl.prop)) {
      const parsedValue = valueParser(decl.value);
      parsedValue.walk(node => { if (node.type === 'word' && keyframes.has(node.value)) node.value = keyframes.get(node.value); });
      decl.value = parsedValue.toString();
    }
  });
  ast.walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    try {
      rule.selector = selectorParser(selectors => {
        selectors.each(selector => {
          const first = selector.nodes.find(node => node.type !== 'comment');
          if (first?.type === 'tag' && first.value === 'html') {
            first.parent.insertAfter(first, selectorParser.attribute({ attribute: 'data-dtp-theme', operator: '=', value: id, quoteMark: '"' }));
          } else if (first?.type === 'pseudo' && first.value === ':root') {
            first.replaceWith(...selectorParser().astSync(rootSelector).first.nodes);
          } else {
            // Restrict the subject, including the document element itself.
            // Prefixing an ancestor breaks :where(:root), html.dark expressed
            // as .dark, and other functional root selectors.
            const scope = selectorParser().astSync(`:is(${rootSelector},${rootSelector} *)`).first.first.clone();
            const lastCombinator = selector.nodes.findLastIndex(node => node.type === 'combinator');
            const pseudoElement = selector.nodes.slice(lastCombinator + 1).find(node => node.type === 'pseudo' && /^(?:::|:(?:before|after|first-line|first-letter)$)/.test(node.value));
            if (pseudoElement) selector.insertBefore(pseudoElement, scope); else selector.append(scope);
          }
        });
      }).processSync(rule.selector);
    } catch (e) { throw new ThemeError('css-selector', `主题选择器无法适配：${rule.selector.slice(0, 120)}`, { cause: e.message }); }
  });
  return ast.toString();
}
