import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { publicUrl } from './network.mjs';
export async function probePage(browser, bootstrap, { screenshots } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  let page, phase = 'boot';
  const errors = [];
  try {
  const origin = new URL(bootstrap).origin;
  const blocked = [];
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || /^(data|blob):/.test(url)) return route.continue();
    try { await publicUrl(url); return route.continue(); }
    catch { blocked.push(new URL(url).origin + new URL(url).pathname); return route.abort(); }
  });
  page = await context.newPage();
  await page.addInitScript(() => { window.__DTP_PROBE_MODE__ = true; });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(origin + '/') && !response.url().endsWith('/favicon.ico')) errors.push(`加载失败 (${response.status()})：${new URL(response.url()).pathname}`); });
  const probeUrl = new URL(bootstrap); probeUrl.searchParams.set('theme-probe', '1');
  await page.goto(probeUrl.href, { timeout: 25000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__DTP_PROBE_READY__ || window.__DTP_PROBE_RESULT__, null, { timeout: 25000 });
  phase = 'onboarding';
  const early = await page.evaluate(() => window.__DTP_PROBE_RESULT__);
  if (early) return { ...early, errors };
  const proceed = page.getByRole('button', { name: '继续', exact: true });
  const addKey = page.getByRole('button', { name: '添加 API Key', exact: true });
  await proceed.or(addKey).first().waitFor({ state: 'visible', timeout: 12000 });
  if (await proceed.isVisible()) { await proceed.click(); await addKey.waitFor({ state: 'visible' }); }
  if (await addKey.isVisible()) {
    await addKey.click();
    const skip = page.getByRole('button', { name: '稍后配置', exact: true });
    await skip.click(); await skip.waitFor({ state: 'hidden' });
  }
  await page.locator('[data-composer-input]').first().waitFor({ state: 'visible', timeout: 12000 });
  await page.evaluate(() => { window.__DTP_PROBE_INTERACTIVE__ = true; window.__DTP_PROBE_BEGIN__?.(); });
  phase = 'mount';
  let step = 0;
  for (;;) {
    await page.waitForFunction(id => window.__DTP_PROBE_RESULT__ || (window.__DTP_PROBE_STEP__?.id > id), step, { timeout: 25000 });
    const state = await page.evaluate(() => ({ result: window.__DTP_PROBE_RESULT__, step: window.__DTP_PROBE_STEP__ }));
    if (state.result) break;
    step = state.step.id;
    phase = state.step.phase;
    let error;
    try {
      const input = page.locator('[data-composer-input]').first();
      await input.fill('主题兼容检查', { timeout: 3500 }); await input.fill('');
      await page.getByRole('button', { name: '账号菜单', exact: true }).click({ timeout: 3500 });
      await page.getByRole('menuitem', { name: '设置', exact: true }).click({ timeout: 3500 });
      await page.getByRole('button', { name: '外观', exact: true }).first().waitFor({ state: 'visible', timeout: 3500 });
      await page.keyboard.press('Escape');
    } catch (e) { error = `主题在 ${state.step.phase} 模式下使输入或设置不可用：${e.message}`; }
    if (screenshots) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: join(screenshots, `${error ? 'failed-' : ''}${state.step.phase}.png`) }); }
    await page.evaluate(({ id, error }) => { window.__DTP_PROBE_UI_ERROR__ = error; window.__DTP_PROBE_ACK__ = id; }, { id: step, error });
  }
  const report = await page.evaluate(() => window.__DTP_PROBE_RESULT__);
  const result = { ...report, errors: [...errors, ...(report.errors || []), ...[...new Set(blocked)].map(url => `主题依赖尚未打包的外部资源：${url}`)] };
  if (result.errors.length) { result.ok = false; result.error = result.errors[0]; }
  return result;
  } catch (e) {
    return { ok: false, error: errors[0] || e.message, phase, errors,
      state: await page?.evaluate(() => ({ ready: window.__DTP_PROBE_READY__, step: window.__DTP_PROBE_STEP__, result: window.__DTP_PROBE_RESULT__, text: document.body.innerText.slice(-1500) })).catch(() => null) };
  } finally { await context.close(); }
}
