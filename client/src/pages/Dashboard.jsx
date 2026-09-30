import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

const initial = (s) => (s?.trim()?.[0] || '?').toUpperCase();

/* Small reusable modal: one text input + submit. Uses .modal* classes from styles.css */
function Modal({ title, subtitle, label, type = 'text', placeholder, submitLabel, onSubmit, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(value.trim());
    } catch (x) {
      setError(x.message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          {error && (
            <div role="alert" className="alert error"><span>{error}</span></div>
          )}
          <label>
            {label}
            <input
              ref={inputRef} type={type} required placeholder={placeholder}
              value={value} onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || !value.trim()}>
              {busy ? 'Please wait…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [orgs, setOrgs] = useState(null);
  const [orgId, setOrgId] = useState(localStorage.getItem('orgId')); // convenience only; server re-checks every request
  const [org, setOrg] = useState(null);
  const [projects, setProjects] = useState(null);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // 'org' | 'project' | 'member' | null

  const closeModal = useCallback(() => setModal(null), []);

  const loadOrgs = useCallback(() => api('/organizations').then(setOrgs).catch((e) => setErr(e.message)), []);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  // Pick a valid active org once orgs load
  useEffect(() => {
    if (orgs?.length && !orgs.some((o) => o.id === orgId)) setOrgId(orgs[0].id);
  }, [orgs, orgId]);

  const loadOrg = useCallback(() => {
    if (!orgId) return;
    setOrg(null); setProjects(null); setErr('');
    localStorage.setItem('orgId', orgId);
    Promise.all([api(`/organizations/${orgId}`), api(`/organizations/${orgId}/projects`)])
      .then(([o, p]) => { setOrg(o); setProjects(p); })
      .catch((e) => setErr(e.message));
  }, [orgId]);
  useEffect(() => { loadOrg(); }, [loadOrg]);

  // Modal submit handlers (errors are shown inside the modal)
  const createOrg = async (name) => {
    const o = await api('/organizations', { method: 'POST', body: { name } });
    await loadOrgs();
    setOrgId(o.id);
    setModal(null);
  };
  const createProject = async (name) => {
    await api(`/organizations/${orgId}/projects`, { method: 'POST', body: { name } });
    setModal(null);
    setQuery('');
    loadOrg();
  };
  const createMember = async (email) => {
    await api(`/organizations/${orgId}/members`, { method: 'POST', body: { email } });
    setModal(null);
    loadOrg();
  };

  const isAdmin = org?.myRole === 'ADMIN';
  const q = query.trim().toLowerCase();
  const visibleProjects = projects?.filter((p) => p.name.toLowerCase().includes(q));

  return (
    <div className="dashboard">
      {/* ---------- Header ---------- */}
      <header className="dashboard-header">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">P</div>
          <div>
            <strong>Project Portal</strong>
            <span>Dashboard</span>
          </div>
        </div>

        <div className="header-actions">
          {orgs?.length > 0 && (
            <label className="org-selector">
              <span>Organization</span>
              <select value={orgId || ''} onChange={(e) => setOrgId(e.target.value)} aria-label="Switch organization">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
              </select>
            </label>
          )}
          <button className="btn secondary" onClick={() => setModal('org')}>+ Org</button>
          <div className="avatar" title={user.name} aria-label={`Signed in as ${user.name}`}>{initial(user.name)}</div>
          <button className="btn ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      {err && (
        <div role="alert" className="alert error">
          <span>{err}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setErr('')}>×</button>
        </div>
      )}

      {/* ---------- Loading orgs ---------- */}
      {!orgs && !err && (
        <div className="loading-list" aria-busy="true">
          <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
        </div>
      )}

      {/* ---------- No organization yet ---------- */}
      {orgs && !orgs.length && (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">🏢</div>
          <h2>Create your first organization</h2>
          <p>You don't belong to any organization yet. Create one to start adding projects and members.</p>
          <button className="btn primary" onClick={() => setModal('org')}>+ Create organization</button>
        </div>
      )}

      {/* ---------- Loading selected org ---------- */}
      {orgs?.length > 0 && !org && !err && (
        <div className="loading-list" aria-busy="true">
          <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
        </div>
      )}

      {/* ---------- Organization view ---------- */}
      {org && (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ORGANIZATION</div>
              <h1>{org.name}</h1>
              <p>You are {isAdmin ? 'an admin' : 'a member'} of this organization.</p>
            </div>
          </div>

          <div className="stats">
            <div className="stat-card">
              <div className="stat-icon blue" aria-hidden="true">📁</div>
              <div><span>Projects</span><strong>{projects ? projects.length : '–'}</strong></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple" aria-hidden="true">👥</div>
              <div><span>Members</span><strong>{org.members.length}</strong></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green" aria-hidden="true">🛡️</div>
              <div><span>Your role</span><strong>{org.myRole}</strong></div>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* Projects */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Projects</h2>
                  <p>{projects ? `${projects.length} in ${org.name}` : 'Loading…'}</p>
                </div>
                <button className="btn primary" onClick={() => setModal('project')}>+ New project</button>
              </div>

              {projects?.length > 0 && (
                <div className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects" aria-label="Search projects"
                  />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
                </div>
              )}

              {!projects ? (
                <div className="loading-list" aria-busy="true"><div className="skeleton" /><div className="skeleton" /></div>
              ) : !projects.length ? (
                <div className="no-results" style={{ margin: '0 18px 18px' }}>
                  <div className="no-results-icon" aria-hidden="true">📁</div>
                  <h3>No projects yet</h3>
                  <p>Create a project to start tracking work in this organization.</p>
                  <button className="btn primary" onClick={() => setModal('project')}>+ New project</button>
                </div>
              ) : !visibleProjects.length ? (
                <div className="no-results" style={{ margin: '0 18px 18px' }}>
                  <div className="no-results-icon" aria-hidden="true">🔍</div>
                  <h3>No matches</h3>
                  <p>No project matches “{query}”.</p>
                </div>
              ) : (
                <div className="project-list">
                  {visibleProjects.map((p) => (
                    <Link key={p._id} to={`/projects/${p._id}`} className="project-item">
                      <div className="project-icon" aria-hidden="true">{initial(p.name)}</div>
                      <div className="project-info">
                        <strong>{p.name}</strong>
                        <span>Created by {p.createdBy?.name || 'unknown'}</span>
                      </div>
                      <span className="project-arrow" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Members */}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Members</h2>
                  <p>{org.members.length} {org.members.length === 1 ? 'person' : 'people'}</p>
                </div>
                {isAdmin && (
                  <button className="btn secondary" onClick={() => setModal('member')}>+ Add member</button>
                )}
              </div>
              <div className="member-list">
                {org.members.map((m) => (
                  <div key={m.userId} className="member-item">
                    <div className="member-avatar" aria-hidden="true">{initial(m.name)}</div>
                    <div className="member-info">
                      <strong>{m.name}</strong>
                      <span>{m.email}</span>
                    </div>
                    <span className={`role${m.role === 'ADMIN' ? ' admin' : ''}`}>{m.role}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {/* ---------- Modals ---------- */}
      {modal === 'org' && (
        <Modal
          title="New organization" subtitle="Organizations hold your projects and members."
          label="Organization name" placeholder="e.g. Acme Inc."
          submitLabel="Create organization" onSubmit={createOrg} onClose={closeModal}
        />
      )}
      {modal === 'project' && (
        <Modal
          title="New project" subtitle={`Will be created in ${org?.name}.`}
          label="Project name" placeholder="e.g. Website redesign"
          submitLabel="Create project" onSubmit={createProject} onClose={closeModal}
        />
      )}
      {modal === 'member' && (
        <Modal
          title="Add member" subtitle="They need an existing account."
          label="Email" type="email" placeholder="name@example.com"
          submitLabel="Add member" onSubmit={createMember} onClose={closeModal}
        />
      )}
    </div>
  );
}