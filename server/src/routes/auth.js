import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/index.js';
import { HttpError, wrap } from '../lib/http.js';
import { requireAuth, cookieOpts } from '../middleware/auth.js';

const r = Router();
const sign = (res, user) =>
  res.cookie('token', jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' }), cookieOpts());
const pub = (u) => ({ id: u._id, name: u.name, email: u.email });

r.post('/register', wrap(async (req, res) => {
  const { name, email, password } = z.object({
    name: z.string().min(1).max(80), email: z.string().email(), password: z.string().min(8).max(100),
  }).parse(req.body);
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  sign(res, user);
  res.status(201).json({ user: pub(user) });
}));

r.post('/login', wrap(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  sign(res, user);
  res.json({ user: pub(user) });
}));

r.post('/logout', (req, res) => { res.clearCookie('token', cookieOpts()); res.json({ ok: true }); });
r.get('/me', requireAuth, (req, res) => res.json({ user: pub(req.user) }));
export default r;
