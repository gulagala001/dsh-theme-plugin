import semver from 'semver';
import { fetchJson } from './network.mjs';
import { githubSpec, resolveGitRef } from './packages.mjs';
import { HOST_VERSION } from '../shared/protocol.mjs';

export const declaredHost = pkg => pkg.engines?.dsh || pkg.dsh?.engines?.dsh || pkg.peerDependencies?.['@deepseek-ai/dsh'] || '';
export const hostFit = range => !range || !semver.validRange(range) ? 'unknown'
  : semver.satisfies(HOST_VERSION, range, { includePrerelease: true }) ? 'current' : 'other';
const repository = value => String(typeof value === 'string' ? value : value?.url || '')
  .replace(/^git\+/, '').replace(/\.git\/?$/, '').replace(/\/$/, '').toLowerCase();
const newer = (version, previous) => semver.valid(version) && (!semver.valid(previous) || semver.gt(version, previous));
const cache = new Map();
async function metadata(url, options) {
  const old = cache.get(url);
  if (old && Date.now() - old.at < 600000) return old.value;
  const value = await fetchJson(url, { timeout: 12000, ...options });
  cache.set(url, { at: Date.now(), value }); return value;
}

// A market's pinned snapshot may lag its author's release. Change sources only
// with matching package/repository identity; never guess an unscoped npm name.
export async function currentEntry(entry, { signal } = {}) {
  if (entry.kind === 'skin-center') return entry;
  const git = githubSpec(entry.spec);
  const npm = !git && !/^https:/.test(entry.spec || '') &&
    String(entry.spec || '').match(/^(@[^/@\s]+\/[^/@\s]+|[^/@\s]+)(?:@([^/\s]+))?$/);
  const name = entry.packageName || npm?.[1];
  if (name) try {
    const pkg = await metadata(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal });
    const expectedRepo = git ? `https://github.com/${git.repo}` : entry.repo;
    const same = pkg.name === name && (!expectedRepo ? !!npm : repository(pkg.repository) === repository(expectedRepo));
    if (same && hostFit(declaredHost(pkg)) !== 'other' && newer(pkg.version, entry.version)) {
      return { ...entry, spec: `${name}@${pkg.version}`, version: pkg.version,
        compatibility: declaredHost(pkg), selectedFrom: { spec: entry.spec, version: entry.version } };
    }
  } catch (error) { if (signal?.aborted) throw error; }
  if (git && git.ref !== 'HEAD') try {
    const sha = await resolveGitRef(git.repo, 'HEAD', { signal });
    if (sha === git.ref) return entry;
    const prefix = git.subdir ? git.subdir.replace(/\/$/, '') + '/' : '';
    const pkg = await metadata(`https://raw.githubusercontent.com/${git.repo}/${sha}/${prefix}package.json`, { signal });
    const same = name ? pkg.name === name : repository(pkg.repository) === `https://github.com/${git.repo}`.toLowerCase();
    if (same && hostFit(declaredHost(pkg)) !== 'other' &&
      (newer(pkg.version, entry.version) || hostFit(entry.compatibility) === 'other' && hostFit(declaredHost(pkg)) === 'current')) {
      return { ...entry, spec: `github:${git.repo}#${sha}${git.subdir ? `&path:/${git.subdir}` : ''}`, version: pkg.version,
        compatibility: declaredHost(pkg), selectedFrom: { spec: entry.spec, version: entry.version } };
    }
  } catch (error) { if (signal?.aborted) throw error; }
  return entry;
}
