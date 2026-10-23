# InterviewReady

A local interview coach for students and early-career job seekers. Enter a target role and optional job description, practice realistic questions, get specific written feedback, refine an answer, and leave with a scorecard and a focused practice plan.

Built for CS4680, Assignment 3: AI Assistant Project. Uses the **Groq API** for live inference. No deployment, database, paid hosting, or package installation is required.

## Run locally (student or grader)

Prerequisites: **Node.js 22 or newer**, a current browser, and **Make**. Download Node from https://nodejs.org. macOS/Linux generally provide Make through their developer tools; Windows users can use WSL or the Node-only commands below. Internet access is required for live Groq requests, but not the sample interview.

From this directory:

```sh
make setup
```

Open the newly created `.env` file in a text editor. Add a Groq API key from https://console.groq.com/keys:

```dotenv
GROQ_API_KEY=your_actual_key_here
GROQ_MODEL=openai/gpt-oss-20b
PORT=3000
```

Then:

```sh
make run
```

Open **http://127.0.0.1:3000**. Leave the terminal running. Press **Ctrl+C** to stop. Restart after changing `.env`. `make setup` preserves an existing `.env` file.

`make` alone also starts the app. If the port is occupied, change `PORT` in `.env`, restart, and open the new port. This app binds to `127.0.0.1` and is intended for local use only.

### Without Make (including Windows)

No `npm install` is needed. Copy `.env.example` to `.env` with your file manager, add your key, then run:

```sh
node --env-file-if-exists=.env server.mjs
```

Optional checks:

```sh
npm test
npm run check
```

### Without an API key

You can run `make run` immediately and click **Explore a sample interview**. The sample is explicitly labeled and contains fixed questions, answers, scores, and feedback. Editing a sample answer does not change its example feedback. Sample mode checks the UI flow; it is not the live AI functionality required for the assignment.

For a live demo or full grading, configure a working Groq key. The professor should use their own key, or the student can configure one privately on the grading machine. Never include a real key in the repository, assignment upload, screenshots, or a recorded video. `.env` is ignored by Git; `.env.example` is intentionally blank. The app never asks the browser to store a key.

## Use the app

1. Enter a role and optionally paste a job description (up to 6,000 characters).
2. Choose behavioral, technical, or mixed questions, a coaching style, and 3, 5, or 7 questions.
3. Answer the first question. Submit with the button or **Ctrl+Enter / Command+Enter**.
4. Read the feedback, scores, strengths, suggested improvements, and optional answer framing.
5. Choose **Refine this answer** to try again with the prior feedback in context. Each question allows four attempts total. Previous attempts remain visible.
6. Continue to the next question, which is generated alongside the feedback and responds to your answer.
7. View your scorecard after the last answer, or finish early after at least one scored answer. Download session notes as a text file.

The app preserves an in-progress session through page refresh in the same browser tab. Session state lives in the server's memory, expires after 12 idle hours, and is cleared when the server restarts. The browser's session storage holds only the current session ID and the unsent answer draft. Finish early scores only answered questions; an unanswered current question is excluded.

## Scoring

The AI scores each answer from 1–5 in four equally weighted areas:

| Criterion | What it measures |
| --- | --- |
| Relevance | Addresses the question and target role |
| Structure | Logical explanation, technical reasoning, or STAR story |
| Specificity | Concrete actions, examples, and outcomes |
| Clarity | Readability and focus of the written answer |

The scale is anchored in the prompt: 1 absent/off-topic, 2 vague/incomplete, 3 relevant with gaps, 4 strong with a minor gap, 5 complete and supported. Technical questions assess reasoning and tradeoffs rather than requiring STAR. The coach cannot assess spoken confidence from typed text.

Per-answer score = average of the four scores × 20. Final score = average of all four raw criterion scores across answered questions × 20, rounded to a whole number. Category averages are rounded to one decimal for display only. Only the **latest attempt for each answered question** counts. The revision comparison uses each question's first attempt, rather than assuming a revision must improve. Feedback is coaching guidance; scores are not calibrated hiring probabilities.

## Prompt engineering (course requirement)

Actual prompts, worked examples, schemas and validation live in `lib/coach.mjs`. The app's **How it works** dialog also explains these patterns for presentation.

1. **Persona pattern:** `PERSONA` defines an experienced, constructive interviewer, instructs it to tailor questions to the role and difficulty, sets rubric anchors, and asks it to avoid unsupported claims. This gives the experience a consistent coaching role.
2. **Few-shot pattern:** `EXAMPLES` includes two question/answer/evaluation exchanges: a vague teamwork claim with low scores, and a specific disagreement-resolution story with high scores. These examples demonstrate actionable feedback, score calibration and honest suggested rewrites.
3. **Iterative refinement:** `evaluate()` sends a revised answer together with the previous answer and evaluation. The model evaluates the new answer against the same rubric and explains improvements or remaining gaps. The UI preserves both versions and compares first/latest scores.

Structured JSON output is an additional reliability technique: the server sends a strict JSON Schema to Groq and also validates the returned content before accepting it. User content is serialized separately from the system persona and identified as untrusted data; this reduces, but cannot eliminate, prompt-injection risk. Suggested answers must use placeholders where the candidate has not supplied actual evidence.

## Architecture

```text
Browser UI → local Node HTTP server → Groq chat completions
                      ↓
               in-memory sessions
```

- `public/index.html`, `styles.css`, `app.js`: responsive, accessible web interface using native HTML/CSS/JavaScript. No framework or build step.
- `server.mjs`: local server, routes, request limits, server-owned sessions, static file allowlist, and error handling.
- `lib/coach.mjs`: prompt engineering, Groq client using native fetch, schemas, input/output validation, fixed sample content, and score calculation.
- `test/app.test.mjs`: automated integration and scoring checks using Node's built-in test runner and mocked Groq responses.

The API key stays server-side. Requests are limited in size, only expected public files are served, cross-origin requests are rejected, HTML output is escaped, and a Content Security Policy disallows external scripts. Sessions are not persisted to disk; restarting deliberately clears them. Live job descriptions and answers are sent to Groq, subject to the user's Groq account terms and quotas.

Default model: `openai/gpt-oss-20b`, **served by Groq**, using `https://api.groq.com/openai/v1/chat/completions`. No OpenAI API key or account is used. An alternative model configured through `GROQ_MODEL` must support strict structured outputs. Groq availability and free-plan quotas can change; consult your account limits.

## Checks

```sh
make check
make test
```

Tests require no credentials and make no external API calls. They cover sample and live session transitions, actual request payloads and credentials (with a mocked provider), prompt examples and revision context, latest-attempt score calculation, invalid input and model output, truncated responses, key/usage/server failures, secret exposure, static-file protection, and duplicate submission prevention. Passing these tests does not validate a real API key or a live provider response.

## Troubleshooting

- **Key needed:** add `GROQ_API_KEY` in `.env` and restart. A configured status means a key is present, not that Groq has validated it.
- **Key/access rejected:** check the key and model permissions in your Groq console.
- **Usage limit:** wait for the minute quota to reset or check the daily quota. Failed requests preserve the current draft and do not add a scored attempt.
- **Model/format error:** select a model with strict schema support; use the default first.
- **Timeout or network failure:** retry when connectivity returns. Requests time out after 45 seconds and do not retry automatically or silently substitute sample feedback.
- **Session expired:** server restarts clear sessions. Start a new interview.
- **Port in use:** change `PORT` in `.env`, restart and use that port in the browser.

## Submission and presentation

The assignment requires a GitHub repository with complete code/documentation, a live demo, and a published video of **less than two minutes** submitted through the specified course form. Hosting the app publicly is optional and is outside this project's scope. A suggested short video outline is in `DEMO.md`.

Before submission, configure a real key privately, run the checks, complete a real Groq interview including a revision, and verify that your recording demonstrates live AI rather than sample mode. Upload code to the repository without `.env`. Verify the due date in Canvas.

Official API references: [Groq quickstart](https://console.groq.com/docs/quickstart), [structured outputs](https://console.groq.com/docs/structured-outputs), [models](https://console.groq.com/docs/models), [rate limits](https://console.groq.com/docs/rate-limits).
