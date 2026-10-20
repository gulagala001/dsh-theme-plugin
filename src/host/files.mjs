import { readFile, writeFile, rename, mkdir, realpath, stat, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ThemeError } from '../shared/protocol.mjs';
export const digest = data => createHash('sha256').update(data).digest('hex');
export const exists = async path => { try { await stat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, path);
}
export function inside(root, name) {
  if (typeof name !== 'string' || name.includes('\0') || name.includes('\\') || isAbsolute(name)) throw new ThemeError('resource-path', '主题资源路径无效');
  const path = resolve(root, name), rel = relative(root, path);
  if (rel.startsWith('../') || rel === '..' || isAbsolute(rel)) throw new ThemeError('resource-path', '主题资源越过主题目录');
  return path;
}
export async function ownedFile(root, name) {
  const base = await realpath(root), path = inside(base, name);
  const real = await realpath(path);
  if (inside(base, relative(base, real)) !== real || !((await stat(real)).isFile())) throw new ThemeError('resource-path', '资源不是主题目录内的文件');
  return real;
}
export async function walk(root, { maxFiles = 6000, maxBytes = 160 * 1024 * 1024 } = {}) {
  const files = []; let bytes = 0;
  async function visit(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.local', '.DS_Store'].includes(entry.name)) continue;
      const path = join(dir, entry.name), name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new ThemeError('resource-symlink', `主题包含符号链接：${name}`);
      if (entry.isDirectory()) await visit(path, name + '/');
      else if (entry.isFile()) {
        const s = await lstat(path); bytes += s.size; files.push({ name, bytes: s.size });
        if (files.length > maxFiles || bytes > maxBytes) throw new ThemeError('package-size', '主题解压大小或文件数量超过限制');
      }
    }
  }
  await visit(root);
  return { files, bytes };
}
