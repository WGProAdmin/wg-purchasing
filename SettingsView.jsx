import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { BASES, errMsg } from '../lib/util.js';

export default function SettingsView() {
  return (
    <>
      <div className="head"><div><h1>Settings</h1><p>Who can use the tool, which markets they see, and how par orders are calculated.</p></div></div>
      <div className="settings"><Team /><Par /><Queue /></div>
    </>
  );
}

function Team() {
  const { zones, loadNames, toast } = useApp();
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({ email: '', role: 'regional_director', zone_ids: [] });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setPeople(await loadNames()), [loadNames]);
  useEffect(() => { load(); }, [load]);
  const edit = p => setForm({ email: p.email, role: p.purchasing_role || 'regional_director', zone_ids: p.zone_ids || [] });
  const save = async remove => {
    setErr(''); if (!form.email.trim()) return setErr('Enter an email.');
    setBusy(true);
    const { error } = await supabase.rpc('purchasing_set_member', { p_email: form.email, p_role: remove ? null : form.role, p_zone_ids: [] });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    toast(remove ? 'Access removed.' : 'Access saved.'); setForm({ email: '', role: 'regional_director', zone_ids: [] }); load();
  };
  const members = people.filter(p => p.purchasing_role).sort((a, b) => (a.purchasing_role + a.name).localeCompare(b.purchasing_role + b.name));
  return (
    <section className="card">
      <h2>Team access</h2>
      <p>Access here is separate from the property database roles. Admins approve requests and log orders; regional directors can view and request for every market.</p>
      <table className="simple">
        <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
        <tbody>{members.map(p => (
          <tr key={p.user_id}><td>{p.name}<div className="muted" style={{ fontSize: 12.5 }}>{p.email}</div></td>
            <td>{p.purchasing_role === 'admin' ? 'Admin' : 'Regional director'}</td>
            <td><button className="btn ghost sm" type="button" onClick={() => edit(p)}>Change</button></td></tr>))}</tbody>
      </table>
      <div className="sec-h">Add or update someone</div>
      {err ? <p className="err" role="alert">{err}</p> : null}
      <div className="grid2">
        <div className="field"><label htmlFor="tm">Work email</label><input id="tm" type="email" list="hubpeople" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /><datalist id="hubpeople">{people.filter(p => !p.purchasing_role && p.email).map(p => <option key={p.user_id} value={p.email}>{p.name}</option>)}</datalist></div>
        <div className="field"><label htmlFor="tr">Role</label><select id="tr" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}><option value="regional_director">Regional director</option><option value="admin">Admin</option></select></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="button" disabled={busy} onClick={() => save(false)}>Save access</button>
        {members.some(p => p.email?.toLowerCase() === form.email.trim().toLowerCase()) ? <button className="btn warn" type="button" disabled={busy} onClick={() => save(true)}>Remove access</button> : null}
      </div>
    </section>
  );
}

function Par() {
  const { catalog, loadCatalog, toast } = useApp();
  const [rules, setRules] = useState([]);
  const [draft, setDraft] = useState({});
  const load = useCallback(async () => { const { data } = await supabase.from('linen_par_rules').select('*'); setRules(data || []); }, []);
  useEffect(() => { load(); }, [load]);
  const saveItem = async (key, patch) => {
    const { error } = await supabase.from('linen_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('key', key);
    if (error) return toast(errMsg(error)); loadCatalog();
  };
  const saveRule = async (rule, factor) => {
    const n = Number(factor); if (!(n > 0)) return;
    const { error } = await supabase.from('linen_par_rules').update({ factor: n }).eq('id', rule.id);
    if (error) toast(errMsg(error)); else load();
  };
  const delRule = async rule => { const { error } = await supabase.from('linen_par_rules').delete().eq('id', rule.id); if (error) toast(errMsg(error)); else load(); };
  const addRule = async key => {
    const d = draft[key] || {}; const n = Number(d.factor);
    if (!d.basis || !(n > 0)) return toast('Pick what it’s based on and a number above zero.');
    const { error } = await supabase.from('linen_par_rules').insert({ item_key: key, basis: d.basis, factor: n });
    if (error) return toast(errMsg(error)); setDraft(x => ({ ...x, [key]: {} })); load();
  };
  return (
    <section className="card">
      <h2>Items and par</h2>
      <p>One par order = the sum of each rule, rounded up to the “round to” amount. The New onboard tab recalculates from these as soon as you save.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="simple">
          <thead><tr><th>Item</th><th>Unit price</th><th>Round to</th><th>Active</th><th style={{ minWidth: 330 }}>Par rules</th></tr></thead>
          <tbody>{catalog.list.map(i => (
            <tr key={i.key}>
              <td>{i.label}</td>
              <td><input className="n" type="number" step="0.01" min="0" defaultValue={i.unit_price ?? ''} aria-label={`${i.label} price`}
                onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (i.unit_price == null ? null : Number(i.unit_price))) saveItem(i.key, { unit_price: v }); }} /></td>
              <td><input className="n" type="number" step="1" min="1" defaultValue={i.par_round_to} aria-label={`${i.label} round to`}
                onBlur={e => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); if (v !== i.par_round_to) saveItem(i.key, { par_round_to: v }); }} /></td>
              <td><input type="checkbox" checked={i.active} aria-label={`${i.label} active`} onChange={e => saveItem(i.key, { active: e.target.checked })} style={{ width: 'auto' }} /></td>
              <td>
                {rules.filter(r => r.item_key === i.key).map(r => (
                  <div className="rule" key={r.id}><span style={{ flex: 1 }}>{BASES[r.basis]}</span>
                    <span className="muted">×</span><input type="number" step="0.25" min="0" defaultValue={Number(r.factor)} aria-label="Factor" onBlur={e => { if (Number(e.target.value) !== Number(r.factor)) saveRule(r, e.target.value); }} />
                    <button className="iconbtn" type="button" aria-label="Remove rule" onClick={() => delRule(r)}><Trash2 size={14} /></button></div>))}
                <div className="rule">
                  <select aria-label="Based on" value={draft[i.key]?.basis || ''} onChange={e => setDraft(x => ({ ...x, [i.key]: { ...x[i.key], basis: e.target.value } }))}>
                    <option value="">Add a rule…</option>{Object.entries(BASES).filter(([b]) => !rules.some(r => r.item_key === i.key && r.basis === b)).map(([b, l]) => <option key={b} value={b}>{l}</option>)}</select>
                  <span className="muted">×</span><input type="number" step="0.25" min="0" aria-label="Factor" value={draft[i.key]?.factor || ''} onChange={e => setDraft(x => ({ ...x, [i.key]: { ...x[i.key], factor: e.target.value } }))} />
                  <button className="btn sec sm" type="button" onClick={() => addRule(i.key)}>Add</button>
                </div>
              </td>
            </tr>))}</tbody>
        </table>
      </div>
    </section>
  );
}

function Queue() {
  const { me, loadMe, toast } = useApp();
  const [val, setVal] = useState(me.settings?.onboard_since || '');
  const save = async () => {
    const { error } = await supabase.from('purchasing_settings').update({ onboard_since: val, updated_at: new Date().toISOString(), updated_by: me.user_id }).eq('id', true);
    if (error) return toast(errMsg(error)); toast('Saved.'); loadMe();
  };
  return (
    <section className="card">
      <h2>New onboard queue</h2>
      <p>Properties added to the property database on or after this date show in New onboard until they’re ordered or marked not needed.</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ marginBottom: 0 }}><label htmlFor="qs">Show properties added since</label><input id="qs" type="date" value={val} onChange={e => setVal(e.target.value)} /></div>
        <button className="btn" type="button" onClick={save}>Save</button>
      </div>
    </section>
  );
}
