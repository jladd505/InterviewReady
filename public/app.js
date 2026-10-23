const $ = selector => document.querySelector(selector);
const main = $('#main');
const metrics = ['relevance', 'structure', 'specificity', 'clarity'];
const labels = { relevance: 'Relevance', structure: 'Structure', specificity: 'Specificity', clarity: 'Clarity' };
const descriptions = { relevance: 'Answer the question and connect to the role.', structure: 'Build a logical explanation or a complete STAR story.', specificity: 'Use concrete actions, examples and outcomes.', clarity: 'Make the answer focused and easy to follow.' };
let session = null;
let configured = false;
let busy = false;
let revising = false;
let setup = { role: '', description: '', type: 'Mixed', difficulty: 'Standard', count: 3 };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const average = scores => Math.round(metrics.reduce((n, m) => n + scores[m], 0) / 4 * 20);
function readStored(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function store(key, value) { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value); } catch { /* Storage may be disabled; the app still works. */ } }
function notify(message) {
  const toast = $('#notice'); toast.textContent = message; toast.hidden = false;
  clearTimeout(notify.timer); notify.timer = setTimeout(() => { toast.hidden = true; }, 7000);
}
async function api(path, data) {
  const response = await fetch(path, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Please try again.'); error.status = response.status; throw error; }
  return result;
}
function updateNav(view) {
  for (const name of ['setup', 'practice', 'results']) {
    const nav = $(`#nav-${name}`);
    nav.classList.toggle('active', name === view);
    nav.setAttribute('aria-current', name === view ? 'step' : 'false');
    nav.disabled = name === 'practice' ? !session || session.finished : name === 'results' ? !session?.finished : Boolean(session && !session.finished);
  }
  $('#page-name').textContent = { setup: 'Interview setup', practice: 'Practice room', results: 'Your scorecard' }[view];
}
function focusTitle() { const title = $('h1'); title?.setAttribute('tabindex', '-1'); title?.focus({ preventScroll: true }); }
function renderSetup() {
  updateNav('setup');
  main.innerHTML = `
    <section class="intro"><div class="eyebrow"><span class="tiny-star">✳</span> A LITTLE PRACTICE. A LOT MORE POSSIBILITY.</div><h1>Your next chapter<br>starts with <em>practice.</em></h1><p>Find your words. Build your confidence. Walk into your<br class="desktop-break"> next interview feeling a little more like yourself.</p></section>
    <div class="setup-grid">
      <section class="card setup-card"><div class="card-heading"><span class="step-badge">01</span><div><h2>Let’s set the scene</h2><p>Make this practice feel like the real thing.</p></div><span class="heading-arrow">↗</span></div>
        <form id="setup-form">
          <div class="field"><label for="role">What role are you preparing for? <span class="required">*</span></label><input id="role" name="role" placeholder="e.g. Junior Software Engineer" minlength="2" maxlength="120" required value="${esc(setup.role)}" autocomplete="organization-title"></div>
          <div class="field"><label for="description">Job description <span class="optional">optional</span></label><textarea id="description" name="description" rows="4" maxlength="6000" placeholder="Paste the description to get questions tailored to the opportunity…">${esc(setup.description)}</textarea><div class="field-hint">A little context helps your coach ask better questions.</div></div>
          <div class="field"><label for="type">Interview focus</label><div class="segmented" id="type-options" role="group" aria-label="Interview focus">${['Behavioral', 'Technical', 'Mixed'].map(type => `<button type="button" data-type="${type}" class="segment ${setup.type === type ? 'selected' : ''}" aria-pressed="${setup.type === type}">${type === 'Mixed' ? '✳ ' : ''}${type}</button>`).join('')}</div><input id="type" name="type" type="hidden" value="${setup.type}"></div>
          <div class="form-row"><div class="field"><label for="difficulty">Coaching style</label><select id="difficulty" name="difficulty">${['Supportive', 'Standard', 'Challenging'].map(v => `<option${setup.difficulty === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div><div class="field"><label for="count">Session length</label><select id="count" name="count">${[3, 5, 7].map(v => `<option value="${v}"${setup.count === v ? ' selected' : ''}>${v} questions</option>`).join('')}</select></div></div>
          <div id="form-error" class="error-box" role="alert" hidden></div>
          ${!configured ? '<div class="setup-tip"><span>ⓘ</span><div>One small setup step: add your Groq key to <code>.env</code> and restart the server for live coaching.</div></div>' : ''}
          <button id="start-button" class="button primary full" type="submit"${!configured ? ' disabled' : ''}><span>Enter the practice room</span><span>↗</span></button>
          <div class="under-button">Your pace. Your space. No pressure.</div>
        </form>
      </section>
      <aside class="setup-aside"><section class="preview-card"><div class="preview-top"><span class="pill">YOUR PERSONAL COACH</span><span>✳</span></div><div class="speech-art"><div class="bubble bubble-one">Tell me about a time…<span>•••</span></div><div class="bubble bubble-two"><span>✓</span> Let’s make that answer stronger.</div><div class="orbit">↗</div></div><h2>A better answer<br>starts with a conversation.</h2><p>Thoughtful questions. Useful feedback.<br>A chance to try again.</p><div class="preview-divider"></div><ol class="how-list"><li><span>1</span><div><strong>Make it relevant</strong><p>Questions shaped around your role.</p></div></li><li><span>2</span><div><strong>Get a fresh perspective</strong><p>Know what works and what to improve.</p></div></li><li><span>3</span><div><strong>See yourself grow</strong><p>Refine your answer. Track your progress.</p></div></li></ol></section>
      <button class="sample-link" id="sample-button" type="button"><span class="play-icon">▷</span><span>Just looking around?<strong>Explore a sample interview <span>↗</span></strong></span></button><p class="sample-caption">Fixed examples · no API key needed</p></aside>
    </div>`;
  $('#setup-form').addEventListener('submit', start);
  $('#type-options').addEventListener('click', event => {
    const button = event.target.closest('[data-type]'); if (!button) return;
    $('#type').value = button.dataset.type;
    document.querySelectorAll('[data-type]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button); });
  });
  $('#sample-button').onclick = () => start(null, true);
}
function saveSetup() {
  const form = $('#setup-form');
  if (form) { const data = new FormData(form); setup = { ...Object.fromEntries(data), count: Number(data.get('count')) }; }
}
async function start(event, demo = false) {
  event?.preventDefault(); if (busy) return;
  saveSetup(); busy = true;
  document.querySelectorAll('#setup-form button, #sample-button').forEach(b => { b.disabled = true; });
  const button = demo ? $('#sample-button') : $('#start-button');
  const old = button.innerHTML; button.textContent = demo ? 'Opening sample…' : 'Your coach is preparing a question…';
  try {
    session = await api('/api/sessions', demo ? { demo: true } : setup);
    store('ir-session', session.id); store('ir-draft', null); revising = false; renderPractice(); focusTitle();
  } catch (error) {
    button.innerHTML = old;
    const box = $('#form-error'); box.hidden = false; box.textContent = error.message;
    document.querySelectorAll('#setup-form button, #sample-button').forEach(b => { b.disabled = false; });
    $('#start-button').disabled = !configured;
  } finally { busy = false; }
}
function sampleBanner() { return session.demo ? '<div class="demo-banner"><span>◇</span><div><strong>Sample interview</strong> · Fixed example feedback, not an assessment of your answer. Live coaching uses Groq.</div></div>' : ''; }
function rubric(scores) {
  return `<div class="rubric">${metrics.map(m => `<div class="rubric-item"><div><span title="${descriptions[m]}">${labels[m]}</span><strong>${esc(scores[m])}<small>/5</small></strong></div><div class="score-track">${[1, 2, 3, 4, 5].map(n => `<span class="score-piece ${n <= scores[m] ? 'filled' : ''}"></span>`).join('')}</div></div>`).join('')}</div>`;
}
function renderPractice() {
  updateNav('practice');
  const index = session.turns.length - 1;
  const turn = session.turns[index];
  const attempt = turn.attempts.at(-1);
  const feedback = attempt?.feedback;
  const showForm = !attempt || revising;
  const draft = readStored('ir-draft');
  const answer = draft !== null ? draft : revising ? attempt.answer : session.demo ? sampleAnswers[index] : '';
  main.innerHTML = `${sampleBanner()}
    <section class="practice-intro"><div><div class="eyebrow">YOUR PRACTICE ROOM</div><h1>Take a breath.<br><em>You’ve got this.</em></h1><p>${esc(session.settings.role)} <span class="inline-dot">·</span> ${esc(session.settings.type)} <span class="inline-dot">·</span> ${esc(session.settings.difficulty)}</p></div><div class="session-progress"><span>QUESTION <strong>${index + 1} / ${session.settings.count}</strong></span><div class="progress-steps">${Array.from({ length: session.settings.count }, (_, i) => `<span class="${i <= index ? 'done' : ''}"></span>`).join('')}</div><button id="finish-early" class="text-button" type="button"${session.turns.some(t => t.attempts.length) ? '' : ' disabled'}>Finish & view scorecard ↗</button></div></section>
    <div class="practice-grid"><div>
      <section class="card question-card"><div class="question-label"><span class="coach-avatar">ir</span><div><strong>Your interview coach</strong><small>${session.demo ? 'Sample question' : 'Personalized for you'}</small></div><span class="pill">${esc(turn.focus)}</span></div><h2>${esc(turn.question)}</h2><div class="question-foot"><span>✳</span> Take your time. A thoughtful answer beats a rushed one.</div></section>
      <section class="card answer-card"><div class="answer-heading"><h2>${revising ? 'A fresh take' : 'Your answer'}</h2>${turn.attempts.length ? `<span class="pill">${revising ? `ATTEMPT ${turn.attempts.length + 1}` : `ATTEMPT ${turn.attempts.length}`}</span>` : '<span class="optional">A good place to start</span>'}</div>
        ${showForm ? `<form id="answer-form"><label class="sr-only" for="answer">Your interview answer</label><textarea id="answer" name="answer" rows="8" minlength="5" maxlength="6000" required placeholder="Start with the situation, share what you did, and tell us what changed…">${esc(answer)}</textarea><div class="answer-tools"><span id="word-count">0 words</span><span>⌘ / Ctrl + Enter to review</span></div><div id="answer-error" class="error-box" role="alert" hidden></div><div class="answer-actions">${revising ? '<button class="button secondary" id="cancel-revise" type="button">Keep previous answer</button>' : '<span class="subtle">Progress happens one answer at a time.</span>'}<button class="button primary" type="submit" id="review-button">${session.demo ? 'Show example feedback' : revising ? 'Review my revision' : 'Get my feedback'} <span>↗</span></button></div></form>` : `<p class="answer-text">${esc(attempt.answer)}</p>`}
      </section>
      ${feedback ? `<section class="card feedback-card" id="feedback"><div class="card-heading"><span class="step-badge">✳</span><div><h2>${session.demo ? 'Example feedback' : 'A fresh perspective'}</h2><p>${turn.attempts.length > 1 ? `Revision ${turn.attempts.length - 1} reviewed` : 'Here’s where you stand, and where to go next.'}</p></div><div class="mini-score">${average(feedback.scores)}<small>/100</small></div></div><p class="feedback-summary">${esc(feedback.summary)}</p>${rubric(feedback.scores)}<div class="feedback-columns"><div><h3><span>✓</span> What’s working</h3><ul>${feedback.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div><div><h3><span>↗</span> Make it stronger</h3><ul>${feedback.improvements.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div></div><details class="suggested"><summary>A possible way to frame it <span>+</span></summary><p>${esc(feedback.suggestedAnswer)}</p><small>Use your own experience. Bracketed details need your real evidence.</small></details>
      ${turn.attempts.length > 1 ? `<details class="attempts"><summary>See earlier attempts (${turn.attempts.length - 1})</summary>${turn.attempts.slice(0, -1).map((a, i) => `<article><strong>Attempt ${i + 1} · ${average(a.feedback.scores)}/100</strong><p>${esc(a.answer)}</p><p class="subtle">${esc(a.feedback.summary)}</p></article>`).join('')}</details>` : ''}
      ${!revising ? `<div class="feedback-actions"><button id="revise-button" class="button secondary" type="button"${turn.attempts.length >= 4 ? ' disabled' : ''}>${turn.attempts.length >= 4 ? 'All 4 attempts used' : '↻ Refine this answer'}</button><button id="next-button" class="button primary" type="button">${index + 1 === session.settings.count ? 'See my scorecard' : 'Next question'} <span>→</span></button></div>` : ''}</section>` : ''}
      ${index > 0 ? `<details class="card history"><summary>Your earlier questions <span>${index}</span></summary>${session.turns.slice(0, -1).map((t, i) => `<article><div class="eyebrow">QUESTION ${i + 1} · ${average(t.attempts.at(-1).feedback.scores)}/100</div><h3>${esc(t.question)}</h3><p>${esc(t.attempts.at(-1).answer)}</p></article>`).join('')}</details>` : ''}
    </div><aside class="practice-aside"><div class="coaching-note"><span class="eyebrow">A LITTLE GUIDANCE</span><h2>${session.settings.type === 'Technical' ? 'Think out loud.<br>Make it clear.' : 'Give your story<br>a little structure.'}</h2>${session.settings.type === 'Technical' ? '<p>State your assumptions. Explain your approach. Compare tradeoffs, then describe how you would verify the result.</p>' : '<div class="star-list"><div><span>S</span><p><strong>Situation</strong>Set the scene.</p></div><div><span>T</span><p><strong>Task</strong>What was your responsibility?</p></div><div><span>A</span><p><strong>Action</strong>What did you actually do?</p></div><div><span>R</span><p><strong>Result</strong>What changed? What did you learn?</p></div></div>'}<div class="note-divider"></div><p class="coach-tip">${session.settings.type === 'Mixed' ? 'For technical questions, explain assumptions, reasoning, tradeoffs and how you would test your approach.' : 'Small, specific details make a big difference. Keep it honest and make it yours.'}</p></div><p class="practice-caption">Practice scores assess your written answers.<br>They don’t predict hiring decisions.</p></aside></div>`;
  $('#finish-early').onclick = finish;
  if (showForm) {
    const input = $('#answer');
    const count = () => { const words = input.value.trim().split(/\s+/).filter(Boolean).length; $('#word-count').textContent = `${words} ${words === 1 ? 'word' : 'words'} · ${input.value.length}/6000 characters`; store('ir-draft', input.value); };
    input.addEventListener('input', count); count();
    $('#answer-form').addEventListener('submit', review);
    input.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); $('#answer-form').requestSubmit(); } });
    if (revising) $('#cancel-revise').onclick = () => { store('ir-draft', null); revising = false; renderPractice(); };
  }
  if ($('#revise-button')) $('#revise-button').onclick = () => { revising = true; store('ir-draft', null); renderPractice(); $('#answer').focus(); };
  if ($('#next-button')) $('#next-button').onclick = index + 1 === session.settings.count ? finish : next;
}
async function review(event) {
  event.preventDefault(); if (busy) return;
  const answer = $('#answer').value.trim();
  await action(async () => {
    session = await api(`/api/sessions/${session.id}/answer`, { answer });
    store('ir-draft', null); revising = false; renderPractice(); $('#feedback').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#feedback h2').setAttribute('tabindex', '-1'); $('#feedback h2').focus({ preventScroll: true });
  }, 'Your coach is reading…');
}
async function next() {
  await action(async () => { session = await api(`/api/sessions/${session.id}/next`, {}); store('ir-draft', null); renderPractice(); window.scrollTo({ top: 0, behavior: 'smooth' }); focusTitle(); });
}
async function finish() {
  await action(async () => { session = await api(`/api/sessions/${session.id}/finish`, {}); store('ir-draft', null); renderResults(); window.scrollTo({ top: 0, behavior: 'smooth' }); focusTitle(); });
}
async function action(fn, loadingText) {
  if (busy) return; busy = true;
  const controls = [...document.querySelectorAll('main button, main textarea')];
  const before = controls.map(c => c.disabled);
  controls.forEach(c => { c.disabled = true; });
  const button = $('#review-button'); const original = button?.innerHTML;
  if (button && loadingText) { button.textContent = loadingText; button.classList.add('loading'); }
  main.setAttribute('aria-busy', 'true');
  try { await fn(); }
  catch (error) {
    const box = $('#answer-error');
    if (box) { box.hidden = false; box.textContent = error.message; } else notify(error.message || 'Connection lost. Check that the local server is running.');
    if (error.status === 404) { store('ir-session', null); notify('The server restarted or the session expired. Use Start a new interview to continue.'); addRestart(); }
  } finally {
    busy = false; main.setAttribute('aria-busy', 'false');
    controls.forEach((c, i) => { c.disabled = before[i]; });
    if (button?.isConnected) { button.innerHTML = original; button.classList.remove('loading'); }
  }
}
function addRestart() {
  if ($('#restart-expired')) return;
  const button = document.createElement('button'); button.id = 'restart-expired'; button.className = 'button secondary'; button.textContent = 'Start a new interview'; button.onclick = reset; main.prepend(button);
}
function renderResults() {
  updateNav('results');
  const report = session.report;
  const revised = session.turns.some(t => t.attempts.length > 1);
  const delta = report.overall - report.initial;
  main.innerHTML = `${sampleBanner()}<section class="results-intro"><div class="eyebrow">YOUR SESSION, REFLECTED</div><h1>Look at you.<br><em>One step more ready.</em></h1><p>${esc(session.settings.role)} · ${report.completed} of ${session.settings.count} questions completed</p></section>
    <div class="results-grid"><section class="score-card"><span class="eyebrow">${session.demo ? 'SAMPLE PRACTICE SCORE' : 'YOUR PRACTICE SCORE'}</span><div class="big-score">${report.overall}<span>/100</span></div><span class="score-label">${report.overall >= 80 ? 'A strong foundation' : report.overall >= 60 ? 'Building momentum' : 'A place to grow'}</span><p>Based on your latest answer<br>to each completed question.</p>${revised ? `<div class="improvement-chip">${delta > 0 ? '+' : ''}${delta} ${Math.abs(delta) === 1 ? 'point' : 'points'} from first attempts</div>` : '<div class="improvement-chip">Practice is progress. Keep going.</div>'}</section>
    <section class="card breakdown"><div class="card-heading"><div><h2>The details that matter</h2><p>Your average in each area, on a five-point scale.</p></div><span class="heading-arrow">↗</span></div>${metrics.map(m => `<div class="breakdown-row"><div><strong>${labels[m]}</strong><p>${descriptions[m]}</p></div><strong class="metric-number">${report.averages[m].toFixed(1)}<small>/5</small></strong></div>`).join('')}</section></div>
    <section class="card next-steps"><div><span class="eyebrow">TAKE THIS WITH YOU</span><h2>Your next small steps</h2><p>A focused practice plan for your next session.</p></div><ol>${report.improvements.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
    <section class="session-review"><h2>Your interview, question by question</h2>${session.turns.filter(t => t.attempts.length).map((turn, i) => `<details class="card review-item"><summary><span class="review-number">0${i + 1}</span><span>${esc(turn.question)}</span><strong>${average(turn.attempts.at(-1).feedback.scores)}<small>/100</small></strong><span>+</span></summary><div class="review-body">${turn.attempts.map((a, j) => `<article><h3>Attempt ${j + 1} · ${average(a.feedback.scores)}/100</h3><p class="answer-text">${esc(a.answer)}</p><p>${esc(a.feedback.summary)}</p><h4>To improve</h4><ul>${a.feedback.improvements.map(s => `<li>${esc(s)}</li>`).join('')}</ul></article>`).join('')}</div></details>`).join('')}</section>
    <div class="results-actions"><button id="new-session" class="button primary" type="button">Practice again <span>↗</span></button><button id="export-button" class="button secondary" type="button">↓ Download session notes</button><span>Keep the insights. Come back when you’re ready.</span></div>`;
  $('#new-session').onclick = reset;
  $('#export-button').onclick = download;
}
function reset() { if (busy) return; session = null; revising = false; store('ir-session', null); store('ir-draft', null); renderSetup(); window.scrollTo(0, 0); focusTitle(); }
function download() {
  const r = session.report;
  let notes = `InterviewReady — ${session.demo ? 'SAMPLE (fixed example feedback)' : 'Practice session'}\nRole: ${session.settings.role}\nFocus: ${session.settings.type}\nScore: ${r.overall}/100 (${r.completed}/${session.settings.count} questions completed)\nScores reflect latest attempts; they are coaching feedback, not a hiring prediction.\n\n`;
  for (const metric of metrics) notes += `${labels[metric]}: ${r.averages[metric]}/5\n`;
  notes += '\nPractice plan\n' + r.improvements.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n';
  session.turns.forEach((t, i) => { notes += `\nQUESTION ${i + 1}: ${t.question}\n`; t.attempts.forEach((a, j) => { notes += `\nAttempt ${j + 1} (${average(a.feedback.scores)}/100)\n${a.answer}\n\nFeedback: ${a.feedback.summary}\nStrengths:\n${a.feedback.strengths.map(s => '- ' + s).join('\n')}\nImprovements:\n${a.feedback.improvements.map(s => '- ' + s).join('\n')}\nPossible framing: ${a.feedback.suggestedAnswer}\n`; }); });
  const url = URL.createObjectURL(new Blob([notes], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'interviewready-session.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const sampleAnswers = [
  'In a four-person class project, we disagreed about SQL versus MongoDB. I owned the data layer, so I asked each teammate to explain their needs, documented our query requirements, and prototyped both. We agreed on SQL because the data was relational. We finished the data layer before our milestone, and I learned to use shared criteria instead of preferences.',
  'I would first check when the slowdown started and which endpoints are affected. I would inspect latency metrics and logs, then trace a slow request through the application and database. I would compare recent deployments, check slow queries and connection pools, and measure the bottleneck before changing anything. After a fix, I would compare p95 latency and error rate with the baseline.',
  'For a class project I had to learn React in one week. I read the introductory documentation, built a small practice form, then used that pattern in our app. I asked a teammate to review the component and fixed a state update bug. We completed the feature on time. Next time I would write down the data flow before coding because that was the part I initially misunderstood.',
];
$('#about-button').onclick = () => $('#about-dialog').showModal();
$('#close-about').onclick = () => $('#about-dialog').close();
$('#about-dialog').onclick = event => { if (event.target === $('#about-dialog')) $('#about-dialog').close(); };
$('#nav-setup').onclick = () => { if (!busy) session?.finished ? reset() : renderSetup(); };
$('#nav-practice').onclick = () => { if (!busy && session && !session.finished) renderPractice(); };
$('#nav-results').onclick = () => { if (!busy && session?.finished) renderResults(); };
async function init() {
  try {
    const status = await api('/api/status'); configured = status.configured;
    $('#connection').innerHTML = `<span class="status-dot ${configured ? 'ready' : ''}"></span>${configured ? 'Groq · key configured' : 'Groq · key needed'}`;
    const saved = readStored('ir-session');
    if (saved) {
      try {
        session = await api(`/api/sessions/${saved}`);
        const attempts = session.turns.at(-1).attempts.length;
        revising = !session.finished && attempts > 0 && attempts < 4 && readStored('ir-draft') !== null;
      }
      catch (error) { if (error.status === 404) { store('ir-session', null); store('ir-draft', null); notify('Your previous session expired or the server restarted. Start fresh below.'); } else throw error; }
    }
    session ? session.finished ? renderResults() : renderPractice() : renderSetup();
  } catch { main.innerHTML = '<section class="card offline"><h1>Let’s reconnect.</h1><p>The local server could not be reached. Run <code>make run</code>, then refresh this page.</p><a class="button primary" href="/">Try again ↗</a></section>'; $('#connection').textContent = 'Server unavailable'; }
}
init();
