import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Modal, useToast } from '../ui';

const STATUS = ['TODO', 'IN_PROGRESS', 'DONE'];
const PRIORITY = ['LOW', 'MEDIUM', 'HIGH'];
const nice = (s) => s.replace('_', ' ');

export default function Project() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [members, setMembers] = useState([]);
  const [fatal, setFatal] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(null); // a task, or 'project'
  const [confirm, setConfirm] = useState(null); // { text, onYes }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api(`/projects/${id}`);
      const [t, o] = await Promise.all([api(`/projects/${id}/tasks`), api(`/organizations/${p.organization}`)]);
      setProject(p); setTasks(t); setMembers(o.members);
    } catch (e) { setFatal(e.status === 404 ? 'Project not found or you do not have access.' : e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setSaving(true);
    try { await fn(); await load(); if (ok) toast(ok); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
    finally { setSaving(false); }
  };
  // Optimistic update for quick status/priority changes: UI moves instantly, rolls back on failure.
  const quick = (t, changes) => {
    setTasks((ts) => ts.map((x) => (x._id === t._id ? { ...x, ...changes } : x)));
    api(`/tasks/${t._id}`, { method: 'PATCH', body: changes }).catch((e) => { toast(e.message, 'err'); load(); });
  };
  const addTask = async (e) => {
    e.preventDefault();
    if (await run(() => api(`/projects/${id}/tasks`, { method: 'POST', body: { title } }), 'Task added')) setTitle('');
  };

  if (fatal) return <div className="layout"><Link to="/">← Back</Link><p role="alert" className="error">{fatal}</p></div>;
  if (!project || !tasks) return <div className="layout"><div className="skel" /><div className="skel" /><div className="skel" /></div>;

  const counts = Object.fromEntries(STATUS.map((s) => [s, tasks.filter((t) => t.status === s).length]));
  const shown = filter === 'ALL' ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div className="layout fade">
      <Link to="/">← Back to dashboard</Link>
      <div className="row between">
        <div><h1>{project.name}</h1><p className="muted">{project.description || 'No description'}</p></div>
        <div className="row">
          <button onClick={() => setEditing('project')}>Edit</button>
          <button className="danger" onClick={() => setConfirm({ text: 'Delete this project and all its tasks?', onYes: () => run(async () => { await api(`/projects/${id}`, { method: 'DELETE' }); nav('/'); }) })}>Delete</button>
        </div>
      </div>

      <form className="row" onSubmit={addTask}>
        <input required placeholder="New task title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" />
        <button disabled={saving}>Add task</button>
      </form>

      <div className="tabs" role="tablist">
        {['ALL', ...STATUS].map((s) => (
          <button key={s} role="tab" aria-selected={filter === s} className={filter === s ? 'tab on' : 'tab'} onClick={() => setFilter(s)}>
            {nice(s)} <span className="badge">{s === 'ALL' ? tasks.length : counts[s]}</span>
          </button>
        ))}
      </div>

      {!shown.length ? <p className="muted empty">{tasks.length ? 'No tasks in this status.' : 'No tasks yet. Add your first one above.'}</p> : (
        <ul className="tasks">{shown.map((t) => (
          <li key={t._id} className={`task fade p-${t.priority}`}>
            <div className="grow">
              <strong className={t.status === 'DONE' ? 'done' : ''}>{t.title}</strong>
              {t.description && <p className="muted small">{t.description}</p>}
              <div className="row small">
                <select aria-label="Status" value={t.status} onChange={(e) => quick(t, { status: e.target.value })}>{STATUS.map((s) => <option key={s} value={s}>{nice(s)}</option>)}</select>
                <select aria-label="Priority" value={t.priority} onChange={(e) => quick(t, { priority: e.target.value })}>{PRIORITY.map((s) => <option key={s}>{s}</option>)}</select>
                <span className="muted">👤 {t.assignee?.name || 'Unassigned'}</span>
              </div>
            </div>
            <div className="row">
              <button onClick={() => setEditing(t)}>Edit</button>
              <button className="danger" onClick={() => setConfirm({ text: `Delete “${t.title}”?`, onYes: () => run(() => api(`/tasks/${t._id}`, { method: 'DELETE' }), 'Task deleted') })}>Delete</button>
            </div>
          </li>))}
        </ul>
      )}

      {editing === 'project' && <ProjectModal project={project} onClose={() => setEditing(null)}
        onSave={async (body) => (await run(() => api(`/projects/${id}`, { method: 'PATCH', body }), 'Project updated')) && setEditing(null)} />}
      {editing && editing !== 'project' && <TaskModal task={editing} members={members} saving={saving} onClose={() => setEditing(null)}
        onSave={async (body) => (await run(() => api(`/tasks/${editing._id}`, { method: 'PATCH', body }), 'Task updated')) && setEditing(null)} />}
      {confirm && <Modal title="Are you sure?" onClose={() => setConfirm(null)}>
        <p>{confirm.text}</p>
        <div className="row end"><button className="ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="danger" onClick={() => { confirm.onYes(); setConfirm(null); }}>Delete</button></div>
      </Modal>}
    </div>
  );
}

function ProjectModal({ project, onClose, onSave }) {
  const [f, setF] = useState({ name: project.name, description: project.description || '' });
  return (
    <Modal title="Edit project" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <label>Name<input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Description<textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="row end"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button>Save</button></div>
      </form>
    </Modal>
  );
}

function TaskModal({ task, members, saving, onClose, onSave }) {
  const [f, setF] = useState({ title: task.title, description: task.description || '', status: task.status, priority: task.priority, assignee: task.assignee?._id || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit task" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...f, assignee: f.assignee || null }); }}>
        <label>Title<input required autoFocus value={f.title} onChange={set('title')} /></label>
        <label>Description<textarea rows={4} value={f.description} onChange={set('description')} /></label>
        <div className="row">
          <label>Status<select value={f.status} onChange={set('status')}>{STATUS.map((s) => <option key={s} value={s}>{nice(s)}</option>)}</select></label>
          <label>Priority<select value={f.priority} onChange={set('priority')}>{PRIORITY.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Assignee<select value={f.assignee} onChange={set('assignee')}><option value="">Unassigned</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
        </div>
        <div className="row end"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}