# InterviewReady: presentation and short-video guide

This is a suggested outline, not a completed presentation or recording. Use a real configured Groq key for the live demo. Keep `.env` and credentials out of the recording.

## Under-two-minute video (target 100–110 seconds)

- **0–12 seconds — Problem:** Students often do not know what to practice or how to improve vague interview answers. InterviewReady provides focused questions, feedback and another try.
- **12–28 seconds — Setup:** Show the app running locally. Enter “Junior Software Engineer,” paste a short role description, select Mixed and three questions, and start a live interview.
- **28–50 seconds — First answer:** Answer one generated question using a genuine project example. Show the feedback, four criteria and specific improvement advice.
- **50–75 seconds — Refine:** Add a missing action or outcome from your actual experience, submit a revision, and show the retained first attempt and updated evaluation. Do not promise that scores will rise.
- **75–95 seconds — Result:** Continue to show a follow-up question, then finish early or show a fully completed session. Explain that early finishes count only answered questions. Show the scorecard, practice plan and downloadable notes.
- **95–110 seconds — Prompt patterns and value:** Explain the interviewer persona, weak/strong few-shot examples and revision context. State the intended impact: more deliberate practice and clearer answers. Future extensions could include optional voice practice and progress across sessions.

Use an actual role/job description and your own real answer. A sample prompt for a practice role: “Junior Software Engineer: build web interfaces and REST APIs, collaborate with teammates, test and debug code, and explain technical decisions.” Questions vary because Groq generates them live.

## Longer classroom presentation

Explain the problem, show a live interview and revision, open `lib/coach.mjs` to show the implemented prompt patterns, explain score calculation, and discuss limitations. Generated feedback can be inconsistent, the rubric is not a hiring decision, and free API quotas can affect availability. Sample mode is only an explicitly labeled walkthrough if the provider cannot be reached; it is not proof of AI functionality.

## Submission checklist

- GitHub repository contains all source files, Makefile, `.env.example`, README and tests.
- Real `.env` and API key are absent from GitHub and recordings.
- A fresh local copy runs with Node.js 22+, `make setup` and `make run`.
- Live Groq interview works, including an answer revision and scorecard.
- Short, engaging video is published, accessible to the grader, and under two minutes.
- Repository link and video link are submitted through the course's form.
- Canvas due date has been checked. No public app deployment is required.
