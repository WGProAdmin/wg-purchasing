import React from 'react';
import { GROUPS } from '../lib/util.js';
import { useApp } from '../App.jsx';

/* Quantity grid grouped by towels / king / queen / twin. values: {item_key: qty}; onChange(next) */
export default function ItemGrid({ values, onChange, hints, idPrefix = 'q' }) {
  const { catalog } = useApp();
  const active = new Set((catalog.active || []).map(i => i.key));
  const grouped = new Set(GROUPS.flatMap(g => g.items.map(([k]) => k)));
  const extra = (catalog.active || []).filter(i => !grouped.has(i.key)).map(i => [i.key, i.label]);
  const groups = GROUPS.map(g => ({ ...g, items: g.items.filter(([k]) => active.has(k)) })).concat(extra.length ? [{ name: 'Other', items: extra }] : []).filter(g => g.items.length);
  const set = (k, v) => { const n = Math.max(0, Math.round(Number(v) || 0)); const next = { ...values }; if (n) next[k] = n; else delete next[k]; onChange(next); };
  return (
    <div>
      {groups.map(g => {
        const tot = g.items.reduce((a, [k]) => a + (values[k] || 0), 0);
        return (
          <div className="igroup" key={g.name}>
            <h4>{g.name}<span>{tot ? tot + ' pcs' : ''}</span></h4>
            <div className="icells">
              {g.items.map(([k, label]) => (
                <div className="icell" key={k}>
                  <label htmlFor={idPrefix + k}>{label}</label>
                  <input id={idPrefix + k} type="number" min="0" step="1" inputMode="numeric" className={values[k] ? 'has' : ''}
                    value={values[k] || ''} onChange={e => set(k, e.target.value)} />
                  {hints && hints[k] != null ? <span className="hint">{hints[k]}</span> : null}
                </div>))}
            </div>
          </div>);
      })}
    </div>
  );
}
