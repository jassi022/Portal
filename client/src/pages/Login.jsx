import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_KEY = 'login:remembered-email';

const readRemembered = () => {
  try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
};
const writeRemembered = (email) => {
  try {
    if (email) localStorage.setItem(REMEMBER_KEY, email);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch { /* storage unavailable */ }
};

const RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'case', label: 'Upper and lower case', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: 'num', label: 'A number', test: (p) => /\d/.test(p) },
];
const STRENGTH_LABELS = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'];

function scorePassword(p) {
  if (!p) return 0;
  let s = RULES.filter((r) => r.test(p)).length; // 0-3
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s += 1; // bonus
  return Math.min(s, 4);
}

function validate(field, value, mode) {
  switch (field) {
    case 'name':
      if (mode !== 'register') return '';
      return value.trim() ? '' : 'Enter your name.';
    case 'email':
      if (!value.trim()) return 'Enter your email.';
      return EMAIL_RE.test(value) ? '' : 'Enter a valid email, like name@example.com.';
    case 'password':
      if (!value) return 'Enter your password.';
      if (value.length < 8) return 'Use at least 8 characters.';
      return '';
    default:
      return '';
  }
}

function EyeIcon({ off }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();

  const [mode, setMode] = useState('login');
  const [f, setF] = useState(() => ({ name: '', email: readRemembered(), password: '' }));
  const [touched, setTouched] = useState({});
  const [remember, setRemember] = useState(() => !!readRemembered());
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const refs = { name: useRef(null), email: useRef(null), password: useRef(null) };
  const isRegister = mode === 'register';

  const errors = useMemo(
    () => ({
      name: validate('name', f.name, mode),
      email: validate('email', f.email, mode),
      password: validate('password', f.password, mode),
    }),
    [f, mode]
  );

  const strength = scorePassword(f.password);

  // Focus the first empty field on load
  useEffect(() => {
    (f.email ? refs.password : refs.email).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => {
    setF((prev) => ({ ...prev, [k]: e.target.value }));
    if (err) setErr('');
  };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const showError = (k) => touched[k] && errors[k];

  function switchMode(next) {
    if (next === mode || busy) return;
    setMode(next);
    setErr('');
    setTouched({});
    setShowPw(false);
  }

  function checkCaps(e) {
    if (e.getModifierState) setCaps(e.getModifierState('CapsLock'));
  }

  function triggerShake() {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');

    const fields = isRegister ? ['name', 'email', 'password'] : ['email', 'password'];
    setTouched({ name: true, email: true, password: true });
    const firstBad = fields.find((k) => errors[k]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      triggerShake();
      return;
    }

    setBusy(true);
    try {
      if (isRegister) await register(f.name.trim(), f.email.trim(), f.password);
      else await login(f.email.trim(), f.password);
      writeRemembered(remember ? f.email.trim() : '');
      nav('/');
    } catch (x) {
      setErr(x.message || 'Something went wrong. Try again.');
      triggerShake();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section
        className={`auth-card${shake ? ' shake' : ''}`}
        onAnimationEnd={() => setShake(false)}
      >
        <div className="auth-tabs" role="tablist" aria-label="Account" data-active={mode}>
          <button type="button" role="tab" aria-selected={!isRegister}
            className={!isRegister ? 'on' : ''} onClick={() => switchMode('login')}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={isRegister}
            className={isRegister ? 'on' : ''} onClick={() => switchMode('register')}>
            Register
          </button>
        </div>

        <header className="auth-head">
          <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p>{isRegister ? 'It takes less than a minute.' : 'Log in to pick up where you left off.'}</p>
        </header>

        <form onSubmit={submit} noValidate>
          {/* Name (register only, collapses smoothly) */}
          <div className={`collapse${isRegister ? ' open' : ''}`} aria-hidden={!isRegister}>
            <div className="collapse-inner">
              <div className="field">
                <label htmlFor="auth-name">Name</label>
                <input
                  id="auth-name" ref={refs.name} autoComplete="name"
                  disabled={!isRegister} value={f.name}
                  onChange={set('name')} onBlur={blur('name')}
                  aria-invalid={!!showError('name')}
                  aria-describedby={showError('name') ? 'auth-name-err' : undefined}
                />
                {showError('name') && <p id="auth-name-err" className="field-error">{errors.name}</p>}
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email" ref={refs.email} type="email" inputMode="email"
              autoComplete="email" value={f.email}
              onChange={set('email')} onBlur={blur('email')}
              aria-invalid={!!showError('email')}
              aria-describedby={showError('email') ? 'auth-email-err' : undefined}
            />
            {showError('email') && <p id="auth-email-err" className="field-error">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <div className="pw-wrap">
              <input
                id="auth-password" ref={refs.password}
                type={showPw ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={f.password}
                onChange={set('password')} onBlur={(e) => { blur('password')(); setCaps(false); }}
                onKeyDown={checkCaps} onKeyUp={checkCaps}
                aria-invalid={!!showError('password')}
                aria-describedby="auth-password-help"
              />
              <button
                type="button" className="pw-toggle"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                aria-pressed={showPw}
              >
                <EyeIcon off={showPw} />
              </button>
            </div>

            <div id="auth-password-help" aria-live="polite">
              {caps && <p className="field-hint warn">Caps Lock is on.</p>}
              {showError('password') && <p className="field-error">{errors.password}</p>}
            </div>

            {/* Strength meter + checklist (register only) */}
            <div className={`collapse${isRegister && f.password ? ' open' : ''}`}>
              <div className="collapse-inner">
                <div className="meter" data-level={strength} aria-hidden="true">
                  <span /><span /><span /><span />
                </div>
                <p className="meter-label">
                  Strength: <strong>{STRENGTH_LABELS[strength]}</strong>
                </p>
                <ul className="rules">
                  {RULES.map((r) => (
                    <li key={r.id} className={r.test(f.password) ? 'pass' : ''}>
                      <span className="tick" aria-hidden="true">{r.test(f.password) ? '✓' : '•'}</span>
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Remember me (login only) */}
          <div className={`collapse${!isRegister ? ' open' : ''}`}>
            <div className="collapse-inner">
              <label className="check">
                <input
                  type="checkbox" checked={remember} disabled={isRegister}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember my email on this device
              </label>
            </div>
          </div>

          {err && (
            <div role="alert" className="alert error">
              <span>{err}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setErr('')}>×</button>
            </div>
          )}

          <button className="btn primary auth-submit" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? (isRegister ? 'Creating account…' : 'Logging in…') : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="link" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </section>
    </main>
  );
}