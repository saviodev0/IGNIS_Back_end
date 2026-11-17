<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

API do IGNIS para gerenciar usuários, ciclos de estudo, metas e conquistas.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Study cycles

A student has at most one unfinished cycle at a time (`POST /study-cycles/start`
returns `409` while one exists). `GET /study-cycles/active` returns it, or an empty
body when there is none, and `POST /study-cycles/:id/pause` and `/resume` stop and
restart its clock. Every cycle response includes `status` (`running`, `paused` or
`completed`), `remainingSeconds` and `ignisReward`. Time spent paused does not
count as study time, and pausing an already paused cycle (or resuming a running
one) changes nothing. Apply the migration with `npx prisma migrate deploy`.

A cycle can have an optional title of up to 80 characters: send `title` in
`POST /study-cycles/start`, or change it later (also on completed cycles) with
`PATCH /study-cycles/:id/title`. Extra spaces are trimmed and an empty title removes
the name. `GET /study-cycles/history` returns each cycle's `title` and `pausedSeconds`.

## Progress API

`GET /users/me/stats` returns lifetime study totals and the current IGNIS balance,
plus `todayStudyMinutes`, `todayCompletedCycles`, and `dailyStudy` for the last
seven local calendar days (including today). Days without completed cycles are
returned with zero totals. `stats.timezone` identifies the server's local
timezone, configured by `TZ` when set or otherwise inherited from the runtime
environment. Daily grouping and streak calculations use that same timezone.

`GET /study-cycles/history` is paginated and includes both completed and
incomplete sessions. The `completed` boolean identifies the session state;
incomplete sessions have `completedAt: null`. `durationMinutes` is the
registered cycle duration and is not a measured effective duration. Its summary
totals include completed sessions only.

`GET /goals` returns progress calculated from the authenticated user's completed
cycles within each goal's date range. `GET /achievements` includes the persisted
`unlockedAt` timestamp, or `null` for locked achievements.

`POST /goals` takes exactly `{ "type": "DAILY" | "WEEKLY" | "MONTHLY", "targetMinutes": <integer from 1 to 2147483647> }`;
anything else (unknown type, decimals, text, zero, negatives, extra fields) is a `400` with a single clear message.
The `:id` of `POST /study-cycles/:id/complete` must be an integer (`400` otherwise), like `pause` and `resume`.

## AI chat

Authenticated students chat with an AI about their study material (`/chats`).
Chats, messages and the text extracted from uploads live in MongoDB; the AI
provider (Groq) keeps no history.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `API_KEY` (or `GROQ_API_KEY`) | Groq API key |
| `LLM_FALLBACK_MODEL` | Backup model, enables the fallback (see below). Unset = no fallback |
| `LLM_FALLBACK_SUMMARY_MODEL` | Backup for summaries/titles (defaults to `LLM_FALLBACK_MODEL`) |
| `LLM_FALLBACK_URL`, `LLM_FALLBACK_API_KEY` | Backup provider (OpenAI-compatible chat completions); default is Groq itself with the same key |
| `GROQ_URL` | Overrides the main provider URL (proxy/gateway; also handy for tests) |
| `METRICS_TOKEN` | Enables `GET /metrics/ai` for the team (see below). Unset = endpoint disabled |
| `LLM_TIMEOUT_MS` | How long to wait for the main provider to start answering before using the backup (default `30000`) |
| `MONGODB_URL` | MongoDB connection string (defaults to the docker-compose database) |
| `UPLOADS_DIR` | Where original PDF/DOCX uploads are stored (defaults to `./arquivos`) |
| `AI_DAILY_TOKEN_LIMIT` | Daily AI token quota per student (defaults to `200000`; `0` disables the limit) |
| `OCR` | Set to `off` to disable text recognition for scanned PDFs |
| `EMBEDDINGS` | Set to `off` to disable semantic search (keyword search only) |

### Measuring search quality

`npm run eval:search` measures how well the material search finds the right passage. It needs
no Groq key (only the search runs) and uses the same code as the chat (`src/chat/search.ts`).

- `eval/search/docs/` – 4 sample documents (biology, history, physics, chemistry), loaded as the passages of one chat.
- `eval/search/perguntas.json` – 63 questions: literal and paraphrased ones with the expected passage,
  unrelated ones (some on the same subject but absent from the material) and generic ones ("summarize the file").
- The report compares keyword (BM25), semantic and hybrid search: hit at 1st place, hit among the 4 passages
  sent to the AI, false positives (unrelated question that still gets passages), and a sweep of the
  semantic threshold (`SEMANTIC_MIN`, currently `0.83`).
- Flags: `-- --detalhes` lists every question, `-- --sem-embeddings` runs keyword search only (no model download).

The questions are split into `ajuste` (used to choose the thresholds) and `prova` (never used for tuning, kept as an independent check). When you change the chunker, the ranking or the thresholds, run it before and after and compare.

### Redoing the last answer / editing the last question

`POST /chats/:id/messages` accepts `"replaceLast": true`. The new question and the new AI answer **replace** the last
question and the last AI answer (regenerate = send the same question again; edit = send the corrected text). The old
pair is deleted only after the new answer arrives, so if the AI fails the student keeps what they had, and the old
answer's 👍/👎 goes away with it. The AI does not receive the old pair as context. It is refused with `400` when the
last exchange was not with the AI (nothing to redo, or answered straight from the database like "create goal" /
"studied 2h"); in this mode the shortcuts for goals, study time and own-numbers questions are off, since they have
effects of their own that cannot be redone. A cancelled answer that already has some text replaces the old one.

### Searching conversations

`GET /chats/search?q=` looks in the student's own chat titles and messages and returns up to 20 chats (most relevant
first), each with up to 3 snippets around the match (`matches[].snippet`, with `messageId` and `role`) and `titleMatch`.
`q` needs at least 2 characters (otherwise `400`). It ignores accents and case and also finds the plural
(`mitocondria` finds `mitocôndrias`, `proclamacao` finds `proclamações`), but not pieces of a word (`mito`). It uses
a MongoDB text index with `userId` as its prefix (`busca_mensagens`, `busca_titulos`), so it never scans the whole
collection nor another student's data. The indexes use `default_language: 'none'` on purpose: Mongo stems words
*before* removing accents, which made `proclamacao` miss `proclamação`; plurals are covered by sending simple
variants in the query. Indexes are built on startup (`autoIndex`); on an existing database the first start may take a
moment while the messages are indexed.

### Rating answers (👍/👎)

`PATCH /chats/:id/messages/:messageId/feedback` with `{ "feedback": "up" | "down" | null }` (`null` removes the rating).
Only the chat owner can rate, and only AI answers (not the student's own messages nor answers built straight from the
database, like "goal created"). Omitting the field is a `400`, so a mistake never erases a rating. The rating comes back
in `GET /chats/:id` as `feedback` on each AI message (`null` when unrated), and the metrics summary counts them (below).

### AI backup provider

If the main model fails with `429`, `408`, `5xx`, a network error or a timeout before it starts answering,
the request is retried **once** on the backup (`LLM_FALLBACK_MODEL`) and the student does not notice.
The reason is logged as a warning (`IA principal (...) respondeu 429; usando o reserva (...)`).
Client errors (`400`, `401`, ...) are not retried, and a student cancelling an answer never triggers the backup.
Once the text starts streaming it cannot switch provider, so a failure in the middle of an answer still ends it.
Without `LLM_FALLBACK_MODEL` nothing changes. Using another Groq model (its own rate limit) needs only that variable;
another provider also needs `LLM_FALLBACK_URL` and `LLM_FALLBACK_API_KEY`.

### AI metrics

Every chat answer stores one row in MongoDB (`aimetrics`) with **numbers and labels only**: model, whether the backup
answered, time to first text, total time, error label (e.g. `http_503`), cancelled or not, whether sources were used,
whether the chat had files, and token counts. No message or file text and nothing that identifies the student; rows
expire after 90 days. Recording never blocks or breaks the chat.

The team reads the summary with the `METRICS_TOKEN` from `.env` (students cannot, and without the variable the endpoint is off):

```bash
curl -H "x-metrics-token: $METRICS_TOKEN" "https://api.example.com/metrics/ai?days=7"   # days: 1 to 90, default 7
```

It returns answers, errors and error rate (by type), the 👍/👎 count (`feedback`: rated, up, down, % rated, % of 👎 among rated), average and p95 of time to first text and total time (successful
answers only), % without source (overall and only in chats that have files), % answered by the backup, average tokens and a
per-model breakdown. Answers the student cancelled are counted apart and left out of rates and times.

## Deploying

`docs/DEPLOY.md` (in Portuguese) is the step-by-step guide to run everything on one Linux
server with Docker Compose: `deploy/docker-compose.prod.yml` starts Caddy (automatic HTTPS),
the static site, this API, PostgreSQL and MongoDB; `deploy/backup.sh` backs up both
databases and the uploaded files. The API image applies pending Prisma migrations on start.

## Production configuration

With `NODE_ENV=production` the API refuses to start unless `DATABASE_URL`, `MONGODB_URL`,
`CORS_ORIGINS` and a strong `JWT_SECRET` (32+ characters, not the development one) are set,
and it logs warnings for a missing `GROQ_API_KEY`/`TRUST_PROXY` or a cookie without `Secure`.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` turns on the checks above and the `Secure` login cookie |
| `CORS_ORIGINS` | Front-end origins allowed by CORS, comma separated (defaults to `http://localhost:8081`) |
| `TRUST_PROXY` | Number of proxies in front of the API (e.g. `1`), so rate limits use the real client IP |
| `COOKIE_SECURE` | `true`/`false` overrides the `Secure` flag (default: on in production) |
| `COOKIE_SAMESITE` | `lax` (default), `strict` or `none` |
| `COOKIE_DOMAIN` | Optional, e.g. `.ignis.com`, to share the login cookie between subdomains |
| `PORT` | HTTP port (defaults to `3000`) |
| `MODELS_DIR` | Where the embedding model is cached (defaults to `./modelos`) |

Uploaded files are kept on the server disk only, as
`<UPLOADS_DIR>/<userId>/<chatId>/<fileId>.<ext>`. The folder is git-ignored; in
production mount it on a persistent volume, otherwise redeploys erase it. Only
the chat owner can download (`GET /chats/:id/files/:fileId`) or delete
(`DELETE /chats/:id/files/:fileId`) a file.

Search over the uploaded material combines keyword ranking (BM25) with semantic
search: a small multilingual model (`multilingual-e5-small`) runs inside the API
and embeds each chunk in the background after the upload. The model (~160 MB) is
downloaded on first start and needs about 450 MB of RAM; if it cannot load, the
chat keeps working with keyword search only.

Scanned PDFs (pages that are only images) are read by OCR in Portuguese (`tesseract.js`,
running inside the API, about half a second per page). The limit is 30 pages and 60 seconds
per file, with a clear error beyond that; page numbers are kept, so sources stay correct. The
language data is cached under `MODELS_DIR/ocr` after the first use.

Uploads are split by structure (headings and paragraphs, ~1100 characters, the
section title is repeated in continuation chunks) and PDF chunks remember their
page. Replies are streamed over SSE as markdown; before the text, an event
`{"type":"sources","sources":[{"file","page"}]}` lists the files and pages used,
and the sources are saved with the message. Questions unrelated to the material
send no chunks and show no sources.

Privacy: `DELETE /chats` erases everything the logged-in student stored in the AI
(chats, messages, files including the originals on disk, and study material) and returns
the counts. Token counters are kept (they hold no content and back the daily quota).
The system prompt treats uploaded files as data, never as instructions, and forbids
revealing its instructions, keys or other students' data.

Usage: every AI call (chat, summaries and study material) records the tokens it used
per student and day (as reported by Groq, estimated when missing). Past the daily quota the
API answers `429` with the renewal time (midnight, server timezone); answers computed from the
database never use the quota. `GET /chats/usage` returns `used`, `limit`, `remaining` and
`resetsAt` for today.

Cycle titles: `POST /chats/cycle-title` (optional `chatId`, default the most recent chat)
suggests a short title for a study cycle from the chat's name, files, summary and last
questions, using the cheaper model. It counts toward the daily quota, answers `404` when the
student has no chat and `400` when the chat is empty. The student can edit the result before
saving it with `PATCH /study-cycles/:id/title`.

Study material: `POST /chats/:id/material` with `type` (`summary`, `flashcards` or
`quiz`), optional `fileId` and `count` (3 to 20) generates it from the chat's files
(large files are sampled from start to end), saves it and returns it. Flashcards are
`{front, back}` and quiz questions are `{question, options[4], answerIndex, explanation}`;
malformed AI output is rejected with `502` and nothing is saved. `GET /chats/:id/material`
lists the saved ones and `DELETE /chats/:id/material/:materialId` removes one.

Other behaviours:

- Goals by chat: messages such as "criar meta semanal de 10h", "quero uma meta diária
  de 1h30" or "nova meta mensal de 40 horas" create a daily, weekly or monthly goal
  without calling the AI, and the chat confirms type, value and end date. If the
  student already has an active goal of that type, the value is invalid or the type is
  missing, it explains why and creates nothing. Questions about goals still go to the
  normal answers. Study plans end by suggesting the exact command.
- `PATCH /chats/:id` with `{ "title" }` renames a chat (1 to 80 characters).
- Requests for a study plan ("monte um plano de estudos") also send the recent
  study history, goals and the calendar of the next days to the AI.
- At the start of a conversation, or when the student mentions earlier studies
  ("lembra do que estudamos"), the AI receives title, study time, files and
  summary of the student's last 4 chats. Chats of other users are never included.

Messages like "quantas horas estudei hoje?" are answered from the database
without calling the AI, and "estudei 1h30" adds time to the chat.

## Rate limiting

Requests are limited per IP (`@nestjs/throttler`): 120/min in general, 10/min on
login, 5/min on register, 20/min on chat messages and 10/min on uploads. Exceeding
a limit returns `429`. Behind a reverse proxy or load balancer set `TRUST_PROXY=1`,
otherwise every request looks like it comes from the proxy's IP.

## IGNIS intent router

`POST /ignis/intent` accepts `{ "message": "..." }` and returns the first matching
intent and its API route. Supported intents are `study_cycle`, `study_history`,
`progress`, `goals`, `achievements`, `greeting`, and `help`. Messages that do not
match a supported pattern return `unknown` with a `null` route. Matching is
case-insensitive and ignores Portuguese accents; the message must contain
between 1 and 1000 characters.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Requisitos

- Node.js 20+
- PostgreSQL
- MongoDB