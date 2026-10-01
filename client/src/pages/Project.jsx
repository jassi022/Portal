import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../ui';

const STATUS = ['TODO', 'IN_PROGRESS', 'DONE'];
const PRIORITY = ['LOW', 'MEDIUM', 'HIGH'];

const LABEL = {
  ALL: 'All',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const label = (value) => LABEL[value] || value;

function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default function Project() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [members, setMembers] = useState([]);

  const [fatal, setFatal] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');

  const [title, setTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const closeEditing = useCallback(() => setEditing(null), []);
  const closeConfirm = useCallback(() => setConfirm(null), []);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);

      const p = await api(`/projects/${id}`);

      const [t, o] = await Promise.all([
        api(`/projects/${id}/tasks`),
        api(`/organizations/${p.organization}`),
      ]);

      setProject(p);
      setTasks(Array.isArray(t) ? t : []);
      setMembers(o?.members || []);
      setFatal('');
    } catch (e) {
      setFatal(
        e.status === 404
          ? 'Project not found or you do not have access.'
          : e.message
      );
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, ok) => {
    setSaving(true);

    try {
      await fn();
      await load();

      if (ok) toast(ok);

      return true;
    } catch (e) {
      toast(e.message || 'Something went wrong', 'err');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // changes = what is sent to the API
  // optimistic = what is shown in the UI right away (defaults to changes)
  const quick = async (task, changes, optimistic = changes) => {
    const previous = tasks;

    setTasks((current) =>
      current.map((item) =>
        item._id === task._id
          ? { ...item, ...optimistic }
          : item
      )
    );

    try {
      await api(`/tasks/${task._id}`, {
        method: 'PATCH',
        body: changes,
      });

      toast('Task updated');
    } catch (e) {
      setTasks(previous);
      toast(e.message || 'Unable to update task', 'err');
    }
  };

  const changeAssignee = (task, userId) => {
    const member = members.find((m) => m.userId === userId);

    quick(
      task,
      { assignee: userId || null },
      {
        assignee: member
          ? { _id: member.userId, name: member.name }
          : null,
      }
    );
  };

  const addTask = async (e) => {
    e.preventDefault();

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      toast('Enter a task title', 'err');
      return;
    }

    const success = await run(
      () =>
        api(`/projects/${id}/tasks`, {
          method: 'POST',
          body: {
            title: cleanTitle,
            status: 'TODO',
            priority: 'MEDIUM',
            assignee: newAssignee || null,
          },
        }),
      'Task added'
    );

    if (success) {
      setTitle('');
      setNewAssignee('');
    }
  };

  const counts = useMemo(() => {
    if (!tasks) {
      return {
        ALL: 0,
        TODO: 0,
        IN_PROGRESS: 0,
        DONE: 0,
      };
    }

    return {
      ALL: tasks.length,
      TODO: tasks.filter((t) => t.status === 'TODO').length,
      IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      DONE: tasks.filter((t) => t.status === 'DONE').length,
    };
  }, [tasks]);

  const completion = tasks?.length
    ? Math.round((counts.DONE / tasks.length) * 100)
    : 0;

  const shown = useMemo(() => {
    if (!tasks) return [];

    const query = search.trim().toLowerCase();

    let result = tasks.filter((task) => {
      const matchesFilter =
        filter === 'ALL' || task.status === filter;

      const matchesSearch =
        !query ||
        task.title?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.assignee?.name?.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });

    result = [...result].sort((a, b) => {
      if (sort === 'priority') {
        const order = {
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
        };

        return (order[b.priority] || 0) - (order[a.priority] || 0);
      }

      if (sort === 'status') {
        return STATUS.indexOf(a.status) - STATUS.indexOf(b.status);
      }

      if (sort === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }

      return (
        new Date(b.createdAt || 0) -
        new Date(a.createdAt || 0)
      );
    });

    return result;
  }, [tasks, filter, search, sort]);

  const deleteProject = () => {
    setConfirm({
      title: 'Delete project?',
      text: 'This will permanently delete the project and all its tasks.',
      onYes: async () => {
        const success = await run(
          () =>
            api(`/projects/${id}`, {
              method: 'DELETE',
            }),
          'Project deleted'
        );

        if (success) nav('/');
      },
    });
  };

  const deleteTask = (task) => {
    setConfirm({
      title: 'Delete task?',
      text: `Delete "${task.title}" permanently?`,
      onYes: () =>
        run(
          () =>
            api(`/tasks/${task._id}`, {
              method: 'DELETE',
            }),
          'Task deleted'
        ),
    });
  };

  if (fatal) {
    return (
      <div className="dashboard">
        <Link to="/" className="back-link">
          ← Back to dashboard
        </Link>

        <div role="alert" className="alert error">
          <span>{fatal}</span>
        </div>
      </div>
    );
  }

  if (!project || !tasks) {
    return (
      <div className="dashboard">
        <div className="loading-list" aria-busy="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard project-page">

      {/* Top navigation */}
      <div className="project-topbar">
        <Link to="/" className="back-link">
          ← Dashboard
        </Link>

        <button
          type="button"
          className="btn ghost"
          onClick={load}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Project header */}
      <div className="page-heading">
        <div className="project-title-area">
          <div className="eyebrow">PROJECT</div>

          <h1>{project.name}</h1>

          <p>
            {project.description || 'No project description available.'}
          </p>
        </div>

        <div className="header-actions">
          <button
            className="btn secondary"
            onClick={() => setEditing('project')}
          >
            ✎ Edit
          </button>

          <button
            className="btn danger"
            onClick={deleteProject}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Progress */}
      <section className="project-progress-card">
        <div className="progress-summary">
          <div>
            <span className="progress-label">
              Project progress
            </span>

            <strong>
              {counts.DONE} of {tasks.length} tasks completed
            </strong>
          </div>

          <div className="progress-percent">
            {completion}%
          </div>
        </div>

        <div
          className="progress"
          aria-label={`${completion}% of tasks completed`}
        >
          <div className="progress-bar">
            <span
              style={{
                width: `${completion}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="stats project-stats">
        <button
          type="button"
          className={`stat-card interactive ${filter === 'ALL' ? 'active' : ''
            }`}
          onClick={() => setFilter('ALL')}
        >
          <div className="stat-icon blue">📋</div>

          <div>
            <span>Total tasks</span>
            <strong>{counts.ALL}</strong>
          </div>
        </button>

        <button
          type="button"
          className={`stat-card interactive ${filter === 'IN_PROGRESS' ? 'active' : ''
            }`}
          onClick={() => setFilter('IN_PROGRESS')}
        >
          <div className="stat-icon purple">⚡</div>

          <div>
            <span>In progress</span>
            <strong>{counts.IN_PROGRESS}</strong>
          </div>
        </button>

        <button
          type="button"
          className={`stat-card interactive ${filter === 'DONE' ? 'active' : ''
            }`}
          onClick={() => setFilter('DONE')}
        >
          <div className="stat-icon green">✓</div>

          <div>
            <span>Completed</span>
            <strong>{counts.DONE}</strong>
          </div>
        </button>
      </div>

      {/* Tasks */}
      <section className="panel tasks-panel">

        <div className="panel-header">
          <div>
            <h2>Tasks</h2>
            <p>
              {shown.length} of {tasks.length} shown
            </p>
          </div>
        </div>

        {/* Add task */}
        <form
          className="task-add"
          onSubmit={addTask}
        >
          <input
            required
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="New task title"
          />

          <select
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            aria-label="Assign new task to"
          >
            <option value="">Unassigned</option>

            {members.map((member) => (
              <option
                key={member.userId}
                value={member.userId}
              >
                {member.name}
              </option>
            ))}
          </select>

          <button
            className="btn primary"
            disabled={saving || !title.trim()}
          >
            + Add task
          </button>
        </form>

        {/* Search / sort */}
        <div className="task-toolbar">

          <div className="search-box">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort tasks"
          >
            <option value="newest">Newest</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="title">Title</option>
          </select>
        </div>

        {/* Filters */}
        <div
          className="tabs"
          role="tablist"
          aria-label="Task filters"
        >
          {['ALL', ...STATUS].map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={filter === status}
              className={
                filter === status
                  ? 'tab on'
                  : 'tab'
              }
              onClick={() => setFilter(status)}
            >
              {label(status)}
              <span className="count">
                {counts[status]}
              </span>
            </button>
          ))}
        </div>

        {/* Empty */}
        {!shown.length ? (
          <div className="no-results">
            <div
              className="no-results-icon"
              aria-hidden="true"
            >
              {search || filter !== 'ALL' ? '🔍' : '✓'}
            </div>

            <h3>
              {search || filter !== 'ALL'
                ? 'No matching tasks'
                : 'No tasks yet'}
            </h3>

            <p>
              {search || filter !== 'ALL'
                ? 'Try changing your search or filter.'
                : 'Add your first task above to get started.'}
            </p>

            {(search || filter !== 'ALL') && (
              <button
                className="btn secondary"
                onClick={() => {
                  setSearch('');
                  setFilter('ALL');
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ul className="tasks">

            {shown.map((task) => (
              <li
                key={task._id}
                className={`task p-${task.priority}`}
              >
                <div className="task-main">

                  <div className="task-heading-row">
                    <button
                      type="button"
                      className="task-check"
                      title={
                        task.status === 'DONE'
                          ? 'Mark as incomplete'
                          : 'Mark as complete'
                      }
                      onClick={() =>
                        quick(task, {
                          status:
                            task.status === 'DONE'
                              ? 'TODO'
                              : 'DONE',
                        })
                      }
                    >
                      {task.status === 'DONE' ? '✓' : ''}
                    </button>

                    <div className="task-title-wrap">
                      <strong
                        className={
                          task.status === 'DONE'
                            ? 'done'
                            : ''
                        }
                      >
                        {task.title}
                      </strong>

                      {task.description && (
                        <p className="task-desc">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="task-controls">

                    <select
                      aria-label="Task status"
                      value={task.status}
                      onChange={(e) =>
                        quick(task, {
                          status: e.target.value,
                        })
                      }
                    >
                      {STATUS.map((status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {label(status)}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Task priority"
                      value={task.priority}
                      onChange={(e) =>
                        quick(task, {
                          priority: e.target.value,
                        })
                      }
                    >
                      {PRIORITY.map((priority) => (
                        <option
                          key={priority}
                          value={priority}
                        >
                          {label(priority)}
                        </option>
                      ))}
                    </select>

                    <span className="assignee">
                      <span
                        className="assignee-dot"
                        aria-hidden="true"
                      >
                        {(task.assignee?.name?.[0] || '?')
                          .toUpperCase()}
                      </span>

                      <select
                        aria-label="Task assignee"
                        value={task.assignee?._id || ''}
                        onChange={(e) =>
                          changeAssignee(task, e.target.value)
                        }
                      >
                        <option value="">Unassigned</option>

                        {/* Assignee who is no longer an org member */}
                        {task.assignee?._id &&
                          !members.some(
                            (m) => m.userId === task.assignee._id
                          ) && (
                            <option value={task.assignee._id} disabled>
                              {task.assignee.name} (former member)
                            </option>
                          )}

                        {members.map((member) => (
                          <option
                            key={member.userId}
                            value={member.userId}
                          >
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                </div>

                <div className="task-actions">

                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setEditing(task)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => deleteTask(task)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}

          </ul>
        )}
      </section>

      {/* Project modal */}
      {editing === 'project' && (
        <ProjectModal
          project={project}
          saving={saving}
          onClose={closeEditing}
          onSave={async (body) => {
            const success = await run(
              () =>
                api(`/projects/${id}`, {
                  method: 'PATCH',
                  body,
                }),
              'Project updated'
            );

            if (success) {
              setEditing(null);
            }
          }}
        />
      )}

      {/* Task modal */}
      {editing && editing !== 'project' && (
        <TaskModal
          task={editing}
          members={members}
          saving={saving}
          onClose={closeEditing}
          onSave={async (body) => {
            const success = await run(
              () =>
                api(`/tasks/${editing._id}`, {
                  method: 'PATCH',
                  body,
                }),
              'Task updated'
            );

            if (success) {
              setEditing(null);
            }
          }}
        />
      )}

      {/* Confirmation modal */}
      {confirm && (
        <Dialog
          title={confirm.title || 'Are you sure?'}
          onClose={closeConfirm}
        >
          <div className="modal-body">
            <p>{confirm.text}</p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={closeConfirm}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn danger solid"
                disabled={saving}
                onClick={async () => {
                  await confirm.onYes();
                  setConfirm(null);
                }}
              >
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ProjectModal({
  project,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({
    name: project.name,
    description: project.description || '',
  });

  const set = (key) => (e) =>
    setForm({
      ...form,
      [key]: e.target.value,
    });

  return (
    <Dialog
      title="Edit project"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name: form.name.trim(),
            description: form.description.trim(),
          });
        }}
      >
        <label>
          Name

          <input
            required
            autoFocus
            value={form.name}
            onChange={set('name')}
          />
        </label>

        <label>
          Description

          <textarea
            rows={4}
            value={form.description}
            onChange={set('description')}
          />
        </label>

        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="btn primary"
            disabled={saving || !form.name.trim()}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function TaskModal({
  task,
  members,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    status: task.status || 'TODO',
    priority: task.priority || 'MEDIUM',
    assignee: task.assignee?._id || '',
  });

  const set = (key) => (e) =>
    setForm({
      ...form,
      [key]: e.target.value,
    });

  const assigneeIsFormer =
    task.assignee?._id &&
    !members.some((m) => m.userId === task.assignee._id);

  return (
    <Dialog
      title="Edit task"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();

          onSave({
            ...form,
            title: form.title.trim(),
            description: form.description.trim(),
            assignee: form.assignee || null,
          });
        }}
      >
        <label>
          Title

          <input
            required
            autoFocus
            value={form.title}
            onChange={set('title')}
          />
        </label>

        <label>
          Description

          <textarea
            rows={4}
            value={form.description}
            onChange={set('description')}
          />
        </label>

        <div className="field-row">
          <label>
            Status

            <select
              value={form.status}
              onChange={set('status')}
            >
              {STATUS.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {label(status)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Priority

            <select
              value={form.priority}
              onChange={set('priority')}
            >
              {PRIORITY.map((priority) => (
                <option
                  key={priority}
                  value={priority}
                >
                  {label(priority)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Assignee

            <select
              value={form.assignee}
              onChange={set('assignee')}
            >
              <option value="">
                Unassigned
              </option>

              {assigneeIsFormer && (
                <option value={task.assignee._id} disabled>
                  {task.assignee.name} (former member)
                </option>
              )}

              {members.map((member) => (
                <option
                  key={member.userId}
                  value={member.userId}
                >
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="btn primary"
            disabled={
              saving ||
              !form.title.trim()
            }
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}