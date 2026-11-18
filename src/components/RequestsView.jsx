import React, { useState } from 'react';
import { ArrowUp, ArrowDown, ChevronsUp } from 'lucide-react';
import { useApp } from '../App.jsx';
import { FILTERS, STATUS, TYPES, cost, errMsg, fmtDate, money, sum } from '../lib/util.js';

const byPriority = (a, b) => {
  const ra = a.r.priority_rank, rb = b.r.priority_rank;
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra == null && rb != null) return 1;
  if (rb == null && ra != null) return -1;
  const na = a.r.needed_by || '9999', nb = b.r.needed_by || '9999';
  return na === nb ? new Date(a.r.created_at) - new Date(b.r.created_at) : na < nb ? -1 : 1;
};

export default function RequestsView() {
  const { derived, zoneId, zoneName, isAdmin, setDrawer, loaded } = useApp();
  const [filter, setFilter] = useState('queue');
  const f = FILTERS.find(x => x.k === filter) || FILTERS[0];
  const rows = derived.filter(x => f.match(x.d.status));
  return (
    <>
      <div className="head">
        <div><h1>{zoneId ? zoneName(zoneId) : 'All markets'}</h1>
          <p>{isAdmin ? 'Work the priority queue top to bottom. Approve, set expected order dates, and log orders as they’re placed.' : 'Request linens for your properties and follow each order through to delivery.'}</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin ? <button className="btn sec" type="button" onClick={() => setDrawer({ mode: 'order', requestId: null })}>Log bulk order</button> : null}
          <button className="btn" type="button" onClick={() => setDrawer({ mode: 'form' })}>+ New linen request</button>
        </div>
      </div>
      <div className="filters" role="group" aria-label="Filter by status">
        {FILTERS.map(x => <button key={x.k} type="button" aria-pressed={filter === x.k} onClick={() => setFilter(x.k)}><strong>{derived.filter(y => x.match(y.d.status)).length}</strong>{x.label}</button>)}
      </div>
      {filter === 'queue' ? <Queue rows={rows.slice().sort(byPriority)} loaded={loaded} /> : <List rows={rows} f={f} loaded={loaded} />}
    </>
  );
}

function List({ rows, f, loaded }) {
  const { derived, zoneName, nm, catalog, setDrawer } = useApp();
  return (
    <div className="list">
      <div className="row hd" aria-hidden="true"><div>#</div><div>Submitted</div><div>Request</div><div>Market</div><div>Requested by</div><div className="num">Pieces</div><div className="num">Est. cost</div><div>Order date</div><div>Status</div></div>
      {!loaded ? <div className="empty">Loading requests…</div> :
        !rows.length ? (
          <div className="empty"><h3>{derived.length ? `Nothing in “${f.label}”` : 'No linen requests yet'}</h3>
            <p>{derived.length ? 'Pick another status above to see the rest.' : 'Start one here, or order par linens for new properties from the New onboard tab.'}</p></div>) :
          rows.map(({ r, d }) => {
            const c = cost(d.requested, catalog.byKey);
            return (
              <button className="row" type="button" key={r.id} onClick={() => setDrawer({ mode: 'view', id: r.id })}>
                <div className="ref">{r.ref_no}</div>
                <div>{fmtDate(r.created_at)}</div>
                <div className="t">{r.title}<small>{TYPES[r.type]}{r.linen_request_properties?.length > 1 ? ` | ${r.linen_request_properties.length} properties` : ''}</small></div>
                <div>{zoneName(r.zone_id)}</div>
                <div>{nm(r.requested_by)}</div>
                <div className="num">{sum(d.requested).toLocaleString()}</div>
                <div className="num">{money(c.t)}{c.missing ? '+' : ''}</div>
                <div>{r.expected_order_date ? fmtDate(r.expected_order_date) : (r.needed_by ? <span className="muted">Need {fmtDate(r.needed_by)}</span> : '—')}</div>
                <div><span className={'pill st-' + d.status}>{STATUS[d.status]}</span></div>
              </button>);
          })}
    </div>
  );
}

function Queue({ rows, loaded }) {
  const { zoneName, nm, isAdmin, setDrawer, call, toast } = useApp();
  const [busy, setBusy] = useState(false);
  // Reorder only the rows on screen by reusing their own rank slots, so a market-filtered view
  // never disturbs the relative order of requests in other markets.
  const move = async (from, to) => {
    if (busy || to < 0 || to >= rows.length || from === to) return;
    const sorted = rows.map((x, i) => x.r.priority_rank ?? (i + 1) * 1e9).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] <= sorted[i - 1]) sorted[i] = sorted[i - 1] + 1;
    const order = rows.slice(); const [it] = order.splice(from, 1); order.splice(to, 0, it);
    setBusy(true);
    try { await call('linen_set_priority', { p_ids: order.map(x => x.r.id), p_ranks: sorted }); }
    catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };
  const reset = async () => {
    if (!window.confirm('Reset the whole queue to date needed? Manual moves across all markets will be lost.')) return;
    setBusy(true);
    try { await call('linen_reset_priority', {}); toast('Queue reset to date needed.'); } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };
  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span>Requests not yet fully processed, highest priority first. New requests slot in by date needed{isAdmin ? '; use the arrows to move them.' : '.'}</span>
        {isAdmin ? <button className="btn ghost sm" type="button" disabled={busy} onClick={reset}>Reset to date needed</button> : null}
      </div>
      <div className="list">
        <div className="qrow hd" aria-hidden="true"><div>Priority</div><div>Request</div><div>Market</div><div>Requested by</div><div className="num">Pieces</div><div>Needed by</div><div>Order date</div><div>Status</div><div></div></div>
        {!loaded ? <div className="empty">Loading queue…</div> :
          !rows.length ? <div className="empty"><h3>The queue is clear</h3><p>Nothing is waiting to be approved or ordered.</p></div> :
            rows.map(({ r, d }, i) => (
              <div className="qrow" key={r.id}>
                <div className="prio">{i + 1}</div>
                <button className="qopen t" type="button" onClick={() => setDrawer({ mode: 'view', id: r.id })}>{r.title}<small>#{r.ref_no} | {TYPES[r.type]}{r.linen_request_properties?.length > 1 ? ` | ${r.linen_request_properties.length} properties` : ''}</small></button>
                <div>{zoneName(r.zone_id)}</div>
                <div>{nm(r.requested_by)}</div>
                <div className="num">{sum(d.requested).toLocaleString()}</div>
                <div>{fmtDate(r.needed_by) || '—'}</div>
                <div>{fmtDate(r.expected_order_date) || '—'}</div>
                <div><span className={'pill st-' + d.status}>{STATUS[d.status]}</span></div>
                <div className="qmove">{isAdmin ? <>
                  <button className="iconbtn" type="button" aria-label={`Move #${r.ref_no} to top`} disabled={busy || i === 0} onClick={() => move(i, 0)}><ChevronsUp size={15} /></button>
                  <button className="iconbtn" type="button" aria-label={`Move #${r.ref_no} up`} disabled={busy || i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={15} /></button>
                  <button className="iconbtn" type="button" aria-label={`Move #${r.ref_no} down`} disabled={busy || i === rows.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={15} /></button>
                </> : null}</div>
              </div>))}
      </div>
    </>
  );
}
