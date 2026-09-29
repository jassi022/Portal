import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Project, Task, Membership } from '../models/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

// Load the project, THEN check membership of the project's own org.
async function loadProject(req) {
  if (!mongoose.isValidObjectId(req.params.projectId)) throw new HttpError(404, 'Not found');
  const project = await Project.findById(req.params.projectId);
  if (!project) throw new HttpError(404, 'Not found');
  const membership = await requireMembership(req.user, project.organization);
  return { project, membership };
}

export const taskBody = z.object({
  title: z.string().min(1).max(200), description: z.string().max(5000).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  assignee: z.string().nullable().optional(),
}).strict();

export async function assertAssignable(orgId, assignee) {
  if (!assignee) return;
  if (!mongoose.isValidObjectId(assignee) || !(await Membership.exists({ user: assignee, organization: orgId })))
    throw new HttpError(400, 'Assignee must be a member of this organization');
}

r.get('/:projectId', wrap(async (req, res) => res.json((await loadProject(req)).project)));

r.patch('/:projectId', wrap(async (req, res) => {
  const { project } = await loadProject(req);
  const body = z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(2000).optional() }).strict().parse(req.body);
  Object.assign(project, body);
  res.json(await project.save());
}));

r.delete('/:projectId', wrap(async (req, res) => {
  const { project, membership } = await loadProject(req);
  const isCreator = String(project.createdBy) === String(req.user._id);
  if (membership.role !== 'ADMIN' && !isCreator) throw new HttpError(403, 'Only admins or the creator can delete');
  await Task.deleteMany({ project: project._id });
  await project.deleteOne();
  res.status(204).end();
}));

r.get('/:projectId/tasks', wrap(async (req, res) => {
  const { project } = await loadProject(req);
  res.json(await Task.find({ project: project._id }).sort({ createdAt: -1 }).populate('assignee', 'name email'));
}));

r.post('/:projectId/tasks', wrap(async (req, res) => {
  const { project } = await loadProject(req);
  const body = taskBody.parse(req.body);
  await assertAssignable(project.organization, body.assignee);
  res.status(201).json(await Task.create({ ...body, project: project._id, organization: project.organization, createdBy: req.user._id }));
}));
export default r;
