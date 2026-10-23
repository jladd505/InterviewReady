.DEFAULT_GOAL := run
.PHONY: help setup check-node run test check

help:
	@printf 'InterviewReady\n\n  make setup   Create .env (preserves an existing file)\n  make run     Start at http://127.0.0.1:3000\n  make test    Run automated tests (no API key required)\n  make check   Check JavaScript syntax\n\nRequires Node.js 22+ and Make. No package installation needed.\n'

check-node:
	@node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Install Node.js 22 or newer: https://nodejs.org"); process.exit(1); }' || { printf 'Node.js 22+ is required.\n'; exit 1; }

setup: check-node
	@node -e 'const fs = require("node:fs"); if (!fs.existsSync(".env")) { fs.copyFileSync(".env.example", ".env"); console.log("Created .env. Add your GROQ_API_KEY, then run make run."); } else { console.log(".env already exists; left unchanged."); }'

run: check-node
	node --env-file-if-exists=.env server.mjs

test: check-node
	node --test

check: check-node
	node --check server.mjs
	node --check lib/coach.mjs
	node --check public/app.js
