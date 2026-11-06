import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const signIn = async e => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr('That email and password didn’t match. Try again or use a sign-in link.');
  };
  const link = async () => {
    setErr(''); setMsg('');
    if (!email.trim()) return setErr('Enter your work email first.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) setErr('We couldn’t send a link to that email. Make sure it’s your Well & Good login.');
    else setMsg('Check your inbox for a sign-in link.');
  };
  return (
    <div className="auth">
      <div className="auth-card">
        <header><b>Well &amp; Good</b><span>Linen purchasing</span></header>
        <form onSubmit={signIn}>
          {err ? <p className="err" role="alert">{err}</p> : null}
          {msg ? <p className="ok">{msg}</p> : null}
          <div className="field"><label htmlFor="em">Work email</label><input id="em" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={busy || !password}>Sign in</button>
            <button className="btn sec" type="button" disabled={busy} onClick={link}>Email me a sign-in link</button>
          </div>
        </form>
      </div>
    </div>
  );
}
