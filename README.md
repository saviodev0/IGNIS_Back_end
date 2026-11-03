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

## AI chat

Authenticated students chat with an AI about their study material (`/chats`).
Chats, messages and the text extracted from uploads live in MongoDB; the AI
provider (Groq) keeps no history.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `API_KEY` (or `GROQ_API_KEY`) | Groq API key |
| `MONGODB_URL` | MongoDB connection string (defaults to the docker-compose database) |
| `UPLOADS_DIR` | Where original PDF/DOCX uploads are stored (defaults to `./arquivos`) |
| `AI_DAILY_TOKEN_LIMIT` | Daily AI token quota per student (defaults to `200000`; `0` disables the limit) |
| `EMBEDDINGS` | Set to `off` to disable semantic search (keyword search only) |
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

Uploads are split by structure (headings and paragraphs, ~1100 characters, the
section title is repeated in continuation chunks) and PDF chunks remember their
page. Replies are streamed over SSE as markdown; before the text, an event
`{"type":"sources","sources":[{"file","page"}]}` lists the files and pages used,
and the sources are saved with the message. Questions unrelated to the material
send no chunks and show no sources.

Usage: every AI call (chat, summaries and study material) records the tokens it used
per student and day (as reported by Groq, estimated when missing). Past the daily quota the
API answers `429` with the renewal time (midnight, server timezone); answers computed from the
database never use the quota. `GET /chats/usage` returns `used`, `limit`, `remaining` and
`resetsAt` for today.

Study material: `POST /chats/:id/material` with `type` (`summary`, `flashcards` or
`quiz`), optional `fileId` and `count` (3 to 20) generates it from the chat's files
(large files are sampled from start to end), saves it and returns it. Flashcards are
`{front, back}` and quiz questions are `{question, options[4], answerIndex, explanation}`;
malformed AI output is rejected with `502` and nothing is saved. `GET /chats/:id/material`
lists the saved ones and `DELETE /chats/:id/material/:materialId` removes one.

Other behaviours:

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
