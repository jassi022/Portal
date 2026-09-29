import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [orgs, setOrgs] = useState(null);
  const [orgId, setOrgId] = useState(localStorage.getItem('orgId')); // convenience only; server re-checks every request
  const [org, setOrg] = useState(null);
  const [projects, setProjects] = useState(null);
  const [err, setErr] = useState('');
  const [pname, setPname] = useState('');
  const [email, setEmail] = useState('');

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

  const act = (fn) => async (e) => { e.preventDefault(); setErr(''); try { await fn(); } catch (x) { setErr(x.message); } };
  const addProject = act(async () => { await api(`/organizations/${orgId}/projects`, { method: 'POST', body: { name: pname } }); setPname(''); loadOrg(); });
  const addMember = act(async () => { await api(`/organizations/${orgId}/members`, { method: 'POST', body: { email } }); setEmail(''); loadOrg(); });
  const addOrg = act(async () => {
    const name = prompt('Organization name'); if (!name) return;
    const o = await api('/organizations', { method: 'POST', body: { name } }); await loadOrgs(); setOrgId(o.id);
  });

  return (
    <div className="layout">
      <header>
        <strong>Project Portal</strong>
        <div className="row">
          <label className="inline">Organization
            <select value={orgId || ''} onChange={(e) => setOrgId(e.target.value)} aria-label="Switch organization">
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
            </select>
          </label>
          <button onClick={addOrg}>+ Org</button>
          <span>{user.name}</span><button onClick={logout}>Log out</button>
        </div>
      </header>
      {err && <p role="alert" className="error">{err}</p>}
      {orgs && !orgs.length && <p className="card">You don't belong to any organization yet. Create one with “+ Org”.</p>}
      {org && (
        <div className="grid">
          <section className="card">
            <h2>Projects</h2>
            <form className="row" onSubmit={addProject}>
              <input required placeholder="New project name" value={pname} onChange={(e) => setPname(e.target.value)} aria-label="Project name" />
              <button>Add</button>
            </form>
            {!projects ? <div className="skel" aria-busy="true" /> : !projects.length ? <p className="muted">No projects yet.</p> :
              <ul>{projects.map((p) => <li key={p._id}><Link to={`/projects/${p._id}`}>{p.name}</Link> <span className="muted">by {p.createdBy?.name}</span></li>)}</ul>}
          </section>
          <section className="card">
            <h2>{org.name} <small className="muted">({org.myRole})</small></h2>
            <h3>Members</h3>
            <ul>{org.members.map((m) => <li key={m.userId}>{m.name} — {m.email} <span className="badge">{m.role}</span></li>)}</ul>
            {org.myRole === 'ADMIN' && (
              <form className="row" onSubmit={addMember}>
                <input type="email" required placeholder="Add member by email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Member email" />
                <button>Add</button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}