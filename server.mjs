import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AppError, createCoach, validateSettings, validateAnswer, SAMPLE, sampleFeedback, scorecard } from './lib/coach.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
async function body(req) {
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (Buffer.byteLength(input) > 24000) throw new AppError('Request is too large.', 413);
  }
  try { return JSON.parse(input); } catch { throw new AppError('Send a valid JSON request.'); }
}
export function createApp({ apiKey = process.env.GROQ_API_KEY, model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b', fetchImpl } = {}) {
  const sessions = new Map();
  const coach = createCoach({ apiKey, model, fetchImpl });
  const serialize = s => ({ ...s, busy: undefined, lastActive: undefined, report: scorecard(s.turns) });
  return http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      // Bind locally and reject cross-origin requests to the local server.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new AppError('Cross-origin requests are not allowed.', 403);
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) throw new AppError('Use localhost or 127.0.0.1 to open this app.', 403);
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, { configured: Boolean(apiKey), model });
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) throw new AppError('Content-Type must be application/json.', 415);
      // Sessions live only in this local process; expire after 12 hours, and bound memory use.
      for (const [id, session] of sessions) if (!session.busy && Date.now() - session.lastActive > 12 * 3600000) sessions.delete(id);
      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const input = await body(req);
        const demo = input.demo === true;
        const settings = demo ? { role: 'Junior Software Engineer', description: 'Work on a collaborative team building web applications and APIs.', type: 'Mixed', difficulty: 'Supportive', count: 3 } : validateSettings(input);
        if (sessions.size >= 100) throw new AppError('Session capacity reached. Restart the local server to clear old sessions.', 503);
        const first = demo ? SAMPLE[0] : await coach.first(settings);
        const session = { id: randomUUID(), demo, settings, turns: [{ question: first.question, focus: first.focus, attempts: [] }], finished: false, busy: false, lastActive: Date.now() };
        sessions.set(session.id, session);
        return send(201, serialize(session));
      }
      const match = url.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(answer|next|finish))?$/);
      if (match) {
        const session = sessions.get(match[1]);
        if (!session) throw new AppError('This session expired or the server restarted. Start a new interview.', 404);
        session.lastActive = Date.now();
        if (req.method === 'GET' && !match[2]) return send(200, serialize(session));
        if (req.method !== 'POST' || !match[2]) throw new AppError('Method not allowed.', 405);
        if (session.busy) throw new AppError('An answer is already being reviewed. Please wait.', 409);
        if (session.finished) throw new AppError('This interview is finished. Start a new session to keep practicing.', 409);
        const current = session.turns.at(-1);
        if (match[2] === 'answer') {
          session.busy = true;
          try {
            const input = await body(req);
            const answer = validateAnswer(input.answer);
            if (current.attempts.length >= 4) throw new AppError('You have used all four attempts for this question. Continue to the next question.', 409);
            const feedback = session.demo ? sampleFeedback(session.turns.length - 1) : await coach.evaluate(session, answer);
            current.attempts.push({ answer, feedback });
          } finally { session.busy = false; }
        } else if (match[2] === 'next') {
          if (!current.attempts.length) throw new AppError('Review your answer before continuing.', 409);
          if (session.turns.length >= session.settings.count) throw new AppError('You have reached the final question. View your scorecard.', 409);
          const last = current.attempts.at(-1).feedback;
          session.turns.push({ question: last.nextQuestion, focus: last.nextFocus, attempts: [] });
        } else {
          if (!session.turns.some(t => t.attempts.length)) throw new AppError('Complete at least one answer before viewing your scorecard.', 409);
          session.finished = true;
        }
        return send(200, serialize(session));
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(await readFile(new URL(`./public/${name}`, import.meta.url)));
      }
      throw new AppError('Not found.', 404);
    } catch (error) {
      if (res.headersSent) return res.end();
      send(error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.' });
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT must be an integer between 1 and 65535.'); process.exit(1); }
  const server = createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop that app or set a different PORT in .env.` : 'Could not start the local server.'); process.exit(1); });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  InterviewReady → http://127.0.0.1:${port}\n  ${process.env.GROQ_API_KEY ? 'Groq connected: key configured (validated on first interview).' : 'Sample mode available. Add GROQ_API_KEY to .env for live interviews.'}\n  Press Ctrl+C to stop.\n`);
  });
}
