import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Organization, Membership, Project, User } from '../models/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { requireAuth, requireMembership } from '../middleware/auth.js';

const r = Router();
r.use(requireAuth);

// Orgs I belong to (feeds the org switcher)
r.get('/', wrap(async (req, res) => {
  const ms = await Membership.find({ user: req.user._id }).populate('organization');
  res.json(ms.map((m) => ({ id: m.organization._id, name: m.organization.name, slug: m.organization.slug, role: m.role })));
}));

r.post('/', wrap(async (req, res) => {
  const { name } = z.object({ name: z.string().min(1).max(80) }).parse(req.body);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(3).toString('hex');
  const org = await Organization.create({ name, slug, createdBy: req.user._id });
  await Membership.create({ user: req.user._id, organization: org._id, role: 'ADMIN' });
  res.status(201).json({ id: org._id, name: org.name, slug: org.slug, role: 'ADMIN' });
}));

r.get('/:orgId', wrap(async (req, res) => {
  const m = await requireMembership(req.user, req.params.orgId);
  const org = await Organization.findById(req.params.orgId);
  const members = await Membership.find({ organization: org._id }).populate('user', 'name email');
  res.json({
    id: org._id, name: org.name, slug: org.slug, myRole: m.role,
    members: members.map((x) => ({ userId: x.user._id, name: x.user.name, email: x.user.email, role: x.role })),
  });
}));

// Admin adds an existing user by email
r.post('/:orgId/members', wrap(async (req, res) => {
  await requireMembership(req.user, req.params.orgId, { adminOnly: true });
  const { email, role } = z.object({ email: z.string().email(), role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER') }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new HttpError(404, 'No user with that email');
  await Membership.create({ user: user._id, organization: req.params.orgId, role }); // duplicate -> 409
  res.status(201).json({ userId: user._id, name: user.name, email: user.email, role });
}));

r.get('/:orgId/projects', wrap(async (req, res) => {
  await requireMembership(req.user, req.params.orgId);
  res.json(await Project.find({ organization: req.params.orgId }).sort({ createdAt: -1 }).populate('createdBy', 'name'));
}));

r.post('/:orgId/projects', wrap(async (req, res) => {
  await requireMembership(req.user, req.params.orgId);
  const body = z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).optional() }).parse(req.body);
  // organization comes from the validated URL, never from the request body
  res.status(201).json(await Project.create({ ...body, organization: req.params.orgId, createdBy: req.user._id }));
}));
export default r;
