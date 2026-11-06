import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { FILTERS, STATUS, TYPES, cost, fmtDate, money, sum } from '../lib/util.js';

export default function RequestsView() {
  const { derived, zoneId, zoneName, isAdmin, nm, catalog, setDrawer, loaded } = useApp();
  const [filter, setFilter] = useState('open');
  const f = FILTERS.find(x => x.k === filter) || FILTERS[0];
  const rows = derived.filter(x => f.match(x.d.status));
  return (
    <>
      <div className="head">
        <div><h1>{zoneId ? zoneName(zoneId) : 'All markets'}</h1>
          <p>{isAdmin ? 'Review requests, set expected order dates, and log orders as they’re placed.' : 'Request linens for your properties and follow each order through to delivery.'}</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin ? <button className="btn sec" type="button" onClick={() => setDrawer({ mode: 'order', requestId: null })}>Log bulk order</button> : null}
          <button className="btn" type="button" onClick={() => setDrawer({ mode: 'form' })}>+ New linen request</button>
        </div>
      </div>
      <div className="filters" role="group" aria-label="Filter by status">
        {FILTERS.map(x => <button key={x.k} type="button" aria-pressed={filter === x.k} onClick={() => setFilter(x.k)}><strong>{derived.filter(y => x.match(y.d.status)).length}</strong>{x.label}</button>)}
      </div>
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
    </>
  );
}
