import React, { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { Button, Input, Select, SegmentedControl, Personalization, AppearanceSelect, EffectsToggle, AppearanceDrafts, useAppearanceDrafts } from './appearance.jsx';
import { API, BUILTINS, repairTask } from '../shared/protocol.mjs';
import { CustomizationSettings } from './customization.jsx';
function activateEntry(client, entry) {
  if (!entry.localLegacy) return client.activate(entry.id);
  const { builtin, localLegacy, installed, ...skin } = entry;
  return client.importFile(new File([JSON.stringify(skin)], `${skin.id}.omd-skin.json`, { type: 'application/json' }));
}
export function ThemeSettings({ client, appearance, customization }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const visual = useSyncExternalStore(appearance.subscribe, appearance.getSnapshot);
  const [page, setPage] = useState('appearance'), drafts = useAppearanceDrafts();
  const [feedback, setFeedback] = useState('');
  const act = action => { try { const value = action(); if (value?.then) return value.then(() => true, e => { client.report(e); return false; }); return true; } catch (e) { client.report(e); return false; } };
  const changePage = page => { if (drafts.flush()) { setPage(page); client.detail(null); if (page === 'market') void client.market(); } };
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); setFeedback('已复制，可直接发送给 AI'); }
    catch { setFeedback('请在下方文本框中全选并复制'); }
  }
  const selected = state.themes.find(t => t.id === state.active) || BUILTINS.find(t => t.id === (state.active || visual.selected));
  return <AppearanceDrafts.Provider value={drafts}><section className="dtp-settings omd-appearance" data-dsh-plugin="dsh-theme-plugin" data-dsh-surface="settings">
    <header className="dtp-heading"><div><h2>外观</h2><p>选择喜欢的主题，让工作空间更合心意。</p></div>{selected && <span className="dtp-active-label">{selected.name}</span>}</header>
    <SegmentedControl id="dtp-navigation" label="外观页面" value={page} options={[{ value: 'appearance', label: '外观设置' }, { value: 'themes', label: '主题管理' }, { value: 'market', label: '市场' }]} onChange={changePage}/>
    {state.busy && <div role="status" className="dtp-notice"><span className="dtp-spinner"/>{state.busy.label}…</div>}
    {state.reloadPending && <div role="status" className="dtp-notice">主题已启用；草稿发送或清空后会自动刷新，完成页面更新。</div>}
    {state.recovery && <div role="status" className="dtp-notice">{state.recovery.message}</div>}
    {state.error && <div role="alert" className="dtp-error"><strong>暂时无法完成</strong><p>{state.error.message}</p><div className="dtp-actions">
      {state.error.repair && <Button size="sm" variant="outline" onClick={() => copy(state.error.repair)}>复制给 AI 修复</Button>}
      <Button size="sm" variant="ghost" onClick={() => client.dismiss()}>关闭</Button></div>
      {state.error.repair && <details><summary>查看修复说明</summary><textarea aria-label="AI 修复说明" readOnly value={state.error.repair} onFocus={e => e.target.select()}/></details>}
    </div>}
    {feedback && <p role="status" className="dtp-muted">{feedback}</p>}
    {state.detail ? <Details entry={state.detail} {...{ client, state, copy, appearance }}/> : <>
      {page === 'appearance' && <div className="dtp-appearance">
        <CustomizationSettings registry={customization} client={client}/>
        <div className="omd-appearance-row"><span>明暗模式</span><AppearanceSelect runtime={appearance} act={act}/></div>
        <div className="omd-appearance-row"><span>降低透明与动态效果</span><EffectsToggle runtime={appearance} state={visual} act={act}/></div>
        <Personalization runtime={appearance} state={visual} act={act}/>
        <div className="dtp-actions"><Button size="sm" variant="outline" disabled={!!state.busy} onClick={() => client.activate('default')}>恢复 DSH 原生外观</Button></div>
      </div>}
      {page === 'themes' && <Manage {...{ client, state, appearance, visual, copy }}/>}
      {page === 'market' && <Market {...{ client, state }}/>}
    </>}
  </section></AppearanceDrafts.Provider>;
}
function Cover({ entry, onOpen }) {
  const [index, setIndex] = useState(0);
  const urls = entry.screenshots || (entry.image ? [`${API}/builtin/${entry.image}`] : []);
  const url = urls[index];
  return <button className="dtp-cover" type="button" aria-label={`查看${entry.name}`} onClick={onOpen}>
    {url ? <img loading="lazy" decoding="async" referrerPolicy="no-referrer" src={url} alt={`${entry.name}的主题预览`} onError={() => setIndex(i => i + 1)}/> :
      <div className="dtp-cover-empty">{entry.id === 'glyph-motion' ? <span aria-hidden="true">⠿⣿⣶⣤⣀</span> : <span aria-hidden="true">◐</span>}<small>{entry.native ? 'DSH 原生外观' : entry.id === 'glyph-motion' ? 'Glyph 字符主题' : '上游未提供可用预览'}</small></div>}
  </button>;
}
function Card({ entry, children, onOpen, active, sourceLabel }) {
  return <article className={`dtp-card${active ? ' dtp-selected' : ''}`} data-theme-id={entry.id}>
    <Cover entry={entry} onOpen={onOpen}/>
    <div className="dtp-card-body"><div className="dtp-card-title"><h3 title={entry.name}>{entry.name}</h3>{active && <span className="dtp-badge">使用中</span>}</div>
      <p className="dtp-author">{entry.author || 'dsh-theme-plugin'}{sourceLabel ? ` · ${sourceLabel}` : ''}</p>
      <p className="dtp-description">{entry.description?.replace(/^#+\s*/gm, '') || '打开详情查看主题信息与安装来源。'}</p>
      {entry.statusLabel && <p className="dtp-muted">{entry.statusLabel}</p>}
      <div className="dtp-card-footer"><span>{entry.version ? `v${entry.version}` : ''}{entry.stars > 0 ? ` · ★ ${entry.stars}` : ''}</span><div className="dtp-actions">{children}</div></div>
    </div>
  </article>;
}
function Manage({ client, state, appearance, visual, copy }) {
  const [query, setQuery] = useState(''), file = useRef();
  const local = visual.skins.filter(x => !x.builtin && !state.themes.some(t => t.legacy?.id === x.id)).map(x => ({ ...x, localLegacy: true }));
  const list = [...BUILTINS, ...state.themes, ...local].filter(t => `${t.name} ${t.description || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="dtp-page">
    <div className="dtp-toolbar"><Input aria-label="搜索已安装主题" placeholder="搜索已安装主题" value={query} onChange={e => setQuery(e.target.value)}/>
      <Button size="sm" variant="outline" disabled={!!state.busy} onClick={() => file.current.click()}>导入主题</Button>
      <Button size="sm" variant="ghost" disabled={!!state.busy} onClick={() => client.operation('discover', {})}>重新发现</Button>
      <input ref={file} hidden type="file" accept=".json,.zip,.tgz,.gz" onChange={e => { const value = e.target.files?.[0]; e.target.value = ''; void client.importFile(value); }}/>
    </div>
    {state.discovering && <p role="status">正在识别已有主题，原设置保持可用…</p>}
    <div className="dtp-grid">{list.map(entry => <Card key={entry.id} entry={entry} active={(state.active || visual.selected) === entry.id} onOpen={() => client.detail({ ...entry, installed: true })}>
      <Button size="sm" variant="outline" disabled={!!state.busy || (state.active || visual.selected) === entry.id} onClick={() => activateEntry(client, entry)}>启用</Button>
    </Card>)}</div>
    {!!state.issues.length && <section className="dtp-issues"><h3>需要处理的主题</h3>{state.issues.map(issue => <article className="dtp-issue" key={issue.id}><div><strong>{issue.name}</strong><p>{issue.message}</p></div><Button size="sm" variant="outline" onClick={() => copy(issue.repair)}>复制给 AI 修复</Button></article>)}</section>}
  </div>;
}
function Market({ client, state }) {
  const [query, setQuery] = useState(''), [source, setSource] = useState('all'), [sort, setSort] = useState('popular'), [tag, setTag] = useState('all'), [limit, setLimit] = useState(30);
  useEffect(() => { setLimit(30); }, [query, source, sort, tag]);
  const sources = state.catalog.sources || [], catalog = state.catalog.items || [];
  const tags = [...new Set(catalog.flatMap(x => x.tags || []))].sort((a, b) => a.localeCompare(b, 'zh')).slice(0, 150);
  const filtered = catalog.filter(x => (source === 'all' || x.sources.includes(source)) && (tag === 'all' || x.tags.includes(tag)) && `${x.name} ${x.author} ${x.description} ${(x.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  filtered.sort((a, b) => sort === 'latest' ? String(b.updated || '').localeCompare(String(a.updated || '')) : Number(!!b.screenshots.length) - Number(!!a.screenshots.length) || (b.stars || 0) - (a.stars || 0) || (b.downloads || 0) - (a.downloads || 0));
  return <div className="dtp-page">
    <div className="dtp-market-intro"><div><h3>发现你的下一套主题</h3><p>浏览社区作品，预览外观，一键兼容安装。</p></div><Button variant="ghost" size="sm" disabled={state.catalogLoading} onClick={() => client.market(true)}>刷新市场</Button></div>
    <div className="dtp-toolbar"><Input aria-label="搜索市场主题" placeholder="搜索主题、作者或风格" value={query} onChange={e => setQuery(e.target.value)}/>
      <Select aria-label="市场来源" value={source} onChange={e => setSource(e.target.value)}><option value="all">全部市场</option>{sources.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      <Select aria-label="主题风格" value={tag} onChange={e => setTag(e.target.value)}><option value="all">全部风格</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</Select>
      <Select aria-label="排序" value={sort} onChange={e => setSort(e.target.value)}><option value="popular">热门</option><option value="latest">最新</option></Select>
    </div>
    <div className="dtp-source-status"><span>{filtered.length} 个主题</span>{sources.map(s => <span key={s.id} title={s.error || (s.state === 'mirror' ? '使用上游仓库目录，下载时确认资源可用性' : '')}>{s.name} · {s.state === 'unavailable' ? '暂不可用' : s.state === 'cached' ? '本地缓存' : s.state === 'mirror' ? '仓库目录' : s.count}</span>)}</div>
    {state.catalogLoading && !catalog.length ? <div role="status" className="dtp-empty"><span className="dtp-spinner"/>正在获取社区主题与预览…</div> :
      !filtered.length ? <div className="dtp-empty">没有找到匹配主题。可以更换关键词或刷新市场。</div> :
      <div className="dtp-grid">{filtered.slice(0, limit).map(entry => {
        const installed = state.themes.find(t => t.id === entry.id ||
          entry.packageName && t.linked?.packageName === entry.packageName);
        const issue = state.issues.find(t => t.id === entry.id);
        const statusLabel = installed?.report?.ok ? `已通过 DSH ${state.hostVersion} 本机检查` :
          entry.hostStatus === 'other' || issue?.code === 'host-version' ? '旧条目 · 安装时查找适配当前 DSH 的新版' : issue ? '上次检查未通过 · 可查看原因并重试' : '安装前检查当前 DSH 兼容性';
        return <Card key={entry.id} entry={{ ...entry, statusLabel }} active={state.active === entry.id} sourceLabel={sources.find(s => s.id === entry.source)?.name} onOpen={() => client.detail({ ...entry, ...(installed || {}), installed: !!installed })}>
          <Button variant="outline" size="sm" disabled={!!state.busy} onClick={() => installed?.report?.ok ? client.activate(installed.id) : client.operation('install', { id: entry.id }, { apply: true })}>{installed?.report?.ok ? '启用' : entry.hostStatus === 'other' ? '检查新版并安装' : installed ? '重新检查并安装' : '安装并应用'}</Button>
        </Card>;
      })}</div>}
    {filtered.length > limit && <div className="dtp-more"><Button variant="outline" size="sm" onClick={() => setLimit(limit + 30)}>加载更多</Button></div>}
  </div>;
}
function Details({ entry, client, state, copy, appearance }) {
  const [index, setIndex] = useState(0);
  const shots = entry.screenshots || (entry.image ? [`${API}/builtin/${entry.image}`, `${API}/builtin/${entry.darkImage}`] : []);
  const builtin = BUILTINS.some(x => x.id === entry.id);
  return <div className="dtp-detail"><Button size="sm" variant="ghost" onClick={() => client.detail(null)}>← 返回</Button>
    <div className="dtp-detail-title"><div><h2>{entry.name}</h2><p>{entry.author || 'dsh-theme-plugin'}{entry.version ? ` · v${entry.version}` : ''}</p></div>
      <Button size="sm" disabled={!!state.busy} onClick={() => entry.installed || builtin ? activateEntry(client, entry) : client.operation('install', { id: entry.id }, { apply: true })}>{entry.installed || builtin ? '启用主题' : '安装并应用'}</Button></div>
    {shots.length > 0 && <><img className="dtp-detail-image" src={shots[index]} referrerPolicy="no-referrer" alt={`${entry.name}预览 ${index + 1}`}/>{shots.length > 1 && <div className="dtp-thumbnails">{shots.map((url, i) => <button key={url} type="button" aria-label={`预览图 ${i + 1}`} aria-pressed={i === index} onClick={() => setIndex(i)}><img src={url} alt="" loading="lazy" referrerPolicy="no-referrer"/></button>)}</div>}</>}
    <p className="dtp-long-description">{entry.description || '此主题暂未提供详细说明。'}</p>
    <dl className="dtp-info">{entry.license && <><dt>许可声明</dt><dd>{typeof entry.license === 'string' ? entry.license : JSON.stringify(entry.license)}</dd></>}{entry.compatibility && <><dt>上游声明</dt><dd>{entry.compatibility}</dd></>}
      {entry.report && <><dt>兼容检查</dt><dd>{!entry.report.ok ? '需要重新检查' : entry.report.runtime === 'isolated-host' ? '已通过匹配宿主的隔离加载检查' : entry.report.runtime === 'native-managed' ? '由 DSH 原生管理的已安装主题' : '已通过主题格式与资源检查'}</dd></>}
      {entry.source?.selectedFrom && <><dt>版本选择</dt><dd>已从市场原条目 {entry.source.selectedFrom.version || entry.source.selectedFrom.spec} 更新为同来源的 {entry.version}。</dd></>}
      {entry.source?.fallbackFrom && <><dt>版本选择</dt><dd>较新版未通过当前 DSH 检查，已使用通过检查的目录版本 {entry.version}。</dd></>}
      {entry.repo && <><dt>来源</dt><dd><a href={entry.repo} target="_blank" rel="noreferrer">查看原项目</a></dd></>}
    </dl>
    {entry.report?.warnings?.map(message => <p className="dtp-muted" key={message}>{message}</p>)}
    <div className="dtp-actions"><Button variant="ghost" size="sm" onClick={() => {
      const theme = state.themes.find(t => t.id === entry.id) || entry;
      void copy(repairTask({ theme, error: { code: 'appearance-review', stage: '用户反馈', message: '请结合原主题预览检查外观、交互和当前 DSH 兼容性；我会补充具体问题表现。' }, report: theme.report || {} }));
    }}>复制 AI 检查说明</Button></div>
    {(entry.installed || builtin) && <div className="dtp-actions">{!entry.linked && <Button variant="outline" size="sm" disabled={entry.id === 'default'} onClick={() => client.exportTheme(entry.id)}>导出主题</Button>}
      {!builtin && <Button variant="outline" size="sm" disabled={!!state.busy} onClick={async () => { if (entry.localLegacy) appearance.remove(entry.id); else await client.remove(entry.id); client.detail(null); }}>移出主题管理</Button>}
      {entry.source?.market && <Button variant="outline" size="sm" disabled={!!state.busy} onClick={() => client.operation('install', { id: entry.id })}>从原来源更新</Button>}
    </div>}
  </div>;
}
