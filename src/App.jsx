import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from './lib/supabase.js';
import { derive } from './lib/util.js';
import SignIn from './components/SignIn.jsx';
import Notifications from './components/Notifications.jsx';
import RequestsView from './components/RequestsView.jsx';
import OnboardView from './components/OnboardView.jsx';
import LedgerView from './components/LedgerView.jsx';
import SettingsView from './components/SettingsView.jsx';
import Drawer from './components/Drawer.jsx';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const PREFS = 'wg-linen-prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } };

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="auth"><p className="muted">Loading…</p></div>;
  if (!session) return <SignIn />;
  return <Main key={session.user.id} session={session} />;
}

function Main({ session }) {
  const prefs = loadPrefs();
  const [me, setMe] = useState(null);
  const [meErr, setMeErr] = useState('');
  const [catalog, setCatalog] = useState({ list: [], byKey: {} });
  const [names, setNames] = useState({});
  const [zoneId, setZoneId] = useState(prefs.zoneId || '');
  const [tab, setTab] = useState(prefs.tab || 'requests');
  const [requests, setRequests] = useState([]);
  const [pos, setPos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [queueCount, setQueueCount] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [notifs, setNotifs] = useState([]);

  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ zoneId, tab })); } catch {} }, [zoneId, tab]);

  const toast = useCallback((msg, action) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, action }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000);
  }, []);

  const loadMe = useCallback(async () => {
    const { data, error } = await supabase.rpc('purchasing_me');
    if (error) { setMeErr(error.message); return; }
    setMe(data);
  }, []);
  const loadCatalog = useCallback(async () => {
    const { data } = await supabase.from('linen_items').select('*').order('sort');
    const list = (data || []);
    setCatalog({ list, active: list.filter(i => i.active), byKey: Object.fromEntries(list.map(i => [i.key, i])) });
  }, []);
  const loadNames = useCallback(async () => {
    const { data } = await supabase.rpc('purchasing_directory');
    setNames(Object.fromEntries((data || []).map(p => [p.user_id, p.name])));
    return data || [];
  }, []);

  const loadData = useCallback(async () => {
    let rq = supabase.from('linen_requests').select('*, linen_request_items(*), linen_request_properties(*)').order('created_at', { ascending: false }).limit(1000);
    let pq = supabase.from('linen_purchase_orders').select('*, linen_po_items(*)').order('created_at', { ascending: true }).limit(2000);
    if (zoneId) { rq = rq.eq('zone_id', zoneId); pq = pq.eq('zone_id', zoneId); }
    const [r, p] = await Promise.all([rq, pq]);
    if (r.error || p.error) { setLoadErr((r.error || p.error).message); return; }
    setLoadErr(''); setRequests(r.data); setPos(p.data); setLoaded(true);
  }, [zoneId]);

  const loadQueueCount = useCallback(async () => {
    const { data } = await supabase.rpc('linen_onboard_queue', { p_zone_id: zoneId || null, p_include_dismissed: false });
    setQueueCount((data || []).length);
  }, [zoneId]);

  const loadNotifs = useCallback(async () => {
    const { data } = await supabase.from('purchasing_notifications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(80);
    setNotifs(data || []);
  }, [session.user.id]);

  useEffect(() => { loadMe(); loadCatalog(); loadNames(); loadNotifs(); }, [loadMe, loadCatalog, loadNames, loadNotifs]);
  useEffect(() => { if (me?.role) { loadData(); loadQueueCount(); } }, [me?.role, loadData, loadQueueCount]);

  // Realtime: refresh lists on any change; toast new notifications
  const reloadRef = useRef(); reloadRef.current = () => { loadData(); loadQueueCount(); };
  useEffect(() => {
    if (!me?.role) return;
    let timer;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => reloadRef.current(), 400); };
    const ch = supabase.channel('linen-purchasing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'linen_requests' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'linen_purchase_orders' }, bump)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'purchasing_notifications', filter: `user_id=eq.${session.user.id}` }, payload => {
        setNotifs(n => [payload.new, ...n.filter(x => x.id !== payload.new.id)]);
        toastRef.current(<span><b>{payload.new.title}</b> {payload.new.body || ''}</span>, payload.new.request_id ? { label: 'Open', fn: () => setDrawer({ mode: 'view', id: payload.new.request_id }) } : null);
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [me?.role, session.user.id]);
  const toastRef = useRef(); toastRef.current = toast;

  const posByReq = useMemo(() => {
    const m = new Map(); for (const o of pos) if (o.request_id) { if (!m.has(o.request_id)) m.set(o.request_id, []); m.get(o.request_id).push(o); } return m;
  }, [pos]);
  const derived = useMemo(() => requests.map(r => ({ r, d: derive(r, posByReq) })), [requests, posByReq]);
  const zones = me?.zones || [];
  const zoneName = id => zones.find(z => z.id === id)?.name || '';
  const nm = id => !id ? '' : (names[id] || (id === session.user.id ? (me?.name || 'You') : 'Someone'));

  const call = useCallback(async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    loadData(); loadQueueCount();
    return data;
  }, [loadData, loadQueueCount]);

  if (meErr) return <div className="auth"><div className="auth-card"><header><b>Well &amp; Good</b><span>Linen purchasing</span></header><form><p className="err">{meErr}</p><button className="btn" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></form></div></div>;
  if (!me) return <div className="auth"><p className="muted">Loading…</p></div>;
  if (!me.role) return (
    <div className="auth"><div className="auth-card"><header><b>Well &amp; Good</b><span>Linen purchasing</span></header>
      <form><h3 style={{ marginTop: 0 }}>You don’t have access yet</h3><p className="muted">Signed in as {session.user.email}. Ask a purchasing admin to add you.</p>
        <button className="btn ghost" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></form></div></div>);

  const isAdmin = me.role === 'admin';
  const unread = notifs.filter(n => !n.read_at).length;
  const ctx = {
    session, me, isAdmin, zones, zoneId, zoneName, catalog, nm, names, requests, pos, posByReq, derived, loaded, loadErr,
    toast, setDrawer, call, reload: () => reloadRef.current(), loadMe, loadCatalog, loadNames, setZoneId, setTab
  };
  const tabs = [['requests', 'Requests'], ['onboard', 'New onboard'], ['ledger', 'Linen ledger']].concat(isAdmin ? [['settings', 'Settings']] : []);

  return (
    <Ctx.Provider value={ctx}>
      <header className="bar">
        <div className="bar-in">
          <div className="brand"><b>Well &amp; Good</b><span>Linen purchasing</span></div>
          <nav aria-label="Sections">
            {tabs.map(([k, l]) => <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}{k === 'onboard' && queueCount ? <span className="count">{queueCount}</span> : null}</button>)}
          </nav>
          <label className="sr" htmlFor="zone">Market</label>
          <select id="zone" value={zoneId} onChange={e => setZoneId(e.target.value)}>
            <option value="">All markets</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <Notifications notifs={notifs} setNotifs={setNotifs} unread={unread} />
          <div className="who"><span>{me.name}</span><button className="signout" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
        </div>
      </header>
      <main>
        {loadErr ? <div className="notice">Some data didn’t load: {loadErr}</div> : null}
        {tab === 'requests' && <RequestsView />}
        {tab === 'onboard' && <OnboardView onCount={setQueueCount} />}
        {tab === 'ledger' && <LedgerView />}
        {tab === 'settings' && isAdmin && <SettingsView />}
      </main>
      <Drawer drawer={drawer} />
      <div className="toasts" aria-live="polite">
        {toasts.map(t => <div className="toast" key={t.id}><div>{t.msg}</div>{t.action ? <button type="button" onClick={() => { t.action.fn(); setToasts(x => x.filter(y => y.id !== t.id)); }}>{t.action.label}</button> : null}</div>)}
      </div>
    </Ctx.Provider>
  );
}
