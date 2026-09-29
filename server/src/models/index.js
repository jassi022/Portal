import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (name, extra = {}) => ({ type: Schema.Types.ObjectId, ref: name, ...extra });

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true }));

export const Organization = model('Organization', new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  createdBy: ref('User', { required: true }),
}, { timestamps: true }));

// Join table: lets a user belong to MANY orgs, with a role per org.
const membershipSchema = new Schema({
  user: ref('User', { required: true }),
  organization: ref('Organization', { required: true }),
  role: { type: String, enum: ['ADMIN', 'MEMBER'], default: 'MEMBER' },
}, { timestamps: true });
membershipSchema.index({ user: 1, organization: 1 }, { unique: true });
membershipSchema.index({ organization: 1 });
export const Membership = model('Membership', membershipSchema);

const projectSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  organization: ref('Organization', { required: true }),
  createdBy: ref('User', { required: true }),
}, { timestamps: true });
projectSchema.index({ organization: 1, createdAt: -1 });
export const Project = model('Project', projectSchema);

const taskSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['TODO', 'IN_PROGRESS', 'DONE'], default: 'TODO' },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  project: ref('Project', { required: true }),
  organization: ref('Organization', { required: true }), // copied from project: direct tenant check
  assignee: ref('User', { default: null }),
  createdBy: ref('User', { required: true }),
}, { timestamps: true });
taskSchema.index({ project: 1, createdAt: -1 });
taskSchema.index({ organization: 1 });
export const Task = model('Task', taskSchema);
