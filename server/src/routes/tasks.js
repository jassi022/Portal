import { Router } from 'express';
import mongoose from 'mongoose';
import { Task } from '../models/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import { taskBody, assertAssignable } from './projects.js';

const r = Router();
r.use(requireAuth);

async function loadTask(req) {
  if (!mongoose.isValidObjectId(req.params.taskId)) throw new HttpError(404, 'Not found');
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new HttpError(404, 'Not found');
  const membership = await requireMembership(req.user, task.organization);
  return { task, membership };
}

r.patch('/:taskId', wrap(async (req, res) => {
  const { task } = await loadTask(req);
  const body = taskBody.partial().parse(req.body);
  await assertAssignable(task.organization, body.assignee);
  Object.assign(task, body);
  res.json(await task.save());
}));

r.delete('/:taskId', wrap(async (req, res) => {
  const { task, membership } = await loadTask(req);
  const isCreator = String(task.createdBy) === String(req.user._id);
  if (membership.role !== 'ADMIN' && !isCreator) throw new HttpError(403, 'Only admins or the creator can delete');
  await task.deleteOne();
  res.status(204).end();
}));
export default r;
