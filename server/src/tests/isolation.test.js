// Runs against a SEPARATE database (portal_test) derived from MONGO_URI. Never touches your real data.
import 'dotenv/config';
import dns from 'dns';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

dns.setServers(['8.8.8.8', '1.1.1.1']);
const { default: app } = await import('../src/app.js');
const pw = 'Password123';
let alice, bob, carol, orgA, projA, taskA, orgB;

const signup = async (name) => {
    const a = request.agent(app);
    await a.post('/api/auth/register').send({ name, email: `${name}@t.io`, password: pw }).expect(201);
    return a;
};

before(async () => {
    await mongoose.connect(process.env.MONGO_URI.replace(/\/[^/?]*\?/, '/portal_test?'));
    await mongoose.connection.dropDatabase();
    [alice, bob, carol] = [await signup('alice'), await signup('bob'), await signup('carol')];
    orgA = (await alice.post('/api/organizations').send({ name: 'Org A' })).body;
    orgB = (await bob.post('/api/organizations').send({ name: 'Org B' })).body;
    projA = (await alice.post(`/api/organizations/${orgA.id}/projects`).send({ name: 'Secret' })).body;
    taskA = (await alice.post(`/api/projects/${projA._id}/tasks`).send({ title: 'Secret task' })).body;
    await alice.post(`/api/organizations/${orgA.id}/members`).send({ email: 'carol@t.io' }).expect(201);
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('unauthenticated requests get 401', async () => {
    await request(app).get('/api/organizations').expect(401);
});
test('non-member cannot read another org or its project list', async () => {
    await bob.get(`/api/organizations/${orgA.id}`).expect(404);
    await bob.get(`/api/organizations/${orgA.id}/projects`).expect(404);
});
test('non-member cannot read/update/delete another org project', async () => {
    await bob.get(`/api/projects/${projA._id}`).expect(404);
    await bob.patch(`/api/projects/${projA._id}`).send({ name: 'hacked' }).expect(404);
    await bob.delete(`/api/projects/${projA._id}`).expect(404);
    await bob.get(`/api/projects/${projA._id}/tasks`).expect(404);
});
test('non-member cannot touch another org task or create one', async () => {
    await bob.patch(`/api/tasks/${taskA._id}`).send({ status: 'DONE' }).expect(404);
    await bob.delete(`/api/tasks/${taskA._id}`).expect(404);
    await bob.post(`/api/projects/${projA._id}/tasks`).send({ title: 'x' }).expect(404);
});
test('client cannot inject organization via body', async () => {
    await alice.post(`/api/projects/${projA._id}/tasks`).send({ title: 'x', organization: orgB.id }).expect(400);
    await alice.patch(`/api/projects/${projA._id}`).send({ organization: orgB.id }).expect(400);
});
test('task cannot be assigned to a user outside the org', async () => {
    const me = (await bob.get('/api/auth/me')).body.user;
    await alice.patch(`/api/tasks/${taskA._id}`).send({ assignee: me.id }).expect(400);
});
test('regular member can read but not manage members (403)', async () => {
    await carol.get(`/api/projects/${projA._id}`).expect(200);
    await carol.post(`/api/organizations/${orgA.id}/members`).send({ email: 'bob@t.io' }).expect(403);
    await carol.delete(`/api/projects/${projA._id}`).expect(403);
});
test('invalid ids return 404, not a crash', async () => {
    await alice.get('/api/projects/not-an-id').expect(404);
});