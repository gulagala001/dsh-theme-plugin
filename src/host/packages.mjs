import { mkdir, writeFile, readdir, readFile, cp, realpath } from 'node:fs/promises';
import { join, dirname, basename, resolve, relative } from 'node:path';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import tar from 'tar-stream';
import { unzipSync } from 'fflate';
import { download, fetchJson } from './network.mjs';
import { inside, exists, json, walk, digest } from './files.mjs';
import { ThemeError, slug } from '../shared/protocol.mjs';
const MAX_BYTES = 160 * 1024 * 1024;
export async function extract(bytes, folder) {
  await mkdir(folder, { recursive: true });
  let count = 0, total = 0;
  const save = async (name, data) => {
    if (!name || name.endsWith('/')) return;
    if (++count > 6000 || (total += data.length) > MAX_BYTES) throw new ThemeError('archive-size', '主题解压后超过大小限制');
    const path = inside(folder, name.replace(/^\.\//, ''));
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, data, { mode: 0o600 });
  };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let expanded = 0, entries = 0;
    const files = unzipSync(bytes, { filter: file => {
      inside(folder, file.name);
      expanded += file.originalSize; entries++;
      if (entries > 6000 || expanded > MAX_BYTES) throw new ThemeError('archive-size', '主题压缩包展开大小超过限制');
      return !file.name.endsWith('/');
    } });
    for (const [name, data] of Object.entries(files)) await save(name, data);
  } else {
    const parser = tar.extract();
    await new Promise((resolvePromise, reject) => {
      parser.on('entry', (header, stream, next) => {
        (async () => {
          if (!['file', 'directory'].includes(header.type)) throw new ThemeError('archive-type', `不支持的主题归档条目：${header.name}`);
          inside(folder, header.name.replace(/^\.\//, ''));
          if (header.size > MAX_BYTES - total) throw new ThemeError('archive-size', '主题解压后超过大小限制');
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          if (header.type === 'file') await save(header.name, Buffer.concat(chunks));
          next();
        })().catch(e => { parser.destroy(e); reject(e); });
      });
      parser.on('finish', resolvePromise); parser.on('error', reject);
      const input = Readable.from(bytes);
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const gunzip = createGunzip(); gunzip.on('error', reject); parser.on('error', () => gunzip.destroy()); input.pipe(gunzip).pipe(parser);
      } else input.pipe(parser);
    });
  }
  let root = folder;
  for (let depth = 0; depth < 3; depth++) {
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isDirectory()) break;
    root = join(root, entries[0].name);
  }
  return { root, bytes: total, files: count };
}
export function githubSpec(spec, repoUrl = '') {
  let raw = spec;
  if (!raw?.startsWith('github:')) {
    const match = (repoUrl || raw || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/#]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/);
    if (!match) return null;
    return { repo: `${match[1]}/${match[2].replace(/\.git$/, '')}`, ref: match[3] || 'HEAD', subdir: match[4] || '' };
  }
  const match = raw.match(/^github:([^/#]+\/[^/#]+)(?:#([^&]+))?(?:&path:\/?(.+))?$/);
  if (!match) throw new ThemeError('install-source', '无法识别 GitHub 主题来源');
  return { repo: match[1], ref: match[2] || 'HEAD', subdir: match[3] || '' };
}
export async function acquire(entry, target, { signal } = {}) {
  await mkdir(target, { recursive: true });
  const spec = entry.spec || entry.source?.spec;
  if (entry.kind === 'skin-center' && entry.files?.length) {
    const root = join(target, 'package'); await mkdir(root, { recursive: true });
    let commit;
    try { commit = (await fetchJson('https://api.github.com/repos/zhu1090093659/dsh-skins/commits/main', { signal })).sha; } catch {}
    let total = 0;
    for (const name of entry.files) {
      const path = inside(root, name);
      let data;
      try { data = await download(`https://dsh-market.com/assets/skins/${encodeURIComponent(entry.originalId)}/${name}`, { signal, limit: 35 * 1024 * 1024 }); }
      catch (e) {
        if (!commit) throw e;
        data = await download(`https://raw.githubusercontent.com/zhu1090093659/dsh-skins/${commit}/skins/${encodeURIComponent(entry.originalId)}/${name}`, { signal, limit: 35 * 1024 * 1024 });
      }
      total += data.bytes.length; if (total > MAX_BYTES) throw new ThemeError('package-size', '主题资源总大小超过限制');
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, data.bytes);
    }
    return { root, resolved: commit || entry.version, source: { url: entry.repo, spec, resolved: commit || entry.version, market: entry.source }, bytes: total };
  }
  const git = githubSpec(spec);
  let fetched, resolved = spec, sourceUrl = entry.repo || spec;
  if (git) {
    let ref = git.ref;
    try { ref = (await fetchJson(`https://api.github.com/repos/${git.repo}/commits/${encodeURIComponent(git.ref)}`, { signal })).sha; }
    catch (e) { if (!/^[a-f0-9]{40}$/i.test(ref)) throw new ThemeError('source-version', '无法确定主题的固定源码版本，请稍后重试', { source: git.repo, cause: e.message }); }
    fetched = await download(`https://codeload.github.com/${git.repo}/tar.gz/${encodeURIComponent(ref)}`, { signal, limit: 80 * 1024 * 1024, timeout: 60000 });
    resolved = ref;
  } else if (/^https:\/\//.test(spec || '')) {
    fetched = await download(spec, { signal, limit: 80 * 1024 * 1024, timeout: 60000 });
  } else {
    const match = String(spec || '').match(/^(@[^/@\s]+\/[^/@\s]+|[^/@\s]+)(?:@([^/\s]+))?$/);
    if (!match) throw new ThemeError('install-source', '缺少可识别的主题下载来源');
    const manifest = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2] || 'latest')}`, { signal });
    if (!manifest.dist?.tarball) throw new ThemeError('install-source', 'npm 主题缺少发行包');
    fetched = await download(manifest.dist.tarball, { signal, limit: 80 * 1024 * 1024, timeout: 60000 });
    if (manifest.dist.integrity) {
      const { createHash } = await import('node:crypto');
      const values = manifest.dist.integrity.split(/\s+/);
      if (!values.some(item => { const [algorithm, value] = item.split('-'); return ['sha512', 'sha256'].includes(algorithm) && createHash(algorithm).update(fetched.bytes).digest('base64') === value; })) throw new ThemeError('package-integrity', '主题发行包摘要不匹配');
    }
    resolved = `${manifest.name}@${manifest.version}`;
  }
  const unpacked = await extract(fetched.bytes, target);
  const root = git?.subdir ? inside(unpacked.root, git.subdir) : unpacked.root;
  if (!await exists(root)) throw new ThemeError('package-subdirectory', '主题来源指定的子目录不存在');
  return { ...unpacked, root, digest: digest(fetched.bytes), resolved, source: { spec, url: sourceUrl, resolved, market: entry.source } };
}
export async function candidates(root, hint = {}) {
  const found = [];
  async function inspect(folder, depth = 0) {
    if (depth > 5 || found.length > 300) return;
    if (await exists(join(folder, 'theme.json'))) {
      const m = await json(join(folder, 'theme.json')).catch(() => null);
      if (m?.format === 'dsh-theme-plugin/v1' || m?.schemaVersion === 1 || m?.format === 'dsh-dream-skin/pack') found.push(folder);
    }
    if (await exists(join(folder, 'skin.json'))) { if (!found.includes(folder)) found.push(folder); return; }
    if (await exists(join(folder, 'package.json'))) {
      const pkg = await json(join(folder, 'package.json'));
      if (pkg.dsh?.client) { if (!found.includes(folder)) found.push(folder); return; }
    }
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && !['node_modules', '.git', 'test', 'tests', 'docs', 'assets', 'preview'].includes(entry.name)) await inspect(join(folder, entry.name), depth + 1);
      if (entry.isFile() && /\.omd-skin\.json$|\.dsh-theme\.json$/.test(entry.name)) found.push(join(folder, entry.name));
    }
  }
  await inspect(root);
  if (hint.packageName) {
    const match = [];
    for (const dir of found) if ((await json(join(dir, 'package.json'), {}).catch(() => ({}))).name === hint.packageName) match.push(dir);
    if (match.length) return match;
  }
  const idMatch = found.filter(dir => basename(dir) === hint.originalId || basename(dir) === hint.subdir?.split('/').at(-1));
  return idMatch.length ? idMatch : found;
}
export async function copyLocal(input, target) {
  const root = await realpath(input); await walk(root);
  await cp(root, target, { recursive: true, filter: path => !/(^|\/)(node_modules|\.git|\.local)(\/|$)/.test(relative(root, path)) });
  return target;
}
