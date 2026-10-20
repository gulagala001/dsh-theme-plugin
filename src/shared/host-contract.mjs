import { HOST_VERSION } from './protocol.mjs';

// Bump when module mappings, resource hosting or lifecycle semantics change.
// Installed packages keep source digests separate from this compatibility stamp.
export const ADAPTER_VERSION = 5;
export const HOST_CONTRACT = Object.freeze({
  version: HOST_VERSION,
  adapterVersion: ADAPTER_VERSION,
  services: {
    slots: ['inject', 'register', 'entriesOfSlot'],
    theme: ['getTheme', 'setTheme', 'overrideTokens'],
    modules: ['import', 'invalidate'],
  },
  // rc.2 extracted the store API from the old runtime module. Only this
  // verified export is mapped; unrelated runtime exports must be adapted.
  moduleAliases: {
    '@deepseek-ai/dsh-client-runtime/client': { target: '@deepseek-ai/dsh-client-store', exports: ['defineStore', 'createSnapshotStore'] },
  },
});
export const isHostThemeService = name => [
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-general',
  '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app',
].includes(name);
export const isNativeThemeController = name => name === '@linxin666/dsh-client-ui-skin-center';
export function checkHostCapabilities(ctx) {
  const missing = [];
  for (const [service, methods] of Object.entries(HOST_CONTRACT.services)) {
    const value = ctx.get(service);
    for (const method of methods) if (typeof value?.[method] !== 'function') missing.push(`${service}.${method}`);
  }
  if (missing.length) throw Error(`当前 DSH 的主题接口发生变化：${missing.join('、')}。请更新主题管理插件；原主题与设置已保留。`);
}
export function needsRecheck(theme, hostVersion = HOST_VERSION) {
  return !theme.linked && (theme.report?.adapterVersion !== ADAPTER_VERSION ||
    needsRuntimeProbe(theme) && theme.report?.hostVersion !== hostVersion);
}
export const needsRuntimeProbe = theme => !!(theme.client || theme.hooks || theme.css || Object.keys(theme.background || {}).length);
