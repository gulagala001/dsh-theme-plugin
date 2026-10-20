// Own effects from both legacy top-level bundles and normal plugin factories.
// This is lifecycle management, not a JavaScript security sandbox.
import { API } from '../shared/protocol.mjs';
export function createThemeScope(theme) {
  let active = true;
  const timeouts = new Set(), intervals = new Set(), frames = new Set(), observers = new Set(), events = [], elements = new Set(), properties = new Map(), releases = new Set(), styled = new Map(), services = new Map();
  const scope = { modules: new Map() };
  scope.onDispose = fn => { releases.add(fn); return () => releases.delete(fn); };
  const routeUrl = value => {
    let url;
    try { url = new URL(value, location.href); } catch { return value; }
    if (url.origin !== location.origin) return value;
    const ownClient = `/plugins/${theme.packageName}/client.js`;
    if (url.pathname === ownClient) return `${API}/assets/${theme.id}/${theme.digest}/${theme.client.path.split('/').map(encodeURIComponent).join('/')}${url.search}`;
    return value;
  };
  const descriptor = (target, key) => {
    for (let p = target; p; p = Object.getPrototypeOf(p)) {
      const value = Object.getOwnPropertyDescriptor(p, key);
      if (value) return value;
    }
  };
  const routeCss = value => String(value).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, quote, url) => `url(${quote}${routeUrl(url)}${quote})`);
  const routeHtml = value => String(value).replace(/\b(src|href|poster)=(["'])(.*?)\2/gi, (_, key, quote, url) => `${key}=${quote}${routeUrl(url)}${quote}`);
  scope.adaptService = (name, value) => {
    if (!value || !['locale', 'slots', 'theme', 'connection'].includes(name)) return value;
    if (services.get(name)?.original === value) return services.get(name).adapted;
    const releaseMethods = { locale: ['register'], slots: ['register', 'inject'], theme: ['register', 'overrideTokens', 'registerPresenter'] }[name] || [];
    const rpc = name === 'connection' && value.rpc && new Proxy(value.rpc, { get(target, key) {
      if (key !== 'call') { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; }
      return (channel, endpoint, ...args) => {
        const full = `${channel}/${endpoint}`, mapped = routeUrl(full);
        const next = mapped !== full ? mapped.slice(0, -(`/${endpoint}`).length) : routeUrl(channel);
        return target.call(next, endpoint, ...args);
      };
    } });
    const adapted = new Proxy(value, { get(target, key) {
      if (key === 'rpc' && rpc) return rpc;
      const fn = Reflect.get(target, key, target);
      if (!releaseMethods.includes(key) || typeof fn !== 'function') return typeof fn === 'function' ? fn.bind(target) : fn;
      return (...args) => {
        let off;
        try { off = fn.apply(target, args); }
        catch (error) {
          // A theme replacing a built-in slot must shadow the host's default
          // registration on current DSH. Preserve explicit nonzero priorities.
          const options = args[0];
          if (name !== 'slots' || key !== 'register' || !options?.name || (options.priority ?? 0) !== 0 ||
            !/^(?:single|list) slot .*already has .*priority 0\b/.test(error.message)) throw error;
          off = fn.call(target, { ...options, priority: -50 }, ...args.slice(1));
        }
        if (typeof off !== 'function') return off;
        let pending = true;
        const once = () => { if (pending) { pending = false; releases.delete(once); return off(); } };
        releases.add(once); return once;
      };
    } });
    services.set(name, { original: value, adapted }); return adapted;
  };
  const ownStyle = element => {
    if (styled.has(element)) return;
    const original = Object.getOwnPropertyDescriptor(element, 'style'), property = descriptor(element, 'style');
    if (!property?.get) return;
    const style = property.get.call(element);
    const proxy = new Proxy(style, {
      get(target, key) {
        if (key === 'setProperty') return (name, value, priority) => target.setProperty(name, routeCss(value), priority);
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) { return Reflect.set(target, key, typeof value === 'string' ? routeCss(value) : value, target); },
    });
    const get = () => proxy;
    Object.defineProperty(element, 'style', { configurable: true, get, set: value => { style.cssText = routeCss(value); } });
    styled.set(element, { original, get });
  };
  scope.adaptModule = (name, mod) => {
    if (!/^react(?:\/jsx(?:-dev)?-runtime)?$/.test(name)) return mod;
    const adapted = { ...mod };
    for (const key of ['createElement', 'jsx', 'jsxs', 'jsxDEV']) {
      const fn = mod[key];
      if (typeof fn !== 'function') continue;
      adapted[key] = (type, props, ...args) => {
        if (typeof type === 'string' && props) {
          props = { ...props };
          for (const key of ['src', 'href', 'poster']) if (typeof props[key] === 'string') props[key] = routeUrl(props[key]);
          if (props.style) props.style = Object.fromEntries(Object.entries(props.style).map(([key, value]) => [key, typeof value === 'string' ? routeCss(value) : value]));
          if (props.dangerouslySetInnerHTML) props.dangerouslySetInnerHTML = { __html: routeHtml(props.dangerouslySetInnerHTML.__html) };
          if (type === 'style' && typeof props.children === 'string') props.children = routeCss(props.children);
        }
        return fn(type, props, ...args);
      };
    }
    return adapted;
  };
  const ownElement = element => {
    elements.add(element);
    ownStyle(element);
    for (const key of ['src', 'href', 'poster']) {
      const property = descriptor(element, key);
      if (!property?.set || !property?.get) continue;
      Object.defineProperty(element, key, { configurable: true,
        get: () => property.get.call(element),
        set: value => property.set.call(element, routeUrl(String(value))),
      });
    }
    const setAttribute = element.setAttribute.bind(element);
    element.setAttribute = (key, value) => setAttribute(key, key === 'style' ? routeCss(value) : ['src', 'href', 'poster'].includes(key.toLowerCase()) ? routeUrl(String(value)) : value);
    const html = descriptor(element, 'innerHTML');
    Object.defineProperty(element, 'innerHTML', { configurable: true, get: () => html.get.call(element), set: value => html.set.call(element, routeHtml(value)) });
    if (element.localName === 'style') {
      const property = descriptor(element, 'textContent');
      Object.defineProperty(element, 'textContent', { configurable: true,
        get: () => property.get.call(element),
        set: value => property.set.call(element, routeCss(value)),
      });
    }
    return element;
  };
  scope.Image = class extends window.Image { constructor(...args) { super(...args); ownElement(this); } };
  scope.Audio = class extends window.Audio { constructor(url) { super(); ownElement(this); if (url !== undefined) this.src = url; } };
  ownStyle(document.body); ownStyle(document.documentElement);
  scope.fetch = (request, options) => {
    if (request instanceof Request) {
      const url = routeUrl(request.url);
      return window.fetch(url === request.url ? request : new Request(new URL(url, location.href), request), options);
    }
    return window.fetch(routeUrl(String(request)), options);
  };
  scope.XMLHttpRequest = class extends window.XMLHttpRequest {
    open(method, url, ...args) { return super.open(method, routeUrl(String(url)), ...args); }
  };
  scope.setWindowProperty = (key, value) => {
    if (!properties.has(key)) properties.set(key, { descriptor: Object.getOwnPropertyDescriptor(window, key) });
    properties.get(key).value = value;
    return Reflect.set(window, key, value, window);
  };
  const native = Object.fromEntries(['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, window[key].bind(window)]));
  scope.setTimeout = (fn, ms, ...args) => {
    if (!active) return 0;
    const id = native.setTimeout(() => { timeouts.delete(id); if (active && typeof fn === 'function') fn(...args); }, ms);
    timeouts.add(id); return id;
  };
  scope.clearTimeout = id => { timeouts.delete(id); native.clearTimeout(id); };
  scope.setInterval = (fn, ms, ...args) => {
    if (!active) return 0;
    const id = native.setInterval(() => { if (active && typeof fn === 'function') fn(...args); }, ms);
    intervals.add(id); return id;
  };
  scope.clearInterval = id => { intervals.delete(id); native.clearInterval(id); };
  scope.requestAnimationFrame = fn => {
    if (!active) return 0;
    const id = native.requestAnimationFrame(time => { frames.delete(id); if (active) fn(time); });
    frames.add(id); return id;
  };
  scope.cancelAnimationFrame = id => { frames.delete(id); native.cancelAnimationFrame(id); };
  for (const name of ['MutationObserver', 'ResizeObserver']) {
    const Base = window[name];
    scope[name] = Base && class extends Base {
      constructor(fn) { super((...args) => { if (active) fn(...args); }); observers.add(this); }
    };
  }
  const add = target => (type, listener, options) => {
    if (!active) return;
    target.addEventListener(type, listener, options); events.push({ target, type, listener, options });
  };
  scope.addEventListener = add(window);
  scope.removeEventListener = window.removeEventListener.bind(window);
  scope.document = new Proxy(document, { get(target, key) {
    if (key === 'addEventListener') return add(target);
    if (key === 'createElement' || key === 'createElementNS') return (...args) => {
      return ownElement(target[key](...args));
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }, set(target, key, value) { return Reflect.set(target, key, value, target); } });
  scope.dispose = () => {
    active = false;
    for (const id of timeouts) native.clearTimeout(id);
    for (const id of intervals) native.clearInterval(id);
    for (const id of frames) native.cancelAnimationFrame(id);
    for (const observer of observers) observer.disconnect();
    for (const release of [...releases]) try { release(); } catch {}
    for (const { target, type, listener, options } of events) target.removeEventListener(type, listener, options);
    for (const element of elements) element.remove();
    for (const [element, { original, get }] of styled) if (Object.getOwnPropertyDescriptor(element, 'style')?.get === get) {
      if (original) Object.defineProperty(element, 'style', original); else delete element.style;
    }
    for (const [key, { descriptor, value }] of properties) {
      if (window[key] !== value) continue;
      try { if (descriptor) Object.defineProperty(window, key, descriptor); else delete window[key]; } catch {}
    }
    timeouts.clear(); intervals.clear(); frames.clear(); observers.clear(); elements.clear(); properties.clear(); releases.clear(); styled.clear(); services.clear(); events.length = 0; scope.modules.clear();
  };
  return scope;
}
