import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, Check, CheckCircle2, ChevronRight, Compass, GraduationCap, Leaf, LoaderCircle, LogOut, Menu, ShieldCheck, Sparkles, Target, X } from 'lucide-react';
import { auth } from './lib/auth';
import { ApiError } from './lib/auth-client';
import { buildPatch, emptyForm, toForm, type FormValues } from './lib/profile-form';
import type { CoreField, ProfileResponse } from './lib/types';

const DirtyContext = createContext({ dirty: false, setDirty: (_value: boolean) => {} });
const labels: Record<CoreField, string> = { institution: 'Your institution', degree: 'Degree or programme', graduationYear: 'Graduation year', targetRole: 'Target role', weeklyLearningHours: 'Weekly learning time' };
function Brand({ light = false }: { light?: boolean }) {
  return <span className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-mark"><Compass size={23} strokeWidth={1.6} /></span>Career<span className="brand-os">OS</span></span>;
}
function Loading({ message = 'Getting your space ready…' }: { message?: string }) {
  return <div className="loading-screen" role="status"><LoaderCircle className="spin" size={26} /><p>{message}</p></div>;
}
function AuthPage({ register = false }: { register?: boolean }) {
  const session = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const location = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false); const navigate = useNavigate();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { document.title = `${register ? 'Create account' : 'Sign in'} · CareerOS`; }, [register]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  if (session.status === 'authenticated') return <Navigate to="/profile" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setFieldErrors({}); setBusy(true);
    try {
      if (register) {
        await auth.register(name, email, password);
        navigate('/login', { replace: true, state: { registered: true } });
      } else await auth.login(email, password);
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fields).length) { setFieldErrors(cause.fields); setError('Please check the highlighted details.'); }
      else setError(cause instanceof Error ? cause.message : 'Please try again.');
    }
    finally { setBusy(false); setPassword(''); }
  };
  return <main className="auth-layout">
    <section className="auth-story" aria-label="Welcome to CareerOS">
      <Link to="/login" className="brand-link" aria-label="CareerOS sign in"><Brand light /></Link>
      <div className="story-content"><span className="eyebrow light-eyebrow">A LITTLE CLARITY. A LOT OF POSSIBILITY.</span>
        <h1>Your next chapter<br />starts with <em>you.</em></h1>
        <p>Bring your background, ambitions and learning time into one thoughtful space.</p>
        <div className="journey-illustration" aria-hidden="true">
          <div className="journey-grid" /><div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="journey-tag tag-top"><GraduationCap size={18} /> Where you are</div>
          <div className="journey-center"><Compass size={49} strokeWidth={1.2} /></div>
          <div className="journey-tag tag-bottom"><Target size={18} /> Where you want to go</div>
          <span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" />
        </div>
        <div className="story-note"><Leaf size={18} /><span>Build direction, one small step at a time.</span></div>
      </div><div className="story-footer">YOUR CAREER. YOUR PACE.</div>
    </section>
    <section className="auth-form-panel" id="main-content" tabIndex={-1}><div className="mobile-brand"><Brand /></div><div className="auth-form-wrap">
      <span className="pill"><span className="tiny-dot" /> YOUR PERSONAL CAREER SPACE</span>
      <h2>{register ? 'Make room for what’s next.' : 'Good to see you.'}</h2>
      <p className="muted auth-subtitle">{register ? 'Start with an account. Build your direction from there.' : 'Sign in to pick up where you left off.'}</p>
      {!register && (location.state as { registered?: boolean } | null)?.registered && <div className="notice success" role="status">Your account is ready. Sign in to continue.</div>}
      {!register && session.notice && <div className="notice" role="status">{session.notice}</div>}
      {error && <div ref={errorRef} tabIndex={-1} className="notice error" role="alert">{error}</div>}
      <form onSubmit={submit} className="auth-form">
        {register && <div className="auth-field"><label htmlFor="account-name">Full name</label><input id="account-name" name="name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={100} required disabled={busy} placeholder="Your name" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? 'name-error' : undefined} />{fieldErrors.name && <span className="field-error" id="name-error">{fieldErrors.name}</span>}</div>}
        <div className="auth-field"><label htmlFor="account-email">Email address</label><input id="account-email" type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" maxLength={254} required disabled={busy} placeholder="you@example.com" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'email-error' : undefined} />{fieldErrors.email && <span className="field-error" id="email-error">{fieldErrors.email}</span>}</div>
        <div className="auth-field"><label htmlFor="account-password">Password</label><div className="password-input"><input id="account-password" type={showPassword ? 'text' : 'password'} name="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={register ? 'new-password' : 'current-password'} required disabled={busy} aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'password-error' : register ? 'password-hint' : undefined} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-pressed={showPassword} disabled={busy}>{showPassword ? 'Hide' : 'Show'}</button></div>{fieldErrors.password && <span className="field-error" id="password-error">{fieldErrors.password}</span>}</div>
        {register && <p className="field-hint" id="password-hint">Use at least 15 characters and at most 72 UTF-8 bytes. Spaces are welcome.</p>}
        <button type="submit" className="button primary auth-submit" disabled={busy}>{busy && <LoaderCircle size={18} className="spin" />}{busy ? (register ? 'Creating account…' : 'Signing in…') : (register ? 'Create your account' : 'Sign in')}</button>
      </form>
      <p className="auth-switch">{register ? 'Already have an account?' : 'New to CareerOS?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
      <div className="privacy-note"><ShieldCheck size={20} /><p>Your career profile stays private to your account.</p></div>
    </div><p className="auth-bottom">A clearer direction. A more intentional journey.</p></section>
  </main>;
}

function AppShell() {
  const session = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const { dirty } = useContext(DirtyContext);
  const [signingOut, setSigningOut] = useState(false); const [logoutError, setLogoutError] = useState(''); const [menu, setMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null); const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    sidebarRef.current?.querySelector<HTMLButtonElement>('.close-menu')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenu(false); return; }
      if (event.key !== 'Tab') return;
      const items = [...sidebarRef.current!.querySelectorAll<HTMLElement>('a, button')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const resized = () => { if (window.innerWidth > 640) setMenu(false); };
    document.addEventListener('keydown', keydown); window.addEventListener('resize', resized);
    return () => { document.removeEventListener('keydown', keydown); window.removeEventListener('resize', resized); menuButtonRef.current?.focus(); };
  }, [menu]);
  if (session.status !== 'authenticated' || !session.user) return <Navigate to="/login" replace />;
  const user = session.user;
  const logout = async () => {
    if (dirty && !window.confirm('Discard your unsaved profile changes and sign out?')) return;
    setSigningOut(true); setLogoutError('');
    try { await auth.logout(); } catch (cause) { setLogoutError(cause instanceof Error ? cause.message : 'Could not confirm sign out.'); }
    finally { setSigningOut(false); }
  };
  return <div className="app-layout">
    <aside id="career-navigation" ref={sidebarRef} role={menu ? 'dialog' : undefined} aria-modal={menu || undefined} aria-label={menu ? 'Workspace navigation' : undefined} className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Link to="/profile" aria-label="CareerOS profile"><Brand light /></Link><button className="icon-button close-menu" aria-label="Close navigation" onClick={() => setMenu(false)}><X size={22} /></button></div>
      <div className="workspace-caption">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation"><Link className="nav-active" to="/profile" onClick={() => setMenu(false)}><Compass size={20} />Career profile<span className="nav-line" /></Link></nav>
      <div className="sidebar-note"><span className="sidebar-note-icon"><Sparkles size={21} /></span><h3>A strong start.</h3><p>Your background and direction are the foundation for what comes next.</p></div>
      <div className="sidebar-bottom"><span className="avatar">{user.name.trim().slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><span>Personal workspace</span></div></div>
    </aside>
    {menu && <button className="menu-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <div className="main-shell" inert={menu}><header className="topbar"><div className="breadcrumbs"><button ref={menuButtonRef} className="icon-button open-menu" aria-label="Open navigation" aria-expanded={menu} aria-controls="career-navigation" onClick={() => setMenu(true)}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={15} /><strong>Career profile</strong></div><button onClick={logout} disabled={signingOut} className="signout"><LogOut size={16} />{signingOut ? 'Signing out…' : 'Sign out'}</button></header>
      {logoutError && <div className="notice error shell-error" role="alert">{logoutError} You are still signed in until sign out is confirmed.</div>}
      <ProfilePage key={user.id} userId={user.id} />
    </div>
  </div>;
}

function ProfilePage({ userId }: { userId: number }) {
  const client = useQueryClient(); const { setDirty } = useContext(DirtyContext);
  const query = useQuery({ queryKey: ['career-profile', userId], queryFn: ({ signal }) => auth.api<ProfileResponse>('/api/users/career-profile', { signal }) });
  const [form, setForm] = useState<FormValues>({ ...emptyForm }); const [saved, setSaved] = useState<FormValues>({ ...emptyForm });
  const [initialized, setInitialized] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); const [success, setSuccess] = useState('');
  const dirty = initialized && JSON.stringify(form) !== JSON.stringify(saved);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { document.title = 'Career profile · CareerOS'; }, []);
  useEffect(() => { if (query.data && !initialized) { const values = toForm(query.data.data); setForm(values); setSaved(values); setInitialized(true); } }, [query.data, initialized]);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const change = (key: keyof FormValues, value: string) => { setForm(current => ({ ...current, [key]: value })); setSuccess(''); setFieldErrors(current => ({ ...current, [key]: '' })); };
  const reload = async () => {
    if (dirty && !window.confirm('Discard unsaved changes and reload your saved profile?')) return;
    setError(''); setSuccess(''); const response = await query.refetch();
    if (response.data && !response.error) { const values = toForm(response.data.data); setForm(values); setSaved(values); setFieldErrors({}); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setFieldErrors({});
    const patch = buildPatch(form, saved); if (!Object.keys(patch).length) { setSuccess('No changes to save.'); return; }
    if (patch.interests && (patch.interests.length > 10 || patch.interests.some(value => value.length > 50))) {
      setFieldErrors({ interests: 'Use up to 10 interests, each no longer than 50 characters.' }); setError('Please check your interests.'); return;
    }
    setBusy(true);
    try {
      const response = await auth.api<ProfileResponse>('/api/users/career-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      client.setQueryData(['career-profile', userId], response); const values = toForm(response.data);
      setForm(values); setSaved(values); setSuccess('Your profile is saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm the save. Reload your saved profile before trying again.'); if (cause instanceof ApiError) setFieldErrors(cause.fields); }
    finally { setBusy(false); }
  };
  const field = (key: keyof FormValues, label: string, options: { placeholder?: string; maxLength?: number; type?: string; min?: number; max?: number; hint?: string } = {}) => <div className="form-field"><label htmlFor={key}>{label}</label><input id={key} name={key} value={form[key]} onChange={event => change(key, event.target.value)} type={options.type ?? 'text'} placeholder={options.placeholder} maxLength={options.maxLength} min={options.min} max={options.max} step={options.type === 'number' ? 1 : undefined} disabled={busy} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `${key}-error` : options.hint ? `${key}-hint` : undefined} />{options.hint && <span className="field-hint" id={`${key}-hint`}>{options.hint}</span>}{fieldErrors[key] && <span className="field-error" id={`${key}-error`}>{fieldErrors[key]}</span>}</div>;
  const completion = query.data?.completeness; const count = completion?.completedFields.length ?? 0;
  return <main className="workspace-main" id="main-content" tabIndex={-1}><div className="page-intro"><div><span className="eyebrow">LET’S SET YOUR DIRECTION</span><h1>Your career, in context.</h1><p className="muted">A little about where you are. A clearer picture of where you’re going.</p></div><span className="page-badge"><ShieldCheck size={15} />Only visible to you</span></div>
    {query.isPending ? <Loading message="Loading your career profile…" /> : query.isError && !query.data ? <div className="panel error-panel" role="alert"><h2>We couldn’t load your profile.</h2><p>{query.error.message}</p><button className="button secondary" onClick={() => query.refetch()}>Try again</button></div> : <div className="profile-layout">
      <div><div className="profile-tab"><Compass size={17} />Career profile<span>YOUR FOUNDATION</span></div>
      <form onSubmit={submit} className="panel profile-panel">
        <div className="panel-heading"><div><h2>{query.data?.data ? 'The bigger picture' : 'Start with your story'}</h2><p>You can fill this in gradually. Everything is editable.</p></div><BookOpen size={24} strokeWidth={1.3} /></div>
        {error && <div tabIndex={-1} ref={errorRef} className="notice error" role="alert">{error}</div>}
        {query.isError && query.data && <div className="notice error" role="alert">Could not reload your profile. Your current form is still here.</div>}
        {success && <div className="notice success" role="status"><CheckCircle2 size={17} />{success}</div>}
        <fieldset disabled={busy}><legend><span className="section-icon"><GraduationCap size={18} /></span>Education</legend><p className="section-description">The background you’re building on.</p>
          <div className="form-grid">{field('institution', 'College or institution', { placeholder: 'e.g. Your college or university', maxLength: 200 })}{field('degree', 'Degree or programme', { placeholder: 'e.g. BTech in Computer Science', maxLength: 100 })}{field('graduationYear', 'Graduation year', { type: 'number', min: 1990, max: 2100, placeholder: 'e.g. 2028', hint: 'Expected or completed. Leave blank if undecided.' })}</div>
        </fieldset>
        <fieldset disabled={busy}><legend><span className="section-icon"><Target size={18} /></span>Career direction</legend><p className="section-description">An ambition and a little time to move towards it.</p>
          <div className="form-grid">{field('targetRole', 'Target role', { placeholder: 'e.g. Backend developer', maxLength: 100 })}{field('weeklyLearningHours', 'Weekly learning hours', { type: 'number', min: 1, max: 40, placeholder: 'e.g. 8', hint: 'A realistic whole number from 1 to 40.' })}</div>
        </fieldset>
        <fieldset disabled={busy}><legend><span className="section-icon"><Sparkles size={18} /></span>A little more about you<span className="optional">Optional</span></legend>
          {field('interests', 'Interests', { placeholder: 'e.g. Web development, AI, open source', maxLength: 520, hint: 'Separate interests with commas. Up to 10 interests.' })}
          <div className="bio-label"><label htmlFor="bio">Short bio</label><textarea id="bio" name="bio" rows={4} value={form.bio} onChange={event => change('bio', event.target.value)} maxLength={1000} placeholder="What are you curious about? What would you like to build?" aria-invalid={!!fieldErrors.bio} aria-describedby="bio-hint" /><span className="field-hint bio-counter" id="bio-hint"><span>A few words in your own voice.</span><span>{form.bio.length}/1000</span></span>{fieldErrors.bio && <span className="field-error">{fieldErrors.bio}</span>}</div>
        </fieldset>
        <div className="form-footer"><span className={dirty ? 'unsaved' : 'saved-label'}>{dirty ? 'You have unsaved changes' : query.data?.data ? <><Check size={15} />Changes saved</> : 'Save when you’re ready'}</span><div className="form-actions"><button type="button" className="button text-button" onClick={reload} disabled={busy || query.isFetching}>Reload saved</button><button className="button primary" type="submit" disabled={busy || !initialized || !dirty}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? 'Saving…' : 'Save profile'}</button></div></div>
      </form></div>
      <aside className="profile-aside" aria-label="Saved profile checklist"><section className="panel completion-panel"><div className="completion-header"><span className="eyebrow">YOUR FOUNDATION</span><span className="completion-fraction">{count}<span>/5</span></span></div><h2>{count === 5 ? 'A clearer starting point.' : 'Small steps. Clearer direction.'}</h2><p>Five details help put your career goals in context.</p><div className="progress-track" role="progressbar" aria-label="Saved core profile details" aria-valuenow={count} aria-valuemin={0} aria-valuemax={5}><span style={{ width: `${count * 20}%` }} /></div><ul className="completion-list">{(Object.keys(labels) as CoreField[]).map(key => <li key={key} className={completion?.completedFields.includes(key) ? 'complete' : ''}><span className="check-circle">{completion?.completedFields.includes(key) && <Check size={12} strokeWidth={3} />}</span>{labels[key]}</li>)}</ul><p className="completion-footnote">Based on your saved details. This is a profile checklist, not a measure of job readiness.</p></section>
      <section className="gentle-note"><span className="gentle-note-icon"><Leaf size={23} strokeWidth={1.4} /></span><h3>You don’t need it all figured out.</h3><p>Start with what you know. Your direction can evolve as you learn.</p><span className="note-flourish" aria-hidden="true"><ArrowUpRight size={24} /></span></section></aside>
    </div>}
    <footer className="workspace-footer"><span>Made for the journey, not just the destination.</span><span>CareerOS</span></footer>
  </main>;
}

export function App() {
  const session = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const client = useQueryClient(); const previous = useRef<number | null>(null); const [dirty, setDirty] = useState(false);
  useEffect(() => { void auth.restore(); }, []);
  useEffect(() => {
    const id = session.user?.id ?? null;
    if (session.status === 'anonymous') client.clear();
    else if (previous.current !== null && id !== previous.current) client.removeQueries({ queryKey: ['career-profile', previous.current] });
    previous.current = id;
  }, [session.user?.id, session.status, client]);
  if (session.status === 'loading') return <Loading />;
  return <DirtyContext.Provider value={{ dirty, setDirty }}><a className="skip-link" href="#main-content">Skip to content</a><Routes>
    <Route path="/login" element={<AuthPage key="login" />} /><Route path="/register" element={<AuthPage key="register" register />} />
    <Route path="/profile" element={<AppShell />} /><Route path="/" element={<Navigate to={session.status === 'authenticated' ? '/profile' : '/login'} replace />} />
    <Route path="*" element={<main className="not-found"><Brand /><h1>This page isn’t here.</h1><p>Let’s get you back to your space.</p><Link className="button primary" to="/">Back to CareerOS</Link></main>} />
  </Routes></DirtyContext.Provider>;
}
