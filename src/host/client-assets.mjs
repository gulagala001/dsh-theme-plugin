import { ThemeError } from '../shared/protocol.mjs';

// Existing upstream protocols; their host entries only serve packaged files.
// Keep those files under the manager's checked resource endpoint instead of
// executing a second Node plugin or registering its global routes.
export function adaptClientAssets(factory, { packageName, originalId, clientPath, assets, resource }) {
  const routes = [];
  if (packageName && clientPath && assets.has(clientPath.replace(/^\.\//, ''))) {
    factory = factory.split(`/plugins/${packageName}/client.js`).join(resource(clientPath.replace(/^\.\//, '')));
  }
  if (packageName) factory = factory.split(`/plugins/${packageName}/`).join(resource(''));
  if (packageName === 'open-sea-skin') routes.push(['/open-sea-skin/', 'native-dist/', 'native-dist/skin.html']);
  if (['maid-atelier', 'orca-link'].includes(originalId) && /^@smalltailqwq\//.test(packageName || '')) {
    routes.push([`/skin-assets/${originalId}/`, 'assets/runtime/', 'assets/runtime/manifest.json']);
    routes.push([`skin-assets/${originalId}/`, 'assets/runtime/', 'assets/runtime/manifest.json']);
  }
  for (const [prefix, folder, required] of routes) {
    if (!factory.includes(prefix)) continue;
    if (!assets.has(required)) throw new ThemeError('resource-missing', `主题缺少运行资源：${required}`);
    factory = factory.split(prefix).join(resource(folder));
  }
  return { factory, adaptedRoutes: routes.map(([from, to]) => ({ from, to })) };
}
