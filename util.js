export const MULTIPLIERS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const TYPES = { onboard: 'New onboard', unusable: 'Unusable linens', restock: 'Restock', other: 'Other' };
export const STATUS = {
  pending: 'Awaiting approval', approved: 'Approved', partial: 'Partially ordered', ordered: 'Ordered',
  received: 'Received', closed: 'Closed', denied: 'Denied', cancelled: 'Cancelled'
};
export const FILTERS = [
  { k: 'open', label: 'Open', match: s => ['pending', 'approved', 'partial', 'ordered'].includes(s) },
  { k: 'pending', label: 'Awaiting approval', match: s => s === 'pending' },
  { k: 'approved', label: 'Approved', match: s => s === 'approved' },
  { k: 'onorder', label: 'On order', match: s => s === 'partial' || s === 'ordered' },
  { k: 'done', label: 'Completed', match: s => s === 'received' || s === 'closed' },
  { k: 'all', label: 'All', match: () => true }
];
export const GROUPS = [
  { name: 'Towels', items: [['bath', 'Bath'], ['hand', 'Hand'], ['wash', 'Wash'], ['mat', 'Bath mat'], ['pool', 'Pool'], ['kitchen', 'Kitchen']] },
  { name: 'King', items: [['k_flat', 'Flat'], ['k_fitted', 'Fitted'], ['k_top', 'Top'], ['k_pillowcase', 'Pillowcase'], ['k_insert', 'Insert'], ['k_coverlet', 'Coverlet'], ['k_duvet', 'Duvet cover']] },
  { name: 'Queen', items: [['q_flat', 'Flat'], ['q_fitted', 'Fitted'], ['q_top', 'Top'], ['q_pillowcase', 'Pillowcase'], ['q_insert', 'Insert'], ['q_coverlet', 'Coverlet'], ['q_duvet', 'Duvet cover']] },
  { name: 'Twin', items: [['t_flat', 'Flat'], ['t_fitted', 'Fitted'], ['t_top', 'Top'], ['t_insert', 'Insert'], ['t_coverlet', 'Coverlet'], ['t_duvet', 'Duvet cover']] }
];
export const BASES = {
  towel_target: 'Towel target', bathrooms: 'Bathrooms (incl. half)', full_bathrooms: 'Full bathrooms', pool_towel_target: 'Towel target if pool',
  property: 'Per property', king_beds: 'King beds', queen_beds: 'Queen/full beds', twin_beds: 'Twin beds',
  king_extra: 'Extra kings', queen_extra: 'Extra queens/fulls', twin_extra: 'Extra twins'
};

export const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export function fmtDate(v) {
  if (!v) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v);
  if (isNaN(d)) return '';
  const s = (d.getMonth() + 1) + '/' + d.getDate();
  return d.getFullYear() === new Date().getFullYear() ? s : s + '/' + String(d.getFullYear()).slice(2);
}
export function fmtTime(v) { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
export function ago(v) {
  const ms = new Date(v).getTime(); const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'Just now'; if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); if (h < 24) return h + ' hr ago';
  return fmtDate(v);
}
export const money = n => '$' + Math.round(n).toLocaleString('en-US');
export const sum = obj => Object.values(obj || {}).reduce((a, n) => a + (Number(n) || 0), 0);
export function cost(items, catalog) {
  let t = 0, missing = false;
  for (const [k, q] of Object.entries(items || {})) {
    if (!q) continue; const p = catalog[k]?.unit_price;
    if (p == null) missing = true; else t += q * Number(p);
  }
  return { t: Math.round(t), missing };
}
export const scale = (par, m) => Object.fromEntries(Object.entries(par || {}).map(([k, v]) => [k, Math.ceil(v * m)]).filter(([, v]) => v > 0));
export function clean(obj) { const o = {}; for (const [k, v] of Object.entries(obj || {})) { const n = Math.max(0, Math.round(Number(v) || 0)); if (n) o[k] = n; } return o; }
export function addInto(a, b) { for (const [k, v] of Object.entries(b || {})) a[k] = (a[k] || 0) + v; return a; }

/* Derive a request's live status from its items and purchase orders */
export function derive(r, posByReq) {
  const orders = posByReq.get(r.id) || [];
  const requested = {}; for (const i of r.linen_request_items || []) requested[i.item_key] = (requested[i.item_key] || 0) + i.qty;
  const ordered = {}; for (const o of orders) for (const i of o.linen_po_items || []) ordered[i.item_key] = (ordered[i.item_key] || 0) + i.qty;
  const outstanding = {}; let outTotal = 0;
  for (const [k, q] of Object.entries(requested)) { const v = Math.max(0, q - (ordered[k] || 0)); if (v) { outstanding[k] = v; outTotal += v; } }
  const allRecv = orders.length > 0 && orders.every(o => o.received_at);
  let status = r.status;
  if (r.status === 'approved' && orders.length) status = outTotal > 0 ? 'partial' : (allRecv ? 'received' : 'ordered');
  if (r.status === 'pending' && orders.length) status = 'partial';
  return { orders, requested, ordered, outstanding, outTotal, status };
}

const ERRORS = {
  not_authorized: 'Your account doesn’t have permission for that.',
  zone_not_allowed: 'You aren’t assigned to that market. Ask an admin to add it.',
  request_locked: 'This request can’t be changed in its current status.',
  not_your_request: 'Only the person who submitted this request (or an admin) can change it.',
  property_wrong_market: 'All properties on one order must be in the same market.',
  property_not_found: 'One of those properties no longer exists in the property database.',
  no_items: 'Enter at least one quantity.',
  note_required: 'Add a reason so the requester knows what to change.',
  invalid_transition: 'That status change isn’t allowed.',
  no_account: 'No login exists for that email yet. Invite them in Supabase Auth first, then add them here.',
  zone_required: 'Choose a market.',
  last_admin: 'There has to be at least one admin. Make someone else an admin first.'
};
export function errMsg(e) {
  const m = e?.message || '';
  for (const [k, v] of Object.entries(ERRORS)) if (m.includes(k)) return v;
  return m || 'That didn’t save. Check your connection and try again.';
}
