import { ThemeError } from '../shared/protocol.mjs';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
function privateAddress(value) {
  return /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fe80:|fc|fd|::ffff:(127|10|192\.168)\.)/i.test(value);
}
export async function publicUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw new ThemeError('source-url', '主题来源必须是公开 HTTPS 地址');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) throw new ThemeError('source-url', '市场下载不能访问本地地址');
  const addresses = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new ThemeError('source-url', '市场下载不能访问私有网络');
  return u;
}
export async function download(url, { limit = 30 * 1024 * 1024, timeout = 25000, signal, headers = {} } = {}) {
  let current = url;
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  for (let redirects = 0; redirects < 6; redirects++) {
    const target = await publicUrl(current);
    const response = await fetch(target, { redirect: 'manual', signal: combined, headers: { 'User-Agent': 'dsh-theme-plugin/0.2', ...headers } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new ThemeError('download', '下载重定向缺少地址');
      current = new URL(location, target).href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new ThemeError('download', `来源返回 HTTP ${response.status}`, { status: response.status, url: target.origin + target.pathname }); }
    if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new ThemeError('package-size', '下载文件超过大小限制'); }
    const parts = []; let size = 0;
    for await (const part of response.body) {
      size += part.length; if (size > limit) throw new ThemeError('package-size', '下载文件超过大小限制');
      parts.push(part);
    }
    return { bytes: Buffer.concat(parts), url: current, type: response.headers.get('content-type') || '' };
  }
  throw new ThemeError('download', '来源重定向过多');
}
export const fetchJson = async (url, options) => {
  const data = await download(url, options);
  try { return JSON.parse(data.bytes.toString('utf8')); }
  catch { throw new ThemeError('catalog-format', '来源返回的内容不是有效 JSON'); }
};
