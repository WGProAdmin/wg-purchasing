import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import ItemGrid from './ItemGrid.jsx';
import { STATUS, TYPES, clean, cost, derive, errMsg, fmtDate, fmtTime, money, sum, today, addInto } from '../lib/util.js';

export default function Drawer({ drawer }) {
  const { setDrawer } = useApp();
  const on = !!drawer;
  const close = useCallback(() => setDrawer(null), [setDrawer]);
  useEffect(() => {
    if (!on) return;
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc);
  }, [on, close]);
  let body = null;
  if (drawer) {
    const m = drawer.mode;
    if (m === 'view') body = <RequestDetail id={drawer.id} />;
    else if (m === 'form') body = <RequestForm id={drawer.id} />;
    else if (m === 'order') body = <OrderForm requestId={drawer.requestId} />;
    else if (m === 'approve') body = <ApproveForm id={drawer.id} />;
    else if (m === 'deny') body = <DenyForm id={drawer.id} />;
    else if (m === 'obCreate') body = <ObCreate data={drawer.data} done={drawer.done} />;
    else if (m === 'obAppend') body = <ObAppend data={drawer.data} done={drawer.done} />;
    else if (m === 'po') body = <PoDetail id={drawer.id} />;
  }
  return (
    <>
      <div className={'scrim' + (on ? ' on' : '')} onClick={close} />
      <aside className={'drawer' + (on ? ' on' : '')} role="dialog" aria-modal="true" aria-labelledby="dTitle">{body}</aside>
    </>
  );
}

function Shell({ title, sub, children, foot }) {
  const { setDrawer } = useApp();
  return (
    <>
      <div className="d-head"><div><h2 id="dTitle">{title}</h2>{sub ? <p>{sub}</p> : null}</div>
        <button className="x" type="button" aria-label="Close" onClick={() => setDrawer(null)}><X size={16} /></button></div>
      <div className="d-body">{children}</div>
      {foot ? <div className="d-foot">{foot}</div> : null}
    </>
  );
}

/* Fetch one request + its orders fresh (works even if it's outside the current market filter) */
function useRequest(id) {
  const { requests, pos } = useApp();
  const [state, setState] = useState({ r: null, orders: [], loading: true });
  useEffect(() => {
    let live = true;
    (async () => {
      const [r, p] = await Promise.all([
        supabase.from('linen_requests').select('*, linen_request_items(*), linen_request_properties(*)').eq('id', id).maybeSingle(),
        supabase.from('linen_purchase_orders').select('*, linen_po_items(*)').eq('request_id', id).order('created_at')
      ]);
      if (live) setState({ r: r.data, orders: p.data || [], loading: false });
    })();
    return () => { live = false; };
  }, [id, requests, pos]);
  return state;
}

function Chips({ items }) {
  const { catalog } = useApp();
  return <div className="chips">{catalog.list.filter(i => items[i.key]).map(i => <span className="chip" key={i.key}>{i.label} {items[i.key]}</span>)}</div>;
}

function RequestDetail({ id }) {
  const { catalog, nm, zoneName, isAdmin, session, setDrawer, call, toast } = useApp();
  const { r, orders, loading } = useRequest(id);
  const [busy, setBusy] = useState(false);
  if (loading) return <Shell title="Loading…" />;
  if (!r) return <Shell title="Request not found" sub="It may be outside your markets or no longer exist." />;
  const d = derive(r, new Map([[r.id, orders]]));
  const mine = r.requested_by === session.user.id;
  const c = cost(d.requested, catalog.byKey);
  const byProp = {}; for (const i of r.linen_request_items) if (i.property_id) { byProp[i.property_id] = byProp[i.property_id] || {}; byProp[i.property_id][i.item_key] = i.qty; }
  const loose = {}; for (const i of r.linen_request_items) if (!i.property_id) loose[i.item_key] = i.qty;

  const act = async (fn, args, msg) => {
    if (busy) return; setBusy(true);
    try { await call(fn, args); toast(msg); } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };

  const ev = [{ at: r.created_at, t: `Submitted by ${nm(r.requested_by)}` }];
  for (const rp of r.linen_request_properties) if (new Date(rp.added_at) - new Date(r.created_at) > 60000) ev.push({ at: rp.added_at, t: `${rp.property_code} added by ${nm(rp.added_by)}` });
  if (r.decided_at) ev.push({ at: r.decided_at, t: `${r.status === 'denied' ? 'Denied' : r.status === 'closed' ? 'Closed' : 'Approved'} by ${nm(r.decided_by)}` });
  for (const o of orders) { ev.push({ at: o.created_at, t: `Order logged by ${nm(o.ordered_by)}${o.vendor ? ' with ' + o.vendor : ''}` }); if (o.received_at) ev.push({ at: o.received_at, t: `Marked received by ${nm(o.received_by)}` }); }
  if (r.status === 'cancelled') ev.push({ at: r.updated_at, t: 'Cancelled' });
  ev.sort((a, b) => new Date(a.at) - new Date(b.at));

  const foot = [];
  if (isAdmin) {
    if (r.status === 'pending') foot.push(
      <button key="d" className="btn warn" type="button" onClick={() => setDrawer({ mode: 'deny', id })}>Deny</button>,
      <button key="a" className="btn sec" type="button" onClick={() => setDrawer({ mode: 'approve', id })}>Approve</button>,
      <button key="o" className="btn" type="button" onClick={() => setDrawer({ mode: 'order', requestId: id })}>Approve and log order</button>);
    else if (r.status === 'approved') foot.push(
      d.outTotal > 0 ? <button key="c" className="btn ghost" type="button" disabled={busy} onClick={() => { if (window.confirm('Close this request? Anything not yet ordered will be dropped from the ledger.')) act('linen_decide_request', { p_request_id: id, p_decision: 'closed' }, 'Request closed.'); }}>Close request</button> : null,
      <button key="e" className="btn sec" type="button" onClick={() => setDrawer({ mode: 'approve', id })}>Change expected date</button>,
      d.outTotal > 0 ? <button key="o" className="btn" type="button" onClick={() => setDrawer({ mode: 'order', requestId: id })}>Log order</button> : null);
    else if (r.status === 'denied' || r.status === 'closed') foot.push(<button key="r" className="btn sec" type="button" onClick={() => setDrawer({ mode: 'approve', id })}>Reopen</button>);
  }
  const canCancel = (isAdmin && ['pending', 'approved'].includes(r.status) && !orders.length) || (mine && r.status === 'pending');
  if (canCancel) foot.unshift(<button key="x" className="btn warn" type="button" disabled={busy} onClick={() => { if (window.confirm('Cancel this request?')) act('linen_cancel_request', { p_request_id: id }, 'Request cancelled.'); }}>Cancel request</button>);
  if (r.type !== 'onboard' && r.status === 'pending' && (mine || isAdmin)) foot.push(<button key="ed" className="btn sec" type="button" onClick={() => setDrawer({ mode: 'form', id })}>Edit</button>);

  return (
    <Shell title={r.title} sub={`#${r.ref_no} | ${zoneName(r.zone_id) || 'Market'} | ${sum(d.requested)} pieces`}
      foot={foot.filter(Boolean).length ? [<div key="m" className="meta" />, ...foot] : null}>
      <div style={{ marginBottom: 16 }}><span className={'pill st-' + d.status}>{STATUS[d.status]}</span></div>
      {r.expected_order_date && !['denied', 'cancelled'].includes(r.status) ? <div className="panel"><h3>Expected order date: {fmtDate(r.expected_order_date)}</h3><p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Set by {nm(r.decided_by)} at approval.</p></div> : null}
      <dl className="kv">
        <dt>Type</dt><dd>{TYPES[r.type]}</dd>
        <dt>Requested by</dt><dd>{nm(r.requested_by)}</dd>
        <dt>Submitted</dt><dd>{fmtDate(r.created_at)}</dd>
        {r.needed_by ? <><dt>Needed by</dt><dd>{fmtDate(r.needed_by)}</dd></> : null}
        {r.pulled_date ? <><dt>Pulled</dt><dd>{fmtDate(r.pulled_date)}</dd></> : null}
      </dl>
      {r.notes ? <><div className="sec-h">Notes from requester</div><div className="note-box">{r.notes}</div></> : null}
      {r.admin_note ? <><div className="sec-h">Admin note</div><div className="note-box">{r.admin_note}</div></> : null}
      {r.linen_request_properties.length ? <>
        <div className="sec-h">Properties</div>
        {r.linen_request_properties.map(rp => (
          <div className="prop-block" key={rp.property_id}><h4>{rp.property_code} - {rp.property_name}<span>{rp.multiplier}x par | {sum(byProp[rp.property_id])} pcs</span></h4><Chips items={byProp[rp.property_id] || {}} /></div>))}
        {Object.keys(loose).length ? <div className="prop-block"><h4>Other items<span>{sum(loose)} pcs</span></h4><Chips items={loose} /></div> : null}
      </> : null}
      <div className="sec-h">Quantities</div>
      <table className="qty">
        <thead><tr><th>Item</th><th>Requested</th><th>Ordered</th><th>Still needed</th><th>Est.</th></tr></thead>
        <tbody>
          {catalog.list.filter(i => d.requested[i.key]).map(i => (
            <tr key={i.key}><td>{i.label}</td><td>{d.requested[i.key]}</td><td>{d.ordered[i.key] || '—'}</td>
              <td className={d.outstanding[i.key] ? 'out' : ''}>{d.outstanding[i.key] || '—'}</td>
              <td>{i.unit_price == null ? '—' : money(d.requested[i.key] * i.unit_price)}</td></tr>))}
          <tr><td><strong>Total</strong></td><td><strong>{sum(d.requested)}</strong></td><td>{sum(d.ordered) || '—'}</td><td className="out">{d.outTotal || '—'}</td><td><strong>{money(c.t)}{c.missing ? '+' : ''}</strong></td></tr>
        </tbody>
      </table>
      {orders.length ? <><div className="sec-h">Orders</div><div className="orders">{orders.map(o => <OrderCard key={o.id} o={o} />)}</div></> : null}
      <div className="sec-h">Activity</div>
      <ul className="timeline">{ev.map((e, i) => <li key={i}>{e.t}<small>{fmtDate(e.at)} {fmtTime(e.at)}</small></li>)}</ul>
    </Shell>
  );
}

function OrderCard({ o }) {
  const { nm, call, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const items = Object.fromEntries((o.linen_po_items || []).map(i => [i.item_key, i.qty]));
  const line = [o.vendor && `Vendor: ${o.vendor}`, o.order_no && `Order #${o.order_no}`, o.eta && `ETA ${fmtDate(o.eta)}`, o.tracking && `Tracking: ${o.tracking}`].filter(Boolean).join(' | ');
  const receive = async () => { setBusy(true); try { await call('linen_mark_received', { p_po_id: o.id }); toast('Marked received.'); } catch (e) { toast(errMsg(e)); setBusy(false); } };
  return (
    <div className="order">
      <div className="order-top"><b>{fmtDate(o.order_date)} | {sum(items)} pieces | {nm(o.ordered_by)}</b>
        {o.received_at ? <span className="pill st-received">Received {fmtDate(o.received_at)}</span> : <button className="btn sec sm" type="button" disabled={busy} onClick={receive}>Mark received</button>}</div>
      {line ? <p>{line}</p> : null}{o.note ? <p>{o.note}</p> : null}
      <Chips items={items} />
    </div>
  );
}

function PoDetail({ id }) {
  const { pos, zoneName } = useApp();
  const [o, setO] = useState(null);
  useEffect(() => { supabase.from('linen_purchase_orders').select('*, linen_po_items(*)').eq('id', id).maybeSingle().then(({ data }) => setO(data)); }, [id, pos]);
  if (!o) return <Shell title="Loading…" />;
  return <Shell title="Bulk order" sub={`${zoneName(o.zone_id)} | ${sum(Object.fromEntries(o.linen_po_items.map(i => [i.item_key, i.qty])))} pieces`}><div className="orders"><OrderCard o={o} /></div></Shell>;
}

function ApproveForm({ id }) {
  const { setDrawer, call, toast } = useApp();
  const { r, loading } = useRequest(id);
  const [date, setDate] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading || !r) return <Shell title="Loading…" />;
  const already = r.status === 'approved';
  const val = date ?? (r.expected_order_date || '');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await call('linen_decide_request', { p_request_id: id, p_decision: 'approved', p_note: note || null, p_expected_order_date: val || null });
      toast(already ? 'Expected order date saved. The requester has been notified.' : 'Request approved. The requester has been notified.');
      setDrawer({ mode: 'view', id });
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Shell title={already ? 'Change expected order date' : r.status === 'pending' ? 'Approve request' : 'Reopen request'} sub={r.title}
      foot={[<div key="m" className="meta" />, <button key="b" className="btn ghost" type="button" onClick={() => setDrawer({ mode: 'view', id })}>Back</button>,
        <button key="s" className="btn" type="button" disabled={busy} onClick={save}>{already ? 'Save date' : 'Approve'}</button>]}>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="field"><label htmlFor="eod">Expected order date</label>
        <input id="eod" type="date" min={today()} value={val} onChange={e => setDate(e.target.value)} />
        <span className="muted" style={{ fontSize: 13 }}>Shown to the regional director so they know when the order will be placed. Optional.</span></div>
      <div className="field"><label htmlFor="an">Note to the requester (optional)</label><textarea id="an" rows="3" value={note} onChange={e => setNote(e.target.value)} /></div>
    </Shell>
  );
}

function DenyForm({ id }) {
  const { setDrawer, call, toast } = useApp();
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!note.trim()) return setErr('Add a reason so the requester knows what to change.');
    setBusy(true);
    try { await call('linen_decide_request', { p_request_id: id, p_decision: 'denied', p_note: note }); toast('Request denied.'); setDrawer({ mode: 'view', id }); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Shell title="Deny request" foot={[<div key="m" className="meta" />, <button key="b" className="btn ghost" type="button" onClick={() => setDrawer({ mode: 'view', id })}>Back</button>, <button key="s" className="btn warn" type="button" disabled={busy} onClick={save}>Deny request</button>]}>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="field"><label htmlFor="dn">Reason (sent to the requester)</label><textarea id="dn" rows="4" value={note} onChange={e => setNote(e.target.value)} /></div>
    </Shell>
  );
}

function RequestForm({ id }) {
  const { zones, zoneId, setDrawer, call, toast, catalog } = useApp();
  const existing = useRequest(id || '00000000-0000-0000-0000-000000000000');
  const [v, setV] = useState(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id && existing.loading) return;
    const r = id ? existing.r : null;
    setV(r ? { zone_id: r.zone_id, type: r.type, title: r.title, needed_by: r.needed_by || '', pulled_date: r.pulled_date || '', notes: r.notes || '',
      items: Object.fromEntries(r.linen_request_items.map(i => [i.item_key, i.qty])) }
      : { zone_id: zoneId || (zones.length === 1 ? zones[0].id : ''), type: 'restock', title: '', needed_by: '', pulled_date: today(), notes: '', items: {} });
  }, [id, existing.loading]);
  if (!v) return <Shell title="Loading…" />;
  const up = patch => setV(x => ({ ...x, ...patch }));
  const c = cost(v.items, catalog.byKey);
  const save = async () => {
    setErr('');
    if (!v.zone_id) return setErr('Choose a market.');
    if (v.type === 'other' && !v.title.trim()) return setErr('Say what this request is for.');
    const items = clean(v.items); if (!sum(items)) return setErr('Enter a quantity for at least one item.');
    const title = v.type === 'unusable' ? `Unusable linens${v.pulled_date ? ' ' + fmtDate(v.pulled_date) : ''}` : v.type === 'restock' ? `Needed as of ${fmtDate(today())}` : v.title.trim();
    setBusy(true);
    try {
      const rid = await call('linen_save_request', {
        p_mode: id ? 'replace' : 'create', p_request_id: id || null, p_zone_id: v.zone_id, p_type: v.type, p_title: id && v.type === 'restock' ? existing.r.title : title,
        p_needed_by: v.needed_by || null, p_pulled_date: v.type === 'unusable' ? (v.pulled_date || null) : null, p_notes: v.notes,
        p_properties: [], p_items: Object.entries(items).map(([item_key, qty]) => ({ item_key, qty }))
      });
      toast(id ? 'Changes saved.' : 'Request submitted. The admin team has been notified.');
      setDrawer({ mode: 'view', id: rid });
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Shell title={id ? 'Edit request' : 'New linen request'} sub={id ? existing.r?.title : 'For restocks and replacements. Order new properties from the New onboard tab.'}
      foot={[<div key="m" className="meta"><strong>{sum(v.items).toLocaleString()} pieces</strong> | est. {money(c.t)}{c.missing ? '+' : ''}</div>,
        <button key="c" className="btn ghost" type="button" onClick={() => setDrawer(id ? { mode: 'view', id } : null)}>Cancel</button>,
        <button key="s" className="btn" type="button" disabled={busy} onClick={save}>{id ? 'Save changes' : 'Submit request'}</button>]}>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="field"><label htmlFor="fz">Market</label>
        <select id="fz" value={v.zone_id} disabled={!!id} onChange={e => up({ zone_id: e.target.value })}><option value="">Choose a market</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div>
      <span className="flabel">Request type</span>
      <div className="types" role="group" aria-label="Request type">
        {['restock', 'unusable', 'other'].map(k => <button key={k} type="button" aria-pressed={v.type === k} onClick={() => up({ type: k })}>{TYPES[k]}</button>)}
      </div>
      {v.type === 'unusable' ? <div className="field"><label htmlFor="fp">Date linens were pulled</label><input id="fp" type="date" value={v.pulled_date} onChange={e => up({ pulled_date: e.target.value })} /></div> : null}
      {v.type === 'other' ? <div className="field"><label htmlFor="ft">What is this request for?</label><input id="ft" value={v.title} placeholder="e.g. Pool towel refresh for summer" onChange={e => up({ title: e.target.value })} /></div> : null}
      <div className="field"><label htmlFor="fn">Needed by</label><input id="fn" type="date" value={v.needed_by} onChange={e => up({ needed_by: e.target.value })} /></div>
      <div className="sec-h">Quantities</div>
      <ItemGrid values={v.items} onChange={items => up({ items })} />
      <div className="field"><label htmlFor="fo">Notes for the admin team</label><textarea id="fo" rows="3" value={v.notes} onChange={e => up({ notes: e.target.value })} /></div>
    </Shell>
  );
}

function OrderForm({ requestId }) {
  const { zones, zoneId, setDrawer, call, toast, catalog, pos } = useApp();
  const { r, orders, loading } = useRequest(requestId || '00000000-0000-0000-0000-000000000000');
  const [o, setO] = useState(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (requestId && loading) return;
    const d = r ? derive(r, new Map([[r.id, orders]])) : null;
    setO({ zone_id: r?.zone_id || zoneId || '', order_date: today(), vendor: '', order_no: '', eta: '', tracking: '', note: '', items: d ? { ...d.outstanding } : {}, d });
  }, [requestId, loading]);
  if (!o) return <Shell title="Loading…" />;
  const up = p => setO(x => ({ ...x, ...p }));
  const vendors = [...new Set(pos.map(p => p.vendor).filter(Boolean))];
  const c = cost(o.items, catalog.byKey);
  const hints = o.d ? Object.fromEntries(Object.keys(o.d.requested).map(k => [k, `need ${o.d.outstanding[k] || 0} of ${o.d.requested[k]}`])) : null;
  const save = async () => {
    setErr('');
    const items = clean(o.items); if (!sum(items)) return setErr('Enter at least one quantity ordered.');
    if (!requestId && !o.zone_id) return setErr('Choose a market.');
    setBusy(true);
    try {
      await call('linen_log_po', { p_items: Object.entries(items).map(([item_key, qty]) => ({ item_key, qty })), p_request_id: requestId || null, p_zone_id: requestId ? null : o.zone_id,
        p_order_date: o.order_date || null, p_vendor: o.vendor, p_order_no: o.order_no, p_eta: o.eta || null, p_tracking: o.tracking, p_note: o.note });
      toast(requestId ? 'Order logged. The requester has been notified.' : 'Bulk order logged.');
      setDrawer(requestId ? { mode: 'view', id: requestId } : null);
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Shell title={requestId ? 'Log order' : 'Log bulk order'} sub={requestId ? r?.title : 'For orders placed against a market’s overall need, not one request.'}
      foot={[<div key="m" className="meta"><strong>{sum(o.items).toLocaleString()} pieces</strong> | est. {money(c.t)}{c.missing ? '+' : ''}</div>,
        <button key="c" className="btn ghost" type="button" onClick={() => setDrawer(requestId ? { mode: 'view', id: requestId } : null)}>Cancel</button>,
        <button key="s" className="btn" type="button" disabled={busy} onClick={save}>Save order</button>]}>
      {err ? <p className="err" role="alert">{err}</p> : null}
      {!requestId ? <div className="field"><label htmlFor="oz">Market</label><select id="oz" value={o.zone_id} onChange={e => up({ zone_id: e.target.value })}><option value="">Choose a market</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div> : null}
      <div className="grid2">
        <div className="field"><label htmlFor="od">Order date</label><input id="od" type="date" value={o.order_date} onChange={e => up({ order_date: e.target.value })} /></div>
        <div className="field"><label htmlFor="ov">Vendor</label><input id="ov" list="vendors" value={o.vendor} onChange={e => up({ vendor: e.target.value })} /><datalist id="vendors">{vendors.map(x => <option key={x} value={x} />)}</datalist></div>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="on">Order #</label><input id="on" value={o.order_no} onChange={e => up({ order_no: e.target.value })} /></div>
        <div className="field"><label htmlFor="oe">Expected delivery</label><input id="oe" type="date" value={o.eta} onChange={e => up({ eta: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="ot">Tracking number or link</label><input id="ot" value={o.tracking} onChange={e => up({ tracking: e.target.value })} /></div>
      {!requestId ? <div className="field"><label htmlFor="ono">Note</label><textarea id="ono" rows="2" value={o.note} onChange={e => up({ note: e.target.value })} /></div> : null}
      <div className="sec-h">{requestId ? 'Quantities ordered (prefilled with what’s still needed)' : 'Quantities ordered'}</div>
      <ItemGrid values={o.items} hints={hints} onChange={items => up({ items })} />
    </Shell>
  );
}

function ObSummary({ data }) {
  const { catalog } = useApp();
  return data.properties.map(p => (
    <div className="prop-block" key={p.property_id}><h4>{p.code} - {p.name}<span>{p.multiplier}x par | {sum(p.items)} pcs</span></h4><Chips items={p.items} /></div>));
}
const obPayload = data => ({
  p_properties: data.properties.map(p => ({ property_id: p.property_id, multiplier: p.multiplier })),
  p_items: data.properties.flatMap(p => Object.entries(p.items).map(([item_key, qty]) => ({ property_id: p.property_id, item_key, qty })))
});

function ObCreate({ data, done }) {
  const { setDrawer, call, toast, zoneName, catalog } = useApp();
  const [neededBy, setNeededBy] = useState(''); const [notes, setNotes] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const all = data.properties.reduce((a, p) => addInto(a, p.items), {});
  const c = cost(all, catalog.byKey);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const rid = await call('linen_save_request', { p_mode: 'create', p_zone_id: data.zone_id, p_type: 'onboard', p_needed_by: neededBy || null, p_notes: notes, ...obPayload(data) });
      toast('Onboard order submitted. The admin team has been notified.'); done?.(); setDrawer({ mode: 'view', id: rid });
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Shell title="Create new onboard order" sub={`${zoneName(data.zone_id)} | ${data.properties.length} ${data.properties.length === 1 ? 'property' : 'properties'}`}
      foot={[<div key="m" className="meta"><strong>{sum(all).toLocaleString()} pieces</strong> | est. {money(c.t)}{c.missing ? '+' : ''}</div>,
        <button key="c" className="btn ghost" type="button" onClick={() => setDrawer(null)}>Cancel</button>,
        <button key="s" className="btn" type="button" disabled={busy} onClick={save}>Submit order</button>]}>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <ObSummary data={data} />
      <div className="field" style={{ marginTop: 14 }}><label htmlFor="obn">Needed by</label><input id="obn" type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} /></div>
      <div className="field"><label htmlFor="obo">Notes for the admin team</label><textarea id="obo" rows="3" value={notes} onChange={e => setNotes(e.target.value)} /></div>
    </Shell>
  );
}

function ObAppend({ data, done }) {
  const { setDrawer, call, toast, zoneName, derived, isAdmin, session, nm } = useApp();
  const [pick, setPick] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const options = derived.filter(({ r }) => r.zone_id === data.zone_id && ['pending', 'approved'].includes(r.status) && (isAdmin || r.requested_by === session.user.id));
  const save = async () => {
    if (!pick) return setErr('Choose an order to add to.');
    setBusy(true); setErr('');
    try { await call('linen_save_request', { p_mode: 'append', p_request_id: pick, ...obPayload(data) }); toast('Added to the order.'); done?.(); setDrawer({ mode: 'view', id: pick }); }
    catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Shell title="Add to existing order" sub={`${zoneName(data.zone_id)} | ${data.properties.length} ${data.properties.length === 1 ? 'property' : 'properties'}`}
      foot={[<div key="m" className="meta" />, <button key="c" className="btn ghost" type="button" onClick={() => setDrawer(null)}>Cancel</button>,
        <button key="s" className="btn" type="button" disabled={busy || !options.length} onClick={save}>Add to order</button>]}>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="sec-h">Choose an open order in {zoneName(data.zone_id)}</div>
      {!options.length ? <p className="muted">No open orders here {isAdmin ? '' : 'that you submitted '}yet. Create a new order instead.</p> :
        <div className="orders" role="radiogroup">
          {options.map(({ r, d }) => (
            <label key={r.id} className="order" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', borderColor: pick === r.id ? 'var(--blue)' : undefined }}>
              <input type="radio" name="pick" checked={pick === r.id} onChange={() => setPick(r.id)} style={{ marginTop: 4 }} />
              <div><b>#{r.ref_no} {r.title}</b><p>{STATUS[d.status]} | {sum(d.requested)} pieces | {nm(r.requested_by)}{r.expected_order_date ? ` | order ${fmtDate(r.expected_order_date)}` : ''}</p></div>
            </label>))}
        </div>}
      <div className="sec-h">Adding</div>
      <ObSummary data={data} />
      <p className="muted" style={{ fontSize: 13 }}>If a property is already on that order, its quantities are replaced with these.</p>
    </Shell>
  );
}
