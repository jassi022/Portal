# Multi-Tenant Project Portal (MERN)

Organizations → Memberships → Projects → Tasks, with server-side tenant isolation.
**Stack:** MongoDB + Mongoose, Express, React (Vite), Node. JWT in an httpOnly cookie.

## Local setup
```bash
# API
cd server && npm install && cp .env.example .env   # fill MONGO_URI + JWT_SECRET
npm run seed && npm run dev                         # http://localhost:4000
# Frontend (new terminal)
cd client && npm install && npm run dev             # http://localhost:5173 (proxies /api to :4000)
```
Demo login (after seed): `demo@example.com` / `Demo1234!` — member of **Acme Inc.** (admin) and **Beta Labs** (member).

## Environment variables
Server (`server/.env.example`): `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (exact frontend URL, used for CORS), `NODE_ENV`.
Client (`client/.env.example`): `VITE_API_URL` (empty locally; deployed API URL in production).

## API
| | |
|--|--|
| POST /api/auth/register · login · logout, GET /api/auth/me | auth |
| GET/POST /api/organizations, GET /api/organizations/:id | orgs |
| POST /api/organizations/:id/members | admin adds member by email |
| GET/POST /api/organizations/:id/projects | projects in org |
| GET/PATCH/DELETE /api/projects/:id | project |
| GET/POST /api/projects/:id/tasks | tasks |
| PATCH/DELETE /api/tasks/:id | task |

## Data model
`User`, `Organization`, `Membership(user, organization, role ADMIN|MEMBER)` with a unique `(user, organization)` index,
`Project(organization)`, `Task(project, organization, assignee)`. Task stores `organization` (copied from its project)
so tenant checks need one lookup. Indexes: `projects {organization, createdAt}`, `tasks {project, createdAt}`, `tasks {organization}`.

## How tenant isolation works
1. `requireAuth` reads the JWT cookie and loads the user.
2. Every org-scoped route calls `requireMembership(user, orgId)`, which queries `Membership` in the DB.
3. For `/projects/:id` and `/tasks/:id` the server loads the resource **first**, then checks membership in the *resource's own* organization. Client-sent org IDs are never trusted; `organization` on create comes from the validated URL, and request bodies are `.strict()` so `organization` cannot be injected or changed.
4. Assignees must be members of the same org.
5. Non-members get **404** (not 403) so resource existence isn't disclosed. Members lacking the role get **403**.
Roles: ADMIN can manage members and delete anything; MEMBER can create/edit, and delete only what they created.

## Trade-offs / limitations
- httpOnly cookie instead of localStorage token (XSS-safe); cross-site deploys need `SameSite=None; Secure` (already set in production) and correct `CLIENT_ORIGIN`. CSRF is mitigated by SameSite + JSON-only APIs, but no CSRF token yet.
- Members are added only if the user already has an account (no invite emails).
- No pagination, rate limiting, or automated tests yet; next: supertest cross-tenant tests, refresh tokens, audit log.

## Deployment
API → Render/Railway (set env vars, `npm start`); DB → MongoDB Atlas (allow the host's IP); frontend → Vercel/Netlify (`VITE_API_URL` = API URL, build `npm run build`, output `dist`). Run `npm run seed` once against the Atlas URI.

## MongoDB configuration
Uses MongoDB Atlas (or local MongoDB). Create a database user with read/write access, allow your IP under Network Access, and put the connection string in `server/.env` as `MONGO_URI` (database name at the end, e.g. `/portal`). Collections and indexes are created automatically. `npm run seed` resets and fills demo data.

## Tests
`cd server && npm test` — runs tenant-isolation and authorization tests (cross-org read/update/delete, body injection, assignee validation, role checks) against a separate `portal_test` database derived from `MONGO_URI`.