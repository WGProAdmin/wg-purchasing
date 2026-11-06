import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import ItemGrid from './ItemGrid.jsx';
import { MULTIPLIERS, cost, fmtDate, money, scale, sum, errMsg } from '../lib/util.js';

export default function OnboardView({ onCount }) {
  const { zoneId, zoneName, isAdmin, catalog, setDrawer, requests, toast, me } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const [sel, setSel] = useState({});        // property_id -> true
  const [mult, setMult] = useState({});      // property_id -> multiplier
  const [over, setOver] = useState({});      // property_id -> edited items
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('linen_onboard_queue', { p_zone_id: zoneId || null, p_include_dismissed: showDismissed });
    if (error) { setErr(errMsg(error)); setRows([]); return; }
    setErr(''); setRows(data || []);
    if (!showDismissed) onCount?.((data || []).length);
    const ids = new Set((data || []).map(r => r.property_id));
    setSel(s => Object.fromEntries(Object.entries(s).filter(([k]) => ids.has(k))));
  }, [zoneId, showDismissed, onCount]);
  useEffect(() => { load(); }, [load, requests]);

  const itemsFor = r => over[r.property_id] || scale(r.par, mult[r.property_id] ?? 1);
  const chosen = (rows || []).filter(r => sel[r.property_id]);
  const markets = [...new Set(chosen.map(r => r.zone_id))];
  const totals = useMemo(() => { const t = {}; for (const r of chosen) for (const [k, v] of Object.entries(itemsFor(r))) t[k] = (t[k] || 0) + v; return t; }, [chosen, over, mult]);
  const c = cost(totals, catalog.byKey);

  const payload = () => ({
    zone_id: markets[0],
    properties: chosen.map(r => ({ property_id: r.property_id, multiplier: mult[r.property_id] ?? 1, code: r.property_code, name: r.name, items: itemsFor(r) }))
  });
  const done = () => { setSel({}); setOver({}); setOpen({}); load(); };

  const dismiss = async (r, on) => {
    let reason = null;
    if (on) { reason = window.prompt(`Why doesn’t ${r.property_code} need linens? (optional)`, 'Client supplies linens'); if (reason === null) return; }
    const { error } = await supabase.rpc('linen_set_onboard_dismissed', { p_property_id: r.property_id, p_dismissed: on, p_reason: reason });
    if (error) return toast(errMsg(error));
    toast(on ? `${r.property_code} removed from the queue.` : `${r.property_code} is back in the queue.`); load();
  };

  return (
    <>
      <div className="head">
        <div><h1>New onboard{zoneId ? `: ${zoneName(zoneId)}` : ''}</h1>
          <p>Properties synced from the property database that haven’t had linens ordered. Each starts at one par order; set a multiplier, then create an order or add to one.</p></div>
      </div>
      {isAdmin ? <div className="toolbar"><label><input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} /> Show properties marked not needed</label></div> : null}
      {err ? <div className="notice">{err}</div> : null}
      <div className="ob">
        <div className="ob-row hd" aria-hidden="true"><div></div><div>Property</div><div>Beds and baths</div><div className="num">Pieces</div><div>Multiplier</div><div>First clean</div><div className="num">Est.</div><div>Added</div><div></div></div>
        {rows === null ? <div className="empty">Loading properties…</div> :
          !rows.length ? <div className="empty"><h3>No new properties waiting</h3><p>New properties appear here automatically once they sync into the property database.</p></div> :
            rows.map(r => {
              const its = itemsFor(r); const pc = cost(its, catalog.byKey); const isOpen = !!open[r.property_id];
              return (
                <React.Fragment key={r.property_id}>
                  <div className={'ob-row' + (sel[r.property_id] ? ' sel' : '')}>
                    <div><input type="checkbox" aria-label={`Select ${r.property_code}`} disabled={r.dismissed} checked={!!sel[r.property_id]} onChange={e => setSel(s => ({ ...s, [r.property_id]: e.target.checked || undefined }))} /></div>
                    <div className="t">{r.property_code} - {r.name}
                      <small>{r.market_name}{r.review_status === 'pending' ? ' | setup in progress' : ''}{r.dismissed ? ` | not needed${r.dismiss_reason ? ': ' + r.dismiss_reason : ''}` : ''}</small>
                      {r.missing_info ? <small className="warn">Bed or bath info is missing in the property database, so par may be short.</small> : null}
                    </div>
                    <div>{r.bed_summary || '—'}<small className="muted" style={{ display: 'block', fontSize: 12.5 }}>{r.bathrooms ? `${Number(r.bathrooms)} bath` : ''}{r.sleep_count ? ` | sleeps ${r.sleep_count}` : ''}{r.has_pool ? ' | pool' : ''}</small></div>
                    <div className="num">{sum(its).toLocaleString()}</div>
                    <div><select aria-label="Par multiplier" value={mult[r.property_id] ?? 1} disabled={!!over[r.property_id]}
                      onChange={e => { setMult(m => ({ ...m, [r.property_id]: Number(e.target.value) })); }}>
                      {MULTIPLIERS.map(m => <option key={m} value={m}>{m}x par</option>)}</select></div>
                    <div>{fmtDate(r.date_of_first_clean) || '—'}</div>
                    <div className="num">{money(pc.t)}{pc.missing ? '+' : ''}</div>
                    <div>{fmtDate(r.created_at)}</div>
                    <div><button className="iconbtn" type="button" aria-expanded={isOpen} aria-label={isOpen ? 'Hide items' : 'Show items'} onClick={() => setOpen(o => ({ ...o, [r.property_id]: !isOpen }))}>{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></div>
                  </div>
                  {isOpen ? (
                    <div className="ob-detail">
                      {over[r.property_id] ? <p className="muted" style={{ fontSize: 13 }}>Quantities edited by hand, so the multiplier is off. Reset to go back to par.</p> : null}
                      <ItemGrid idPrefix={'ob' + r.property_id.slice(0, 6)} values={its} onChange={v => setOver(o => ({ ...o, [r.property_id]: v }))} />
                      <div className="actions">
                        {over[r.property_id] ? <button className="btn ghost sm" type="button" onClick={() => setOver(o => { const n = { ...o }; delete n[r.property_id]; return n; })}>Reset to par</button> : null}
                        {isAdmin ? (r.dismissed ? <button className="btn sec sm" type="button" onClick={() => dismiss(r, false)}>Return to queue</button>
                          : <button className="btn ghost sm" type="button" onClick={() => dismiss(r, true)}>Mark not needed</button>) : null}
                      </div>
                    </div>) : null}
                </React.Fragment>);
            })}
      </div>
      {chosen.length ? (
        <div className="ob-bar" role="region" aria-label="Selected properties">
          <div className="sum">{markets.length > 1 ? 'Select properties from one market to order them together.' :
            <><b>{chosen.length} {chosen.length === 1 ? 'property' : 'properties'}</b> | {sum(totals).toLocaleString()} pieces | est. {money(c.t)}{c.missing ? '+' : ''}</>}</div>
          <button className="btn sec" type="button" onClick={() => setSel({})}>Clear</button>
          <button className="btn sec" type="button" disabled={markets.length > 1} onClick={() => setDrawer({ mode: 'obAppend', data: payload(), done })}>Add to existing order</button>
          <button className="btn" type="button" disabled={markets.length > 1} onClick={() => setDrawer({ mode: 'obCreate', data: payload(), done })}>Create new order</button>
        </div>) : null}
    </>
  );
}
