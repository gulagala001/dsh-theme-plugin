import React, { useSyncExternalStore } from 'react';
import { Button, Input, Select, Switch, Checkbox } from './appearance.jsx';
import { settingVisible } from './customization.mjs';
export function CustomizationSettings({ registry, client }) {
  const definitions = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  return definitions.map(definition => {
    const values = registry.values(definition);
    const set = (key, value) => { try { registry.set(definition, key, value); } catch (e) { client.report(e); } };
    return <section key={definition.skinId} className="dtp-theme-controls"><h3>{definition.title || '主题专属设置'}</h3>
      {definition.settings.filter(s => settingVisible(s, values)).map(s => {
        const value = values[s.key], disabled = values[s.disabledWhen] === true;
        return <div className="omd-appearance-row" key={s.key}><span>{s.label}{s.description && <small>{s.description}</small>}</span><div className="dtp-custom-control">
          {s.type === 'boolean' && <Switch label={s.label} checked={value} disabled={disabled} onChange={next => set(s.key, next)}/>}
          {s.type === 'select' && <Select aria-label={s.label} value={value} disabled={disabled} onChange={e => set(s.key, e.target.value)}>{s.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}
          {s.type === 'range' && <label><Input aria-label={s.label} type="number" value={value} min={s.min} max={s.max} step={s.step || 1} disabled={disabled} onChange={e => { if (e.target.value !== '') set(s.key, Number(e.target.value)); }}/>{s.unit}</label>}
          {s.type === 'color' && <input aria-label={s.label} type="color" value={value} disabled={disabled} onChange={e => set(s.key, e.target.value)}/>}
          {s.type === 'checkbox-group' && s.options.map(o => <Checkbox key={o.value} label={o.label} checked={value.includes(o.value)} disabled={disabled} onChange={checked => set(s.key, checked ? [...value, o.value] : value.filter(v => v !== o.value))}/>)}
          {s.type === 'visibility-schedule' && <div>
            <Switch label="按时间显示" checked={value.enabled} disabled={disabled} onChange={enabled => set(s.key, { ...value, enabled })}/>
            <Select aria-label="时段外显示" value={value.outside} disabled={disabled} onChange={e => set(s.key, { ...value, outside: e.target.value })}><option value="visible">时段外显示，时段内隐藏</option><option value="hidden">时段外隐藏，时段内显示</option></Select>
            {value.ranges.map((range, index) => <div className="dtp-actions" key={index}>
              {['start', 'end'].map(key => <Input key={key} type="time" aria-label={key === 'start' ? '开始时间' : '结束时间'} value={range[key]} disabled={disabled} onChange={e => set(s.key, { ...value, ranges: value.ranges.map((r, i) => i === index ? { ...r, [key]: e.target.value } : r) })}/>)}
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => set(s.key, { ...value, ranges: value.ranges.filter((_, i) => i !== index) })}>移除</Button>
            </div>)}
            <Button size="sm" variant="outline" disabled={disabled || value.ranges.length >= 24} onClick={() => set(s.key, { ...value, ranges: [...value.ranges, { start: '09:00', end: '18:00' }] })}>添加时段</Button>
          </div>}
        </div></div>;
      })}
    </section>;
  });
}
