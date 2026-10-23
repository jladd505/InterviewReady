import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { scorecard, validateSettings, validFeedback, sampleFeedback } from '../lib/coach.mjs';

async function serve(t, options = {}) {
  const server = createApp({ apiKey: '', ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, data, headers = {}) => {
    const response = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    const value = response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : await response.text();
    return { status: response.status, value, headers: response.headers };
  };
}
const settings = { role: 'Junior Engineer', description: 'Build reliable APIs.', type: 'Mixed', difficulty: 'Standard', count: 3 };
const envelope = (data, reason = 'stop') => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason: reason }] }), { status: 200 });

test('sample interview supports complete flow, revision history, and final-state protection without calling Groq', async t => {
  const request = await serve(t, { fetchImpl: () => { throw new Error('Sample mode must not call Groq'); } });
  const status = await request('/api/status'); assert.equal(status.value.configured, false);
  let { status: code, value: session } = await request('/api/sessions', { demo: true });
  assert.equal(code, 201); assert.equal(session.demo, true);
  const base = `/api/sessions/${session.id}`;
  assert.equal((await request(base + '/next', {})).status, 409);
  assert.equal((await request(base + '/finish', {})).status, 409);
  for (let i = 0; i < 3; i++) {
    const result = await request(base + '/answer', { answer: 'This is a sample answer to explore the workflow.' });
    assert.equal(result.status, 200); session = result.value;
    if (i === 0) {
      const revised = await request(base + '/answer', { answer: 'This is a revised example answer with more context.' });
      assert.equal(revised.value.turns[0].attempts.length, 2);
    }
    if (i < 2) { const next = await request(base + '/next', {}); assert.equal(next.status, 200); }
  }
  assert.equal((await request(base + '/next', {})).status, 409);
  const finished = await request(base + '/finish', {});
  assert.equal(finished.value.finished, true); assert.equal(finished.value.report.completed, 3);
  assert.equal((await request(base + '/answer', { answer: 'More text' })).status, 409);
  assert.equal((await request(base)).value.id, session.id);
});

test('live flow sends server-side credentials, schema, few-shot anchors, settings and revision context', async t => {
  const requests = [];
  const request = await serve(t, { apiKey: 'test-secret', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    const payload = JSON.parse(options.body); requests.push(payload);
    assert.equal(payload.response_format.json_schema.strict, true);
    return envelope(requests.length === 1 ? { question: 'Describe your API experience.', focus: 'Experience' } : sampleFeedback(0));
  } });
  const start = await request('/api/sessions', settings); assert.equal(start.status, 201);
  const id = start.value.id;
  assert.equal((await request(`/api/sessions/${id}/answer`, { answer: 'I built a REST API for our course project.' })).status, 200);
  assert.equal((await request(`/api/sessions/${id}/answer`, { answer: 'I designed and tested a REST API, then documented it for teammates.' })).status, 200);
  const context = JSON.parse(requests[2].messages.at(-1).content);
  assert.equal(context.settings.role, settings.role);
  assert.equal(context.refinement.previousAnswer, 'I built a REST API for our course project.');
  assert.equal(requests[1].messages.filter(m => m.role === 'assistant').length, 2);
  const publicData = JSON.stringify((await request(`/api/sessions/${id}`)).value);
  assert.ok(!publicData.includes('test-secret'));
  const next = await request(`/api/sessions/${id}/next`, {});
  assert.equal(next.value.turns[1].question, sampleFeedback(0).nextQuestion);
});

test('scorecard uses latest attempts and excludes unanswered questions', () => {
  const feedback = value => ({ ...sampleFeedback(0), scores: { relevance: value, structure: value, specificity: value, clarity: value } });
  const result = scorecard([{ attempts: [{ feedback: feedback(1) }, { feedback: feedback(5) }] }, { attempts: [] }, { attempts: [{ feedback: feedback(3) }] }]);
  assert.equal(result.overall, 80); assert.equal(result.initial, 40); assert.equal(result.completed, 2);
  assert.equal(result.averages.clarity, 4);
});

test('missing key, invalid input, missing session and cross-origin requests produce useful errors', async t => {
  const request = await serve(t);
  const missing = await request('/api/sessions', settings);
  assert.equal(missing.status, 503); assert.match(missing.value.error, /GROQ_API_KEY/);
  assert.equal((await request('/api/sessions', { ...settings, count: 100 })).status, 400);
  assert.equal((await request('/api/sessions/missing')).status, 404);
  assert.equal((await request('/api/status', undefined, { Origin: 'https://another-site.example' })).status, 403);
  const html = await request('/'); assert.equal(html.status, 200); assert.match(html.value, /InterviewReady/);
  assert.ok(html.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal((await request('/.env')).status, 404);
  assert.equal((await request('/server.mjs')).status, 404);
  assert.throws(() => validateSettings({ ...settings, role: '' }));
  assert.equal(validFeedback({ ...sampleFeedback(0), scores: { relevance: 10 } }), false);
});

test('rounding cannot fabricate improvement when revisions receive identical scores', () => {
  const turns = [0, 1, 2].map(i => ({ attempts: [{ feedback: sampleFeedback(i) }, { feedback: sampleFeedback(i) }] }));
  const result = scorecard(turns);
  assert.equal(result.overall, 93);
  assert.equal(result.overall, result.initial);
  assert.equal(result.averages.structure, 4.7);
});

for (const upstreamStatus of [401, 429, 500]) {
  test(`Groq ${upstreamStatus} errors do not expose secrets or destroy the draft/session`, async t => {
    let calls = 0;
    const request = await serve(t, { apiKey: 'hidden-secret', fetchImpl: async () => ++calls === 1 ? envelope({ question: 'Tell me about a project.', focus: 'Projects' }) : new Response('hidden-secret', { status: upstreamStatus }) });
    const { value: session } = await request('/api/sessions', settings);
    const result = await request(`/api/sessions/${session.id}/answer`, { answer: 'I built a project for class.' });
    assert.equal(result.status, upstreamStatus === 429 ? 429 : 502);
    assert.ok(!JSON.stringify(result.value).includes('hidden-secret'));
    assert.equal((await request(`/api/sessions/${session.id}`)).value.turns[0].attempts.length, 0);
  });
}

test('invalid and truncated model responses are rejected before state changes', async t => {
  let calls = 0;
  const request = await serve(t, { apiKey: 'test', fetchImpl: async () => {
    calls++;
    if (calls === 1) return envelope({ question: 'Tell me about a project.', focus: 'Projects' });
    if (calls === 2) return envelope({ ...sampleFeedback(0), scores: { relevance: 500 } });
    if (calls === 3) return envelope(sampleFeedback(0), 'length');
    return envelope(sampleFeedback(0));
  } });
  const { value: session } = await request('/api/sessions', settings);
  const path = `/api/sessions/${session.id}`;
  assert.equal((await request(path + '/answer', { answer: 'A project example.' })).status, 502);
  assert.equal((await request(path + '/answer', { answer: 'A project example.' })).status, 502);
  assert.equal((await request(path + '/answer', { answer: 'A project example.' })).status, 200);
  assert.equal((await request(path)).value.turns[0].attempts.length, 1);
});

test('parallel submissions cannot double-score a question', async t => {
  let calls = 0; let release; let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const request = await serve(t, { apiKey: 'test', fetchImpl: async () => {
    if (++calls === 1) return envelope({ question: 'Tell me about a project.', focus: 'Projects' });
    entered(); await gate; return envelope(sampleFeedback(0));
  } });
  const { value: session } = await request('/api/sessions', settings);
  const path = `/api/sessions/${session.id}/answer`;
  const pending = request(path, { answer: 'A project example.' });
  await ready;
  const concurrent = await request(path, { answer: 'Another project example.' });
  release(); assert.equal(concurrent.status, 409); assert.equal((await pending).status, 200);
});
