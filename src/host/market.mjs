import { fetchJson } from './network.mjs';
import { atomic, json, digest } from './files.mjs';
import { join } from 'node:path';
import { text, ThemeError } from '../shared/protocol.mjs';
import { HOST_VERSION } from '../shared/protocol.mjs';
import semver from 'semver';
export const SOURCES = [
  { id: 'king', name: 'DSH 皮肤市场', url: 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/catalog.json', site: 'https://kingofsoysauce.github.io/dsh-skin-market/' },
  { id: 'workshop', name: '创意工坊', url: 'https://dsh-market.com/manifest/skins.json', fallback: 'https://raw.githubusercontent.com/zhu1090093659/dsh-web/dev/market/dist/manifest/skins.json', site: 'https://dsh-market.com' },
  { id: 'a2h', name: 'A2H 主题市场', url: 'https://dsh.a2hmarket.ai/dsh-skin/api/v1/public/skins?page=1&size=100', site: 'https://dsh.a2hmarket.ai' },
  { id: 'awesome', name: 'DSH 社区主题', url: 'https://awesome-dsh-plugin.com/plugins.json', site: 'https://dshmarket.com' },
];
const http = value => typeof value === 'string' && /^https:\/\//.test(value) ? value : '';
const images = list => [...new Set(list.flat().map(x => typeof x === 'string' ? x : x?.url || x?.full || x?.preview).map(http).filter(Boolean))].slice(0, 12);
const repository = value => {
  const match = String(value || '').match(/github\.com\/([^/]+)\/([^/#]+)(?:\/tree\/([^/]+)\/(.+))?/i);
  return match ? `${match[1]}/${match[2].replace(/\.git$/, '')}`.toLowerCase() + (match[4] ? '/' + match[4].replace(/\/+$/, '') : '') : String(value || '').toLowerCase();
};
const repositoryKey = item => {
  const key = repository(item.repo);
  const path = item.subdir || String(item.spec || '').match(/&path:\/?(.+)$/)?.[1];
  return key.split('/').length === 2 && path ? `${key}/${path.replace(/^\/+|\/+$/g, '')}` : key;
};
function entry(source, item) {
  let result;
  if (source === 'king') {
    result = { originalId: item.id, name: text(item.name), description: text(item.description), author: text(item.author), repo: item.repo,
      packageName: item.package, version: item.install?.version, spec: item.install?.target,
      screenshots: images([item.media?.list?.preview, item.listScreenshot, ...(item.screenshots || [])]),
      tags: item.tags || [], modes: item.modes || [], stars: item.starsSnapshot || 0, updated: item.releaseUpdatedAt || item.updatedAt,
      license: text(item.license?.code), compatibility: item.compatibility?.dsh, subdir: item.install?.subdir || '', kind: 'plugin' };
  } else if (source === 'workshop') {
    result = { originalId: item.id, name: text(item.name), description: item.description || item.tagline, author: text(item.author), repo: item.repo,
      version: item.version, spec: `workshop:${item.id}`, screenshots: images(Object.values(item.preview || {}).flatMap(p => [
        new URL(p, 'https://dsh-market.com/').href,
        `https://raw.githubusercontent.com/zhu1090093659/dsh-skins/main/skins/${encodeURIComponent(item.id)}/${p.replace(/^.*\/preview\//, 'preview/')}`,
      ])),
      tags: item.tags || [], updated: '', stars: 0, rank: item.rank, kind: 'skin-center', files: item.files || [], manifest: item };
  } else if (source === 'a2h') {
    result = { originalId: item.skinId, name: item.name, description: item.description || item.tagline, author: item.authorNickname, repo: item.repoUrl,
      packageName: item.packageName, version: item.version, spec: item.installSpec || item.packageName, screenshots: images([item.coverUrl, ...(Array.isArray(item.gallery) ? item.gallery : [])]),
      tags: item.tags || [], updated: item.updatedAt, downloads: item.installCount, stars: 0, kind: 'plugin', license: text(item.license) };
  } else {
    if (item.category !== 'theme') return null;
    const spec = item.install?.match(/\sadd\s+(?:-w\s+)?(.+)$/)?.[1]?.trim()?.replace(/^['"]|['"]$/g, '');
    result = { originalId: `${item.owner}/${item.name}`, name: item.name, description: text(item.description), author: item.owner, repo: item.url,
      packageName: item.npm, version: item.version, spec: spec || (item.npm || `github:${item.owner}/${item.name}`),
      screenshots: images(item.screenshots || []), tags: [], updated: item.added, stars: item.stars || 0, downloads: item.downloads, kind: 'plugin' };
  }
  if (!result.name || !result.spec) return null;
  result.name = text(result.name); result.description = text(result.description); result.author = text(result.author);
  result.version = typeof result.version === 'string' ? result.version : '';
  result.compatibility = typeof result.compatibility === 'string' ? result.compatibility : '';
  result.tags = (Array.isArray(result.tags) ? result.tags : []).filter(t => typeof t === 'string').slice(0, 40);
  result.modes = (Array.isArray(result.modes) ? result.modes : []).filter(t => t === 'light' || t === 'dark');
  result.stars = Math.max(0, Number(result.stars) || 0); result.downloads = Math.max(0, Number(result.downloads) || 0);
  if (typeof result.spec !== 'string' || !result.name) return null;
  if (result.spec === result.packageName && semver.valid(result.version)) result.spec += '@' + result.version;
  result.repo = http(result.repo);
  const location = repositoryKey(result);
  const identity = source === 'workshop' ? `skin-center:${result.originalId}` : location.split('/').length > 2 ? `repo:${location}` : result.packageName ? `package:${result.packageName}` : location ? `repo:${location}` : `spec:${result.spec}`;
  return { ...result, id: `market-${digest(identity).slice(0, 24)}`, identity, source, sources: [source], sourceId: `${source}:${result.originalId}` };
}
export function normalizeCatalog(source, data) {
  if (source === 'a2h' && data.code !== 'OK') throw new ThemeError('catalog-service', text(data.message) || '主题市场返回业务错误');
  const items = source === 'king' ? data.skins : source === 'a2h' ? data.data?.items : source === 'awesome' ? data.plugins : data.items;
  if (!Array.isArray(items)) throw new ThemeError('catalog-format', '主题市场目录结构无法识别');
  return items.map(item => entry(source, item)).filter(Boolean);
}
export function mergeCatalogs(groups) {
  const results = [], byPackage = new Map(), byRepo = new Map();
  for (const item of groups.flat()) {
    const key = repositoryKey(item), packageKey = item.packageName;
    const old = packageKey && byPackage.get(packageKey) || (item.kind !== 'skin-center' && key && byRepo.get(key));
    if (old && old.kind === item.kind && (!old.packageName || !packageKey || old.packageName === packageKey || key.split('/').length > 2)) {
      old.sources = [...new Set([...old.sources, item.source])];
      old.alternatives ||= []; old.alternatives.push({ source: item.source, spec: item.spec, version: item.version });
      old.screenshots = images([...old.screenshots, ...item.screenshots]);
      old.stars = Math.max(old.stars || 0, item.stars || 0);
      if ((item.description?.length || 0) > (old.description?.length || 0)) old.description = item.description;
      const fit = range => semver.validRange(range || '') && range ? semver.satisfies(HOST_VERSION, range, { includePrerelease: true }) ? 2 : 0 : 1;
      const a = semver.valid(old.version), b = semver.valid(item.version);
      if (fit(item.compatibility) > fit(old.compatibility) || fit(item.compatibility) === fit(old.compatibility) && b && (!a || semver.gt(b, a))) {
        old.alternatives.push({ source: old.source, spec: old.spec, version: old.version });
        for (const name of ['source', 'sourceId', 'spec', 'version', 'packageName', 'repo', 'compatibility', 'updated']) old[name] = item[name];
        if (item.license) old.license = item.license;
      }
      if (packageKey) byPackage.set(packageKey, old);
      continue;
    }
    results.push(item);
    if (packageKey) byPackage.set(packageKey, item);
    if (key && item.kind !== 'skin-center') byRepo.set(key, item);
  }
  return results;
}
export class Market {
  constructor(root) { this.path = join(root, 'catalog-cache.json'); this.data = null; this.inflight = null; }
  async catalog(force = false) {
    if (!this.data) this.data = await json(this.path, { sources: [], items: [], fetchedAt: 0 }).catch(() => ({ sources: [], items: [], fetchedAt: 0 }));
    if (!force && this.data.items.length && Date.now() - this.data.fetchedAt < 15 * 60 * 1000) return this.data;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const previous = this.data;
      const groups = await Promise.all(SOURCES.map(async source => {
        try {
          let data, mirror = false;
          try { data = await fetchJson(source.url, { limit: 12 * 1024 * 1024, timeout: 16000 }); }
          catch (e) { if (!source.fallback) throw e; data = await fetchJson(source.fallback, { timeout: 16000 }); mirror = true; }
          let items = normalizeCatalog(source.id, data);
          if (source.id === 'a2h' && data.data.total > items.length) {
            for (let page = 2; (page - 1) * 100 < data.data.total && page <= 20; page++) items.push(...normalizeCatalog('a2h', await fetchJson(source.url.replace('page=1', `page=${page}`), { timeout: 16000 })));
          }
          return { status: { ...source, state: mirror ? 'mirror' : 'online', count: items.length, updatedAt: Date.now() }, items };
        } catch (e) {
          const items = previous.items.filter(x => x.source === source.id);
          return { status: { ...source, state: items.length ? 'cached' : 'unavailable', count: items.length, error: e.message }, items };
        }
      }));
      this.data = { fetchedAt: Date.now(), sources: groups.map(g => g.status), items: mergeCatalogs(groups.map(g => g.items)) };
      await atomic(this.path, this.data);
      return this.data;
    })().finally(() => { this.inflight = null; });
    return this.inflight;
  }
  async find(id) { const data = await this.catalog(); const item = data.items.find(x => x.id === id); if (!item) throw new ThemeError('theme-missing', '主题已不在市场目录中，请刷新后重试'); return item; }
}
