export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const errorHandler = (err, req, res, next) => {
  if (err.name === 'ZodError') return res.status(400).json({ error: 'Invalid request', details: err.flatten().fieldErrors });
  if (err.code === 11000) return res.status(409).json({ error: 'Already exists' });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
