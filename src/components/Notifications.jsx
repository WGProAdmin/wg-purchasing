import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useApp } from '../App.jsx';
import { ago } from '../lib/util.js';

export default function Notifications({ notifs, setNotifs, unread }) {
  const { setDrawer } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    document.title = (unread ? `(${unread}) ` : '') + 'Linen Purchasing | Well & Good';
  }, [unread]);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const markRead = async ids => {
    setNotifs(n => n.map(x => (!ids || ids.includes(x.id)) ? { ...x, read_at: x.read_at || new Date().toISOString() } : x));
    await supabase.rpc('purchasing_mark_read', { p_ids: ids });
  };
  const openOne = n => { if (!n.read_at) markRead([n.id]); setOpen(false); if (n.request_id) setDrawer({ mode: 'view', id: n.request_id }); };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="bell" type="button" aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setOpen(o => !o)}>
        <Bell size={18} aria-hidden="true" />{unread ? <span className="dot">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      <section className={'npanel' + (open ? ' on' : '')} aria-label="Notifications">
        <div className="np-h"><h3>Notifications</h3>{unread ? <button className="linkbtn" type="button" onClick={() => markRead(null)}>Mark all as read</button> : null}</div>
        <div className="np-list">
          {!notifs.length ? <div className="empty">You’re all caught up. New requests and order updates will show up here.</div> :
            notifs.map(n => (
              <button key={n.id} type="button" className={'nitem' + (n.read_at ? '' : ' unread')} onClick={() => openOne(n)}>
                <b>{n.title}</b>{n.body ? <span>{n.body}</span> : null}<small>{ago(n.created_at)}</small>
              </button>))}
        </div>
      </section>
    </div>
  );
}
