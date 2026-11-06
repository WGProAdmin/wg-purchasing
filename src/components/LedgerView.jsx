import React from 'react';
import { useApp } from '../App.jsx';
import { TYPES, cost, fmtDate, money, sum } from '../lib/util.js';

/* Mirrors the Updated - Linens tab: requests add, orders subtract, footer = still needed */
export default function LedgerView() {
  const { zoneId, zoneName, requests, pos, posByReq, derived, catalog, nm, setDrawer, loaded } = useApp();
  if (!zoneId) return (<><div className="head"><div><h1>Linen ledger</h1><p>Pick a market in the top bar to see its ledger.</p></div></div>
    <div className="list"><div className="empty"><h3>Choose a market</h3><p>The ledger nets every request against every order for one market, like the tracker sheet.</p></div></div></>);
  if (!loaded) return <div className="list"><div className="empty">Loading ledger…</div></div>;
  const items = catalog.list;
  const lines = [];
  for (const { r, d } of derived) {
    if (r.status === 'cancelled' || r.status === 'denied') continue;
    const open = { mode: 'view', id: r.id };
    const byProp = new Map();
    for (const i of r.linen_request_items || []) { const k = i.property_id || ''; if (!byProp.has(k)) byProp.set(k, {}); byProp.get(k)[i.item_key] = i.qty; }
    for (const rp of r.linen_request_properties || []) {
      lines.push({ at: rp.added_at, sign: 1, label: `${rp.property_code} - ${rp.property_name}`, sub: `${fmtDate(rp.added_at)} | ${rp.multiplier}x par | #${r.ref_no}`, items: byProp.get(rp.property_id) || {}, open });
    }
    if (byProp.has('')) lines.push({ at: r.created_at, sign: 1, label: r.title, sub: `${TYPES[r.type]} | ${fmtDate(r.created_at)} | #${r.ref_no}`, items: byProp.get(''), open });
    if (r.status === 'closed' && d.outTotal > 0) lines.push({ at: r.decided_at, sign: -1, order: true, label: `Closed: ${r.title}`, sub: 'Remaining quantity waived', items: d.outstanding, open });
  }
  for (const o of pos) {
    const r = o.request_id ? requests.find(x => x.id === o.request_id) : null;
    const its = Object.fromEntries((o.linen_po_items || []).map(i => [i.item_key, i.qty]));
    lines.push({ at: o.created_at, sign: -1, order: true, label: `Ordered by ${nm(o.ordered_by)}`,
      sub: `${fmtDate(o.order_date)} | ${r ? '#' + r.ref_no : 'bulk order'}${o.vendor ? ' | ' + o.vendor : ''}${o.received_at ? ' | received' : ''}`,
      items: its, open: r ? { mode: 'view', id: r.id } : { mode: 'po', id: o.id } });
  }
  lines.sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!lines.length) return (<><div className="head"><div><h1>{zoneName(zoneId)} ledger</h1></div></div>
    <div className="list"><div className="empty"><h3>No activity for {zoneName(zoneId)} yet</h3><p>Requests and orders will build the ledger as they come in.</p></div></div></>);
  const net = {};
  for (const L of lines) for (const [k, n] of Object.entries(L.items)) net[k] = (net[k] || 0) + L.sign * n;
  const out = Object.fromEntries(Object.entries(net).filter(([, v]) => v > 0));
  const c = cost(out, catalog.byKey);
  const used = items.filter(i => i.active || lines.some(L => L.items[i.key]));
  return (
    <>
      <div className="head"><div><h1>{zoneName(zoneId)} ledger</h1><p>Every request adds, every order subtracts. The blue row is what’s still needed.</p></div></div>
      <div className="ledger-wrap">
        <table className="ledger">
          <thead><tr><th scope="col">Source</th>{used.map(i => <th scope="col" key={i.key}>{i.label}</th>)}</tr></thead>
          <tbody>
            {lines.map((L, ix) => (
              <tr key={ix} className={(L.order ? 'order ' : '') + 'click'} onClick={() => setDrawer(L.open)}>
                <td className="src">{L.label}<small>{L.sub}</small></td>
                {used.map(i => { const n = L.items[i.key] || 0; return <td key={i.key} className={n ? (L.sign > 0 ? 'p' : 'n') : ''}>{n ? (L.sign > 0 ? n : '−' + n) : ''}</td>; })}
              </tr>))}
          </tbody>
          <tfoot><tr><td>Still needed</td>{used.map(i => <td key={i.key}>{net[i.key] || ''}</td>)}</tr></tfoot>
        </table>
      </div>
      <div className="ledger-foot"><span>{sum(out).toLocaleString()} pieces still needed | est. {money(c.t)}{c.missing ? ' plus items with no price on file' : ''}</span><span>Select a row to open it.</span></div>
    </>
  );
}
