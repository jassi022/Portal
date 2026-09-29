import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Organization, Membership, Project, Task } from './models/index.js';

await mongoose.connect(process.env.MONGO_URI);
await Promise.all([User, Organization, Membership, Project, Task].map((m) => m.deleteMany({})));
const hash = await bcrypt.hash('Demo1234!', 12);
const demo = await User.create({ name: 'Demo User', email: 'demo@example.com', passwordHash: hash });
const other = await User.create({ name: 'Other User', email: 'other@example.com', passwordHash: hash });
const acme = await Organization.create({ name: 'Acme Inc.', slug: 'acme-inc', createdBy: demo._id });
const beta = await Organization.create({ name: 'Beta Labs', slug: 'beta-labs', createdBy: other._id });
await Membership.insertMany([
  { user: demo._id, organization: acme._id, role: 'ADMIN' },
  { user: demo._id, organization: beta._id, role: 'MEMBER' },
  { user: other._id, organization: beta._id, role: 'ADMIN' },
]);
const web = await Project.create({ name: 'Website Redesign', organization: acme._id, createdBy: demo._id });
const app = await Project.create({ name: 'Mobile Application', organization: beta._id, createdBy: other._id });
await Task.insertMany([
  { title: 'Design homepage', project: web._id, organization: acme._id, createdBy: demo._id, assignee: demo._id, priority: 'HIGH' },
  { title: 'Set up CI', project: app._id, organization: beta._id, createdBy: other._id, status: 'IN_PROGRESS' },
]);
console.log('Seeded. Login: demo@example.com / Demo1234!');
process.exit(0);
