import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Membership } from '../models/index.js';
import { HttpError, wrap } from '../lib/http.js';

export const cookieOpts = () => ({
  httpOnly: true, // browser JS can't read it -> protects token from XSS
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 3600 * 1000,
});

export const requireAuth = wrap(async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) throw new HttpError(401, 'Not authenticated');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { throw new HttpError(401, 'Invalid or expired session'); }
  const user = await User.findById(payload.sub).select('-passwordHash');
  if (!user) throw new HttpError(401, 'Not authenticated');
  req.user = user;
  next();
});

/**
 * THE tenant-isolation gate. Every org-scoped route calls this; it checks the
 * DB (never the client) for a membership. Non-members get 404 so we don't
 * reveal that the resource exists. Members lacking the role get 403.
 */
export async function requireMembership(user, orgId, { adminOnly = false } = {}) {
  if (!mongoose.isValidObjectId(orgId)) throw new HttpError(404, 'Not found');
  const m = await Membership.findOne({ user: user._id, organization: orgId });
  if (!m) throw new HttpError(404, 'Not found');
  if (adminOnly && m.role !== 'ADMIN') throw new HttpError(403, 'Admin role required');
  return m;
}
